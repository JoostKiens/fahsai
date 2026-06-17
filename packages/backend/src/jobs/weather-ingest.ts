import pRetry, { AbortError } from 'p-retry';
import { redis, HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { fetchWeatherGridForDate, OpenMeteoHttpError } from '../utils/openmeteo.js';
import { precomputeStationWeather } from '../utils/computeStationWeather.js';

const DB_BATCH_SIZE = 500;
// Full weather grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis.
const MIN_COMPLETE_POINTS = 4000;

export function weatherCacheKey(date: string): string {
  return `weather:${date}`;
}

export function windCacheKey(date: string): string {
  return `weather:wind:${date}`;
}

export type RunWeatherIngestOptions = {
  /** UTC calendar day (YYYY-MM-DD) — passed from HTTP handler so it matches resolved ?date default after awaits. */
  calendarDayUtc?: string;
};

export async function runWeatherIngest(
  date?: string,
  opts?: RunWeatherIngestOptions,
): Promise<{ stored: number }> {
  // Default to yesterday: the 07:00 UTC wind snapshot hasn't been taken yet when the cron
  // runs at 04:00 UTC, so today's reading would be missing or stale.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const calendarDayUtc = opts?.calendarDayUtc ?? today;
  const targetDate = date ?? yesterday;

  console.log(`[weather-ingest] Fetching weather grid for ${targetDate} from Open-Meteo...`);
  const readings = await pRetry(
    async () => {
      try {
        return await fetchWeatherGridForDate(targetDate, { calendarDayUtc });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[weather-ingest] fetch error: ${msg}`);
        // Abort only on permanent client errors (400–499, excluding 429).
        // 429 is handled with retries inside fetchWeatherBatch; let it propagate
        // to pRetry's exponential backoff if the internal retries are exhausted.
        if (
          err instanceof OpenMeteoHttpError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        )
          throw new AbortError(err);
        throw err;
      }
    },
    {
      retries: 2,
      minTimeout: 60 * 1000,
      factor: 2,
      onFailedAttempt: (err) => {
        const cause =
          err.cause instanceof Error
            ? ((err.cause as { code?: string }).code ?? err.cause.name ?? err.cause.message)
            : undefined;
        console.warn(
          `[weather-ingest] attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}${cause ? ` (${cause})` : ''}`,
        );
      },
    },
  );
  console.log(`[weather-ingest] Fetched ${readings.length} grid points`);

  if (readings.length === 0) {
    console.warn(
      `[weather-ingest] No grid points returned — skipping writes to preserve existing data`,
    );
    return { stored: 0 };
  }

  // Persist to Supabase first — durable store must be written before the cache.
  // If Redis write fails after this, the API route will read from Supabase on cache
  // miss and repopulate Redis automatically.
  const rows = readings.map((r) => ({
    date: targetDate,
    lat: r.lat,
    lng: r.lng,
    wind_speed_kmh: r.wind_speed_kmh,
    wind_direction_deg: r.wind_direction_deg,
    relative_humidity_2m: r.relative_humidity_2m,
    precipitation_sum: r.precipitation_sum,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    const batchNum = Math.floor(i / DB_BATCH_SIZE) + 1;
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('weather_readings')
          .upsert(batch, { onConflict: 'date,lat,lng', ignoreDuplicates: true });
        if (error)
          throw new AbortError(
            `[weather-ingest] Supabase upsert failed (batch ${batchNum}): ${error.message}`,
          );
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (err) =>
          console.warn(
            `[weather-ingest] Supabase batch ${batchNum} attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}`,
          ),
      },
    );
  }
  console.log(`[weather-ingest] Persisted ${readings.length} rows to weather_readings`);

  // Only act on complete grids — partial data from a rate-limited run must not poison
  // station_weather rows or the Redis cache.
  if (readings.length >= MIN_COMPLETE_POINTS) {
    try {
      await precomputeStationWeather(targetDate, readings);
    } catch (err) {
      console.error(
        `[weather-ingest] station_weather precompute failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const windReadings = readings.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      wind_speed_kmh: r.wind_speed_kmh,
      wind_direction_deg: r.wind_direction_deg,
    }));
    await Promise.all([
      redis.set(weatherCacheKey(targetDate), readings, { ex: HISTORICAL_TTL_SECONDS }),
      redis.set(windCacheKey(targetDate), windReadings, { ex: HISTORICAL_TTL_SECONDS }),
    ]);
    console.log(
      `[weather-ingest] Stored in Redis as weather:${targetDate} and weather:wind:${targetDate} (TTL 7d)`,
    );
  } else {
    console.warn(
      `[weather-ingest] Only ${readings.length} points — below threshold (${MIN_COMPLETE_POINTS}), skipping Redis write`,
    );
  }

  return { stored: readings.length };
}
