import { runStationsIngest } from '../jobs/stations-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runStationsIngest();
  console.log('[stations-ingest] done', result);
  process.exit(0);
} catch (err) {
  console.error('[stations-ingest] failed', err);
  reportError(err);
  await waitForRollbar();
  process.exit(1);
}
