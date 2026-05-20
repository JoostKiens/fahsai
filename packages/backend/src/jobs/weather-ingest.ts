import pRetry, { AbortError } from 'p-retry';
import { redis, HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { fetchWeatherGridForDate } from '../lib/openmeteo.js';

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
        // Abort only on permanent client errors (400/401/403/404/422).
        // 429 is handled with retries inside fetchWeatherBatch; let it propagate
        // to pRetry's exponential backoff if the internal retries are exhausted.
        if (err instanceof Error && /\b(400|401|403|404|414|422)\b/.test(msg))
          throw new AbortError(msg);
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
    wind_speed_max_kmh: r.wind_speed_max_kmh,
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

  // Pre-compute weather for every active station so the history endpoint can do a
  // simple station_weather lookup instead of a weather_readings grid snap at query time.
  await precomputeStationWeather(targetDate, readings);

  // Set Redis directly: the ingest produces the exact value both weather routes serve
  // verbatim (no join, deduplication, or projection needed), so we can warm both cache
  // keys here rather than waiting for the first API request to repopulate them.
  // Only cache complete grids — partial data from a rate-limited run must not poison Redis.
  if (readings.length >= MIN_COMPLETE_POINTS) {
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

// Grid constants — must match openmeteo.ts
const SNAP_LAT_MIN = 1.0;
const SNAP_LNG_MIN = 89.0;
const SNAP_STEP = 0.4;

function snapToGrid(coord: number, min: number): number {
  return Math.round((min + Math.round((coord - min) / SNAP_STEP) * SNAP_STEP) * 100) / 100;
}

async function precomputeStationWeather(
  date: string,
  readings: {
    lat: number;
    lng: number;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[],
): Promise<void> {
  const PAGE_SIZE = 1000;

  // Use station_ids from station_readings for this date — only stations that actually
  // reported pm25 will appear on the map, so only they need weather pre-computed.
  // (weather-ingest runs at 08:00 UTC, after aqi-ingest pass 2 at 04:00 UTC, so
  // yesterday's readings are already present.)
  const reportingIds = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('station_readings')
      .select('station_id')
      .eq('parameter', 'pm25')
      .gte('measured_at', `${date}T00:00:00Z`)
      .lte('measured_at', `${date}T23:59:59Z`)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn(
        '[weather-ingest] Could not fetch station_readings for pre-computation:',
        error.message,
      );
      return;
    }
    if (!data?.length) break;
    for (const r of data) reportingIds.add(r.station_id as string);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (!reportingIds.size) {
    console.warn(
      `[weather-ingest] No pm25 readings found for ${date} — skipping station_weather pre-computation`,
    );
    return;
  }

  // Fetch coordinates for the reporting stations.
  const stations: { id: string; lat: number; lng: number }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('stations')
      .select('id, lat, lng')
      .in('id', [...reportingIds])
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn('[weather-ingest] Could not fetch station coordinates:', error.message);
      return;
    }
    if (!data?.length) break;
    stations.push(...(data as { id: string; lat: number; lng: number }[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (!stations.length) {
    console.warn('[weather-ingest] No station coordinates found for pre-computation');
    return;
  }

  // Build O(1) lookup: key by SNAPPED coords so the map agrees with the station snap,
  // even if a reading's lat/lng has minor float drift.
  const gridMap = new Map<string, (typeof readings)[0]>();
  for (const r of readings) {
    gridMap.set(`${snapToGrid(r.lat, SNAP_LAT_MIN)},${snapToGrid(r.lng, SNAP_LNG_MIN)}`, r);
  }

  const rows: {
    date: string;
    station_id: string;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[] = [];

  for (const station of stations) {
    const snappedLat = snapToGrid(station.lat, SNAP_LAT_MIN);
    const snappedLng = snapToGrid(station.lng, SNAP_LNG_MIN);
    const reading = gridMap.get(`${snappedLat},${snappedLng}`);
    if (!reading) continue;
    rows.push({
      date,
      station_id: station.id,
      wind_speed_kmh: reading.wind_speed_kmh,
      wind_direction_deg: reading.wind_direction_deg,
      precipitation_sum: reading.precipitation_sum,
      relative_humidity_2m: reading.relative_humidity_2m,
    });
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: upsertError } = await supabase
      .from('station_weather')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'station_id,date', ignoreDuplicates: false });
    if (upsertError) {
      console.error('[weather-ingest] station_weather upsert failed:', upsertError.message);
      return;
    }
  }

  console.log(
    `[weather-ingest] Pre-computed weather for ${rows.length}/${stations.length} stations → station_weather`,
  );
}
