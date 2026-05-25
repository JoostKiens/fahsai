import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { haversineKm, bearingDeg, compassFromDeg } from '../lib/geo.js';
import { URBAN_SOURCES } from '../data/urbanSources.js';
import { traceEnsemble, offsetDate, nearestGridPoint } from '../utils/trajectory.js';
import type { WindGridPoint } from '../utils/trajectory.js';
import type { WeatherReading } from '@thailand-aq/types';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DAILY_QUOTA_LIMIT = 500;
const BKK_OFFSET_MS = 7 * 3600_000; // UTC+7
const HISTORICAL_TTL_SECONDS = 604800; // 7 days
const AREA_PRESSURE_HIGH_THRESHOLD = 40; // "High" label cutoff — score at which buildup warrants emphasis
const SLOW_WIND_THRESHOLD_KMH = 10; // below this, stagnation narrative takes priority over transport

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- AQI helpers ---

const AQI_BP = [12.0, 35.4, 55.4, 150.4, 250.4];
const AQI_LABELS = [
  'Good',
  'Moderate',
  'Unhealthy for sensitive groups',
  'Unhealthy',
  'Very unhealthy',
  'Hazardous',
];

function pm25Cat(pm25: number): string {
  for (let i = 0; i < AQI_BP.length; i++) {
    if (pm25 <= AQI_BP[i]) return AQI_LABELS[i];
  }
  return AQI_LABELS[AQI_LABELS.length - 1];
}

// --- trend ---

// --- upwind helpers ---

const UPWIND_TOLERANCE_DEG = 60;

function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// --- geographic region lookup for trajectory annotation ---

const GEO_REGIONS: ReadonlyArray<{
  label: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}> = [
  // Water bodies first — prevents land bounding-box false matches over open sea
  { label: 'Gulf of Thailand', latMin: 6, latMax: 13.5, lngMin: 99.5, lngMax: 104.5 },
  { label: 'Andaman Sea', latMin: 5, latMax: 16, lngMin: 92, lngMax: 99.5 },
  { label: 'South China Sea', latMin: 1, latMax: 25, lngMin: 104.5, lngMax: 122 },
  // Land — Myanmar split at 21°N to avoid overlap with Thailand in the border zone
  { label: 'China', latMin: 21.5, latMax: 55, lngMin: 97, lngMax: 135 },
  { label: 'Bangladesh', latMin: 20.5, latMax: 26.7, lngMin: 88, lngMax: 92.7 },
  { label: 'Myanmar', latMin: 21, latMax: 28.5, lngMin: 92, lngMax: 101.5 },
  { label: 'Myanmar', latMin: 9.5, latMax: 21, lngMin: 92, lngMax: 99.5 },
  { label: 'Laos', latMin: 13.9, latMax: 22.5, lngMin: 100.5, lngMax: 107.7 },
  { label: 'Cambodia', latMin: 9.9, latMax: 14.7, lngMin: 102.5, lngMax: 107.7 },
  { label: 'Vietnam', latMin: 8.4, latMax: 23.4, lngMin: 104.5, lngMax: 109.5 },
  { label: 'Thailand', latMin: 5.5, latMax: 20.5, lngMin: 97.5, lngMax: 106 },
  { label: 'Malaysia', latMin: 1, latMax: 6.7, lngMin: 99.5, lngMax: 104.7 },
  { label: 'India', latMin: 6, latMax: 36, lngMin: 68, lngMax: 92 },
];

function geoRegion(lat: number, lng: number): string {
  for (const r of GEO_REGIONS) {
    if (lat >= r.latMin && lat <= r.latMax && lng >= r.lngMin && lng <= r.lngMax) return r.label;
  }
  return '';
}

// --- fire pressure ---

function firePressureLabel(score: number): string {
  if (score === 0) return 'None';
  if (score < 15) return 'Low';
  if (score < 40) return 'Moderate';
  if (score < 70) return 'High';
  return 'Very high';
}

// Full weather grid is 4,599 points. Require ≥4,000 before trusting a cache hit —
// incomplete caches from the 1000-row Supabase cap must be bypassed.
const GRID_MIN_COMPLETE = 4000;
const GRID_PAGE_SIZE = 1000;

// --- wind grid fetching ---

async function getWindGrid(date: string): Promise<WeatherReading[]> {
  const cached = await redis.get<WeatherReading[]>(`weather:${date}`);
  if (cached && cached.length >= GRID_MIN_COMPLETE) return cached;

  // Paginate: weather_readings has 4,599 rows per date; Supabase silently caps at 1,000.
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

// --- CAMS sampling ---

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

// --- route ---

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

      // Quota check — keyed to Bangkok calendar day
      const todayBkk = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      const quotaKey = `explain:quota:${todayBkk}`;
      const count = await redis.incr(quotaKey);
      if (count === 1) await redis.expire(quotaKey, 86400);
      if (count > DAILY_QUOTA_LIMIT) {
        return reply.status(429).send({ error: 'quota_exceeded' });
      }

      // Anchor all time windows to the selected date (BKK timezone).
      // anchorEndMs = start of the day AFTER selectedDate in BKK = exclusive upper bound.
      const selectedDate =
        req.body.date ?? new Date(Date.now() + BKK_OFFSET_MS).toISOString().slice(0, 10);
      const [yr, mo, dy] = selectedDate.split('-').map(Number);
      const anchorEndMs = Date.UTC(yr, mo - 1, dy) - BKK_OFFSET_MS + 86_400_000;

      // 8 days so computeTrend (needs 8 readings) can compare recent vs older on daily data
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

        // Paginate: cams_grid has 4,599 rows per date; Supabase silently caps at 1,000.
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
      const snapLat = Math.round(Math.round(lat / 0.4) * 0.4 * 1000) / 1000;
      const snapLng = Math.round(Math.round(lng / 0.4) * 0.4 * 1000) / 1000;

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

        // station_weather is pre-computed from the full grid at ingest time — use it for
        // the station's own precipitation/humidity context instead of doing a grid snap
        // (which is susceptible to the 1000-row Supabase cap on weather_readings).
        // 5 days matches the history panel visible to the user.
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
          .from('fire_pressure_scores')
          .select('score, fire_count, total_frp')
          .eq('date', d0)
          .eq('lat', snapLat)
          .eq('lng', snapLng)
          .maybeSingle(),
      ]);

      // Each trajectory waypoint has a date (d0, d1, or d2). Sample CAMS from the
      // matching date's grid so the PM2.5 value corresponds to the actual date labeled.
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

      // Trend: latest day vs median of all prior days (needs ≥ 2 days).
      // dailyAvgs is sorted ascending so the newest entry is at the end.
      // Suppressed when current PM2.5 is in the Good range (< 12 µg/m³) — ratio-based
      // trends are misleading noise at low absolute values (e.g. 0.5 → 3.4 reads as
      // "rising sharply" but is meaningless in practice).
      const trend = (() => {
        if (latestPm25 < 12) return 'not significant — current level is well within Good range';
        if (dailyAvgs.length < 2) return 'insufficient data';
        const latest = dailyAvgs[dailyAvgs.length - 1].avg;
        const baseline = medianOf(dailyAvgs.slice(0, -1).map((d) => d.avg));
        if (baseline === 0) return 'stable';
        const ratio = latest / baseline;
        if (ratio > 1.15) return 'rising sharply';
        if (ratio > 1.05) return 'rising';
        if (ratio < 0.85) return 'falling sharply';
        if (ratio < 0.95) return 'falling';
        return 'stable';
      })();

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

      // --- fire query using footprint bbox ---
      // Use UTC day end as the upper bound so the VIIRS PM pass (~18:30 UTC) is included.
      // The fires route uses the same UTC-day convention; BKK midnight (anchorEndMs) is 7h
      // earlier and silently drops the most recent satellite pass over the region.
      const fireUntil = `${selectedDate}T23:59:59Z`;

      // Paginate fire query — fire_points can exceed 1000 rows within the bbox/time window
      // during peak burning season; Supabase silently truncates without .range(), returning
      // the oldest rows (lowest bigserial IDs) and dropping the most recent fires entirely.
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
        {
          fireRowCount: allFireRows.length,
          since72h,
          fireUntil,
          footprintBbox,
          corridorKm,
        },
        'explain: fire query result',
      );

      const allWaypoints = members.flat();

      const fires = allFireRows
        .map((f) => ({
          ...f,
          distKm: Math.min(...allWaypoints.map((w) => haversineKm(w.lat, w.lng, f.lat, f.lng))),
          bearing: bearingDeg(lat, lng, f.lat, f.lng),
        }))
        .filter((f) => f.distKm <= corridorKm)
        // Sort newest first so the AI prompt shows the most actionable (recent) fires.
        // Distance is the tiebreaker within the same age bucket.
        .sort((a, b) => {
          const ageA = Math.max(0, (anchorEndMs - new Date(a.detected_at).getTime()) / 3_600_000);
          const ageB = Math.max(0, (anchorEndMs - new Date(b.detected_at).getTime()) / 3_600_000);
          return ageA !== ageB ? ageA - ageB : a.distKm - b.distKm;
        });

      // --- fire pressure score ---
      // Recency weight: inverse decay with 24 h half-life so 3-day-old fires still
      // contribute ~25% (vs ~1.4% with the old linear formula). Smoke from fires
      // along the trajectory 72 h ago is exactly what the trajectory is designed to
      // attribute — nearly zeroing it out was physically wrong.
      // Normalization / 10: previous /50 required 5,000 units for 100/100, making
      // typical burning-season fire events score near 0. With /10, 1,000 weighted
      // FRP units = 100/100 — a realistic ceiling for a major fire event.
      const firePressureScore = fires.reduce((sum, f) => {
        const ageHours = Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000);
        const recencyWeight = 1 / (1 + ageHours / 24); // 24 h half-life inverse decay
        const transportWeight = 1 / (1 + f.distKm / corridorKm);
        return sum + (f.frp ?? 10) * recencyWeight * transportWeight;
      }, 0);
      const firePressureNorm = Math.min(100, Math.round(firePressureScore / 10));

      // --- peers context ---
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
        peerMap.set(sid, { name: s.name, pm25: row.value, distKm });
      }
      const peerList = [...peerMap.values()];
      const peerValues = peerList.map((p) => p.pm25);
      const peerMedian = medianOf(peerValues);
      const peerMin = peerValues.length ? Math.min(...peerValues) : null;
      const peerMax = peerValues.length ? Math.max(...peerValues) : null;
      const outlierRatio = peerMedian > 0 ? latestPm25 / peerMedian : null;

      // Outlier thresholds:
      //   strong — reading is ≥2× or ≤0.4× peer median → likely sensor issue or hyperlocal anomaly
      //   elevated — reading is ≥1.4× peer median → noticeably above neighbours, worth flagging
      const isStrongOutlier = outlierRatio !== null && (outlierRatio >= 2.0 || outlierRatio <= 0.4);
      const isElevatedOutlier = outlierRatio !== null && outlierRatio >= 1.4 && !isStrongOutlier;

      // --- urban / industrial / power plant sources ---
      const relevantSources = URBAN_SOURCES.map((source) => {
        const distFromOrigin = haversineKm(
          originWaypoint.lat,
          originWaypoint.lng,
          source.lat,
          source.lng,
        );
        const minDistToPath = Math.min(
          ...centerTrajectory.map((w) => haversineKm(w.lat, w.lng, source.lat, source.lng)),
        );
        const effectiveDist = Math.max(1, Math.min(distFromOrigin, minDistToPath));
        if (effectiveDist > 800) return null;

        const populationScore = source.population / effectiveDist ** 2;
        const emissionScore = (source.emissionProxy * 10_000) / effectiveDist ** 2;
        const influenceScore = populationScore + emissionScore;
        if (influenceScore < 50) return null;

        const nearestW = wind0.length
          ? (nearestGridPoint(lat, lng, wind0 as WindGridPoint[]) as {
              wind_direction_deg: number;
            })
          : null;
        const bearing = bearingDeg(lat, lng, source.lat, source.lng);
        const isUpwind = nearestW
          ? angleDiff(bearing, nearestW.wind_direction_deg) <= UPWIND_TOLERANCE_DEG
          : false;

        return { ...source, distKm: effectiveDist, influenceScore, isUpwind };
      })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.influenceScore - a.influenceScore)
        .slice(0, 8);

      // --- CAMS sampling along center trajectory ---
      const sampleIndices = [
        Math.floor(centerTrajectory.length * 0.33),
        Math.floor(centerTrajectory.length * 0.66),
        centerTrajectory.length - 1,
      ];
      const camsSamples = sampleIndices
        .filter((i) => i < centerTrajectory.length)
        .map((i) => {
          const wp = centerTrajectory[i];
          // Use the CAMS grid for the waypoint's actual date so the label matches the data.
          const camsForDate = camsDataByDate.get(wp.date) ?? camsD0;
          return { waypoint: wp, pm25: sampleCams(wp.lat, wp.lng, camsForDate) };
        })
        .filter(
          (s): s is { waypoint: (typeof centerTrajectory)[0]; pm25: number } => s.pm25 !== null,
        );

      // --- weather context (precipitation + humidity) ---
      // Use station_weather for the station's own dates — it's pre-computed from the full
      // grid at ingest time and is immune to the Supabase 1000-row cap on weather_readings.
      type StationWeatherRow = {
        date: string;
        wind_speed_kmh: number | null;
        wind_direction_deg: number | null;
        precipitation_sum: number | null;
        relative_humidity_2m: number | null;
      };
      const stationWeatherByDate = new Map<string, StationWeatherRow>();
      for (const row of (stationWeatherRows.data ?? []) as StationWeatherRow[]) {
        stationWeatherByDate.set(row.date, row);
      }
      const wx0 = stationWeatherByDate.get(d0) ?? null;
      const wx1 = stationWeatherByDate.get(d1) ?? null;
      const wx2 = stationWeatherByDate.get(d2) ?? null;
      const wx3 = stationWeatherByDate.get(d3) ?? null;
      const wx4 = stationWeatherByDate.get(d4) ?? null;

      // For the trajectory origin (an arbitrary grid location) we still need to snap
      // against the wind grid, since station_weather only covers known stations.
      function nearestWeather(
        grid: WeatherReading[],
        wLat: number,
        wLng: number,
      ): WeatherReading | null {
        if (!grid.length) return null;
        return nearestGridPoint(wLat, wLng, grid as WindGridPoint[]) as WeatherReading;
      }
      const wxOriginGrid = (windGridsByDate.get(originWaypoint.date) ?? []) as WeatherReading[];
      const wxOrigin =
        originWaypoint !== centerTrajectory[0] && wxOriginGrid.length
          ? nearestWeather(wxOriginGrid, originWaypoint.lat, originWaypoint.lng)
          : null;

      // --- build prompt strings ---

      const dailyLines = dailyAvgs
        .map((d) => `  ${d.date}: ${d.avg.toFixed(1)} µg/m³ (${pm25Cat(d.avg)})`)
        .join('\n');

      // Wind summary — 3 days
      const windSummary = [d0, d1, d2]
        .map((date) => {
          const grid = windGridsByDate.get(date)!;
          if (!grid.length) return `  ${date}: no data`;
          const nearest = nearestGridPoint(lat, lng, grid);
          return (
            `  ${date}: from ${compassFromDeg(nearest.wind_direction_deg)} ` +
            `at ${nearest.wind_speed_kmh.toFixed(1)} km/h`
          );
        })
        .join('\n');

      // Weather context — 5-day precipitation + humidity at station
      const stationDays: Array<{ date: string; wx: StationWeatherRow | null }> = [
        { date: d0, wx: wx0 },
        { date: d1, wx: wx1 },
        { date: d2, wx: wx2 },
        { date: d3, wx: wx3 },
        { date: d4, wx: wx4 },
      ];

      const precipRows = stationDays.map(({ date, wx }) => {
        if (wx === null) return `  ${date}: no data`;
        const precip = (wx.precipitation_sum ?? 0).toFixed(1);
        const rh =
          wx.relative_humidity_2m !== null ? ` RH ${wx.relative_humidity_2m.toFixed(0)}%` : '';
        const humidWarn =
          (wx.relative_humidity_2m ?? 0) >= 85
            ? ' ⚠ high humidity — optical sensors may over-read PM2.5'
            : '';
        return `  ${date}: ${precip} mm rain,${rh}${humidWarn}`;
      });

      // Compute total precip over the 5-day window from available rows
      const totalPrecip5d = stationDays.reduce(
        (sum, { wx }) => sum + (wx?.precipitation_sum ?? 0),
        0,
      );
      const availableDays = stationDays.filter(({ wx }) => wx !== null).length;
      if (availableDays > 0) {
        precipRows.push(
          totalPrecip5d === 0
            ? `  Total past ${availableDays} days: 0.0 mm — no rainfall. Rain-based explanations for PM2.5 changes are not applicable.`
            : `  Total past ${availableDays} days: ${totalPrecip5d.toFixed(1)} mm`,
        );
      }

      if (wxOrigin !== null) {
        precipRows.push(
          `  Trajectory origin (${originWaypoint.date}): ${(wxOrigin.precipitation_sum ?? 0).toFixed(1)} mm rain`,
        );
      }
      const weatherContextStr = precipRows.join('\n');

      // Trajectory summary
      const trajectoryStr =
        centerTrajectory.length < 2
          ? 'Insufficient wind data — trajectory unavailable'
          : (() => {
              const pathWaypoints = centerTrajectory.filter(
                (_, i) => i % 4 === 0 || i === centerTrajectory.length - 1,
              );
              let prevRegion = '';
              const pathStr = pathWaypoints
                .map((w, idx) => {
                  const coord = `${w.lat.toFixed(1)}°N ${w.lng.toFixed(1)}°E`;
                  if (idx === 0) return coord; // station itself — no region annotation
                  const region = geoRegion(w.lat, w.lng);
                  if (!region || region === prevRegion) {
                    prevRegion = region;
                    return coord;
                  }
                  prevRegion = region;
                  return `${coord} (${region})`;
                })
                .join(' ← ');
              const originRegion = geoRegion(originWaypoint.lat, originWaypoint.lng);
              const originLabel =
                `Origin region: ${originWaypoint.lat.toFixed(2)}°N, ${originWaypoint.lng.toFixed(2)}°E` +
                (originRegion ? ` — ${originRegion}` : '') +
                ` (${originWaypoint.date})`;
              return [
                `Traced ${(centerTrajectory.length - 1) * 6}h back using 5-member ensemble`,
                originLabel,
                `Corridor width: ${corridorKm.toFixed(0)} km (based on mean wind ${meanWindSpeedKmh.toFixed(1)} km/h)`,
                `Path (station → origin): ${pathStr}`,
              ].join('\n');
            })();

      // CAMS string
      const camsStr = camsSamples.length
        ? camsSamples
            .map(
              (s) =>
                `  ${s.waypoint.lat.toFixed(1)}°N ${s.waypoint.lng.toFixed(1)}°E ` +
                `(${s.waypoint.date}): ${s.pm25.toFixed(1)} µg/m³ (${pm25Cat(s.pm25)})`,
            )
            .join('\n')
        : '  No CAMS data along trajectory';

      // Fire string — time-bucket summary + top 20 newest fires
      function fireBucket(maxAgeH: number, minAgeH = 0) {
        const bucket = fires.filter((f) => {
          const age = Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000);
          return age >= minAgeH && age < maxAgeH;
        });
        const totalFrp = bucket.reduce((s, f) => s + (f.frp ?? 0), 0);
        return { count: bucket.length, totalFrp };
      }
      const b0 = fireBucket(24); // 0–24 h
      const b1 = fireBucket(48, 24); // 24–48 h
      const b2 = fireBucket(73, 48); // 48–72 h (73 to include clamped-to-0 edge)

      const fireStr =
        fires.length === 0
          ? '  No fires detected within transport corridor'
          : [
              `  By recency: 0-24h: ${b0.count} fires (${b0.totalFrp.toFixed(0)} MW FRP) | ` +
                `24-48h: ${b1.count} fires (${b1.totalFrp.toFixed(0)} MW FRP) | ` +
                `48-72h: ${b2.count} fires (${b2.totalFrp.toFixed(0)} MW FRP)`,
              '  Most recent fires (up to 30, newest first):',
              ...fires.slice(0, 30).map((f) => {
                const ageH = Math.round(
                  Math.max(0, (anchorEndMs - new Date(f.detected_at).getTime()) / 3_600_000),
                );
                return (
                  `  ${f.lat.toFixed(2)}°N ${f.lng.toFixed(2)}°E — ` +
                  `${f.distKm.toFixed(0)} km from path — ` +
                  `FRP ${(f.frp ?? 0).toFixed(0)} MW — ${ageH}h ago`
                );
              }),
            ].join('\n');

      // Urban sources string
      const sourcesStr =
        relevantSources.length === 0
          ? '  None identified within footprint'
          : relevantSources
              .map((s) => {
                const upwindTag = s.isUpwind ? ' [currently upwind]' : '';
                const detail =
                  s.type === 'power_plant'
                    ? `${s.emissionProxy} MW coal plant`
                    : s.type === 'industrial'
                      ? 'industrial zone'
                      : `pop. ${(s.population / 1e6).toFixed(1)}M`;
                return `  ${s.name}, ${s.country} — ${s.distKm.toFixed(0)} km — ${detail}${upwindTag}`;
              })
              .join('\n');

      // Filter obvious sensor faults (> 5× median) before listing, provided at least 5
      // non-outlier peers remain. Summary stats use the full list so count/range are honest.
      const nonOutlierPeers =
        peerMedian > 0 && peerList.filter((p) => p.pm25 <= peerMedian * 5).length >= 5
          ? peerList.filter((p) => p.pm25 <= peerMedian * 5)
          : peerList;

      const peerStr =
        peerList.length === 0
          ? 'No peer station data available within 75 km'
          : [
              `${peerList.length} stations — median ${peerMedian.toFixed(1)} µg/m³, range ${peerMin?.toFixed(1)}–${peerMax?.toFixed(1)} µg/m³`,
              nonOutlierPeers
                .sort((a, b) => a.distKm - b.distKm)
                .slice(0, 10)
                .map(
                  (p) =>
                    `  ${p.name}: ${p.pm25.toFixed(1)} µg/m³ — ${pm25Cat(p.pm25)} (${p.distKm.toFixed(0)} km)`,
                )
                .join('\n'),
            ].join('\n');

      // Outlier note injected into the data section so the model sees it before reasoning.
      const isHighOutlier = outlierRatio !== null && outlierRatio >= 2.0;
      const outlierNote = isStrongOutlier
        ? isHighOutlier
          ? `⚠ STRONG OUTLIER (HIGH): This station reads ${outlierRatio.toFixed(1)}× the peer median (${peerMedian.toFixed(1)} µg/m³). Nearby stations are much lower. Do NOT attribute this reading to regional smoke or fires — the most likely explanations are a sensor malfunction, a very localised source directly at the station, or a data reporting error.`
          : `⚠ STRONG OUTLIER (LOW): This station reads ${outlierRatio.toFixed(1)}× the peer median (${peerMedian.toFixed(1)} µg/m³). Nearby stations are much higher. This station is reading far below the regional level — the most likely explanations are a sensor malfunction, local shielding or washing of particles, or a data reporting error. Do NOT present this as good air quality — it is likely a measurement anomaly.`
        : isElevatedOutlier
          ? `NOTE: This station reads ${outlierRatio.toFixed(1)}× the peer median (${peerMedian.toFixed(1)} µg/m³) — somewhat above its neighbours. You may briefly note this if it adds useful context, but focus the explanation on the regional air quality drivers.`
          : '';

      // Dynamic seasonal context based on selected date's month
      const month = new Date(selectedDate).getUTCMonth() + 1;
      const seasonContext =
        month >= 2 && month <= 4
          ? 'Peak dry season and agricultural burning season in mainland Southeast Asia (Feb–Apr). Smoke can transport hundreds of kilometres under stable, low-wind conditions.'
          : month >= 10 || month <= 1
            ? 'Early or late dry season in mainland Southeast Asia (Oct–Jan). Agricultural burning is beginning or winding down; fire activity is lower than peak.'
            : 'Monsoon season in mainland Southeast Asia (May–Sep). Fire activity is low; elevated PM2.5 is more likely from urban/industrial sources or stagnant air pockets.';

      const pressureData = pressureResult.data as {
        score: number;
        fire_count: number;
        total_frp: number;
      } | null;
      const pressureInterpretation =
        !isStrongOutlier &&
        pressureData?.score != null &&
        pressureData.score >= AREA_PRESSURE_HIGH_THRESHOLD
          ? `Interpretation: Fire activity has been sustained at ${firePressureLabel(pressureData.score).toLowerCase()} levels across this area for weeks or longer — this reflects persistent regional smoke buildup, not a one-off event.`
          : null;
      const pressureScoreStr =
        pressureData?.score != null
          ? [
              `Score: ${pressureData.score.toFixed(1)}/100 — ${firePressureLabel(pressureData.score)} (${pressureData.fire_count} detections, total FRP ${pressureData.total_frp.toFixed(0)} MW over 14 days)`,
              ...(pressureInterpretation ? [pressureInterpretation] : []),
            ].join('\n')
          : 'No data — location outside fire detection grid or no activity in past 14 days';

      const slowWindBuildup =
        !isStrongOutlier &&
        pressureData?.score != null &&
        pressureData.score >= AREA_PRESSURE_HIGH_THRESHOLD &&
        meanWindSpeedKmh <= SLOW_WIND_THRESHOLD_KMH
          ? '- Area fire pressure is High or Very High and winds have been slow — emphasize that stagnant air has allowed long-running regional fire smoke to accumulate at this location. This is a buildup story, not just a transport story.'
          : '';

      // --- trajectory / fire / CAMS section — omitted for strong outliers ---
      const transportSection = isStrongOutlier
        ? `FIRES / TRAJECTORY / CAMS: Omitted — reading is a strong outlier vs peer stations (${outlierRatio.toFixed(1)}× median, station is ${isHighOutlier ? 'far above' : 'far below'} neighbours). Regional transport data is not relevant.`
        : `3-DAY BACK-TRAJECTORY (5-member ensemble, surface-level approximation)
${trajectoryStr}
NOTE: Simplified 2D surface trajectory from daily wind snapshots. Treat origin region as indicative, not precise.

AIR QUALITY ALONG TRAJECTORY (CAMS model PM2.5)
${camsStr}

CUMULATIVE FIRE PRESSURE (fires within transport corridor, last 72 h)
Score: ${firePressureNorm}/100 — ${firePressureLabel(firePressureNorm)}
Total fires along path: ${fires.length}
${fireStr}`;

      const prompt = `You are explaining current air quality to a general audience in plain English.

STATION: ${stationName} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)
CURRENT PM2.5: ${latestPm25.toFixed(1)} µg/m³ — ${pm25Cat(latestPm25)}
RECENT TREND: ${trend}

7-DAY DAILY AVERAGES
${dailyLines || '  No historical data'}

WIND (last 3 days, nearest grid point to station)
${windSummary}

WEATHER CONTEXT (precipitation and humidity at station)
${weatherContextStr}

${transportSection}

AREA FIRE PRESSURE (14-day precomputed score at this location)
${pressureScoreStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along trajectory)
${sourcesStr}

PEER STATIONS WITHIN 75 KM (last 24 h)
${peerStr}
${outlierNote ? `\n${outlierNote}` : ''}

CONTEXT: ${seasonContext}

Write 1–3 short paragraphs in plain English. No markdown, no bullet points — flowing prose only.
The reader already sees the station name, PM2.5 value, and AQI category — do not repeat these verbatim.
Lead with what is most interesting: where the air came from and what drove it.
- Use neutral third person for location references ("this area", "this station", "conditions here") — do not use "we", "our", or "our community".
- Use the trajectory and CAMS values to reason about transport over time, not just current wind direction. If wind direction changed significantly over the period shown, note what that means for the pollution origin. When describing the transport corridor, name the direction and the regions or countries the air traveled through (e.g., "arriving from the west, tracking back through central Myanmar") — readers cannot see the full multi-day trajectory on the map, so make it geographically concrete.
- The cumulative fire pressure score summarises fire activity along the actual transport path — weight it accordingly.
- The area fire pressure score shows 14-day accumulated fire activity at this specific location — use it to give context about longer-term fire buildup beyond the recent trajectory window. If both scores are low and no fires are detected, do not mention fires at all.
${slowWindBuildup}
- If fire pressure is 0 and no fires were detected, do not mention fires at all.
- If power plants or industrial zones are along the trajectory, mention them only if fire pressure is low or moderate (they explain background pollution, not acute spikes). If they are far away (> 200 km) and air quality along the trajectory is good, skip them.
- Compare against peer stations. If this station is a strong outlier, lead with that.
- Recent rain can wash out PM2.5 — mention it only if precipitation is significant (> 5 mm total). If rainfall is negligible, do not mention it. High humidity (≥ 85%) may cause optical sensors to over-read.
- ${isStrongOutlier && !isHighOutlier ? 'This station reads far below its neighbours — focus on why it is an outlier, not on whether the absolute level is good or bad.' : latestPm25 > 35 ? 'Conditions are elevated — focus on what explains the reading.' : 'Explain why conditions are currently relatively good.'}
- Do not describe the week trend — the user already sees the 5-day chart.
${trend.startsWith('not significant') ? '- The trend is not significant — do not discuss it at all, not even to note that values are low.' : ''}
- Do not reference specific time windows from the underlying data (e.g. "last 3 days", "72-hour", "last 24 hours", "past 72 hours", "14 days", "two weeks"). Use natural language instead ("recently", "over the past few days", "for weeks"). Treat all time windows as minimum durations — the underlying conditions may have persisted longer than what the data captures.
- Do not speculate beyond what the data shows.
${isStrongOutlier ? '- Suggest the most likely explanations for the anomaly.' : ''}${lang === 'th' ? '\nRespond entirely in Thai (ภาษาไทย).' : ''}`;

      // Start streaming — hijack Fastify response so we control the raw socket
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
