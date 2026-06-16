import 'dotenv/config';
import { runStationReadingsIngest } from '../jobs/station-readings-ingest.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';

try {
  const result = await runStationReadingsIngest(
    process.argv[2] ?? new Date().toISOString().slice(0, 10),
  );
  console.log('[station-readings-ingest] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-ingest] failed', err);
  await waitForRollbar();
  process.exit(1);
}
