import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

// Register before the routes: the OpenAPI document is built from the routes as they are added.
// Serves the interactive docs at /docs and the document itself at /docs/json.
export async function registerApiDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
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
