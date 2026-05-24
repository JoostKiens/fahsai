import 'dotenv/config';
import { runWeatherIngest } from '../jobs/weather-ingest.js';

try {
  const result = await runWeatherIngest();
  console.log('[weather-ingest] done', result);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[weather-ingest] failed: ${msg}`);
  process.exit(1);
}
