import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { explainRatelimit } from '../cache/ratelimit.js';
import { haversineKm, bearingDeg, compassFromDeg } from '../utils/geo.js';
import { computeFirePressureNorm } from '../utils/firePressure.js';
import regions from '../data/geo-regions.json' with { type: 'json' };
import { URBAN_SOURCES } from '../data/urbanSources.js';
import {
  traceEnsemble,
  offsetDate,
  nearestGridPoint,
  TRAJECTORY_STEPS,
} from '../utils/trajectory.js';
import type { WindGridPoint } from '../utils/trajectory.js';
import type { WeatherReading } from '@thailand-aq/types';
import type { RawExplainData, Season, FixtureUpwindSource } from '../scripts/eval/types.js';
import { buildScientificContext } from '../lib/buildScientificContext.js';
import { buildPrompt } from '../lib/buildPrompt.js';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DAILY_QUOTA_LIMIT = 500;
const BKK_OFFSET_MS = 7 * 3600_000; // UTC+7
const HISTORICAL_TTL_SECONDS = 604800; // 7 days

export type ExplainCase =
  | 'OUTLIER_HIGH'
  | 'OUTLIER_LOW'
  | 'PLAUSIBLE_FIRE_TRANSPORT'
  | 'PLAUSIBLE_URBAN_INDUSTRIAL'
  | 'PLAUSIBLE_CLEAN'
  | 'PLAUSIBLE_UNCLEAR';

// Full weather grid is 4,599 points. Require ≥4,000 before trusting a cache hit —
// incomplete caches from the 1000-row Supabase cap must be bypassed.
const GRID_MIN_COMPLETE = 4000;
const GRID_PAGE_SIZE = 1000;

function geoRegion(lat: number, lng: number): string {
  const pt = point([lng, lat]);
  for (const feature of regions.features) {
    if (
      booleanPointInPolygon(pt, feature as unknown as Parameters<typeof booleanPointInPolygon>[1])
    ) {
      return feature.properties.name;
    }
  }
  return '';
}

function getSeason(date: string): Season {
  const month = new Date(date).getUTCMonth() + 1;
  if (month >= 2 && month <= 4) return 'peak_burning';
  if (month >= 10 || month <= 1) return 'early_dry';
  return 'monsoon';
}

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Map UrbanSource type to FixtureUpwindSource type.
// All power_plant entries in URBAN_SOURCES are coal plants in practice.
function mapSourceType(t: string): FixtureUpwindSource['type'] {
  if (t === 'megacity' || t === 'city') return 'city';
  if (t === 'industrial') return 'industrial';
  return 'coal_plant';
}

async function getWindGrid(date: string): Promise<WeatherReading[]> {
  const cached = await redis.get<WeatherReading[]>(`weather:${date}`);
  if (cached && cached.length >= GRID_MIN_COMPLETE) return cached;

  const all: WeatherReading[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('weather_readings')
      .select(
        'lat, lng, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
      )
      .eq('date', date)
      .range(offset, offset + GRID_PAGE_SIZE - 1);
    if (!data?.length) break;
    all.push(...(data as WeatherReading[]));
    if (data.length < GRID_PAGE_SIZE) break;
    offset += GRID_PAGE_SIZE;
  }

  if (!all.length) return [];
  void redis.set(`weather:${date}`, all, { ex: HISTORICAL_TTL_SECONDS });
  return all;
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

export function explainRoutes(app: FastifyInstance): void {
  app.post<{ Body: { stationId: string; lat: number; lng: number; date?: string; lang?: string } }>(
    '/api/explain',
    async (req, reply) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: 'AI explanation not configured' });
      }

      const { stationId, lat, lng, lang } = req.body ?? {};
      if (!stationId || lat === undefined || lng === undefined) {
        return reply.status(400).send({ error: 'Missing required fields: stationId, lat, lng' });
      }

      try {
        const { success } = await explainRatelimit.limit(req.ip);
        if (!success) {
          return reply.status(429).send({ error: 'Rate limit exceeded. Try again later.' });
        }
      } catch (err) {
        req.log.error({ err }, 'explainRatelimit: Upstash error — failing open');
      }

      const todayBkk = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      const quotaKey = `explain:quota:${todayBkk}`;
      const count = await redis.incr(quotaKey);
      if (count === 1) await redis.expire(quotaKey, 86400);
      if (count > DAILY_QUOTA_LIMIT) {
        return reply.status(429).send({ error: 'quota_exceeded' });
      }

      const selectedDate =
        req.body.date ?? new Date(Date.now() + BKK_OFFSET_MS).toISOString().slice(0, 10);
      const [yr, mo, dy] = selectedDate.split('-').map(Number);
      const anchorEndMs = Date.UTC(yr, mo - 1, dy) - BKK_OFFSET_MS + 86_400_000;

      const since7d = new Date(anchorEndMs - 8 * 86_400_000).toISOString();
      const since24h = new Date(anchorEndMs - 24 * 3600_000).toISOString();
      const since72h = new Date(anchorEndMs - 72 * 3600_000).toISOString();
      const until = new Date(anchorEndMs).toISOString();

      const d0 = selectedDate;
      const d1 = offsetDate(selectedDate, -1);
      const d2 = offsetDate(selectedDate, -2);
      const d3 = offsetDate(selectedDate, -3);
      const d4 = offsetDate(selectedDate, -4);

      async function getCamsGrid(
        date: string,
      ): Promise<{ lat: number; lng: number; pm25: number }[]> {
        const cached = await redis.get<{ lat: number; lng: number; pm25: number }[]>(
          `cams:pm25:${date}`,
        );
        if (cached && cached.length >= GRID_MIN_COMPLETE) return cached;

        const all: { lat: number; lng: number; pm25: number }[] = [];
        let offset = 0;
        while (true) {
          const { data } = await supabase
            .from('cams_grid')
            .select('lat, lng, pm25')
            .eq('date', date)
            .range(offset, offset + GRID_PAGE_SIZE - 1);
          if (!data?.length) break;
          all.push(...(data as { lat: number; lng: number; pm25: number }[]));
          if (data.length < GRID_PAGE_SIZE) break;
          offset += GRID_PAGE_SIZE;
        }

        if (!all.length) return [];
        void redis.set(`cams:pm25:${date}`, all, { ex: HISTORICAL_TTL_SECONDS });
        return all;
      }

      // Gather all context in parallel
      const [
        stationRows,
        peerRows,
        stationWeatherRows,
        wind0,
        wind1,
        wind2,
        camsD0,
        camsD1,
        camsD2,
        pressureResult,
      ] = await Promise.all([
        supabase
          .from('station_readings')
          .select('value, measured_at, stations(id, name)')
          .eq('station_id', stationId)
          .gte('measured_at', since7d)
          .lt('measured_at', until)
          .order('measured_at', { ascending: false })
          .limit(170),

        supabase
          .from('station_readings')
          .select('value, measured_at, station_id, stations(id, name, lat, lng)')
          .gte('measured_at', since24h)
          .lt('measured_at', until)
          .neq('station_id', stationId)
          .order('measured_at', { ascending: false }),

        supabase
          .from('station_weather')
          .select(
            'date, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
          )
          .eq('station_id', stationId)
          .in('date', [d0, d1, d2, d3, d4]),

        getWindGrid(d0),
        getWindGrid(d1),
        getWindGrid(d2),

        getCamsGrid(d0),
        getCamsGrid(d1),
        getCamsGrid(d2),

        supabase
          .from('station_fire_pressure')
          .select('score, fire_count, total_frp_mw')
          .eq('station_id', stationId)
          .eq('date', d0)
          .maybeSingle(),
      ]);

      const camsDataByDate = new Map([
        [d0, camsD0],
        [d1, camsD1],
        [d2, camsD2],
      ]);

      if (stationRows.error) throw new Error(stationRows.error.message);
      if (!stationRows.data?.length) {
        return reply.status(404).send({ error: 'Station not found' });
      }

      // --- station context ---
      type StationJoin = { id: string; name: string } | null;
      const stationName =
        (stationRows.data[0].stations as unknown as StationJoin)?.name ?? stationId;
      const readings = (stationRows.data as { value: number; measured_at: string }[]).map(
        (r) => r.value,
      );
      const latestPm25 = readings[0];

      // Daily averages (group by BKK calendar day)
      const dailyMap = new Map<string, number[]>();
      for (const row of stationRows.data as { value: number; measured_at: string }[]) {
        const bkkDate = new Date(new Date(row.measured_at).getTime() + BKK_OFFSET_MS)
          .toISOString()
          .slice(0, 10);
        if (!dailyMap.has(bkkDate)) dailyMap.set(bkkDate, []);
        dailyMap.get(bkkDate)!.push(row.value);
      }
      const dailyAvgs = [...dailyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, vals]) => ({
          date,
          avg: vals.reduce((s, v) => s + v, 0) / vals.length,
        }));

      // --- trajectory ---
      const windGridsByDate = new Map<string, WindGridPoint[]>([
        [d0, wind0],
        [d1, wind1],
        [d2, wind2],
      ]);

      const ensemble = traceEnsemble(lat, lng, selectedDate, windGridsByDate);
      const { footprintBbox, corridorKm, members, meanWindSpeedKmh } = ensemble;
      const centerTrajectory = members[0];
      const originWaypoint = centerTrajectory[centerTrajectory.length - 1];

      req.log.info(
        {
          selectedDate,
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

      // --- fire query ---
      const fireUntil = `${selectedDate}T23:59:59Z`;
      type FireRow = { lat: number; lng: number; frp: number | null; detected_at: string };
      const allFireRows: FireRow[] = [];
      let fireOffset = 0;
      while (true) {
        const { data: firePage } = await supabase
          .from('fire_points')
          .select('lat, lng, frp, confidence, detected_at')
          .gte('detected_at', since72h)
          .lt('detected_at', fireUntil)
          .gte('lat', footprintBbox.latMin)
          .lte('lat', footprintBbox.latMax)
          .gte('lng', footprintBbox.lngMin)
          .lte('lng', footprintBbox.lngMax)
          .order('detected_at', { ascending: false })
          .range(fireOffset, fireOffset + GRID_PAGE_SIZE - 1);
        if (!firePage?.length) break;
        allFireRows.push(...(firePage as unknown as FireRow[]));
        if (firePage.length < GRID_PAGE_SIZE) break;
        fireOffset += GRID_PAGE_SIZE;
      }

      req.log.info(
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
          const ageA = Math.max(0, (anchorEndMs - new Date(a.detected_at).getTime()) / 3_600_000);
          const ageB = Math.max(0, (anchorEndMs - new Date(b.detected_at).getTime()) / 3_600_000);
          return ageA !== ageB ? ageA - ageB : a.distKm - b.distKm;
        });

      // --- fire pressure ---
      const firePressureNorm = computeFirePressureNorm(
        fires.map((f) => ({ detected_at: f.detected_at, frp: f.frp, distKm: f.distKm })),
        corridorKm,
        anchorEndMs,
      );

      // --- peers ---
      type PeerJoin = { id: string; name: string; lat: number; lng: number } | null;
      const peerMap = new Map<string, { name: string; pm25: number; distKm: number }>();
      for (const row of (peerRows.data as {
        value: number;
        measured_at: string;
        station_id: string;
        stations: unknown;
      }[]) ?? []) {
        const sid = row.station_id;
        if (peerMap.has(sid)) continue;
        const s = row.stations as PeerJoin;
        if (!s) continue;
        const distKm = haversineKm(lat, lng, s.lat, s.lng);
        if (distKm > 75) continue;
        if (distKm < 0.5) continue;
        peerMap.set(sid, { name: s.name, pm25: row.value, distKm });
      }
      const peerList = [...peerMap.values()];
      const peerValues = peerList.map((p) => p.pm25);
      const peerMedian = medianOf(peerValues);

      const peerWeightedMean = (() => {
        if (!peerList.length) return 0;
        let totalW = 0;
        let sum = 0;
        for (const p of peerList) {
          const w = 1 / Math.max(p.distKm, 1);
          totalW += w;
          sum += p.pm25 * w;
        }
        return totalW > 0 ? sum / totalW : 0;
      })();

      const bothLow = latestPm25 < 35 && peerWeightedMean < 35;
      const outlierRatio = peerWeightedMean > 0 ? latestPm25 / peerWeightedMean : null;
      const isStrongOutlier =
        !bothLow &&
        outlierRatio !== null &&
        (outlierRatio >= 2.0 || outlierRatio <= 0.4) &&
        Math.abs(latestPm25 - peerWeightedMean) >= 20;
      const isHighOutlier = isStrongOutlier && outlierRatio !== null && outlierRatio >= 2.0;

      const nonOutlierPeers =
        peerMedian > 0 &&
        peerList.filter((p) => p.pm25 <= peerMedian * 2 && p.pm25 >= peerMedian * 0.4).length >= 3
          ? peerList.filter((p) => p.pm25 <= peerMedian * 2 && p.pm25 >= peerMedian * 0.4)
          : peerList;

      const filteredPeerValues = nonOutlierPeers.map((p) => p.pm25);
      const filteredPeerMin = filteredPeerValues.length ? Math.min(...filteredPeerValues) : null;
      const filteredPeerMax = filteredPeerValues.length ? Math.max(...filteredPeerValues) : null;

      const peerDistribution =
        peerList.length > 10
          ? [
              'Good',
              'Moderate',
              'Unhealthy for sensitive groups',
              'Unhealthy',
              'Very unhealthy',
              'Hazardous',
            ]
              .map((label) => {
                const cnt = peerList.filter((p) => {
                  const aqi_bp = [12.0, 35.4, 55.4, 150.4, 250.4];
                  const aqi_labels = [
                    'Good',
                    'Moderate',
                    'Unhealthy for sensitive groups',
                    'Unhealthy',
                    'Very unhealthy',
                    'Hazardous',
                  ];
                  let cat = aqi_labels[aqi_labels.length - 1];
                  for (let i = 0; i < aqi_bp.length; i++) {
                    if (p.pm25 <= aqi_bp[i]) {
                      cat = aqi_labels[i];
                      break;
                    }
                  }
                  return cat === label;
                }).length;
                return cnt > 0 ? `${cnt} ${label}` : null;
              })
              .filter((s): s is string => s !== null)
              .join(', ')
          : null;

      // --- station weather ---
      type StationWeatherRecord = {
        date: string;
        wind_speed_kmh: number | null;
        wind_direction_deg: number | null;
        precipitation_sum: number | null;
        relative_humidity_2m: number | null;
      };
      const stationWeatherByDate = new Map<string, StationWeatherRecord>();
      for (const row of (stationWeatherRows.data ?? []) as StationWeatherRecord[]) {
        stationWeatherByDate.set(row.date, row);
      }
      const wx0 = stationWeatherByDate.get(d0) ?? null;
      const wx1 = stationWeatherByDate.get(d1) ?? null;
      const wx2 = stationWeatherByDate.get(d2) ?? null;
      const wx3 = stationWeatherByDate.get(d3) ?? null;
      const wx4 = stationWeatherByDate.get(d4) ?? null;

      // Total precipitation over 5 days
      const totalPrecip5d = [wx0, wx1, wx2, wx3, wx4].reduce(
        (sum, wx) => sum + (wx?.precipitation_sum ?? 0),
        0,
      );

      // --- persistent wind ---
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

      // --- urban sources ---
      // Mean wind direction: persistentWind (5-day average) preferred; fallback to d0 grid point.
      const meanWindDirDeg: number | null = (() => {
        if (persistentWind !== null) return persistentWind.directionDeg;
        if (!wind0.length) return null;
        return nearestGridPoint(lat, lng, wind0).wind_direction_deg;
      })();

      // True when the bearing from the station to the source aligns with where the wind comes FROM.
      const isBearingUpwind = (sourceLat: number, sourceLng: number): boolean => {
        if (meanWindDirDeg === null) return true; // no wind data — fail open
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

      // Sources in persistent wind direction beyond trajectory window
      const persistentWindSources =
        persistentWind !== null
          ? relevantSources.filter((s) => {
              if (s.distKm <= corridorKm) return false;
              const bearing = bearingDeg(lat, lng, s.lat, s.lng);
              const diff = Math.abs(((bearing - persistentWind.directionDeg + 540) % 360) - 180);
              return diff <= 45;
            })
          : [];

      // --- CAMS samples along center trajectory ---
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
        .filter(
          (s): s is { waypoint: (typeof centerTrajectory)[0]; pm25: number } => s.pm25 !== null,
        );

      // --- fire recency buckets ---
      function fireBucket(maxAgeH: number, minAgeH = 0) {
        const bucket = fires.filter((f) => {
          const age = Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000);
          return age >= minAgeH && age < maxAgeH;
        });
        const totalFrpMw = bucket.reduce((s, f) => s + (f.frp ?? 0), 0);
        return { count: bucket.length, totalFrpMw };
      }
      const b0 = fireBucket(24);
      const b1 = fireBucket(48, 24);
      const b2 = fireBucket(73, 48);

      // --- area fire pressure ---
      const pressureData = pressureResult.data as {
        score: number;
        fire_count: number;
        total_frp_mw: number;
      } | null;

      // --- trajectory waypoints with regions ---
      const pathWaypoints =
        centerTrajectory.length >= 2
          ? centerTrajectory
              .filter((_, i) => i % 4 === 0 || i === centerTrajectory.length - 1)
              .map((w) => ({ lat: w.lat, lng: w.lng, region: geoRegion(w.lat, w.lng) }))
          : [];

      // ----------------------------------------------------------------
      // Build RawExplainData (RawExplainData shape)
      // ----------------------------------------------------------------

      function buildWeatherDay(date: string, wx: StationWeatherRecord | null) {
        const windState =
          wx === null
            ? ('not_fetched' as const)
            : wx.wind_speed_kmh !== null
              ? ('available' as const)
              : ('missing' as const);
        return {
          date,
          wind: {
            state: windState,
            directionDeg: wx?.wind_direction_deg ?? null,
            speedKmh: wx?.wind_speed_kmh ?? null,
          },
          precipitationMm: wx?.precipitation_sum ?? 0,
          humidity: wx?.relative_humidity_2m ?? null,
          highHumidityWarning: (wx?.relative_humidity_2m ?? 0) >= 85,
        };
      }

      function buildSource(s: (typeof relevantSources)[0]): FixtureUpwindSource {
        return {
          name: s.name,
          country: s.country,
          distanceKm: s.distKm,
          type: mapSourceType(s.type),
          population: s.population > 0 ? s.population : undefined,
          capacityMw: s.type === 'power_plant' && s.emissionProxy > 0 ? s.emissionProxy : undefined,
          currentlyUpwind: s.isUpwind,
        };
      }

      const rawData: RawExplainData = {
        station: { name: stationName, lat, lng },
        date: selectedDate,
        currentPm25: latestPm25,

        sevenDayAverages: dailyAvgs.map((d) => ({ date: d.date, value: d.avg })),

        weather: {
          days: [
            buildWeatherDay(d0, wx0),
            buildWeatherDay(d1, wx1),
            buildWeatherDay(d2, wx2),
            buildWeatherDay(d3, wx3),
            buildWeatherDay(d4, wx4),
          ],
          totalPrecipitationMm: totalPrecip5d,
          trajectoryPrecipitationMm: centerTrajectory.length >= 2 ? trajectoryPrecipTotal : null,
        },

        trajectory:
          centerTrajectory.length < 2
            ? null
            : {
                hoursTraced: (centerTrajectory.length - 1) * 6,
                memberCount: 5,
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
          pathFiresByRecency: { last24h: b0, last48h: b1, last72h: b2 },
          topFires: fires.slice(0, 30).map((f) => ({
            lat: f.lat,
            lng: f.lng,
            distKm: f.distKm,
            frpMw: f.frp ?? 0,
            ageH: Math.round(
              Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000),
            ),
          })),
          areaScore: pressureData?.score ?? 0,
          areaFireCount: pressureData?.fire_count ?? null,
          areaTotalFrpMw: pressureData?.total_frp_mw ?? null,
        },

        upwindSources: relevantSources.map(buildSource),

        peers:
          peerList.length === 0 || filteredPeerMin === null || filteredPeerMax === null
            ? null
            : {
                stationCount: peerList.length,
                weightedMean: peerWeightedMean,
                unweightedMedian: peerMedian,
                range: { min: filteredPeerMin, max: filteredPeerMax },
                stations: nonOutlierPeers
                  .sort((a, b) => a.distKm - b.distKm)
                  .slice(0, 10)
                  .map((p) => ({ name: p.name, value: p.pm25, distanceKm: p.distKm })),
                distribution: peerDistribution,
              },

        outlier: isStrongOutlier
          ? { direction: isHighOutlier ? 'high' : 'low', ratio: outlierRatio ?? 0 }
          : null,

        season: getSeason(selectedDate),

        persistentWind: persistentWind
          ? {
              directionDeg: persistentWind.directionDeg,
              label: persistentWind.label,
              dayCount: persistentWind.dayCount,
              sourcesBeyondWindow: persistentWindSources.map(buildSource),
            }
          : null,
      };

      // ----------------------------------------------------------------
      // Build prompt via shared layers
      // ----------------------------------------------------------------

      const ctx = buildScientificContext(rawData);
      const prompt = buildPrompt(ctx, lang ?? 'en');

      // Start streaming
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });

      try {
        if (process.env.NODE_ENV !== 'production') {
          reply.raw.write('__PROMPT__' + JSON.stringify(prompt) + '\n');
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          reply.raw.write(chunk.text());
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        req.log.error({ err }, 'Gemini API error');
        reply.raw.write(`\n\n[ERROR: ${msg}]`);
      }

      reply.raw.end();
    },
  );
}
