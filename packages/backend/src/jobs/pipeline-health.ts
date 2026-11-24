import { checkDayCompleteness } from '../lib/dayCompleteness.js';
import { fetchNewestCityCamsRun } from '../lib/fetchCityCams.js';

const HEALTH_TIMEOUT_MS = 10_000;
// Two runs a day: one missed run (or a run the ADS keeps rejecting as not published) makes it older.
const CITY_CAMS_MAX_AGE_MS = 24 * 3_600_000;

// Messages are fixed (date and counts go in details) so Rollbar groups each kind of problem.
export type PipelineProblem = { message: string; details: Record<string, unknown> };

// Checks what users would notice: whether `date` (normally yesterday, Bangkok) has the complete
// data /latest-date needs, whether the API reports its database and cache as up, and whether the
// city pages' hourly CAMS values come from a recent run.
export async function runPipelineHealth({
  apiBaseUrl,
  date,
  now = new Date(),
}: {
  apiBaseUrl: string;
  date: string;
  now?: Date;
}): Promise<PipelineProblem[]> {
  const [completeness, healthProblem, newestCityCamsRun] = await Promise.all([
    checkDayCompleteness(date),
    checkApiHealth(apiBaseUrl),
    fetchNewestCityCamsRun(),
  ]);

  const problems: PipelineProblem[] = [];
  if (!completeness.isComplete) {
    problems.push({
      message: 'Pipeline data incomplete',
      details: { date, ...completeness.counts },
    });
  }
  if (healthProblem) problems.push(healthProblem);
  const isCityCamsStale =
    newestCityCamsRun === null ||
    now.getTime() - newestCityCamsRun.getTime() > CITY_CAMS_MAX_AGE_MS;
  if (isCityCamsStale) {
    problems.push({
      message: 'City CAMS run is stale',
      details: { newestRunAt: newestCityCamsRun?.toISOString() ?? null },
    });
  }
  return problems;
}

async function checkApiHealth(apiBaseUrl: string): Promise<PipelineProblem | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    // Text first: when the API is down, Railway's edge answers with an HTML error page, and its
    // status code is the useful part.
    const body = parseJsonOrText(await res.text());
    const isOk =
      res.ok &&
      typeof body === 'object' &&
      body !== null &&
      'status' in body &&
      body.status === 'ok';
    return isOk ? null : { message: 'API health degraded', details: { status: res.status, body } };
  } catch (err) {
    return {
      message: 'API health check failed',
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}
