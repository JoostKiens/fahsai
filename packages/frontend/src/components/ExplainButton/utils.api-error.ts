import { MS_PER_HOUR } from '@thailand-aq/consts';
import {
  ERROR_CODES,
  RATE_LIMIT_REASONS,
  type ApiError,
  type ErrorCode,
  type RateLimit,
  type RateLimitReason,
} from '@thailand-aq/types';

// The backend ends a failed explanation stream with this line, as one line of JSON (see
// docs/claude/explain.md).
const STREAM_ERROR_PREFIX = '\n[ERROR_JSON:';

const UNAVAILABLE: ApiError = { error: 'Explanation unavailable', code: 'unavailable' };

// An error body from the API, checked at runtime: anything else is null.
export function parseApiError(value: unknown): ApiError | null {
  if (!isRecord(value)) return null;
  const { error, code, reason, resetAtMs } = value;
  if (typeof error !== 'string' || !isErrorCode(code)) return null;
  return {
    error,
    code,
    ...(isRateLimitReason(reason) ? { reason } : {}),
    ...(typeof resetAtMs === 'number' ? { resetAtMs } : {}),
  };
}

// The text received so far without the error line, which may still be arriving.
export function withoutStreamError(received: string): string {
  const start = received.lastIndexOf(STREAM_ERROR_PREFIX);
  return start === -1 ? received : received.slice(0, start);
}

// The error the stream ended with, or null if it has none. An error line that is cut off or
// cannot be read still means the explanation failed.
export function parseStreamError(received: string): ApiError | null {
  const start = received.lastIndexOf(STREAM_ERROR_PREFIX);
  if (start === -1) return null;
  const tail = received.slice(start + STREAM_ERROR_PREFIX.length).trimEnd();
  if (!tail.endsWith(']')) return UNAVAILABLE;
  return parseApiError(parseJson(tail.slice(0, -1))) ?? UNAVAILABLE;
}

// A limit with no reason or reset time is treated as the daily quota, an hour away.
export function toRateLimit(error: ApiError | null, nowMs: number): RateLimit {
  return {
    reason: error?.reason ?? 'quota_exceeded',
    resetAtMs: error?.resetAtMs ?? nowMs + MS_PER_HOUR,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value);
}

function isRateLimitReason(value: unknown): value is RateLimitReason {
  return RATE_LIMIT_REASONS.some((reason) => reason === value);
}
