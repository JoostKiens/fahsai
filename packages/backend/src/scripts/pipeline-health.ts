import { runPipelineHealth } from '../jobs/pipeline-health.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { getYesterdayBkk } from '../utils/bkkDate.js';

const LOG = '[pipeline-health]';
const PING_TIMEOUT_MS = 10_000;

// Dead-man's switch (Healthchecks.io): a missing ping alerts, which catches the case this job can't
// report itself, such as Railway not running anything. /fail alerts at once, independently of
// Rollbar. Unset outside production.
async function pingDeadMansSwitch(hasFailed: boolean): Promise<void> {
  const pingUrl = process.env.HEALTHCHECK_PING_URL;
  if (!pingUrl) return;
  try {
    await fetch(hasFailed ? `${pingUrl}/fail` : pingUrl, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${LOG} dead-man's-switch ping failed`, err);
  }
}

try {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) throw new Error('API_BASE_URL is not set');

  const date = process.argv[2] ?? getYesterdayBkk();
  const problems = await runPipelineHealth({ apiBaseUrl, date });
  for (const { message, details } of problems) {
    console.error(`${LOG} ${message}`, details);
    reportError(new Error(message), details);
  }

  await pingDeadMansSwitch(problems.length > 0);
  console.log(`${LOG} done`, { date, problems: problems.length });
  await waitForRollbar();
  process.exit(0);
} catch (err) {
  console.error(`${LOG} failed`, err);
  reportError(err);
  await pingDeadMansSwitch(true);
  await waitForRollbar();
  process.exit(1);
}
