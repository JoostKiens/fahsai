/**
 * Daily upkeep for station_baseline: fills in station_baseline rows that don't yet have a
 * genuine multi-year pool (e.g. a newer station whose curve stops mid-year) using only this
 * year's station_readings data — no OpenAQ S3 archive access at all. Rows already backed by a
 * multi-year pool (min_year !== max_year) are left untouched rather than recomputed from a
 * single year's narrower data; single-year rows (whether from a fresh manual backfill or a
 * previous daily run) stay eligible so they keep accumulating this year's data until a real
 * multi-year backfill supersedes them.
 *
 * Must run after station-readings-ingest, since it reads yesterday's value straight from
 * station_readings.
 *
 * For a full re-backfill (e.g. after adding new stations), use backfill-station-baseline.ts.
 */
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { dayOfYear, doyToMonthDay, runStationBaseline, WINDOW } from '../jobs/station-baseline.js';
import { fetchAllPages } from '../utils/backfill.js';
import { bangkokDateString, bangkokMidnightUtcMs, getYesterdayBkk } from '../utils/bkkDate.js';
import { offsetDate } from '../utils/trajectory.js';

const LOG = '[station-baseline-ingest]';
const PAGE_SIZE = 1000;

interface StationRow {
  id: string;
  pm25_sensor_ids: number[];
}

interface ReadingRow {
  station_id: string;
  value: number;
  measured_at: string;
}

interface ExistingBaselineRow {
  station_id: string;
  month: number;
  day: number;
  min_year: number | null;
  max_year: number | null;
}

const targetDate = getYesterdayBkk();
const targetMonth = Number(targetDate.slice(5, 7));
let targetDay = Number(targetDate.slice(8, 10));
if (targetMonth === 2 && targetDay === 29) targetDay = 28;
const newDoy = dayOfYear(targetMonth, targetDay);
const currentYear = Number(targetDate.slice(0, 4));

// Rows this run may write: yesterday's day-of-year ± WINDOW.
const targetDoys: number[] = [];
for (let offset = -WINDOW; offset <= WINDOW; offset++) {
  let doy = newDoy + offset;
  if (doy < 1) doy += 365;
  if (doy > 365) doy -= 365;
  targetDoys.push(doy);
}

// Each targetDoy needs its own ±WINDOW pool, so the union of dates actually needed spans
// ±2*WINDOW around targetDate (the outermost targetDoys would otherwise get a pool built
// from only half their intended window).
const rangeStart = offsetDate(targetDate, -2 * WINDOW);
const rangeEnd = offsetDate(targetDate, 2 * WINDOW);
const since = new Date(bangkokMidnightUtcMs(rangeStart)).toISOString();
const until = new Date(bangkokMidnightUtcMs(rangeEnd) + MS_PER_DAY).toISOString();

const targetMonths = [...new Set(targetDoys.map((doy) => doyToMonthDay(doy).month))];

try {
  const [stations, readingRows, existingRows] = await Promise.all([
    fetchAllPages<StationRow>(
      (from, to) =>
        supabase
          .from('stations')
          .select('id, pm25_sensor_ids')
          .filter('pm25_sensor_ids', 'not.eq', '{}')
          .range(from, to),
      PAGE_SIZE,
    ),
    fetchAllPages<ReadingRow>(
      (from, to) =>
        supabase
          .from('station_readings')
          .select('station_id, value, measured_at')
          .gte('measured_at', since)
          .lt('measured_at', until)
          .range(from, to),
      PAGE_SIZE,
    ),
    fetchAllPages<ExistingBaselineRow>(
      (from, to) =>
        supabase
          .from('station_baseline')
          .select('station_id, month, day, min_year, max_year')
          .in('month', targetMonths)
          .range(from, to),
      PAGE_SIZE,
    ),
  ]);

  if (!stations.length) {
    console.error(`${LOG} no stations found`);
    process.exit(1);
  }

  // This year's contribution to the pool. Multiple readings can fold onto the same
  // day-of-year (Feb 29 -> Feb 28 in a leap year), so accumulate an array per doy rather
  // than a single scalar -- otherwise one of the two readings is silently dropped.
  const currentYearReadings = new Map<string, Map<number, number[]>>();
  for (const row of readingRows) {
    const date = bangkokDateString(new Date(row.measured_at).getTime());
    let month = Number(date.slice(5, 7));
    let day = Number(date.slice(8, 10));
    if (month === 2 && day === 29) day = 28;
    const doy = dayOfYear(month, day);
    const byDoy = currentYearReadings.get(row.station_id) ?? new Map<number, number[]>();
    const values = byDoy.get(doy) ?? [];
    values.push(row.value);
    byDoy.set(doy, values);
    currentYearReadings.set(row.station_id, byDoy);
  }

  // Which (station, day-of-year) rows already have a genuine multi-year pool -- those are
  // frozen. Single-year rows (min_year === max_year) stay eligible for recompute.
  const targetDoySet = new Set(targetDoys);
  const existingDoys = new Map<string, Set<number>>();
  for (const row of existingRows) {
    const doy = dayOfYear(row.month, row.day);
    if (!targetDoySet.has(doy)) continue;
    if (row.min_year === null || row.max_year === null || row.min_year === row.max_year) continue;
    const set = existingDoys.get(row.station_id) ?? new Set<number>();
    set.add(doy);
    existingDoys.set(row.station_id, set);
  }

  const result = await runStationBaseline({
    stations,
    years: [],
    targetDoys,
    currentYearReadings,
    currentYear,
    existingDoys,
  });
  console.log(`${LOG} done`, result);
  process.exit(0);
} catch (err) {
  console.error(`${LOG} failed`, err);
  process.exit(1);
}
