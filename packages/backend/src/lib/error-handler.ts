import type { FastifyInstance } from 'fastify';
import type { ApiError, ApiErrorDetail, ErrorCode } from '@thailand-aq/types';
import { AppError } from './app-error.js';

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

    return reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiError = { error: 'Route not found', code: 'not_found' };
    return reply.status(404).send(body);
  });
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

// Fastify's own 4xx errors (schema validation, malformed JSON, oversized body): their messages are
// written by Fastify, not derived from our internals, so they are safe to send. A 4xx-looking error
// from anywhere else (a library we call) is our failure, not the client's, and is not trusted here.
function asClientError(error: unknown): ClassifiedError | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!isFastifyError(error)) return null;
  if (!('statusCode' in error) || typeof error.statusCode !== 'number') return null;
  const { statusCode } = error;
  if (statusCode < 400 || statusCode >= 500) return null;

  const message = error instanceof Error ? error.message : 'Invalid request';
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
  return 'code' in error && typeof error.code === 'string' && error.code.startsWith('FST_ERR_');
}

function codeForClientStatus(statusCode: number): ErrorCode {
  if (statusCode === 404) return 'not_found';
  if (statusCode === 429) return 'rate_limited';
  return 'invalid_request';
}

function validationDetails(error: object): ApiErrorDetail[] | null {
  if (!('validation' in error) || !Array.isArray(error.validation)) return null;
  const details = error.validation.map((item: unknown) => ({
    path: pathOf(item),
    message: messageOf(item),
  }));
  return details.length > 0 ? details : null;
}

function pathOf(item: unknown): string {
  if (typeof item !== 'object' || item === null) return '';
  if ('instancePath' in item && typeof item.instancePath === 'string' && item.instancePath !== '') {
    return item.instancePath;
  }
  // a missing required property has an empty instancePath; the property name is in params
  if ('params' in item && typeof item.params === 'object' && item.params !== null) {
    if ('missingProperty' in item.params && typeof item.params.missingProperty === 'string') {
      return item.params.missingProperty;
    }
  }
  return '';
}

function messageOf(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'message' in item) {
    if (typeof item.message === 'string') return item.message;
  }
  return 'is invalid';
}
