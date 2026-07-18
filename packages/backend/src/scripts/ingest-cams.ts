import { runCamsIngest } from '../jobs/cams-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runCamsIngest(process.argv[2]);
  console.log('[cams-ingest] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[cams-ingest] failed', err);
  await waitForRollbar();
  process.exit(1);
}
