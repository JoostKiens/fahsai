import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { fetchLocations, fetchSensorDailyAverage, PARAMETERS } from '../lib/openaq.js';
import { type CachedSensor, SENSOR_CACHE_KEY, SENSOR_CACHE_TTL } from './stations-ingest.js';

const BATCH_SIZE = 500;
const DEFAULT_DELAY_MS = 1_100; // ~54 req/min — safely under the 60/min free-tier limit
// Abort the entire run if this many sensors are skipped due to 429s in a row.
// Repeated 429s after waiting for reset means the hourly quota is exhausted.
// Continuing would risk a temporary or permanent ban from OpenAQ.
const CONSECUTIVE_429_ABORT = 5;
// Countries whose stations fall within the viewport bbox [89,1,114,30]
const TARGET_COUNTRIES = new Set(['TH', 'MM', 'LA', 'KH', 'VN', 'CN', 'BD', 'MY', 'IN']);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAqiIngest(date?: string): Promise<{
  sensorsQueried: number;
  measurementsInserted: number;
}> {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('OPENAQ_API_KEY env var is required');

  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const dateFrom = `${targetDate}T00:00:00Z`;
  const dateTo = `${targetDate}T23:59:59Z`;

  // --- build sensor list (three-tier: Redis → fetchLocations fallback) ---
  //
  // 1. Redis: stations-ingest writes the full sensor list here weekly (TTL 8 days).
  //    This is the authoritative source — covers all sensors, including ones that
  //    have never reported data yet.
  // 2. fetchLocations() fallback: Redis cache is cold (first run before stations-ingest
  //    has ever run). Fetches fresh from the API and populates the Redis cache.
  let sensorsToFetch: CachedSensor[] = [];

  const cached = await redis.get<CachedSensor[]>(SENSOR_CACHE_KEY);

  if (cached?.length) {
    // The cache contains all parameters within the bbox — filter to pm25 only.
    // Country scoping is implicit: fetchLocations uses DEFAULT_BBOX [89,1,114,30]
    // which already covers exactly TARGET_COUNTRIES.
    sensorsToFetch = cached.filter((s) => s.parameter === 'pm25');
    console.log(`[aqi-ingest] Using ${sensorsToFetch.length} pm25 sensors from Redis cache`);
  } else {
    // Cold start: Redis cache is empty — call the API directly to bootstrap
    console.log('[aqi-ingest] Redis sensor cache empty — falling back to fetchLocations()');
    const locations = await fetchLocations();

    // Cache the full sensor list (all parameters) so subsequent runs skip this fetch
    const allSensors: CachedSensor[] = locations.flatMap((loc) =>
      loc.sensors
        .filter((s) => (PARAMETERS as readonly string[]).includes(s.parameter.name))
        .map((s) => ({
          sensorId: s.id,
          locationId: String(loc.id),
          parameter: s.parameter.name,
          unit: s.parameter.units,
        })),
    );
    await redis.set(SENSOR_CACHE_KEY, allSensors, { ex: SENSOR_CACHE_TTL });
    console.log(`[aqi-ingest] Cached ${allSensors.length} sensors in Redis (TTL 8 days)`);

    sensorsToFetch = locations
      .filter((loc) => loc.country !== null && TARGET_COUNTRIES.has(loc.country.code))
      .flatMap((loc) =>
        loc.sensors
          .filter((s) => s.parameter.name === 'pm25')
          .map((s) => ({
            sensorId: s.id,
            locationId: String(loc.id),
            parameter: s.parameter.name,
            unit: s.parameter.units,
          })),
      );
    console.log(`[aqi-ingest] Fetched ${sensorsToFetch.length} pm25 sensors from API (bootstrap)`);
  }

  console.log(
    `[aqi-ingest] Fetching measurements for ${sensorsToFetch.length} sensors for ${targetDate}...`,
  );

  // --- fetch daily average per sensor with header-driven adaptive delay ---
  const measurementRows: {
    station_id: string;
    sensor_id: number;
    parameter: string;
    value: number;
    unit: string;
    measured_at: string;
  }[] = [];

  let nextDelayMs = DEFAULT_DELAY_MS;
  let consecutive429s = 0;

  for (const s of sensorsToFetch) {
    // Consume the computed delay, then immediately reset to the safe default.
    // Header-based logic below will override it for the next iteration.
    await sleep(nextDelayMs);
    nextDelayMs = DEFAULT_DELAY_MS;

    const { readings, rateLimitRemaining, rateLimitResetMs } = await fetchSensorDailyAverage(
      apiKey,
      s.sensorId,
      dateFrom,
      dateTo,
    );

    // Adjust next delay based on rate-limit headers
    if (rateLimitRemaining !== null && rateLimitResetMs !== null) {
      const timeUntilResetMs = Math.max(0, rateLimitResetMs - Date.now());
      if (rateLimitRemaining <= 2) {
        // Window nearly exhausted — schedule a long pause before the next request
        nextDelayMs = timeUntilResetMs + 1_000;
        console.warn(
          `[aqi-ingest] rate limit nearly exhausted, pausing ${Math.round(nextDelayMs / 1000)}s until reset`,
        );
      } else {
        // Spread remaining quota evenly over the remaining window,
        // never faster than the safe default rate.
        nextDelayMs = Math.max(DEFAULT_DELAY_MS, Math.ceil(timeUntilResetMs / rateLimitRemaining));
      }
    }

    if (readings.length === 0 && rateLimitRemaining === 0) {
      // Sensor was skipped due to exhausted retries on 429
      consecutive429s++;
      if (consecutive429s >= CONSECUTIVE_429_ABORT) {
        throw new Error(
          `[aqi-ingest] Aborting: ${consecutive429s} consecutive sensors skipped due to 429. ` +
            `Hourly quota likely exhausted. Stopping to avoid an OpenAQ ban.`,
        );
      }
    } else {
      consecutive429s = 0;
    }

    for (const r of readings) {
      if (r.value === null || r.value === undefined) continue;
      measurementRows.push({
        station_id: s.locationId,
        sensor_id: s.sensorId,
        parameter: s.parameter,
        value: r.value,
        unit: s.unit,
        measured_at: r.dateUtc,
      });
    }
  }

  console.log(`[aqi-ingest] Collected ${measurementRows.length} measurements for ${targetDate}`);

  // --- insert in batches ---
  for (let i = 0; i < measurementRows.length; i += BATCH_SIZE) {
    const batch = measurementRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('measurements')
      .upsert(batch, { onConflict: 'sensor_id,measured_at', ignoreDuplicates: true });

    if (error) {
      throw new Error(`Measurements upsert failed (batch ${i / BATCH_SIZE + 1}): ${error.message}`);
    }
  }

  // Invalidate Redis cache
  await Promise.all(
    PARAMETERS.flatMap((p) => [
      redis.del(`measurements:latest:${p}:current`),
      redis.del(`measurements:latest:${p}:${targetDate}`),
    ]),
  );

  console.log('[aqi-ingest] Done');
  return { sensorsQueried: sensorsToFetch.length, measurementsInserted: measurementRows.length };
}
