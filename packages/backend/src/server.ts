import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { registerRoutes } from './routes/index';
import { registerApiDocs } from './lib/api-docs';
import { useTypeBoxValidation } from './lib/typebox-validation';
import { frameworkErrors, registerErrorHandling } from './lib/error-handler';
import {
  createReportThrottle,
  REPORT_THROTTLE_WINDOW_MS,
  throttleWarnings,
} from './lib/report-throttle';
import { reportError, reportWarning } from './lib/rollbar';
import { ALLOWED_ORIGINS } from './utils/cors';

const app = Fastify({ logger: true, trustProxy: true, frameworkErrors });

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
await registerRoutes(app);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
