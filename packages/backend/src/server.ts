import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { healthRoutes } from './routes/health';
import { firesRoutes } from './routes/fires';
import { stationReadingsRoutes } from './routes/station-readings';
import { weatherRoutes } from './routes/weather';
import { stationsRoutes } from './routes/stations';
import { camsRoutes } from './routes/cams';
import { powerPlantsRoutes } from './routes/power-plants';
import { explainRoutes } from './routes/explain';
import { latestDateRoutes } from './routes/latest-date';
import { rollbarProxyRoutes } from './routes/rollbar-proxy';
import { registerApiDocs } from './lib/api-docs';
import { useTypeBoxValidation } from './lib/typebox-validation';
import { registerErrorHandling } from './lib/error-handler';
import { createReportThrottle, throttleWarnings } from './lib/report-throttle';
import { reportError, reportWarning } from './lib/rollbar';
import { ALLOWED_ORIGINS } from './utils/cors';

const app = Fastify({ logger: true, trustProxy: true });

const REPORT_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

// Before any route plugin, so they all inherit it. A dataset that stays missing would send a warning
// on every request, so each warning goes to Rollbar at most once per window.
registerErrorHandling(
  app,
  throttleWarnings(
    { reportError, reportWarning },
    createReportThrottle({ windowMs: REPORT_THROTTLE_WINDOW_MS }),
  ),
);

useTypeBoxValidation(app);
await registerApiDocs(app);

await app.register(compress);
await app.register(cors, { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] });
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

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
