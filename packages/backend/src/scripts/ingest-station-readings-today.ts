import 'dotenv/config';
import { runStationReadingsIngest } from '../jobs/station-readings-ingest.js';
import { reportError } from '../lib/rollbar.js';

const today = new Date().toISOString().slice(0, 10);

try {
  const result = await runStationReadingsIngest(today);
  console.log('[station-readings-ingest] done', result);
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-ingest] failed', err);
  process.exit(1);
}
