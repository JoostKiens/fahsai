import 'dotenv/config';
import { supabase } from '../db/client.js';
import { runCamsIngest } from '../jobs/cams-ingest.js';

const MIN_COMPLETE_POINTS = 4000;
const today = new Date().toISOString().slice(0, 10);

try {
  const { count, error } = await supabase
    .from('cams_grid')
    .select('*', { count: 'exact', head: true })
    .eq('date', today);

  if (error) throw new Error(`Supabase count failed: ${error.message}`);

  if ((count ?? 0) >= MIN_COMPLETE_POINTS) {
    console.log(`[cams-fallback] ${count} rows already present for ${today} — skipping ingest`);
    process.exit(0);
  }

  console.log(`[cams-fallback] only ${count ?? 0} rows for ${today} — running ingest`);
  const result = await runCamsIngest(today);
  console.log('[cams-fallback] done', result);
  process.exit(0);
} catch (err) {
  console.error('[cams-fallback] failed', err);
  process.exit(1);
}
