/**
 * Backfill fire_pressure_scores for a date range.
 *
 * Usage:
 *   pnpm --filter backend run backfill:fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD
 *
 * For each date in the range, aggregates the trailing 14-day fire_points window into
 * fire_pressure_scores. Dates that already have rows are skipped.
 * Max range: 120 days.
 */
import 'dotenv/config';
import pRetry from 'p-retry';
import { supabase } from '../db/client.js';
import { ingestFirePressure } from '../jobs/ingest-fire-pressure.js';

const LOG = '[backfill-fire-pressure]';
const MAX_DAYS = 120;

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

const diffDays = Math.round((endMs - startMs) / 86400000) + 1;
if (diffDays > MAX_DAYS) {
  console.error(`${LOG} Date range ${diffDays} days exceeds maximum ${MAX_DAYS} days`);
  process.exit(1);
}

const dates: string[] = [];
let cursor = startMs;
while (cursor <= endMs) {
  dates.push(new Date(cursor).toISOString().slice(0, 10));
  cursor += 86400000;
}

async function existingRowCount(date: string): Promise<number> {
  const { count, error } = await supabase
    .from('fire_pressure_scores')
    .select('*', { count: 'exact', head: true })
    .eq('date', date);
  if (error) throw new Error(`${LOG} Count query failed for ${date}: ${error.message}`);
  return count ?? 0;
}

try {
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const existing = await existingRowCount(date);
    if (existing > 0) {
      console.log(`[${i + 1}/${dates.length}] ${date} — skipped (${existing} rows)`);
      continue;
    }
    await pRetry(() => ingestFirePressure(date), {
      retries: 3,
      minTimeout: 2000,
      factor: 2,
      onFailedAttempt: (err) =>
        console.warn(
          `${LOG} ${date} attempt ${err.attemptNumber} failed (${err.retriesLeft} retries left): ${err.message}`,
        ),
    });
    console.log(`[${i + 1}/${dates.length}] ${date} — done`);
  }
  process.exit(0);
} catch (err) {
  console.error(`${LOG} Fatal error:`, err);
  process.exit(1);
}
