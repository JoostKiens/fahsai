/**
 * Daily upkeep for station_baseline: fills in station_baseline rows that don't exist yet
 * (e.g. a newer station whose curve stops mid-year) using only this year's station_readings
 * data — no OpenAQ S3 archive access at all. Rows that already exist (from the last full
 * backfill, with a proper multi-year pool) are left untouched rather than recomputed from a
 * single year's narrower data.
 *
 * Must run after station-readings-ingest, since it reads yesterday's value straight from
 * station_readings.
 *
 * For a full re-backfill (e.g. after adding new stations), use backfill-station-baseline.ts.
 */
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { dayOfYear, doyToMonthDay, runStationBaseline, WINDOW } from '../jobs/station-baseline.js';
import { bangkokDateString, bangkokMidnightUtcMs, getYesterdayBkk } from '../utils/bkkDate.js';
import { offsetDate } from '../utils/trajectory.js';

const LOG = '[station-baseline-ingest]';

const targetDate = getYesterdayBkk();
const targetMonth = Number(targetDate.slice(5, 7));
let targetDay = Number(targetDate.slice(8, 10));
if (targetMonth === 2 && targetDay === 29) targetDay = 28;
const newDoy = dayOfYear(targetMonth, targetDay);
const currentYear = Number(targetDate.slice(0, 4));

const targetDoys: number[] = [];
for (let offset = -WINDOW; offset <= WINDOW; offset++) {
  let doy = newDoy + offset;
  if (doy < 1) doy += 365;
  if (doy > 365) doy -= 365;
  targetDoys.push(doy);
}

const { data: stationRows, error: stationsError } = await supabase
  .from('stations')
  .select('id, pm25_sensor_ids')
  .filter('pm25_sensor_ids', 'not.eq', '{}');

if (stationsError) {
  console.error(`${LOG} stations query failed:`, stationsError.message);
  process.exit(1);
}

const stations = (stationRows ?? []) as { id: string; pm25_sensor_ids: number[] }[];

if (!stations.length) {
  console.error(`${LOG} no stations found`);
  process.exit(1);
}

// This year's contribution to the pool: read straight from station_readings instead of the
// S3 archive (already ingested by station-readings-ingest, which this job runs after).
const rangeStart = offsetDate(targetDate, -WINDOW);
const rangeEnd = offsetDate(targetDate, WINDOW);
const since = new Date(bangkokMidnightUtcMs(rangeStart)).toISOString();
const until = new Date(bangkokMidnightUtcMs(rangeEnd) + MS_PER_DAY).toISOString();

const { data: readingRows, error: readingsError } = await supabase
  .from('station_readings')
  .select('station_id, value, measured_at')
  .gte('measured_at', since)
  .lt('measured_at', until);

if (readingsError) {
  console.error(`${LOG} station_readings query failed:`, readingsError.message);
  process.exit(1);
}

const currentYearReadings = new Map<string, Map<number, number>>();
for (const row of (readingRows ?? []) as {
  station_id: string;
  value: number;
  measured_at: string;
}[]) {
  const date = bangkokDateString(new Date(row.measured_at).getTime());
  let month = Number(date.slice(5, 7));
  let day = Number(date.slice(8, 10));
  if (month === 2 && day === 29) day = 28;
  const doy = dayOfYear(month, day);
  const byDoy = currentYearReadings.get(row.station_id) ?? new Map<number, number>();
  byDoy.set(doy, row.value);
  currentYearReadings.set(row.station_id, byDoy);
}

// Which (station, day-of-year) rows already exist — those are left alone, only gaps get filled.
const targetMonths = [...new Set(targetDoys.map((doy) => doyToMonthDay(doy).month))];

const { data: existingRows, error: existingError } = await supabase
  .from('station_baseline')
  .select('station_id, month, day')
  .in('month', targetMonths);

if (existingError) {
  console.error(`${LOG} station_baseline query failed:`, existingError.message);
  process.exit(1);
}

const targetDoySet = new Set(targetDoys);
const existingDoys = new Map<string, Set<number>>();
for (const row of (existingRows ?? []) as { station_id: string; month: number; day: number }[]) {
  const doy = dayOfYear(row.month, row.day);
  if (!targetDoySet.has(doy)) continue;
  const set = existingDoys.get(row.station_id) ?? new Set<number>();
  set.add(doy);
  existingDoys.set(row.station_id, set);
}

try {
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
