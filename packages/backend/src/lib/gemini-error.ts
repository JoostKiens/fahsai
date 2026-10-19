import type { ApiError, RateLimitReason } from '@thailand-aq/types';

const GEMINI_BUSY_RETRY_MS = 60_000;

// Gemini RPD resets at midnight America/Los_Angeles (PDT = UTC-7, PST = UTC-8).
// Try both offsets for the next LA calendar day and return the one where LA hour == 0.
export function nextMidnightPT(nowMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(nowMs));
  // with exactly these format options Intl always returns year, month and day, so find() cannot miss
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const next = new Date(get('year'), get('month') - 1, get('day') + 1);
  for (const offsetH of [7, 8]) {
    const candidate = new Date(
      Date.UTC(next.getFullYear(), next.getMonth(), next.getDate(), offsetH),
    );
    const laHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(candidate);
    if (laHour === '0' || laHour === '00') return candidate.getTime();
  }
  return Date.UTC(next.getFullYear(), next.getMonth(), next.getDate(), 8);
}

// What the client is told when generating the explanation fails after the stream has started. The
// raw Gemini message is never sent: the caller logs and reports it instead.
export function classifyGeminiError(err: unknown, nowMs = Date.now()): ApiError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const isRateLimit =
    hasStatus429(err) ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('quota');

  if (!isRateLimit) return { error: 'Explanation unavailable', code: 'unavailable' };

  const isDaily = lower.includes('per day') || lower.includes('daily');
  const reason: RateLimitReason = isDaily
    ? 'gemini_rpd'
    : lower.includes('token')
      ? 'gemini_tpm'
      : 'gemini_rpm';
  return {
    error: 'Gemini rate limit reached',
    code: 'rate_limited',
    reason,
    resetAtMs: isDaily ? nextMidnightPT(nowMs) : nowMs + GEMINI_BUSY_RETRY_MS,
  };
}

// An in-band error is the last thing in the stream, on its own line, as one line of JSON. The
// frontend looks for it at the end of the text it has received.
export function formatStreamError(error: ApiError): string {
  return `\n[ERROR_JSON:${JSON.stringify(error)}]`;
}

function hasStatus429(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 429;
}
