import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandling } from '../lib/error-handler.js';
import { useTypeBoxValidation } from '../lib/typebox-validation.js';
import { noReporters } from './no-reporters.js';

// A Fastify app set up like the real one (TypeBox validation, the shared ApiError schema and the
// central error handler), for tests that register route plugins.
export function buildTestApp(): FastifyInstance {
  const app = Fastify();
  useTypeBoxValidation(app);
  registerErrorHandling(app, noReporters);
  return app;
}
