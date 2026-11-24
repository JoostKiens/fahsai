import { CITIES } from '../data/cities.js';
import { fetchRunMessages, runCityCamsIngest, supabaseCityCamsStore } from '../jobs/city-cams.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { allowSlowConnects } from '../utils/network.js';

// Process-wide, so it is set once here at startup, not inside a job function.
allowSlowConnects();

try {
  const apiKey = process.env.ADS_API_KEY;
  if (!apiKey) throw new Error('[city-cams] ADS_API_KEY env var is required');
  const result = await runCityCamsIngest({
    now: new Date(),
    cities: CITIES,
    fetchRun: (runAt) => fetchRunMessages(runAt, apiKey),
    store: supabaseCityCamsStore,
  });
  console.log('[city-cams] done', result);
  await waitForRollbar();
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[city-cams] failed', err);
  await waitForRollbar();
  process.exit(1);
}
