import { Type, type TUnsafe } from '@fastify/type-provider-typebox';
import { ERROR_CODES, RATE_LIMIT_REASONS, type ApiError } from '@thailand-aq/types';

// A real calendar day: format 'date' rejects 2026-02-30 and 2026-13-45, which a pattern let through.
export const DateString = Type.String({
  format: 'date',
  description: 'A calendar day, YYYY-MM-DD, in Bangkok time.',
  examples: ['2026-10-17'],
});

const BBOX_PATTERN = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/;

// Registered as the 'bbox' format (see typebox-validation.ts), so a bad value reads
// "expected west,south,east,north" instead of quoting a regular expression.
export const BBOX_FORMAT = 'bbox';

export function isBbox(value: string): boolean {
  return BBOX_PATTERN.test(value);
}

export const Bbox = Type.String({
  format: BBOX_FORMAT,
  description:
    'West,south,east,north in degrees. Defaults to 89,1,114,30 (Thailand and its neighbours).',
  examples: ['100,13,101,14'],
});

type NumberOptions = Parameters<typeof Type.Number>[0];

// A whole number in a query string. Not Type.Integer: for a querystring value the validator
// coerces "1.5" to 1 and accepts it, where multipleOf rejects it.
export function wholeNumber(options: NumberOptions = {}) {
  return Type.Number({ ...options, multipleOf: 1 });
}

// What each custom or standard format expects, for the text of a validation error.
export const FORMAT_HINTS: Record<string, string> = {
  date: 'a calendar day, YYYY-MM-DD',
  [BBOX_FORMAT]: 'west,south,east,north (for example 100,13,101,14)',
};

// Registered once with app.addSchema, so the document holds one ApiError component and every route
// refers to it. Keep it in step with ApiError in packages/types.
export const ApiErrorSchema = Type.Object(
  {
    error: Type.String({ description: 'A message a person can read.' }),
    code: Type.Enum(ERROR_CODES, { description: 'What went wrong, for programs.' }),
    reason: Type.Optional(
      Type.Enum(RATE_LIMIT_REASONS, { description: 'Which limit was hit; only for rate_limited.' }),
    ),
    resetAtMs: Type.Optional(Type.Number({ description: 'When the limit resets, epoch ms.' })),
    details: Type.Optional(
      Type.Array(Type.Object({ path: Type.String(), message: Type.String() }), {
        description: 'Which request fields were invalid.',
      }),
    ),
  },
  { $id: 'ApiError', title: 'ApiError' },
);

const ERROR_RESPONSE_DESCRIPTIONS = {
  400: 'The request is invalid.',
  404: 'Nothing found: no data for the date (no_data), or an unknown resource (not_found).',
  429: 'A rate limit was hit; reason and resetAtMs say which and when it resets.',
  500: 'An unexpected error.',
  503: 'A dataset or feature that is not available.',
} as const;

type ErrorStatus = keyof typeof ERROR_RESPONSE_DESCRIPTIONS;

// The error responses of a route. Every route can fail unexpectedly, so 500 is always included.
export function errorResponses<S extends Exclude<ErrorStatus, 500>>(
  ...statuses: S[]
): Record<S | 500, TUnsafe<ApiError>> {
  const entries = [...statuses, 500 as const].map((status) => [
    status,
    Type.Unsafe<ApiError>({
      $ref: 'ApiError#',
      description: ERROR_RESPONSE_DESCRIPTIONS[status],
    }),
  ]);
  // Object.fromEntries cannot keep which keys it was given, but they are exactly `statuses` and 500
  return Object.fromEntries(entries) as Record<S | 500, TUnsafe<ApiError>>;
}
