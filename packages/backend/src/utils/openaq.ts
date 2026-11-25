import { setTimeout as sleep } from 'node:timers/promises';
import { DEFAULT_BBOX } from './bbox.js';

const BASE_URL = 'https://api.openaq.org/v3';

interface OpenAQSensor {
  id: number;
  parameter: { name: string; units: string };
  latest: { value: number; datetime: { utc: string } } | null | undefined;
}

export interface OpenAQLocation {
  id: number;
  name: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  country: { code: string } | null;
  provider: { name: string } | null | undefined;
  isMobile: boolean;
  isMonitor: boolean | null;
  sensors: OpenAQSensor[];
  datetimeLast: { utc: string } | null | undefined;
}

interface OpenAQMeta {
  found: number;
  limit: number;
  page: number;
}

interface OpenAQResponse {
  meta: OpenAQMeta;
  results: OpenAQLocation[];
}

interface OpenAQHourResult {
  value: number;
  period: {
    datetimeFrom: { utc: string; local: string } | null;
    datetimeTo: { utc: string; local: string } | null;
  } | null;
}

interface OpenAQHoursResponse {
  meta: OpenAQMeta;
  results: OpenAQHourResult[];
}

export interface SensorDailyAverage {
  value: number;
  // Canonical UTC timestamp for the daily average — always targetDate T00:00:00Z.
  // Falls at the start of the queried UTC day, within the window used by /api/measurements/latest.
  dateUtc: string;
}

export interface SensorFetchResult {
  readings: SensorDailyAverage[];
  rateLimitRemaining: number | null; // x-ratelimit-remaining
  rateLimitResetMs: number | null; // x-ratelimit-reset × 1000 (Unix ms)
  // true when the fetch gave up after retries (network error, 429, 5xx), so `readings: []` means
  // "unknown", not "no data". False for legitimately empty results (404, no rows, stale date).
  failed: boolean;
}

export function extractPm25SensorIds(location: OpenAQLocation): number[] {
  return location.sensors.filter((s) => s.parameter.name === 'pm25').map((s) => s.id);
}

function parseRateLimitHeaders(
  headers: Headers,
): Pick<SensorFetchResult, 'rateLimitRemaining' | 'rateLimitResetMs'> {
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset'));

  let rateLimitResetMs: number | null = null;
  if (Number.isFinite(reset) && reset > 0) {
    // x-ratelimit-reset is either a Unix timestamp (seconds, ~1.7 billion)
    // or a duration (seconds until reset, typically 0–60).
    // Distinguish by magnitude: Unix timestamps are > 1e9.
    const isTimestamp = reset > 1e9;
    rateLimitResetMs = isTimestamp
      ? reset * 1000 // Unix timestamp → convert to ms
      : Date.now() + reset * 1000; // duration → absolute ms from now
  }

  return {
    rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
    rateLimitResetMs,
  };
}

export async function fetchSensorDailyAverage(
  apiKey: string,
  sensorId: number,
  targetDate: string, // YYYY-MM-DD in local time
  timezoneOffsetHours = 7,
): Promise<SensorFetchResult> {
  // Uses /hours/daily rather than /days or /hours because:
  // - /days is confirmed broken: ignores datetime_from/datetime_to entirely,
  //   always returns the most recent available data (tested 2025-05-12).
  // - /hours/daily is the working equivalent per OpenAQ docs and respects date filters.
  // - /hours/daily requires timezone-aware datetime params (e.g. +07:00) — bare UTC
  //   does not correctly bound the local calendar day.
  // - Returns a single pre-computed daily mean, eliminating manual averaging over
  //   up to 100 hourly records.
  const sign = timezoneOffsetHours >= 0 ? '+' : '-';
  const absHours = Math.abs(timezoneOffsetHours);
  const tzOffset = `${sign}${String(absHours).padStart(2, '0')}:00`;

  const url =
    `${BASE_URL}/sensors/${sensorId}/hours/daily` +
    `?datetime_from=${encodeURIComponent(`${targetDate}T00:00:00${tzOffset}`)}` +
    `&datetime_to=${encodeURIComponent(`${targetDate}T23:59:59${tzOffset}`)}` +
    `&limit=2`;

  const response = await getWithRetries(apiKey, url, `sensor ${sensorId}`);
  if (response.kind === 'failed') return { readings: [], ...response.rateLimit, failed: true };
  if (response.kind === 'not-found') return { readings: [], ...response.rateLimit, failed: false };
  const { rateLimit } = response;

  const data = response.body as OpenAQHoursResponse;
  if (data.results.length === 0) return { readings: [], ...rateLimit, failed: false };

  // OpenAQ buckets days in the sensor's own timezone. For sensors west of +07:00 our window
  // also overlaps the end of their previous local day, returned first as a short stub bucket.
  // No bucket for the target day means stale data (same failure mode as /days): skip it.
  const result = data.results.find((r) => r.period?.datetimeFrom?.local.startsWith(targetDate));
  if (result === undefined) {
    const got = data.results.map((r) => r.period?.datetimeFrom?.local ?? 'null').join(', ');
    console.warn(
      `[openaq] sensor ${sensorId}: date mismatch (expected ${targetDate}, got ${got}), skipping`,
    );
    return { readings: [], ...rateLimit, failed: false };
  }
  if (result.value === null) return { readings: [], ...rateLimit, failed: false };

  const dateUtc = `${targetDate}T00:00:00Z`;
  return { readings: [{ value: result.value, dateUtc }], ...rateLimit, failed: false };
}

interface OpenAQLatestResponse {
  results: { value: number | null; datetime: { utc: string } | null; sensorsId: number }[];
}

export interface LatestPm25 {
  sensorId: number;
  value: number;
  /** OpenAQ's stamp: the end of the measured hour */
  measuredAt: string;
}

export type LatestPm25Result = RateLimit & { reading: LatestPm25 | null; failed: boolean };

/**
 * The freshest PM2.5 value of a location, from /locations/{id}/latest. A location can keep a
 * retired PM2.5 sensor that still reports an old value, so the newest of its PM2.5 sensors wins,
 * not the first (JOO-142: the first was the freshest at only 124 of 156 locations).
 */
export async function fetchLocationLatestPm25(
  apiKey: string,
  locationId: string,
  pm25SensorIds: readonly number[],
): Promise<LatestPm25Result> {
  const response = await getWithRetries(
    apiKey,
    `${BASE_URL}/locations/${encodeURIComponent(locationId)}/latest`,
    `location ${locationId}`,
  );
  if (response.kind !== 'ok') {
    return { reading: null, ...response.rateLimit, failed: response.kind === 'failed' };
  }

  const { results } = response.body as OpenAQLatestResponse;
  const freshest = results
    .flatMap((r) =>
      pm25SensorIds.includes(r.sensorsId) && isValidPm25(r.value) && r.datetime !== null
        ? [{ sensorId: r.sensorsId, value: r.value, measuredAt: r.datetime.utc }]
        : [],
    )
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0];
  return { reading: freshest ?? null, ...response.rateLimit, failed: false };
}

// a negative concentration is a sentinel or sensor fault, never a measurement
function isValidPm25(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

type RateLimit = Pick<SensorFetchResult, 'rateLimitRemaining' | 'rateLimitResetMs'>;

type RetriedResponse =
  | { kind: 'ok'; body: unknown; rateLimit: RateLimit }
  | { kind: 'not-found'; rateLimit: RateLimit }
  // gave up after retries (network error, 429, 5xx): the answer is unknown, not empty
  | { kind: 'failed'; rateLimit: RateLimit };

/**
 * GETs an OpenAQ URL, retrying network errors, 429s (until the rate-limit reset) and 5xx. Throws on
 * any other 4xx: a bad key or request is a bug, not a flaky sensor, so it must not be skipped.
 */
async function getWithRetries(
  apiKey: string,
  url: string,
  label: string,
): Promise<RetriedResponse> {
  const MAX_RETRIES = 4;
  // Fewer than MAX_RETRIES: a 5xx on one sensor is often persistent, and every retry
  // holds up the whole run (the ~700-sensor ingest has little slack before the jobs that read it).
  const MAX_SERVER_ERROR_RETRIES = 2;
  let attempt = 0;
  // Separate from `attempt` so earlier network/429 retries don't eat the 5xx budget.
  let serverErrorAttempt = 0;

  while (true) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    } catch (err) {
      if (attempt >= MAX_RETRIES) {
        console.warn(
          `[openaq] ${label}: network error after ${attempt} retries (${(err as Error).message}), skipping`,
        );
        return { kind: 'failed', rateLimit: { rateLimitRemaining: null, rateLimitResetMs: null } };
      }
      const waitMs = Math.min(30_000, 2_000 * 2 ** attempt);
      attempt++;
      console.warn(
        `[openaq] ${label}: network error (${(err as Error).message}), retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    const rateLimit = parseRateLimitHeaders(res.headers);

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) {
        console.warn(`[openaq] ${label}: rate limited after ${attempt} retries, skipping`);
        return { kind: 'failed', rateLimit };
      }
      // Use x-ratelimit-reset for the exact window boundary; fall back to exponential backoff
      const waitMs = rateLimit.rateLimitResetMs
        ? Math.max(0, rateLimit.rateLimitResetMs - Date.now()) + 1_000
        : Math.min(60_000, 10_000 * 2 ** attempt);
      attempt++;
      console.warn(
        `[openaq] ${label}: 429, waiting ${Math.round(waitMs / 1000)}s until reset (attempt ${attempt})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (res.status === 404) return { kind: 'not-found', rateLimit };

    if (res.status >= 500) {
      if (serverErrorAttempt >= MAX_SERVER_ERROR_RETRIES) {
        console.warn(
          `[openaq] ${label}: ${res.status} after ${serverErrorAttempt} retries, skipping`,
        );
        return { kind: 'failed', rateLimit };
      }
      const waitMs = Math.min(30_000, 2_000 * 2 ** serverErrorAttempt);
      serverErrorAttempt++;
      console.warn(
        `[openaq] ${label}: ${res.status}, retrying in ${Math.round(waitMs / 1000)}s (attempt ${serverErrorAttempt}/${MAX_SERVER_ERROR_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    // Remaining non-OK statuses are 4xx (bad key, bad request): a config/code bug, not a flaky
    // sensor, so fail loudly rather than skip every sensor.
    if (!res.ok) throw new Error(`OpenAQ ${label} error: ${res.status} ${res.statusText}`);

    return { kind: 'ok', body: await res.json(), rateLimit };
  }
}

export async function fetchLocations(): Promise<OpenAQLocation[]> {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('OPENAQ_API_KEY env var is required');

  const all: OpenAQLocation[] = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/locations?bbox=${DEFAULT_BBOX}&limit=1000&page=${page}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });

    if (!res.ok) {
      throw new Error(`OpenAQ API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as OpenAQResponse;
    all.push(...data.results);

    if (all.length >= data.meta.found) break;
    page++;
  }

  return all;
}
