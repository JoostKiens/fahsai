import { parse } from 'csv-parse/sync';
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { buildS3Url, downloadS3File } from '../utils/openaq-s3.js';
import { runWithConcurrency } from '../utils/backfill.js';
import { bangkokDateString } from '../utils/bkkDate.js';

export const WINDOW = 7;
const MIN_READINGS_PER_DAY = 18;
const WRITE_FLOOR = 3;
const BATCH_SIZE = 500;
const CONCURRENCY = 20;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dayOfYear(month: number, day: number): number {
  let doy = 0;
  for (let m = 0; m < month - 1; m++) doy += MONTH_DAYS[m];
  return doy + day;
}

export function doyToMonthDay(doy: number): { month: number; day: number } {
  let remaining = doy;
  for (let m = 0; m < 12; m++) {
    if (remaining <= MONTH_DAYS[m]) return { month: m + 1, day: remaining };
    remaining -= MONTH_DAYS[m];
  }
  return { month: 12, day: 31 };
}

function wrapDoy(doy: number): number {
  if (doy < 1) return doy + 365;
  if (doy > 365) return doy - 365;
  return doy;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

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
    const bkkDate = bangkokDateString(utcMs);
    results.push({ bkkDate, value: val });
  }
  return results;
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

export interface BaselineStation {
  id: string;
  pm25_sensor_ids: number[];
}

export interface RunStationBaselineOptions {
  stations: BaselineStation[];
  /** Historical calendar years to pull raw readings from the OpenAQ S3 archive. Empty for the daily job. */
  years: number[];
  /** Rows to (re)compute; omit for a full backfill of all 365 days. */
  targetDoys?: number[];
  /**
   * stationId -> (day-of-year -> daily mean pm25) sourced from `station_readings` for the
   * current year. Only meaningful when `targetDoys` is set.
   */
  currentYearReadings?: Map<string, Map<number, number>>;
  /** Calendar year `currentYearReadings` values belong to, for stamping min_year/max_year. */
  currentYear?: number;
  /**
   * stationId -> day-of-year values that already have a station_baseline row. Those rows are
   * left untouched (frozen at whatever the last full backfill computed) rather than
   * recomputed from a single year's data. Only meaningful when `targetDoys` is set.
   */
  existingDoys?: Map<string, Set<number>>;
}

export interface RunStationBaselineResult {
  totalUpserted: number;
}

export async function runStationBaseline(
  options: RunStationBaselineOptions,
): Promise<RunStationBaselineResult> {
  const { stations, years, targetDoys, currentYearReadings, currentYear, existingDoys } = options;
  const doysToWrite = targetDoys ?? Array.from({ length: 365 }, (_, i) => i + 1);

  let totalUpserted = 0;

  for (let si = 0; si < stations.length; si++) {
    const station = stations[si];
    const primarySensorId = station.pm25_sensor_ids[0];
    const allReadings: { bkkDate: string; value: number }[] = [];
    let downloaded = 0;
    let errors = 0;

    const allDates: string[] = [];
    for (const year of years) allDates.push(...datesForYear(year));

    await runWithConcurrency(allDates, CONCURRENCY, async (date) => {
      const url = buildS3Url(station.id, date);
      let csv: string | null;
      try {
        csv = await downloadS3File(url);
      } catch (err) {
        errors++;
        if (errors <= 3) {
          console.warn(
            `[baseline] Download error station=${station.id} date=${date}: ${err instanceof Error ? err.message : String(err)}`,
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
    let dataMinYear = Infinity;
    let dataMaxYear = -Infinity;
    for (const [dateStr, values] of byBkkDate) {
      if (values.length < MIN_READINGS_PER_DAY) continue;
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const year = Number(dateStr.slice(0, 4));
      if (year < dataMinYear) dataMinYear = year;
      if (year > dataMaxYear) dataMaxYear = year;
      let month = Number(dateStr.slice(5, 7));
      let day = Number(dateStr.slice(8, 10));
      if (month === 2 && day === 29) day = 28;
      const doy = dayOfYear(month, day);
      const arr = byDoy.get(doy) ?? [];
      arr.push(mean);
      byDoy.set(doy, arr);
    }

    const currentYearByDoy = currentYearReadings?.get(station.id);
    if (currentYearByDoy && currentYearByDoy.size > 0) {
      for (const [doy, value] of currentYearByDoy) {
        const arr = byDoy.get(doy) ?? [];
        arr.push(value);
        byDoy.set(doy, arr);
      }
      if (currentYear !== undefined) {
        if (currentYear < dataMinYear) dataMinYear = currentYear;
        if (currentYear > dataMaxYear) dataMaxYear = currentYear;
      }
    }

    const hasYearData = dataMinYear !== Infinity;
    const stationExistingDoys = existingDoys?.get(station.id);

    const rows: {
      station_id: string;
      month: number;
      day: number;
      median_pm25: number;
      p25_pm25: number;
      p75_pm25: number;
      n: number;
      min_year: number | null;
      max_year: number | null;
    }[] = [];

    for (const targetDoy of doysToWrite) {
      // Already backfilled with a full multi-year pool — leave it frozen rather than
      // recompute from whatever narrower data this run happens to have.
      if (stationExistingDoys?.has(targetDoy)) continue;

      const pool: number[] = [];
      for (let offset = -WINDOW; offset <= WINDOW; offset++) {
        const vals = byDoy.get(wrapDoy(targetDoy + offset));
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
        min_year: hasYearData ? dataMinYear : null,
        max_year: hasYearData ? dataMaxYear : null,
      });
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await pRetry(
        async () => {
          const { error } = await supabase
            .from('station_baseline')
            .upsert(batch, { onConflict: 'station_id,month,day', ignoreDuplicates: false });
          if (error) throw new AbortError(`Upsert failed: ${error.message}`);
        },
        {
          retries: 3,
          minTimeout: 1000,
          factor: 2,
          onFailedAttempt: (err) =>
            console.warn(`[baseline] Upsert attempt ${err.attemptNumber} failed: ${err.message}`),
        },
      );
    }

    totalUpserted += rows.length;
    console.log(
      `[baseline] ${si + 1}/${stations.length} station=${station.id} → ${rows.length} rows (${byDoy.size} days, ${downloaded} files, ${errors} errors)`,
    );
  }

  console.log(`[baseline] Done — ${totalUpserted} total rows upserted`);
  return { totalUpserted };
}
