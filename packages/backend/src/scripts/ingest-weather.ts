import 'dotenv/config';
import { runWeatherIngest } from '../jobs/weather-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runWeatherIngest(process.argv[2]);
  console.log('[weather-ingest] done', result);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[weather-ingest] failed: ${msg}`);
  reportError(err);
  await waitForRollbar();
  process.exit(1);
}
