import type { FastifyInstance } from 'fastify';
import { TypeBoxValidatorCompiler, registerAjvFormats } from '@fastify/type-provider-typebox';

// Validates the TypeBox schemas on the routes: querystring values are coerced to their type (lat=13.8
// is a number), bodies are not. Formats such as 'date' need registering once.
export function useTypeBoxValidation(app: FastifyInstance): void {
  registerAjvFormats();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
}
