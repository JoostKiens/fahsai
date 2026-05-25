/**
 * Backfill station_readings from OpenAQ's public S3 archive.
 * Bypasses the rate-limited API entirely — no credentials required.
 *
 * Usage:
 *   pnpm --filter backend run backfill:station-readings [startDate] [endDate]
 *   # e.g. backfill:station-readings 2026-02-14 2026-03-28
 *
 * Defaults: startDate = today - 100 days, endDate = today - 57 days.
 * Both arguments are YYYY-MM-DD.
 *
 * S3 files are available ≥72h after end of local day, so anything older
 * than ~3 days is safe to backfill. Current-day data still needs the API.
 */
import 'dotenv/config';
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { buildS3Url, downloadS3File, computeDailyMean } from '../lib/openaq-s3.js';

const BATCH_SIZE = 500;
const CONCURRENCY = 20;

function parseDateArg(arg: string | undefined, fallbackDaysAgo: number): string {
  if (arg !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      console.error(`[backfill-s3] Invalid date format: "${arg}". Expected YYYY-MM-DD`);
      process.exit(1);
    }
    return arg;
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - fallbackDaysAgo);
  return d.toISOString().slice(0, 10);
}

const startDate = parseDateArg(process.argv[2], 100);
const endDate = parseDateArg(process.argv[3], 57);

if (startDate > endDate) {
  console.error(`[backfill-s3] startDate (${startDate}) must be ≤ endDate (${endDate})`);
  process.exit(1);
}

// Generate inclusive date range
const dates: string[] = [];
const cursor = new Date(`${startDate}T00:00:00Z`);
const endCursor = new Date(`${endDate}T00:00:00Z`);
while (cursor <= endCursor) {
  dates.push(cursor.toISOString().slice(0, 10));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

console.log(`[backfill-s3] Date range: ${startDate} → ${endDate} (${dates.length} days)`);

// Fetch all stations that have pm25 sensor IDs
const { data: stations, error: stationsError } = await supabase
  .from('stations')
  .select('id, pm25_sensor_ids')
  .filter('pm25_sensor_ids', 'not.eq', '{}');

if (stationsError) throw new Error(`Failed to fetch stations: ${stationsError.message}`);
if (!stations?.length) {
  console.error('[backfill-s3] No stations found — run ingest:stations first');
  process.exit(1);
}

console.log(`[backfill-s3] ${stations.length} stations with pm25 sensors`);

type Station = { id: string; pm25_sensor_ids: number[] };
type MeasurementRow = {
  station_id: string;
  value: number;
  measured_at: string;
};

// Collect all work items (station × date)
const workItems: Array<{ station: Station; date: string }> = [];
for (const date of dates) {
  for (const station of stations as Station[]) {
    workItems.push({ station, date });
  }
}

console.log(`[backfill-s3] ${workItems.length} (station, date) pairs to check`);

const measurementRows: MeasurementRow[] = [];
let downloaded = 0;
let missing = 0;
let errored = 0;

async function processItem(item: { station: Station; date: string }): Promise<void> {
  const { station, date } = item;
  const primarySensorId = station.pm25_sensor_ids[0];
  const url = buildS3Url(station.id, date);

  let csvContent: string | null;
  try {
    csvContent = await downloadS3File(url);
  } catch (err) {
    errored++;
    console.warn(
      `[backfill-s3] Download error station=${station.id} date=${date}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (csvContent === null) {
    missing++;
    return;
  }

  downloaded++;
  const result = computeDailyMean(csvContent, primarySensorId);
  if (result === null) {
    console.warn(`[backfill-s3] No valid pm25 data: station=${station.id} date=${date}`);
    return;
  }

  measurementRows.push({
    station_id: station.id,
    value: result.value,
    measured_at: `${date}T00:00:00Z`,
  });
}

// Bounded concurrency pool — no rate limit on S3
async function runWithConcurrency(
  items: Array<{ station: Station; date: string }>,
  limit: number,
): Promise<void> {
  const queue = [...items];
  let processed = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await processItem(item);
      processed++;
      if (processed % 1000 === 0) {
        console.log(
          `[backfill-s3] Progress: ${processed}/${items.length} — ` +
            `${downloaded} downloaded, ${missing} missing, ${errored} errors, ${measurementRows.length} rows collected`,
        );
      }
    }
  });

  await Promise.all(workers);
}

await runWithConcurrency(workItems, CONCURRENCY);

console.log(
  `[backfill-s3] Downloads done: ${downloaded} files, ${missing} missing (404), ${errored} errors`,
);
console.log(`[backfill-s3] ${measurementRows.length} measurements to upsert`);

// Batch upsert — same conflict key as the regular ingest job
for (let i = 0; i < measurementRows.length; i += BATCH_SIZE) {
  const batch = measurementRows.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(measurementRows.length / BATCH_SIZE);

  await pRetry(
    async () => {
      const { error } = await supabase
        .from('station_readings')
        .upsert(batch, { onConflict: 'station_id,measured_at', ignoreDuplicates: false });
      if (error) throw new AbortError(`Upsert failed (batch ${batchNum}): ${error.message}`);
    },
    {
      retries: 3,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: (err) =>
        console.warn(
          `[backfill-s3] Batch ${batchNum} attempt ${err.attemptNumber} failed: ${err.message}`,
        ),
    },
  );

  if (batchNum % 10 === 0 || batchNum === totalBatches) {
    console.log(`[backfill-s3] Inserted batch ${batchNum}/${totalBatches}`);
  }
}

// Invalidate Redis cache for all affected dates and the "current" key
const redisKeys = [
  'station-readings:latest:pm25:current',
  ...dates.map((d) => `station-readings:latest:pm25:${d}`),
];
await Promise.all(redisKeys.map((k) => redis.del(k)));

console.log(`[backfill-s3] Done — ${measurementRows.length} measurements written`);
process.exit(0);
