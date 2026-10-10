import { setTimeout as sleep } from 'node:timers/promises';
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { fetchSensorDailyAverage } from '../utils/openaq.js';
import { getYesterdayBkk } from '../utils/bkkDate.js';
import { fetchAllPages } from '../utils/backfill.js';

const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;
const DEFAULT_DELAY_MS = 1_100; // ~54 req/min — safely under the 60/min free-tier limit
// A sensor "fails" when fetchSensorDailyAverage gives up after its retries (network error, 429,
// 5xx). Empty results (404, no data, stale date) are not failures. Failed sensors are skipped
// and the run continues, so one flaky sensor can't discard everything fetched so far.
//
// The run exits non-zero (reaching Rollbar) when MORE than this share of queried sensors
// failed: a handful of flaky sensors is normal OpenAQ noise, a larger share means the upstream
// is unhealthy and the day's data is meaningfully incomplete. 5% ≈ 35 of ~700 sensors.
// Collected readings are always written first, then the run throws, so partial data persists.
const MAX_FAILED_SENSOR_RATIO = 0.05;
// Stop early if this many sensors fail in a row. Each failure costs seconds of retry backoff,
// so an upstream outage would otherwise grind through all ~700 sensors (and delay the
// fire-pressure and baseline crons that read this job's output). Repeated 429s after waiting
// for reset also mean the hourly quota is exhausted; continuing risks an OpenAQ ban.
const CONSECUTIVE_FAILURE_ABORT = 5;

type StationRow = { id: string; pm25_sensor_ids: number[] };

export async function runStationReadingsIngest(date?: string): Promise<{
  sensorsQueried: number;
  sensorsFailed: number;
  measurementsInserted: number;
}> {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('OPENAQ_API_KEY env var is required');

  // Default to yesterday: the OpenAQ endpoint uses BKK (+07:00) day boundaries, so a complete
  // 24-hour average for "day D" isn't available until 17:00 UTC on day D. Running at 04:00 UTC
  // means today's BKK day is only ~11 hours old — fetch yesterday instead.
  const targetDate = date ?? getYesterdayBkk();

  const stationRows = await fetchAllPages<StationRow>(
    (from, to) =>
      supabase
        .from('stations')
        .select('id, pm25_sensor_ids')
        .filter('pm25_sensor_ids', 'not.eq', '{}')
        .order('id')
        .range(from, to),
    PAGE_SIZE,
  ).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch stations: ${message}`, { cause: err });
  });

  if (!stationRows.length) {
    console.warn(
      '[station-readings-ingest] no stations with pm25_sensor_ids found — run stations-ingest first',
    );
    return { sensorsQueried: 0, sensorsFailed: 0, measurementsInserted: 0 };
  }

  console.log(
    `[station-readings-ingest] Fetching measurements for ${targetDate} across ${stationRows.length} sensors...`,
  );

  // --- fetch daily average per sensor with header-driven adaptive delay ---
  const measurementRows: {
    station_id: string;
    value: number;
    measured_at: string;
  }[] = [];

  let sensorsQueried = 0;
  let sensorsFailed = 0;
  const failedSensorIds: number[] = [];
  let nextDelayMs = DEFAULT_DELAY_MS;
  let consecutiveFailures = 0;
  let abortError: Error | undefined;

  for (const station of stationRows) {
    // Only fetch the first sensor per station — collocated sensors measure the same air
    // and we display one value per location on the map.
    const sensorId = station.pm25_sensor_ids[0];

    // Consume the computed delay, then immediately reset to the safe default.
    // Header-based logic below will override it for the next iteration.
    await sleep(nextDelayMs);
    nextDelayMs = DEFAULT_DELAY_MS;
    sensorsQueried++;
    console.log(
      `[station-readings-ingest] fetching sensor ${sensorId} (${sensorsQueried}/${stationRows.length})`,
    );

    const { readings, rateLimitRemaining, rateLimitResetMs, failed } =
      await fetchSensorDailyAverage(apiKey, sensorId, targetDate);

    // Adjust next delay based on rate-limit headers
    if (rateLimitRemaining !== null && rateLimitResetMs !== null) {
      const timeUntilResetMs = Math.max(0, rateLimitResetMs - Date.now());
      if (rateLimitRemaining <= 2) {
        // Window nearly exhausted — schedule a long pause before the next request
        nextDelayMs = timeUntilResetMs + 1_000;
        console.warn(
          `[station-readings-ingest] rate limit nearly exhausted, pausing ${Math.round(nextDelayMs / 1000)}s until reset`,
        );
      } else {
        // Spread remaining quota evenly over the remaining window,
        // never faster than the safe default rate.
        nextDelayMs = Math.max(DEFAULT_DELAY_MS, Math.ceil(timeUntilResetMs / rateLimitRemaining));
      }
    }

    if (failed) {
      sensorsFailed++;
      failedSensorIds.push(sensorId);
      consecutiveFailures++;
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_ABORT) {
        // Break rather than throw so the readings collected so far are still written below.
        abortError = new Error(
          `[station-readings-ingest] Aborting: ${consecutiveFailures} consecutive sensors failed ` +
            `(network error, 429 or 5xx after retries). OpenAQ is unhealthy or the hourly quota ` +
            `is exhausted; stopping to avoid an OpenAQ ban.`,
        );
        break;
      }
    } else {
      consecutiveFailures = 0;
    }

    for (const r of readings) {
      if (r.value === null || r.value === undefined) continue;
      measurementRows.push({
        station_id: station.id,
        value: r.value,
        measured_at: r.dateUtc,
      });
    }
  }

  console.log(
    `[station-readings-ingest] Collected ${measurementRows.length} measurements for ${targetDate}`,
  );

  // --- insert in batches ---
  for (let i = 0; i < measurementRows.length; i += BATCH_SIZE) {
    const batch = measurementRows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('station_readings')
          .upsert(batch, { onConflict: 'station_id,measured_at', ignoreDuplicates: false });
        if (error)
          throw new AbortError(
            `[station-readings-ingest] Measurements upsert failed (batch ${batchNum}): ${error.message}`,
          );
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: ({ error, attemptNumber, retriesLeft }) =>
          console.warn(
            `[station-readings-ingest] Supabase batch ${batchNum} attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}`,
          ),
      },
    );
  }

  // Invalidate rather than set: the cached value is a processed result (latest reading per
  // station, deduplicated, joined with station metadata, bbox-filtered) that the ingest
  // does not compute — it only has raw measurement rows. Deleting the keys lets the route
  // repopulate with the correct shape on the next request.
  // Only invalidate pm25 — that is the only parameter this job ingests.
  await Promise.all([
    redis.del(`station-readings:latest:pm25:current`),
    redis.del(`station-readings:latest:pm25:${targetDate}`),
  ]);

  const failedRatio = sensorsFailed / sensorsQueried;
  console.log(
    `[station-readings-ingest] ${sensorsFailed}/${sensorsQueried} sensors failed ` +
      `(${(failedRatio * 100).toFixed(1)}%, limit ${MAX_FAILED_SENSOR_RATIO * 100}%)` +
      (failedSensorIds.length > 0 ? `: ${failedSensorIds.join(', ')}` : ''),
  );

  // Thrown only after the writes above, so the partial data from a bad run is kept.
  if (abortError) throw abortError;
  if (failedRatio > MAX_FAILED_SENSOR_RATIO) {
    throw new Error(
      `[station-readings-ingest] ${sensorsFailed}/${sensorsQueried} sensors failed, ` +
        `above the ${MAX_FAILED_SENSOR_RATIO * 100}% limit. Readings for the other sensors were saved.`,
    );
  }

  console.log('[station-readings-ingest] Done');
  return { sensorsQueried, sensorsFailed, measurementsInserted: measurementRows.length };
}
