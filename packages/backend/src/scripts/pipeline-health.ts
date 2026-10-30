import { pingDeadMansSwitch } from '../lib/deadMansSwitch.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { getYesterdayBkk } from '../utils/bkkDate.js';

const LOG = '[pipeline-health]';

// With a date argument this is a manual check of that day: it must not ping, or it would reset the
// dead-man's switch for a scheduled run that never happened.
const dateArg = process.argv[2];
const pingUrl = dateArg === undefined ? process.env.HEALTHCHECK_PING_URL : undefined;

async function ping(hasFailed: boolean): Promise<void> {
  if (pingUrl) await pingDeadMansSwitch({ pingUrl, hasFailed });
}

try {
  if (dateArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid date "${dateArg}", expected YYYY-MM-DD`);
  }
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) throw new Error('API_BASE_URL is not set');

  // Imported here, not at the top: the DB client throws at import time on missing env vars, and
  // that must still reach Rollbar and the /fail ping below.
  const { runPipelineHealth } = await import('../jobs/pipeline-health.js');
  const date = dateArg ?? getYesterdayBkk();
  const problems = await runPipelineHealth({ apiBaseUrl, date });
  for (const { message, details } of problems) {
    console.error(`${LOG} ${message}`, details);
    reportError(new Error(message), details);
  }

  await ping(problems.length > 0);
  console.log(`${LOG} done`, { date, problems: problems.length });
  await waitForRollbar();
  process.exit(0);
} catch (err) {
  console.error(`${LOG} failed`, err);
  reportError(err);
  await ping(true);
  await waitForRollbar();
  process.exit(1);
}
