/**
 * Backfill station_climatology: precompute seasonal baseline (median, p25, p75)
 * per calendar day per station from the OpenAQ S3 archive.
 *
 * Usage:
 *   pnpm --filter backend run backfill:station-climatology -- --start=2021 --end=2025
 *
 * Defaults: last 5 full calendar years.
 * Idempotent — upserts on (station_id, month, day).
 */
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { buildS3Url, downloadS3File } from '../utils/openaq-s3.js';
import { ICT_OFFSET_MS } from '@thailand-aq/consts';

const WINDOW = 7;
const MIN_READINGS_PER_DAY = 18;
const WRITE_FLOOR = 3;
const BATCH_SIZE = 500;
const CONCURRENCY = 20;
const PAGE_SIZE = 1000;

// --- CLI args ---

function parseYearArg(flag: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return fallback;
  const val = arg.split('=')[1];
  if (!/^\d{4}$/.test(val)) {
    console.error(`[climatology] Invalid --${flag}: "${val}". Expected YYYY`);
    process.exit(1);
  }
  return Number(val);
}

const currentYear = new Date().getUTCFullYear();
const startYear = parseYearArg('start', currentYear - 5);
const endYear = parseYearArg('end', currentYear - 1);

if (startYear > endYear) {
  console.error(`[climatology] --start (${startYear}) must be ≤ --end (${endYear})`);
  process.exit(1);
}

console.log(`[climatology] Years: ${startYear}–${endYear}`);

// --- Helpers ---

async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function dayOfYear(month: number, day: number): number {
  let doy = 0;
  for (let m = 0; m < month - 1; m++) doy += MONTH_DAYS[m];
  return doy + day;
}

function doyToMonthDay(doy: number): { month: number; day: number } {
  let remaining = doy;
  for (let m = 0; m < 12; m++) {
    if (remaining <= MONTH_DAYS[m]) return { month: m + 1, day: remaining };
    remaining -= MONTH_DAYS[m];
  }
  return { month: 12, day: 31 };
}

function datesForYear(year: number): string[] {
  const dates: string[] = [];
  const d = new Date(`${year}-01-01T00:00:00Z`);
  while (d.getUTCFullYear() === year) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// --- CSV parsing ---

interface CsvRow {
  sensors_id: string;
  parameter: string;
  value: string;
  datetime: string;
}

function parsePm25Readings(
  csvContent: string,
  primarySensorId: number,
): { bkkDate: string; value: number }[] {
  let rows: CsvRow[];
  try {
    rows = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
  } catch {
    return [];
  }

  const pm25Rows = rows.filter((r) => r.parameter === 'pm25');
  if (pm25Rows.length === 0) return [];

  const primaryRows = pm25Rows.filter((r) => Number(r.sensors_id) === primarySensorId);
  const targetRows = primaryRows.length > 0 ? primaryRows : pm25Rows;
  const targetSensorId =
    primaryRows.length > 0 ? primarySensorId : Number(targetRows[0].sensors_id);
  const sensorRows = targetRows.filter((r) => Number(r.sensors_id) === targetSensorId);

  const results: { bkkDate: string; value: number }[] = [];
  for (const row of sensorRows) {
    const val = parseFloat(row.value);
    if (!Number.isFinite(val) || val < 0) continue;
    const utcMs = new Date(row.datetime).getTime();
    if (isNaN(utcMs)) continue;
    const bkkDate = new Date(utcMs + ICT_OFFSET_MS).toISOString().slice(0, 10);
    results.push({ bkkDate, value: val });
  }
  return results;
}

// --- Bounded concurrency pool ---

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// --- Main ---

type Station = { id: string; pm25_sensor_ids: number[] };

const stations = await fetchAllPages<Station>((from, to) =>
  supabase
    .from('stations')
    .select('id, pm25_sensor_ids')
    .filter('pm25_sensor_ids', 'not.eq', '{}')
    .range(from, to),
);

if (!stations.length) {
  console.error('[climatology] No stations found');
  process.exit(1);
}

console.log(`[climatology] ${stations.length} stations with pm25 sensors`);

const allDates: string[] = [];
for (let y = startYear; y <= endYear; y++) allDates.push(...datesForYear(y));
console.log(`[climatology] ${allDates.length} dates to check per station`);

let totalUpserted = 0;

for (let si = 0; si < stations.length; si++) {
  const station = stations[si];
  const primarySensorId = station.pm25_sensor_ids[0];
  const allReadings: { bkkDate: string; value: number }[] = [];
  let downloaded = 0;
  let errors = 0;

  await runWithConcurrency(allDates, CONCURRENCY, async (date) => {
    const url = buildS3Url(station.id, date);
    let csv: string | null;
    try {
      csv = await downloadS3File(url);
    } catch (err) {
      errors++;
      if (errors <= 3) {
        console.warn(
          `[climatology] Download error station=${station.id} date=${date}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }
    if (csv === null) return;
    downloaded++;

    const readings = parsePm25Readings(csv, primarySensorId);
    if (readings.length > 0) allReadings.push(...readings);
  });

  // Group by BKK date → daily means with coverage threshold
  const byBkkDate = new Map<string, number[]>();
  for (const r of allReadings) {
    const arr = byBkkDate.get(r.bkkDate) ?? [];
    arr.push(r.value);
    byBkkDate.set(r.bkkDate, arr);
  }

  // Bucket daily means by day-of-year (1–365), folding Feb 29 → Feb 28
  const byDoy = new Map<number, number[]>();
  for (const [dateStr, values] of byBkkDate) {
    if (values.length < MIN_READINGS_PER_DAY) continue;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    let month = Number(dateStr.slice(5, 7));
    let day = Number(dateStr.slice(8, 10));
    if (month === 2 && day === 29) day = 28;
    const doy = dayOfYear(month, day);
    const arr = byDoy.get(doy) ?? [];
    arr.push(mean);
    byDoy.set(doy, arr);
  }

  // Windowed percentiles for each calendar day
  const rows: {
    station_id: string;
    month: number;
    day: number;
    median_pm25: number;
    p25_pm25: number;
    p75_pm25: number;
    n: number;
  }[] = [];

  for (let targetDoy = 1; targetDoy <= 365; targetDoy++) {
    const pool: number[] = [];
    for (let offset = -WINDOW; offset <= WINDOW; offset++) {
      let doy = targetDoy + offset;
      if (doy < 1) doy += 365;
      if (doy > 365) doy -= 365;
      const vals = byDoy.get(doy);
      if (vals) pool.push(...vals);
    }
    if (pool.length < WRITE_FLOOR) continue;

    pool.sort((a, b) => a - b);
    const { month, day } = doyToMonthDay(targetDoy);
    rows.push({
      station_id: station.id,
      month,
      day,
      median_pm25: Math.round(quantile(pool, 0.5) * 10) / 10,
      p25_pm25: Math.round(quantile(pool, 0.25) * 10) / 10,
      p75_pm25: Math.round(quantile(pool, 0.75) * 10) / 10,
      n: pool.length,
    });
  }

  // Batch upsert
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('station_climatology')
          .upsert(batch, { onConflict: 'station_id,month,day', ignoreDuplicates: false });
        if (error) throw new AbortError(`Upsert failed: ${error.message}`);
      },
      {
        retries: 3,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (err) =>
          console.warn(`[climatology] Upsert attempt ${err.attemptNumber} failed: ${err.message}`),
      },
    );
  }

  totalUpserted += rows.length;
  console.log(
    `[climatology] ${si + 1}/${stations.length} station=${station.id} → ${rows.length} rows (${byDoy.size} days, ${downloaded} files, ${errors} errors)`,
  );
}

console.log(`[climatology] Done — ${totalUpserted} total rows upserted`);
process.exit(0);
