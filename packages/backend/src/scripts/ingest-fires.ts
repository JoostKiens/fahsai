import { runFiresIngest } from '../jobs/fires-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runFiresIngest(process.argv[2]);
  console.log('[fires-ingest] done', result);
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[fires-ingest] failed: ${message}`);
  if (stack) console.error(stack);
  reportError(err);
  await waitForRollbar();
  process.exit(1);
}
