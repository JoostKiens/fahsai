import { supabase } from '../db/client.js';
import { runWeatherIngest, getYesterdayBkk } from '../jobs/weather-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

const MIN_COMPLETE_POINTS = 4000;
const yesterday = getYesterdayBkk();

try {
  const { count, error } = await supabase
    .from('weather_readings')
    .select('*', { count: 'exact', head: true })
    .eq('date', yesterday);

  if (error) throw new Error(`Supabase count failed: ${error.message}`);

  if ((count ?? 0) >= MIN_COMPLETE_POINTS) {
    console.log(
      `[weather-fallback] ${count} rows already present for ${yesterday} — skipping ingest`,
    );
    process.exit(0);
  }

  console.log(`[weather-fallback] only ${count ?? 0} rows for ${yesterday} — running ingest`);
  const result = await runWeatherIngest();
  console.log('[weather-fallback] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[weather-fallback] failed', err);
  await waitForRollbar();
  process.exit(1);
}
