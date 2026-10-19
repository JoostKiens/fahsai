export const ERROR_CODES = [
  'invalid_request',
  'not_found',
  'no_data',
  'rate_limited',
  'unavailable',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const RATE_LIMIT_REASONS = [
  'ip_ratelimit',
  'quota_exceeded',
  'gemini_rpm',
  'gemini_tpm',
  'gemini_rpd',
] as const;

export type RateLimitReason = (typeof RATE_LIMIT_REASONS)[number];

export type ApiErrorDetail = {
  path: string;
  message: string;
};

// Every error the API sends: HTTP error bodies and the in-band error at the end of the explain
// stream. `error` is the single human-readable string. Never add a `message` field: the
// published fahsai-mcp-server reads `message` before `error`, so a second text would win.
export type ApiError = {
  error: string;
  code: ErrorCode;
  // which limit was hit; only set when code is 'rate_limited'
  reason?: RateLimitReason;
  resetAtMs?: number;
  details?: ApiErrorDetail[];
};
