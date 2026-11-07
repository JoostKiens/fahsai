import pRetry, { AbortError } from 'p-retry';
import { describeFetchError } from '../utils/fetchError.js';
import { HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { cacheReplace } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { fetchAdsGrid } from '../utils/camsAdsGrid.js';
import { logEgressIp } from '../utils/egressIp.js';
import { fetchAirQualityGrid, isConnectionError, OpenMeteoHttpError } from '../utils/openmeteo.js';
import { computeP95, upsertCamsDailySummary } from './cams-summary.js';
import { getYesterdayBkk } from '../utils/bkkDate.js';

const DB_BATCH_SIZE = 500;
// Full grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis.
const MIN_COMPLETE_POINTS = 4000;

export type CamsSource = 'ads' | 'openmeteo';

/** Reads CAMS_SOURCE. Unset means Open-Meteo, so nothing changes until the variable is set. */
export function parseCamsSource(value: string | undefined): CamsSource {
  if (value === undefined || value === '') return 'openmeteo';
  if (value === 'ads' || value === 'openmeteo') return value;
  throw new Error(`[cams-ingest] invalid CAMS_SOURCE "${value}" — expected ads or openmeteo`);
}

// The client retries its own requests. A job that failed (forecast not published yet) or a
// timeout is not helped by starting over a minute later: the fallback cron covers it.
function fetchFromAds(targetDate: string) {
  const apiKey = process.env.ADS_API_KEY;
  if (!apiKey) throw new Error('[cams-ingest] ADS_API_KEY env var is required for source "ads"');
  return fetchAdsGrid(targetDate, apiKey);
}

function fetchFromOpenMeteo(targetDate: string) {
  return pRetry(
    async () => {
      try {
        return await fetchAirQualityGrid(targetDate);
      } catch (err) {
        // Pass the Error object (not just err.message) so p-retry preserves the original
        // stack. new AbortError(string) captures its own stack before name/message are set,
        // making the logged error appear message-less.
        if (err instanceof OpenMeteoHttpError && err.status >= 400 && err.status < 500)
          throw new AbortError(err);
        // A connection error that reaches here already failed its per-batch retries.
        // Restarting the grid would re-spend calls from batch 1 and can push the run over
        // the hourly limit.
        if (isConnectionError(err)) throw new AbortError(err);
        throw err;
      }
    },
    {
      retries: 2,
      minTimeout: 60 * 1000,
      factor: 2,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        const cause = describeFetchError(error);
        console.warn(
          `[cams-ingest] attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}${cause ? ` (${cause})` : ''}`,
        );
      },
    },
  );
}

export async function runCamsIngest(
  date?: string,
  { source = 'openmeteo' }: { source?: CamsSource } = {},
): Promise<{ stored: number }> {
  const targetDate = date ?? getYesterdayBkk();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(`[cams-ingest] invalid date "${targetDate}" — expected YYYY-MM-DD`);
  }

  // Diagnostic only: it must not delay the ingest, and it never throws.
  void logEgressIp();
  console.log(`[cams-ingest] Fetching PM2.5 grid for ${targetDate} from source "${source}"...`);
  const points =
    source === 'ads' ? await fetchFromAds(targetDate) : await fetchFromOpenMeteo(targetDate);
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
        onFailedAttempt: ({ error, attemptNumber, retriesLeft }) =>
          console.warn(
            `[cams-ingest] Supabase batch ${batchNum} attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}`,
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
    const isCached = await cacheReplace(`cams:pm25:${targetDate}`, points, {
      ex: HISTORICAL_TTL_SECONDS,
    });
    if (isCached) {
      console.log(
        `[cams-ingest] Stored in Redis as cams:pm25:${targetDate} (TTL ${HISTORICAL_TTL_SECONDS})`,
      );
    }

    // Pre-compute the daily p95 that powers the scrubber timeline chart. Gated on a complete
    // grid so a rate-limited partial ingest never produces a misleading percentile.
    const p95 = computeP95(points.map((p) => p.pm25));
    await upsertCamsDailySummary(targetDate, p95, points.length);
    console.log(`[cams-ingest] Stored p95 ${p95.toFixed(1)} µg/m³ in cams_daily_summary`);
  } else {
    console.warn(
      `[cams-ingest] Only ${points.length} points — below threshold (${MIN_COMPLETE_POINTS}), skipping Redis write`,
    );
  }

  return { stored: points.length };
}
