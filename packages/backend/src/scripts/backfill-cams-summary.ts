/**
 * Backfill cams_daily_summary (daily p95 PM2.5) for a date range.
 *
 * Usage:
 *   pnpm --filter backend run backfill:cams-summary -- --start=YYYY-MM-DD --end=YYYY-MM-DD
 *
 * For each date in the range, reads that day's cams_grid PM2.5 values and stores the
 * 95th percentile (the value that powers the scrubber gradient line chart). Dates that already
 * have a cams_daily_summary row are skipped. Max range: 120 days.
 */
import 'dotenv/config';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { computeP95, upsertCamsDailySummary } from '../jobs/cams-summary.js';
import { parseDateFlag } from '../utils/backfill.js';

const LOG = '[backfill-cams-summary]';
const MAX_DAYS = 120;
const PAGE_SIZE = 1000;
// Must match cams-ingest MIN_COMPLETE_POINTS — only store p95 from complete grids.
const MIN_COMPLETE_POINTS = 4000;

const startDate = parseDateFlag('start', LOG);
const endDate = parseDateFlag('end', LOG);

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

async function fetchCamsPm25ForDate(date: string): Promise<number[]> {
  const values: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('cams_grid')
      .select('pm25')
      .eq('date', date)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`${LOG} cams_grid query failed for ${date}: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) values.push((row as { pm25: number }).pm25);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return values;
}

async function summaryExists(date: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('cams_daily_summary')
    .select('*', { count: 'exact', head: true })
    .eq('date', date);
  if (error) throw new Error(`${LOG} count query failed for ${date}: ${error.message}`);
  return (count ?? 0) > 0;
}

try {
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (await summaryExists(date)) {
      console.log(`[${i + 1}/${dates.length}] ${date} — skipped (exists)`);
      continue;
    }
    const values = await fetchCamsPm25ForDate(date);
    if (values.length < MIN_COMPLETE_POINTS) {
      console.log(
        `[${i + 1}/${dates.length}] ${date} — skipped (${values.length} pts, below threshold)`,
      );
      continue;
    }
    const p95 = computeP95(values);
    await upsertCamsDailySummary(date, p95, values.length);
    console.log(
      `[${i + 1}/${dates.length}] ${date} — p95 ${p95.toFixed(1)} (${values.length} pts)`,
    );
  }
  process.exit(0);
} catch (err) {
  console.error(`${LOG} Fatal error:`, err);
  process.exit(1);
}
