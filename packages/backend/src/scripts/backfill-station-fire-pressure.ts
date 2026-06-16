/**
 * Backfill station_fire_pressure for a date range.
 *
 * Usage:
 *   pnpm --filter backend run backfill:station-fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD
 *
 * For each date in the range, computes 14-day trailing window fire pressure scores
 * for all active stations (75 km radius). Dates that already have rows are skipped.
 * Max range: 130 days.
 */
import 'dotenv/config';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { runStationFirePressure } from '../jobs/station-fire-pressure.js';

const LOG = '[backfill-station-fire-pressure]';
const MAX_DAYS = 130;

function parseDateFlag(flag: string): string {
  const val = process.argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  if (!val) {
    console.error(`${LOG} --${flag} is required (YYYY-MM-DD)`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    console.error(`${LOG} --${flag}: invalid format "${val}" — expected YYYY-MM-DD`);
    process.exit(1);
  }
  return val;
}

const startDate = parseDateFlag('start');
const endDate = parseDateFlag('end');

const startMs = new Date(startDate + 'T00:00:00Z').getTime();
const endMs = new Date(endDate + 'T00:00:00Z').getTime();

if (endMs < startMs) {
  console.error(`${LOG} --start must be before or equal to --end`);
  process.exit(1);
}

const diffDays = Math.round((endMs - startMs) / MS_PER_DAY) + 1;
if (diffDays > MAX_DAYS) {
  console.error(`${LOG} Date range ${diffDays} days exceeds maximum ${MAX_DAYS} days`);
  process.exit(1);
}

const dates: string[] = [];
let cursor = startMs;
while (cursor <= endMs) {
  dates.push(new Date(cursor).toISOString().slice(0, 10));
  cursor += MS_PER_DAY;
}

interface StationRow {
  id: string;
  lat: number;
  lng: number;
}

async function fetchActiveStations(): Promise<StationRow[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id, lat, lng')
    .neq('pm25_sensor_ids', '{}');

  if (error) throw new Error(`${LOG} stations query failed: ${error.message}`);
  return (data ?? []) as StationRow[];
}

async function existingRowCount(date: string): Promise<number> {
  const { count, error } = await supabase
    .from('station_fire_pressure')
    .select('*', { count: 'exact', head: true })
    .eq('date', date);
  if (error) throw new Error(`${LOG} Count query failed for ${date}: ${error.message}`);
  return count ?? 0;
}

try {
  console.log(`${LOG} Fetching active stations...`);
  const stations = await fetchActiveStations();
  console.log(`${LOG} Found ${stations.length} active stations`);

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const existing = await existingRowCount(date);
    if (existing >= stations.length) {
      console.log(`[${i + 1}/${dates.length}] ${date} — skipped (${existing} rows)`);
      continue;
    }
    await runStationFirePressure(date, stations);
    console.log(`[${i + 1}/${dates.length}] ${date} — done`);
  }
  process.exit(0);
} catch (err) {
  console.error(`${LOG} Fatal error:`, err);
  process.exit(1);
}
