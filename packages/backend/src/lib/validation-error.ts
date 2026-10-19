import type { FastifySchemaValidationError } from 'fastify/types/schema.js';
import { FORMAT_HINTS } from '../schemas/common.js';

// The text of a request that failed schema validation: what Fastify would say, but readable. The
// full list of problems still reaches the client as `details` (see error-handler.ts).
export function formatValidationError(
  errors: FastifySchemaValidationError[],
  dataVar: string,
): Error {
  const [first] = errors;
  if (!first) return new Error(`Invalid ${dataVar}`);

  const missing = missingProperties(first);
  if (missing.length > 0) {
    const noun = missing.length > 1 ? 'parameters' : 'parameter';
    return new Error(`Missing required ${noun}: ${missing.join(', ')}`);
  }
  const name = first.instancePath.split('/').filter(Boolean).pop() ?? dataVar;
  const format = first.keyword === 'format' ? first.params['format'] : undefined;
  const hint = typeof format === 'string' ? FORMAT_HINTS[format] : undefined;
  if (hint) return new Error(`Invalid parameter ${name}: expected ${hint}`);
  return new Error(`Invalid parameter ${name}: ${first.message ?? 'is not valid'}`);
}

// The properties a 'required' validation error says are missing. TypeBox's validator lists them all
// in one error (requiredProperties); Ajv, which Fastify uses without a schema compiler, reports one
// per error (missingProperty).
export function missingProperties(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('params' in error)) return [];
  const { params } = error;
  if (typeof params !== 'object' || params === null) return [];

  if ('requiredProperties' in params && Array.isArray(params.requiredProperties)) {
    return params.requiredProperties.filter((name): name is string => typeof name === 'string');
  }
  if ('missingProperty' in params && typeof params.missingProperty === 'string') {
    return [params.missingProperty];
  }
  return [];
}
