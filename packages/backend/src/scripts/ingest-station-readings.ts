import { runStationReadingsIngest } from '../jobs/station-readings-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  // --today resolves to the same "yesterday BKK" default runStationReadingsIngest already
  // applies when called with no date — kept as a named flag so the two cron passes read
  // clearly at the call site (see docs/claude/architecture.md's two-pass design).
  const date = process.argv[2] === '--today' ? undefined : process.argv[2];
  const result = await runStationReadingsIngest(date);
  console.log('[station-readings-ingest] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-ingest] failed', err);
  await waitForRollbar();
  process.exit(1);
}
