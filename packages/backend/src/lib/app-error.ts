import type { ApiError, ErrorCode } from '@thailand-aq/types';

// One status per code: the code says what went wrong, the status follows from it.
const STATUS_BY_CODE = {
  invalid_request: 400,
  not_found: 404,
  no_data: 404,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
} as const satisfies Record<ErrorCode, number>;

type AppErrorOptions = Omit<ApiError, 'error'> & { message: string };

// Throw this from a route to send a specific error. The central handler turns it into an ApiError.
export class AppError extends Error {
  readonly statusCode: number;
  readonly body: ApiError;

  constructor({ message, ...rest }: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.statusCode = STATUS_BY_CODE[rest.code];
    this.body = { error: message, ...rest };
  }
}
