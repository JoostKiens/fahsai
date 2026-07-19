/**
 * Backfill station_baseline: precompute seasonal baseline (median, p25, p75)
 * per calendar day per station from the OpenAQ S3 archive.
 *
 * Usage:
 *   pnpm --filter backend run backfill:station-baseline -- --start=2021 --end=2025
 *
 * Defaults: last 5 full calendar years.
 * Idempotent — upserts on (station_id, month, day).
 *
 * For day-to-day upkeep, see ingest-station-baseline.ts (runs daily via Railway cron) —
 * this script remains for full re-backfills only.
 */
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { runStationBaseline } from '../jobs/station-baseline.js';

const PAGE_SIZE = 1000;

function parseYearArg(flag: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return fallback;
  const val = arg.split('=')[1];
  if (!/^\d{4}$/.test(val)) {
    console.error(`[baseline] Invalid --${flag}: "${val}". Expected YYYY`);
    process.exit(1);
  }
  return Number(val);
}

const currentYear = new Date().getUTCFullYear();
const startYear = parseYearArg('start', currentYear - 5);
const endYear = parseYearArg('end', currentYear);

if (startYear > endYear) {
  console.error(`[baseline] --start (${startYear}) must be ≤ --end (${endYear})`);
  process.exit(1);
}

console.log(`[baseline] Years: ${startYear}–${endYear}`);

type Station = { id: string; pm25_sensor_ids: number[] };

const stations = await fetchAllPages<Station>(
  (from, to) =>
    supabase
      .from('stations')
      .select('id, pm25_sensor_ids')
      .filter('pm25_sensor_ids', 'not.eq', '{}')
      .range(from, to),
  PAGE_SIZE,
);

if (!stations.length) {
  console.error('[baseline] No stations found');
  process.exit(1);
}

console.log(`[baseline] ${stations.length} stations with pm25 sensors`);

const years: number[] = [];
for (let y = startYear; y <= endYear; y++) years.push(y);

await runStationBaseline({ stations, years });
process.exit(0);
