import 'dotenv/config';
import { supabase } from '../db/client.js';
import { runWeatherIngest } from '../jobs/weather-ingest.js';

const MIN_COMPLETE_POINTS = 4000;
const yesterday = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

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
  console.error('[weather-fallback] failed', err);
  process.exit(1);
}
