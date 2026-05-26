import pRetry, { AbortError } from 'p-retry';
import { redis, HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { fetchAirQualityGrid, OpenMeteoHttpError } from '../lib/openmeteo.js';

const DB_BATCH_SIZE = 500;
// Full grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis.
const MIN_COMPLETE_POINTS = 4000;

export async function runCamsIngest(date?: string): Promise<{ stored: number }> {
  const targetDate =
    date ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(`[cams-ingest] invalid date "${targetDate}" — expected YYYY-MM-DD`);
  }

  console.log(`[cams-ingest] Fetching PM2.5 grid from Open-Meteo for ${targetDate}...`);
  const points = await pRetry(
    async () => {
      try {
        return await fetchAirQualityGrid(targetDate);
      } catch (err) {
        // Pass the Error object (not just err.message) so p-retry preserves the original
        // stack. new AbortError(string) captures its own stack before name/message are set,
        // making the logged error appear message-less.
        if (err instanceof OpenMeteoHttpError && err.status >= 400 && err.status < 500)
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
          `[cams-ingest] attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}${cause ? ` (${cause})` : ''}`,
        );
      },
    },
  );
  console.log(`[cams-ingest] Fetched ${points.length} grid points`);

  if (points.length === 0) {
    console.warn(
      `[cams-ingest] No grid points returned — skipping writes to preserve existing data`,
    );
    return { stored: 0 };
  }

  // Persist to Supabase first — durable store must be written before the cache.
  // If Redis write fails after this, the API route will read from Supabase on cache
  // miss and repopulate Redis automatically.
  const rows = points.map((p) => ({ date: targetDate, lat: p.lat, lng: p.lng, pm25: p.pm25 }));
  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    const batchNum = Math.floor(i / DB_BATCH_SIZE) + 1;
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('cams_grid')
          .upsert(batch, { onConflict: 'date,lat,lng', ignoreDuplicates: true });
        if (error)
          throw new AbortError(
            `[cams-ingest] Supabase upsert failed (batch ${batchNum}): ${error.message}`,
          );
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (err) =>
          console.warn(
            `[cams-ingest] Supabase batch ${batchNum} attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}`,
          ),
      },
    );
  }
  console.log(`[cams-ingest] Persisted ${points.length} rows to cams_grid`);

  // Set Redis directly: the ingest produces the exact value the CAMS route serves
  // verbatim (no join, deduplication, or projection needed), so we can warm the cache
  // key here rather than waiting for the first API request to repopulate it.
  // Only cache complete grids — partial data from a rate-limited run must not poison
  // Redis. Supabase accumulates partial rows above so subsequent ingests can reach the
  // full 4,599 points even when Redis is skipped.
  if (points.length >= MIN_COMPLETE_POINTS) {
    await redis.set(`cams:pm25:${targetDate}`, points, { ex: HISTORICAL_TTL_SECONDS });
    console.log(
      `[cams-ingest] Stored in Redis as cams:pm25:${targetDate} (TTL ${HISTORICAL_TTL_SECONDS})`,
    );
  } else {
    console.warn(
      `[cams-ingest] Only ${points.length} points — below threshold (${MIN_COMPLETE_POINTS}), skipping Redis write`,
    );
  }

  return { stored: points.length };
}
