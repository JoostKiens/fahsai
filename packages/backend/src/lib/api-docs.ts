import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ApiErrorSchema } from '../schemas/common.js';

// Register before the routes: the OpenAPI document is built from the routes as they are added.
// Serves the interactive docs at /docs and the document itself at /docs/json.
export async function registerApiDocs(app: FastifyInstance): Promise<void> {
  // routes refer to ApiError as { $ref: 'ApiError#' }
  app.addSchema(ApiErrorSchema);

  await app.register(swagger, {
    // components are named after their $id (ApiError) instead of def-0
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, index) =>
        typeof json.$id === 'string' ? json.$id : `def-${index}`,
    },
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Fahsai API',
        description:
          'Fires, PM2.5, wind and weather data for Thailand and its neighbours. Every error is { error, code }.',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}
