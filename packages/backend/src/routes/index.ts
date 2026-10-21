import type { FastifyInstance } from 'fastify';
import { camsRoutes } from './cams.js';
import { explainRoutes } from './explain.js';
import { firesRoutes } from './fires.js';
import { healthRoutes } from './health.js';
import { latestDateRoutes } from './latest-date.js';
import { powerPlantsRoutes } from './power-plants.js';
import { rollbarProxyRoutes } from './rollbar-proxy.js';
import { stationReadingsRoutes } from './station-readings.js';
import { stationsRoutes } from './stations.js';
import { weatherRoutes } from './weather.js';

const API_VERSION_PREFIX = '/api/v1';
// The unversioned paths the first clients (the published fahsai-mcp-server) call. They stay, with
// the same handlers, but are left out of the OpenAPI document.
const LEGACY_PREFIX = '/api';

const dataRoutes = [
  firesRoutes,
  stationReadingsRoutes,
  weatherRoutes,
  stationsRoutes,
  camsRoutes,
  powerPlantsRoutes,
  explainRoutes,
  latestDateRoutes,
];

async function legacyDataRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRoute', (route) => {
    route.schema = { ...route.schema, hide: true };
  });
  for (const routes of dataRoutes) await app.register(routes);
}

// Every route of the API, in one place: server.ts registers it, and the tests check that each
// route is documented. /health and /api/rollbar are not part of the versioned API.
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(rollbarProxyRoutes);
  for (const routes of dataRoutes) await app.register(routes, { prefix: API_VERSION_PREFIX });
  await app.register(legacyDataRoutes, { prefix: LEGACY_PREFIX });
}
