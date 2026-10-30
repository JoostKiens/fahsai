import { checkDayCompleteness } from '../lib/dayCompleteness.js';

const HEALTH_TIMEOUT_MS = 10_000;

// Messages are fixed (date and counts go in details) so Rollbar groups each kind of problem.
export type PipelineProblem = { message: string; details: Record<string, unknown> };

// Checks what users would notice: whether `date` (normally yesterday, Bangkok) has the complete
// data /latest-date needs, and whether the API reports its database and cache as up.
export async function runPipelineHealth({
  apiBaseUrl,
  date,
}: {
  apiBaseUrl: string;
  date: string;
}): Promise<PipelineProblem[]> {
  const [completeness, healthProblem] = await Promise.all([
    checkDayCompleteness(date),
    checkApiHealth(apiBaseUrl),
  ]);

  const problems: PipelineProblem[] = [];
  if (!completeness.isComplete) {
    problems.push({
      message: 'Pipeline data incomplete',
      details: { date, ...completeness.counts },
    });
  }
  if (healthProblem) problems.push(healthProblem);
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
