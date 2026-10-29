import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError, ApiErrorDetail, ErrorCode } from '@thailand-aq/types';
import { AppError } from './app-error.js';
import { formatValidationError, missingProperties } from './validation-error.js';

export type ErrorReporters = {
  reportError: (err: unknown, extra?: Record<string, unknown>) => void;
  reportWarning: (message: string, extra?: Record<string, unknown>) => void;
};

type ClassifiedError = {
  statusCode: number;
  body: ApiError;
  // what to tell Rollbar: null for client errors, which are not our bugs
  severity: 'error' | 'warning' | null;
};

const INTERNAL_ERROR_BODY: ApiError = { error: 'Internal server error', code: 'internal' };

// Registered before the routes so every route plugin inherits it.
export function registerErrorHandling(app: FastifyInstance, reporters: ErrorReporters): void {
  app.setSchemaErrorFormatter(formatValidationError);

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body, severity } = classifyError(error);
    const context = { path: request.url, method: request.method, requestId: request.id };

    // The client gets a generic text, so the original has to be logged here: this handler replaces
    // Fastify's default one, which is what used to log it.
    if (severity === 'error') request.log.error({ err: error }, 'request failed');
    else if (severity === 'warning') request.log.warn({ err: error }, body.error);
    else request.log.info({ code: body.code }, body.error);

    // Report the original error before the client-facing text replaces it.
    if (severity === 'error') reporters.reportError(error, context);
    if (severity === 'warning') reporters.reportWarning(body.error, context);

    // a route may have set a long Cache-Control before it failed; an error is never cacheable
    return reply.status(statusCode).header('Cache-Control', 'no-store').send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiError = { error: 'Route not found', code: 'not_found' };
    return reply.status(404).header('Cache-Control', 'no-store').send(body);
  });
}

// The router answers some errors (a URL that cannot be decoded) before any route or error handler
// is involved, with Fastify's own body. Passed to Fastify() as `frameworkErrors`.
export function frameworkErrors(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const { statusCode, body } =
    error.code === 'FST_ERR_BAD_URL'
      ? { statusCode: 400, body: { error: 'Invalid URL', code: 'invalid_request' } as ApiError }
      : classifyError(error);
  request.log.info({ code: body.code }, body.error);
  void reply.status(statusCode).header('Cache-Control', 'no-store').send(body);
}

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: error.body,
      severity: severityOfServerError(error.statusCode, error.body.code),
    };
  }

  const clientError = asClientError(error);
  if (clientError) return clientError;

  return { statusCode: 500, body: INTERNAL_ERROR_BODY, severity: 'error' };
}

function severityOfServerError(statusCode: number, code: ErrorCode): 'error' | 'warning' | null {
  if (statusCode < 500) return null;
  // a missing dataset or unconfigured feature is operational, not a bug: keep it out of the quota
  return code === 'unavailable' ? 'warning' : 'error';
}

// Fastify's own 4xx errors (schema validation, malformed JSON, oversized body) and the http-errors
// style 4xx of the plugins it serves (the /docs static files answer a refused path with a 403, a
// failed If-Match with a 412): the first have messages written by Fastify, so they are safe to send;
// for the second the text is ours. A 4xx-looking error from anywhere else (a library we call) is
// our failure, not the client's, and is not trusted here.
function asClientError(error: unknown): ClassifiedError | null {
  if (typeof error !== 'object' || error === null) return null;
  const fromFastify = isFastifyError(error);
  if (!fromFastify && !isHttpError(error)) return null;
  if (!('statusCode' in error) || typeof error.statusCode !== 'number') return null;
  const { statusCode } = error;
  if (statusCode < 400 || statusCode >= 500) return null;

  const message = fromFastify && error instanceof Error ? error.message : 'Invalid request';
  const details = validationDetails(error);
  const body: ApiError = {
    error: message,
    code: codeForClientStatus(statusCode),
    ...(details ? { details } : {}),
  };
  return { statusCode, body, severity: null };
}

function isFastifyError(error: object): boolean {
  if ('validation' in error && Array.isArray(error.validation)) return true;
  return 'code' in error && typeof error.code === 'string' && error.code.startsWith('FST_');
}

// The http-errors package sets `status` and `statusCode` to the same number; an error from a
// client library that has only one of them does not match.
function isHttpError(error: object): boolean {
  return 'status' in error && 'statusCode' in error && error.status === error.statusCode;
}

function codeForClientStatus(statusCode: number): ErrorCode {
  if (statusCode === 404) return 'not_found';
  if (statusCode === 429) return 'rate_limited';
  return 'invalid_request';
}

function validationDetails(error: object): ApiErrorDetail[] | null {
  if (!('validation' in error) || !Array.isArray(error.validation)) return null;
  const details = error.validation.flatMap((item: unknown) => detailsOf(item));
  return details.length > 0 ? details : null;
}

function detailsOf(item: unknown): ApiErrorDetail[] {
  const missing = missingProperties(item);
  if (missing.length > 0)
    return missing.map((name) => ({ path: `/${name}`, message: 'is required' }));
  return [{ path: pathOf(item), message: messageOf(item) }];
}

function pathOf(item: unknown): string {
  if (typeof item !== 'object' || item === null) return '';
  return 'instancePath' in item && typeof item.instancePath === 'string' ? item.instancePath : '';
}

function messageOf(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'message' in item) {
    if (typeof item.message === 'string') return item.message;
  }
  return 'is invalid';
}
