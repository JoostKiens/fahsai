import { runCamsIngest } from '../jobs/cams-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { allowSlowConnects } from '../utils/network.js';

// Process-wide, so it is set once here at startup, not inside a job function.
allowSlowConnects();

try {
  const result = await runCamsIngest(process.argv[2]);
  console.log('[cams-ingest] done', result);
  await waitForRollbar();
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[cams-ingest] failed', err);
  await waitForRollbar();
  process.exit(1);
}
