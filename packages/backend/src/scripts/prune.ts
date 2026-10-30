import { runPrune } from '../jobs/prune.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runPrune();
  console.log('[prune] done', result);
  process.exit(0);
} catch (err) {
  console.error('[prune] failed', err);
  reportError(err);
  await waitForRollbar();
  process.exit(1);
}
