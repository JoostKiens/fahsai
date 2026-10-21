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

// Every route of the API, in one place: server.ts registers it, and the tests check that each
// route is documented.
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(firesRoutes);
  await app.register(stationReadingsRoutes);
  await app.register(weatherRoutes);
  await app.register(stationsRoutes);
  await app.register(camsRoutes);
  await app.register(powerPlantsRoutes);
  await app.register(explainRoutes);
  await app.register(latestDateRoutes);
  await app.register(rollbarProxyRoutes);
}
