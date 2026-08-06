import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { redis, HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { supabase } from '../db/client.js';
import regions from '../data/geo-regions.json' with { type: 'json' };
import { URBAN_SOURCES } from '../data/urbanSources.js';
import { haversineKm, bearingDeg, compassFromDeg } from '../utils/geo.js';
import { computeFirePressureNorm } from '../utils/firePressure.js';
import {
  traceEnsemble,
  nearestGridPoint,
  offsetDate,
  TRAJECTORY_STEPS,
} from '../utils/trajectory.js';
import type { WindGridPoint } from '../utils/trajectory.js';
import type { WeatherReading } from '@thailand-aq/types';
import { MS_PER_HOUR } from '@thailand-aq/consts';
import { bangkokDateString, bangkokMidnightIso } from '../utils/bkkDate.js';
import { fetchAllPages } from '../utils/backfill.js';
import { fetchExplainContext } from './fetchExplainContext.js';
import { analyzePeers } from './analyzePeers.js';
import { buildRawExplainData } from './buildRawExplainData.js';
import { buildScientificContext, type ScientificContext } from './buildScientificContext.js';
import { logger } from './logger.js';

const CONTEXT_CACHE_VERSION = 1;

function contextCacheKey(stationId: string, date: string): string {
  return `explain:context:v${CONTEXT_CACHE_VERSION}:${stationId}:${date}`;
}

function geoRegion(lat: number, lng: number): string {
  const pt = {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [lng, lat] },
    properties: {},
  };
  for (const feature of regions.features) {
    if (
      booleanPointInPolygon(pt, feature as unknown as Parameters<typeof booleanPointInPolygon>[1])
    ) {
      return feature.properties.name;
    }
  }
  // The China polygon in geo-regions.json caps at ~30°N, leaving northern China and Tibet
  // unmatched. Proper fix: replace the feature with a full Natural Earth 1:110m admin-0
  // polygon. Until then, fall back to a bounding-box check — it mislabels Mongolia and
  // north-east Asia, but that is better than silently dropping the region from the prompt.
  if (lat > 30 && lat <= 53.5 && lng >= 73 && lng <= 135) return 'China';
  return '';
}

function sampleCams(
  lat: number,
  lng: number,
  data: { lat: number; lng: number; pm25: number }[],
): number | null {
  if (!data.length) return null;
  let best = data[0];
  let bestD = (best.lat - lat) ** 2 + (best.lng - lng) ** 2;
  for (const p of data.slice(1)) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.pm25;
}

export async function computeScientificContext(
  stationId: string,
  lat: number,
  lng: number,
  date: string,
): Promise<ScientificContext | null> {
  const isToday = date === bangkokDateString();

  if (!isToday) {
    try {
      const cached = await redis.get<ScientificContext>(contextCacheKey(stationId, date));
      if (cached) return cached;
    } catch (err) {
      logger.warn({ err }, 'computeScientificContext: Redis cache read failed, recomputing');
    }
  }

  // ----------------------------------------------------------------
  // Fetch all context data in parallel
  // ----------------------------------------------------------------

  const ctx = await fetchExplainContext(stationId, date);
  if (!ctx) return null;

  const {
    anchorEndMs,
    since72h,
    d0,
    d1,
    d2,
    d3,
    d4,
    stationName,
    stationReadings,
    peerRows,
    stationWeatherByDate,
    wind0,
    wind1,
    wind2,
    camsD0,
    camsD1,
    camsD2,
    pressureData,
    baseline,
  } = ctx;

  const latestPm25 = stationReadings[0].value;

  // ----------------------------------------------------------------
  // Trajectory
  // ----------------------------------------------------------------

  const windGridsByDate = new Map<string, WindGridPoint[]>([
    [d0, wind0],
    [d1, wind1],
    [d2, wind2],
  ]);

  const ensemble = traceEnsemble(lat, lng, date, windGridsByDate);
  const { footprintBbox, corridorKm, members, meanWindSpeedKmh } = ensemble;
  const centerTrajectory = members[0];
  const originWaypoint = centerTrajectory[centerTrajectory.length - 1];

  logger.info(
    {
      selectedDate: date,
      stationLat: lat,
      stationLng: lng,
      originWaypoint: {
        lat: originWaypoint.lat,
        lng: originWaypoint.lng,
        date: originWaypoint.date,
      },
      corridorKm,
      meanWindSpeedKmh,
    },
    'explain: trajectory debug',
  );

  // Cumulative precipitation along center trajectory
  const trajectoryPrecipTotal = (() => {
    const seen = new Set<string>();
    let total = 0;
    for (const wp of centerTrajectory) {
      const grid = windGridsByDate.get(wp.date) ?? [];
      if (!grid.length) continue;
      const nearest = nearestGridPoint(wp.lat, wp.lng, grid) as WeatherReading;
      const snappedLat = Math.round(Math.round(nearest.lat / 0.4) * 0.4 * 1000) / 1000;
      const snappedLng = Math.round(Math.round(nearest.lng / 0.4) * 0.4 * 1000) / 1000;
      const key = `${wp.date}:${snappedLat}:${snappedLng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += nearest.precipitation_sum ?? 0;
    }
    return total;
  })();

  // ----------------------------------------------------------------
  // Fire query (depends on trajectory footprint)
  // ----------------------------------------------------------------

  const fireUntil = bangkokMidnightIso(offsetDate(date, 1));
  type FireRow = { lat: number; lng: number; frp: number | null; detected_at: string };
  const FIRE_PAGE_SIZE = 1000;
  // Degrade gracefully on query failure — a fire-data outage shouldn't fail
  // the whole rate-limited, quota-tracked /api/explain request.
  let allFireRows: FireRow[] = [];
  let fireQueryFailed = false;
  try {
    allFireRows = await fetchAllPages<FireRow>(
      (from, to) =>
        supabase
          .from('fire_points')
          .select('lat, lng, frp, confidence, detected_at')
          .gte('detected_at', since72h)
          .lt('detected_at', fireUntil)
          .gte('lat', footprintBbox.latMin)
          .lte('lat', footprintBbox.latMax)
          .gte('lng', footprintBbox.lngMin)
          .lte('lng', footprintBbox.lngMax)
          .order('detected_at', { ascending: false })
          .range(from, to),
      FIRE_PAGE_SIZE,
    );
  } catch (err) {
    fireQueryFailed = true;
    logger.warn({ err }, 'explain: fire_points query failed, continuing without fire data');
  }

  logger.info(
    { fireRowCount: allFireRows.length, since72h, fireUntil, footprintBbox, corridorKm },
    'explain: fire query result',
  );

  const allWaypoints = members.flat();
  const fires = allFireRows
    .map((f) => ({
      ...f,
      distKm: Math.min(...allWaypoints.map((w) => haversineKm(w.lat, w.lng, f.lat, f.lng))),
    }))
    .filter((f) => f.distKm <= corridorKm)
    .sort((a, b) => {
      const ageA = Math.max(0, (anchorEndMs - new Date(a.detected_at).getTime()) / MS_PER_HOUR);
      const ageB = Math.max(0, (anchorEndMs - new Date(b.detected_at).getTime()) / MS_PER_HOUR);
      return ageA !== ageB ? ageA - ageB : a.distKm - b.distKm;
    });

  const firePressureNorm = computeFirePressureNorm(
    fires.map((f) => ({ detected_at: f.detected_at, frp: f.frp, distKm: f.distKm })),
    corridorKm,
    anchorEndMs,
  );

  // ----------------------------------------------------------------
  // Peer analysis
  // ----------------------------------------------------------------

  const peers = analyzePeers(peerRows, lat, lng, latestPm25);

  // ----------------------------------------------------------------
  // Station weather + precipitation totals
  // ----------------------------------------------------------------

  const wx0 = stationWeatherByDate.get(d0) ?? null;
  const wx1 = stationWeatherByDate.get(d1) ?? null;
  const wx2 = stationWeatherByDate.get(d2) ?? null;
  const wx3 = stationWeatherByDate.get(d3) ?? null;
  const wx4 = stationWeatherByDate.get(d4) ?? null;

  const totalPrecip5d = [wx0, wx1, wx2, wx3, wx4].reduce(
    (sum, wx) => sum + (wx?.precipitation_sum ?? 0),
    0,
  );

  // ----------------------------------------------------------------
  // Persistent wind
  // ----------------------------------------------------------------

  const persistentWind = (() => {
    const wxDays = [wx0, wx1, wx2, wx3, wx4].filter(
      (wx): wx is NonNullable<typeof wx> => wx !== null && wx.wind_direction_deg !== null,
    );
    if (wxDays.length < 3) return null;
    const sinSum = wxDays.reduce(
      (s, wx) => s + Math.sin((wx.wind_direction_deg! * Math.PI) / 180),
      0,
    );
    const cosSum = wxDays.reduce(
      (s, wx) => s + Math.cos((wx.wind_direction_deg! * Math.PI) / 180),
      0,
    );
    const meanDeg = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
    const allConsistent = wxDays.every((wx) => {
      const diff = Math.abs(((wx.wind_direction_deg! - meanDeg + 540) % 360) - 180);
      return diff <= 45;
    });
    if (!allConsistent) return null;
    return {
      directionDeg: Math.round(meanDeg),
      label: compassFromDeg(meanDeg),
      dayCount: wxDays.length,
    };
  })();

  // ----------------------------------------------------------------
  // Urban sources
  // ----------------------------------------------------------------

  const meanWindDirDeg: number | null = (() => {
    if (persistentWind !== null) return persistentWind.directionDeg;
    if (!wind0.length) return null;
    return nearestGridPoint(lat, lng, wind0).wind_direction_deg;
  })();

  const isBearingUpwind = (sourceLat: number, sourceLng: number): boolean => {
    if (meanWindDirDeg === null) return true;
    const bearing = bearingDeg(lat, lng, sourceLat, sourceLng);
    const diff = Math.abs(((bearing - meanWindDirDeg + 540) % 360) - 180);
    return diff <= 60;
  };

  const relevantSources = URBAN_SOURCES.map((source) => {
    const distFromStation = haversineKm(lat, lng, source.lat, source.lng);
    const minDistToPath = Math.min(
      ...allWaypoints.map((w) => haversineKm(w.lat, w.lng, source.lat, source.lng)),
    );
    const effectiveDist = Math.max(1, minDistToPath);
    if (effectiveDist > 800) return null;
    const populationScore = source.population / effectiveDist ** 2;
    const emissionScore = (source.emissionProxy * 10_000) / effectiveDist ** 2;
    if (populationScore + emissionScore < 50) return null;
    // Cone check: corridor width scales from 0 at the station to corridorKm at the origin.
    // A 5 km floor prevents floating-point zero at step 0 from excluding co-located sensors.
    const isOnCone = allWaypoints.some((w) => {
      const threshold = Math.max(5, corridorKm * (w.stepIndex / TRAJECTORY_STEPS));
      return haversineKm(w.lat, w.lng, source.lat, source.lng) <= threshold;
    });
    const isUpwind = isOnCone && isBearingUpwind(source.lat, source.lng);
    return { ...source, distKm: distFromStation, minDistToPath, isUpwind };
  })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort(
      (a, b) =>
        (b.population + b.emissionProxy * 10_000) / Math.max(1, b.minDistToPath) ** 2 -
        (a.population + a.emissionProxy * 10_000) / Math.max(1, a.minDistToPath) ** 2,
    )
    .slice(0, 8);

  const persistentWindSources =
    persistentWind !== null
      ? relevantSources.filter((s) => {
          if (s.distKm <= corridorKm) return false;
          const bearing = bearingDeg(lat, lng, s.lat, s.lng);
          const diff = Math.abs(((bearing - persistentWind.directionDeg + 540) % 360) - 180);
          return diff <= 45;
        })
      : [];

  // ----------------------------------------------------------------
  // CAMS samples + trajectory waypoints with regions
  // ----------------------------------------------------------------

  const camsDataByDate = new Map([
    [d0, camsD0],
    [d1, camsD1],
    [d2, camsD2],
  ]);

  const sampleIndices = [
    Math.floor(centerTrajectory.length * 0.33),
    Math.floor(centerTrajectory.length * 0.66),
    centerTrajectory.length - 1,
  ];
  const camsSamples = sampleIndices
    .filter((i) => i < centerTrajectory.length)
    .map((i) => {
      const wp = centerTrajectory[i];
      const camsForDate = camsDataByDate.get(wp.date) ?? camsD0;
      return { waypoint: wp, pm25: sampleCams(wp.lat, wp.lng, camsForDate) };
    })
    .filter((s): s is { waypoint: (typeof centerTrajectory)[0]; pm25: number } => s.pm25 !== null);

  const pathWaypoints =
    centerTrajectory.length >= 2
      ? centerTrajectory
          .filter((_, i) => i % 4 === 0 || i === centerTrajectory.length - 1)
          .map((w) => ({ lat: w.lat, lng: w.lng, region: geoRegion(w.lat, w.lng) }))
      : [];

  // ----------------------------------------------------------------
  // Fire recency buckets
  // ----------------------------------------------------------------

  function fireBucket(maxAgeH: number, minAgeH = 0) {
    const bucket = fires.filter((f) => {
      const age = Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / MS_PER_HOUR);
      return age >= minAgeH && age < maxAgeH;
    });
    return { count: bucket.length, totalFrpMw: bucket.reduce((s, f) => s + (f.frp ?? 0), 0) };
  }

  // ----------------------------------------------------------------
  // Assemble RawExplainData
  // ----------------------------------------------------------------

  const rawData = buildRawExplainData({
    station: { name: stationName, lat, lng },
    selectedDate: date,
    stationReadings,

    d0,
    d1,
    d2,
    d3,
    d4,
    stationWeatherByDate,
    totalPrecipitationMm: totalPrecip5d,
    trajectoryPrecipitationMm: centerTrajectory.length >= 2 ? trajectoryPrecipTotal : null,

    trajectory:
      centerTrajectory.length < 2
        ? null
        : {
            hoursTraced: (centerTrajectory.length - 1) * 6,
            origin: {
              lat: originWaypoint.lat,
              lng: originWaypoint.lng,
              region: geoRegion(originWaypoint.lat, originWaypoint.lng),
              date: originWaypoint.date,
            },
            corridorWidthKm: corridorKm,
            meanWindSpeedKmh,
            waypoints: pathWaypoints,
            camsAlongPath: camsSamples.map((s) => ({
              lat: s.waypoint.lat,
              lng: s.waypoint.lng,
              date: s.waypoint.date,
              pm25: s.pm25,
            })),
          },

    firePressure: {
      pathScore: firePressureNorm,
      pathFireCount: fires.length,
      last24h: fireBucket(24),
      last48h: fireBucket(48, 24),
      last72h: fireBucket(73, 48),
      topFires: fires.slice(0, 30).map((f) => ({
        lat: f.lat,
        lng: f.lng,
        distKm: f.distKm,
        frpMw: f.frp ?? 0,
        ageH: Math.round(
          Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / MS_PER_HOUR),
        ),
      })),
      areaScore: pressureData?.score ?? 0,
      areaFireCount: pressureData?.fire_count ?? null,
      areaTotalFrpMw: pressureData?.total_frp_mw ?? null,
    },

    upwindSources: relevantSources,

    peers,

    outlier: peers.isStrongOutlier
      ? { direction: peers.isHighOutlier ? 'high' : 'low', ratio: peers.outlierRatio ?? 0 }
      : null,

    baseline,

    persistentWind: persistentWind
      ? {
          directionDeg: persistentWind.directionDeg,
          label: persistentWind.label,
          dayCount: persistentWind.dayCount,
          sourcesBeyondWindow: persistentWindSources,
        }
      : null,
  });

  const scientificCtx = buildScientificContext(rawData);

  // Don't persist a result built from a degraded fire query — a transient outage
  // would otherwise get baked into the cache for HISTORICAL_TTL_SECONDS.
  if (!isToday && !fireQueryFailed) {
    try {
      await redis.set(contextCacheKey(stationId, date), scientificCtx, {
        ex: HISTORICAL_TTL_SECONDS,
      });
    } catch (err) {
      logger.warn({ err }, 'computeScientificContext: Redis cache write failed');
    }
  }

  return scientificCtx;
}
