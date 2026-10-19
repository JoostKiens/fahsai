import type { FastifyInstance } from 'fastify';
import {
  Format,
  TypeBoxValidatorCompiler,
  registerAjvFormats,
} from '@fastify/type-provider-typebox';
import { ApiErrorSchema, BBOX_FORMAT, isBbox } from '../schemas/common.js';

// Everything a TypeBox route needs from the app: querystring values are coerced to their type
// (lat=13.8 is a number, bodies are not), the formats the schemas use are known, and the shared
// ApiError schema that the routes' error responses refer to as { $ref: 'ApiError#' } is registered.
export function useTypeBoxValidation(app: FastifyInstance): void {
  registerAjvFormats();
  Format.Set(BBOX_FORMAT, isBbox);
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.addSchema(ApiErrorSchema);
}
