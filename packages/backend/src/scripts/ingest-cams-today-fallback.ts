import { supabase } from '../db/client.js';
import { runCamsIngest, getYesterdayBkk } from '../jobs/cams-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

const MIN_COMPLETE_POINTS = 4000;
// Fallback runs at 01:00 UTC, primary at 23:00 UTC the day before — both resolve
// to the same Bangkok-yesterday target (see getYesterdayBkk), so this fallback
// re-checks/re-runs the same date the primary cron was aiming for.
const targetDate = getYesterdayBkk();

try {
  const { count, error } = await supabase
    .from('cams_grid')
    .select('*', { count: 'exact', head: true })
    .eq('date', targetDate);

  if (error) throw new Error(`Supabase count failed: ${error.message}`);

  if ((count ?? 0) >= MIN_COMPLETE_POINTS) {
    console.log(
      `[cams-fallback] ${count} rows already present for ${targetDate} — skipping ingest`,
    );
    process.exit(0);
  }

  console.log(`[cams-fallback] only ${count ?? 0} rows for ${targetDate} — running ingest`);
  const result = await runCamsIngest(targetDate);
  console.log('[cams-fallback] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[cams-fallback] failed', err);
  await waitForRollbar();
  process.exit(1);
}
