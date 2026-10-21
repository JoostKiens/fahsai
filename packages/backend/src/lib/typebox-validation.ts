import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  Format,
  TypeBoxValidatorCompiler,
  registerAjvFormats,
} from '@fastify/type-provider-typebox';
import { AppError } from './app-error.js';
import { ApiErrorSchema, BBOX_FORMAT, isBbox } from '../schemas/common.js';

// Everything a TypeBox route needs from the app: querystring values are coerced to their type
// (lat=13.8 is a number, bodies are not), the formats the schemas use are known, and the shared
// ApiError schema that the routes' error responses refer to as { $ref: 'ApiError#' } is registered.
export function useTypeBoxValidation(app: FastifyInstance): void {
  registerAjvFormats();
  Format.Set(BBOX_FORMAT, isBbox);
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.addSchema(ApiErrorSchema);
  app.addHook('onRoute', (route) => {
    const names = numericQueryParams(route.schema);
    if (names.length === 0) return;
    const check = (req: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
      try {
        requireDecimalNumbers(req.query, names);
        done();
      } catch (error) {
        done(error as Error);
      }
    };
    route.preValidation = [...asArray(route.preValidation), check];
  });
}

// The validator coerces a querystring value with Number(): lat= becomes 0, true becomes 1 and 0x10
// becomes 16, all of which then pass as numbers. A plain decimal is what a client means by one.
const DECIMAL = /^-?\d+(\.\d+)?$/;

function requireDecimalNumbers(query: unknown, names: string[]): void {
  if (typeof query !== 'object' || query === null) return;
  const raw = query as Record<string, unknown>;
  for (const name of names) {
    const value = raw[name];
    if (value === undefined) continue; // absent is the schema's business: required or optional
    if (typeof value === 'string' && DECIMAL.test(value)) continue;
    throw new AppError({
      code: 'invalid_request',
      message: `Invalid parameter ${name}: must be a number`,
      details: [{ path: `/${name}`, message: 'must be a number' }],
    });
  }
}

function numericQueryParams(schema: unknown): string[] {
  const properties = (
    schema as { querystring?: { properties?: Record<string, { type?: string }> } }
  )?.querystring?.properties;
  if (!properties) return [];
  return Object.entries(properties)
    .filter(([, property]) => property.type === 'number' || property.type === 'integer')
    .map(([name]) => name);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
