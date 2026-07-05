import { runStationReadingsIngest } from '../jobs/station-readings-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const date =
    process.argv[2] === '--today' ? new Date().toISOString().slice(0, 10) : process.argv[2]; // undefined → runStationReadingsIngest defaults to yesterday
  const result = await runStationReadingsIngest(date);
  console.log('[station-readings-ingest] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-ingest] failed', err);
  await waitForRollbar();
  process.exit(1);
}
