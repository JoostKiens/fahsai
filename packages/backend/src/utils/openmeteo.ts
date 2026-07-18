import { setTimeout as sleep } from 'node:timers/promises';
import type { WeatherReading, PM25GridPoint } from '@thailand-aq/types';
import { MS_PER_HOUR } from '@thailand-aq/consts';
import {
  WEATHER_STEP,
  WEATHER_LNG_MIN,
  WEATHER_LAT_MIN,
  WEATHER_LNG_COUNT,
  WEATHER_LAT_COUNT,
} from './computeStationWeather.js';

export class OpenMeteoHttpError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`Open-Meteo Air Quality API error: ${status} — ${detail}`);
    this.name = 'OpenMeteoHttpError';
  }
}

// ─── Weather grid ─────────────────────────────────────────────────────────────
//
// 0.4° grid over bbox [89,1,114,30] — matches the CAMS AQ grid resolution.
// 63 lng × 73 lat = 4,599 points per date. Grid constants shared with
// computeStationWeather.ts so both stay in lockstep.

// 300 locations per batch — the multi-location POST endpoint requires per-location
// arrays for timezone/start_date/end_date, so payload grows linearly with batch size.
// 500 caused 413; 300 keeps each POST body ~18 KB. 4,599 points → 16 batches of ≤300
// → 16 API calls per ingest run (well within the 10,000/day free tier limit).
const WEATHER_BATCH_SIZE = 300;

// 5 s between batches avoids the minutely burst limit.
// 10 batches × 5 s = ~50 s total run time.
const WEATHER_BATCH_PAUSE_MS = 5_000;

// 14:00 BKK — peak daytime convective mixing, best for smoke transport
const HISTORICAL_HOUR_BKK = 14;

export type FetchWeatherGridOptions = {
  /** Bangkok calendar day (Asia/Bangkok, YYYY-MM-DD) — decides forecast vs archive API. */
  calendarDayBkk: string;
};

interface OpenMeteoWeatherResult {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    relative_humidity_2m: number[];
  };
  daily: {
    time: string[];
    precipitation_sum: (number | null)[];
  };
}

// Max retries on 429 within a single batch call.
const WEATHER_429_MAX_RETRIES = 3;
// Fallback wait time when no header hint is available.
const WEATHER_429_FALLBACK_MS = 65_000;

async function fetchWeatherBatch(
  lats: number[],
  lngs: number[],
  date: string,
  isToday: boolean,
): Promise<WeatherReading[]> {
  const baseUrl = isToday
    ? 'https://api.open-meteo.com/v1/forecast'
    : 'https://archive-api.open-meteo.com/v1/archive';

  // Use POST so that large lat/lng arrays go in the JSON body rather than the URL.
  // GET with 1,000 locations produces ~11,000-char URLs which nginx rejects (414).
  const requestBody = JSON.stringify({
    latitude: lats,
    longitude: lngs,
    hourly: ['wind_speed_10m', 'wind_direction_10m', 'relative_humidity_2m'],
    daily: ['precipitation_sum'],
    start_date: lats.map(() => date),
    end_date: lats.map(() => date),
    timezone: lats.map(() => 'Asia/Bangkok'),
    wind_speed_unit: 'kmh',
  });

  let res: Response | undefined;
  for (let attempt = 0; attempt <= WEATHER_429_MAX_RETRIES; attempt++) {
    res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status !== 429) break;

    // Log every header on 429 so we can see what rate-limit info Open-Meteo exposes.
    const allHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      allHeaders[k] = v;
    });
    const body429 = (await res.json().catch(() => null)) as { reason?: string } | null;
    const reason = body429?.reason ?? '';
    console.warn(
      `[openmeteo] 429 weather batch (attempt ${attempt + 1}/${WEATHER_429_MAX_RETRIES + 1}), reason="${reason}", headers=${JSON.stringify(allHeaders)}`,
    );

    if (attempt >= WEATHER_429_MAX_RETRIES) break;

    if (/daily/i.test(reason)) {
      // Daily quota is exhausted — no point retrying until tomorrow. Throw so the
      // caller (pRetry) propagates the error and the script exits with code 1.
      throw new Error(`[openmeteo] daily API limit exceeded — aborting ingest run: "${reason}"`);
    }

    let delayMs: number;
    let delaySource: string;
    if (/minutely/i.test(reason)) {
      delayMs = 65_000;
      delaySource = 'minutely limit (65 s)';
    } else if (/hourly/i.test(reason)) {
      delayMs = 3_900_000; // 65 minutes
      delaySource = 'hourly limit (65 min)';
    } else {
      delayMs = WEATHER_429_FALLBACK_MS;
      delaySource = `unknown reason — fallback (${Math.round(WEATHER_429_FALLBACK_MS / 1000)} s)`;
    }
    console.warn(`[openmeteo] waiting ${Math.round(delayMs / 1000)}s: ${delaySource}`);

    await sleep(delayMs);
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const body = res ? await res.text().catch(() => '(unreadable)') : '(no response)';
    const detail = body.slice(0, 500);
    console.error(`[openmeteo] weather batch HTTP ${status}: ${detail}`);
    throw new OpenMeteoHttpError(status, detail || (res?.statusText ?? ''));
  }

  const raw = (await res.json()) as OpenMeteoWeatherResult | OpenMeteoWeatherResult[];
  const results = Array.isArray(raw) ? raw : [raw];

  // Use the requested lat/lng (lats[i]/lngs[i]) rather than loc.latitude/loc.longitude.
  // The API snaps to its own internal grid and may return a slightly different float
  // (e.g. 13.7999997 instead of 13.8). Storing the requested coordinates keeps the DB
  // consistent with what our snap formula computes at query time.
  return results.map((loc, i) => {
    const idx = targetHourIndex(loc.hourly.time, HISTORICAL_HOUR_BKK);
    return {
      lat: lats[i],
      lng: lngs[i],
      wind_speed_kmh: loc.hourly.wind_speed_10m[idx] ?? 0,
      wind_direction_deg: loc.hourly.wind_direction_10m[idx] ?? 0,
      relative_humidity_2m: loc.hourly.relative_humidity_2m[idx] ?? null,
      precipitation_sum: loc.daily.precipitation_sum[0] ?? null,
    };
  });
}

export async function fetchWeatherGridForDate(
  date: string,
  options: FetchWeatherGridOptions,
): Promise<WeatherReading[]> {
  const isToday = date === options.calendarDayBkk;

  // Build flat list of all grid points
  const allLats: number[] = [];
  const allLngs: number[] = [];
  for (let latIdx = 0; latIdx < WEATHER_LAT_COUNT; latIdx++) {
    for (let lngIdx = 0; lngIdx < WEATHER_LNG_COUNT; lngIdx++) {
      allLats.push(Math.round((WEATHER_LAT_MIN + latIdx * WEATHER_STEP) * 100) / 100);
      allLngs.push(Math.round((WEATHER_LNG_MIN + lngIdx * WEATHER_STEP) * 100) / 100);
    }
  }

  // Split into batches
  const batches: Array<{ lats: number[]; lngs: number[] }> = [];
  for (let i = 0; i < allLats.length; i += WEATHER_BATCH_SIZE) {
    batches.push({
      lats: allLats.slice(i, i + WEATHER_BATCH_SIZE),
      lngs: allLngs.slice(i, i + WEATHER_BATCH_SIZE),
    });
  }

  console.log(
    `[openmeteo] weather grid: ${allLats.length} points (${WEATHER_LNG_COUNT}×${WEATHER_LAT_COUNT}), ${batches.length} batches of ≤${WEATHER_BATCH_SIZE}`,
  );

  const results: WeatherReading[] = [];
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    console.log(`[openmeteo] weather batch ${i + 1}/${batches.length} (${b.lats.length} points)`);
    const readings = await fetchWeatherBatch(b.lats, b.lngs, date, isToday);
    results.push(...readings);
    if (i < batches.length - 1) await sleep(WEATHER_BATCH_PAUSE_MS);
  }

  return results;
}

// ─── AQ grid (PM2.5 from CAMS via Open-Meteo Air Quality API) ─────────────────

// 0.4° grid for PM2.5 — matches Open-Meteo CAMS native resolution
// bbox [89,1,114,30] → 63 × 73 = 4,599 points; 16 batches of 300.
// Open-Meteo free tier: 600 calls/min, 5k/hour, 10k/day — each location = 1 call.
// 4,599 calls per run = ~46% of daily budget; fine for once-daily scheduled ingest.
const AQ_STEP = 0.4;
const AQ_LNG_MIN = 89;
const AQ_LAT_MIN = 1;
const AQ_LNG_COUNT = 63; // (114 - 89) / 0.4 + 1
const AQ_LAT_COUNT = 73; // ( 30 -  1) / 0.4 + 1
const AQ_LNG_POINTS = Array.from(
  { length: AQ_LNG_COUNT },
  (_, i) => Math.round((AQ_LNG_MIN + i * AQ_STEP) * 10) / 10,
);
const AQ_LAT_POINTS = Array.from(
  { length: AQ_LAT_COUNT },
  (_, i) => Math.round((AQ_LAT_MIN + i * AQ_STEP) * 10) / 10,
);

// 300 locations per request → 16 batches total.
// Pause must be ≥30s: 300 calls/batch ÷ 600 calls/min = 30s minimum; 35s adds safety margin.
const AQ_BATCH_SIZE = 300;
const AQ_BATCH_CONCURRENCY = 1;
const AQ_BATCH_PAUSE_MS = 35_000;
// Short retries handle transient spikes; last entry (10 min) covers quota window resets
const AQ_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 600_000];

interface OpenMeteoAQResult {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[]; // 'YYYY-MM-DDTHH:MM'
    pm2_5: (number | null)[];
  };
}

async function fetchAQBatch(
  lats: number[],
  lngs: number[],
  date: string,
): Promise<PM25GridPoint[]> {
  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lngs.join(','),
    hourly: 'pm2_5',
    start_date: date,
    end_date: date,
    timezone: 'Asia/Bangkok',
  });

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;

  let res: Response | undefined;
  for (let attempt = 0; attempt <= AQ_RETRY_DELAYS_MS.length; attempt++) {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status !== 429) break;

    const body = (await res.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason ?? '';
    let delay: number;
    let delaySource: string;
    if (/tomorrow|daily/i.test(reason)) {
      // Daily quota exhausted — no point retrying until UTC midnight
      console.warn(`[openmeteo] 429 daily limit: "${reason}" — skipping batch`);
      return [];
    } else if (/next hour/i.test(reason)) {
      const msUntilNextHour = MS_PER_HOUR - (Date.now() % MS_PER_HOUR) + 5_000; // +5s buffer
      delay = msUntilNextHour;
      delaySource = `body hint "next hour" (${Math.round(delay / 1000)}s until :00)`;
    } else if (/minute|minutely/i.test(reason)) {
      delay = 65_000; // 1 minute + 5s buffer
      delaySource = `body hint "minutely" (65s)`;
    } else {
      delay = AQ_RETRY_DELAYS_MS[attempt] ?? 0;
      delaySource = reason ? `body="${reason}", fallback` : 'fallback';
    }

    console.warn(
      `[openmeteo] 429 on AQ batch (attempt ${attempt + 1}/${AQ_RETRY_DELAYS_MS.length}), source=${delaySource}, waiting ${Math.round(delay / 1000)}s...`,
    );
    if (delay === 0) break;
    await sleep(delay);
  }

  if (!res?.ok) {
    const status = res?.status ?? 0;
    const body = res ? await res.text().catch(() => '') : '';
    const detail = body.slice(0, 300);
    console.error(`[openmeteo] AQ batch HTTP ${status}: ${detail}`);
    throw new OpenMeteoHttpError(status, detail || (res?.statusText ?? ''));
  }

  // API returns a single object when one location is requested, array for multiple.
  const raw = (await res.json()) as OpenMeteoAQResult | OpenMeteoAQResult[];
  const results = Array.isArray(raw) ? raw : [raw];

  return results
    .map((loc) => {
      const values = loc.hourly.pm2_5.filter((v): v is number => v !== null);
      if (values.length === 0) return null;
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      return { lat: loc.latitude, lng: loc.longitude, pm25: Math.round(mean * 10) / 10 };
    })
    .filter((p): p is PM25GridPoint => p !== null);
}

export async function fetchAirQualityGrid(date: string): Promise<PM25GridPoint[]> {
  // Build flat list of all grid points
  const allLats: number[] = [];
  const allLngs: number[] = [];
  for (const lat of AQ_LAT_POINTS) {
    for (const lng of AQ_LNG_POINTS) {
      allLats.push(lat);
      allLngs.push(lng);
    }
  }

  // Split into batches
  const batches: Array<{ lats: number[]; lngs: number[] }> = [];
  for (let i = 0; i < allLats.length; i += AQ_BATCH_SIZE) {
    batches.push({
      lats: allLats.slice(i, i + AQ_BATCH_SIZE),
      lngs: allLngs.slice(i, i + AQ_BATCH_SIZE),
    });
  }

  console.log(
    `[openmeteo] AQ grid: ${allLats.length} points (${AQ_LNG_COUNT}×${AQ_LAT_COUNT}), ${batches.length} batches of ≤${AQ_BATCH_SIZE}`,
  );

  // Run batches sequentially with a polite pause between each to avoid burst rate-limiting.
  // 16 batches × 35 s = ~9 min total — acceptable for a background ingest job.
  // Each batch gets up to AQ_BATCH_CONNECT_RETRIES retries on ETIMEDOUT/connection errors
  // so that a transient rate-limit on one batch doesn't restart the whole 16-batch sequence.
  const AQ_BATCH_CONNECT_RETRIES = 3;
  const AQ_BATCH_CONNECT_RETRY_DELAY_MS = 60_000;

  const results: PM25GridPoint[] = [];
  for (let i = 0; i < batches.length; i += AQ_BATCH_CONCURRENCY) {
    if (i > 0) await sleep(AQ_BATCH_PAUSE_MS);
    const chunk = batches.slice(i, i + AQ_BATCH_CONCURRENCY);
    console.log(
      `[openmeteo] AQ batch ${i + 1}/${batches.length} (${chunk.reduce((n, b) => n + b.lats.length, 0)} points)`,
    );

    const chunkResults = await Promise.all(
      chunk.map(async (b) => {
        for (let attempt = 0; attempt <= AQ_BATCH_CONNECT_RETRIES; attempt++) {
          try {
            return await fetchAQBatch(b.lats, b.lngs, date);
          } catch (err) {
            const isConnectionError =
              err instanceof Error &&
              (err.message.includes('fetch failed') ||
                err.message.includes('ETIMEDOUT') ||
                (err as { name?: string }).name === 'TimeoutError');
            if (!isConnectionError || attempt >= AQ_BATCH_CONNECT_RETRIES) throw err;
            console.warn(
              `[openmeteo] batch ${i} connection error (attempt ${attempt + 1}/${AQ_BATCH_CONNECT_RETRIES}), retrying in ${AQ_BATCH_CONNECT_RETRY_DELAY_MS / 1000}s`,
            );
            await sleep(AQ_BATCH_CONNECT_RETRY_DELAY_MS);
          }
        }
        throw new Error('[openmeteo] unreachable');
      }),
    );

    for (const points of chunkResults) {
      results.push(...points);
    }
  }

  return results;
}

// ─── Shared time helpers ──────────────────────────────────────────────────────

// With timezone=Asia/Bangkok, Open-Meteo returns wall-clock-labeled hourly.time
// strings with no offset (e.g. "2026-07-16T14:00") — request and response share
// one named zone, so hour matching is a plain string comparison, no epoch math.
export function targetHourIndex(times: string[], hour: number): number {
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const match = /T(\d{2}):/.exec(times[i]);
    if (!match) continue;
    const diff = Math.abs(Number(match[1]) - hour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
