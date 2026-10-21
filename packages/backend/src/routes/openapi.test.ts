import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registerApiDocs } from '../lib/api-docs.js';
import { buildTestApp } from '../test/test-app.js';
import { registerRoutes } from './index.js';

// The routes import clients that need credentials; this test only reads the document they produce.
vi.mock('../cache/client.js', () => ({
  redis: {},
  HISTORICAL_TTL_SECONDS: 604800,
  CACHE_CONTROL_IMMUTABLE: 'public, max-age=604800',
}));
vi.mock('../cache/ratelimit.js', () => ({ explainRatelimit: {}, explainContextRatelimit: {} }));
vi.mock('../db/client.js', () => ({ supabase: {} }));

type Operation = { summary?: string; tags?: string[]; responses: Record<string, unknown> };
type OpenApiDocument = { paths: Record<string, Record<string, Operation>> };

describe('the OpenAPI document', () => {
  let paths: OpenApiDocument['paths'];

  beforeAll(async () => {
    const app: FastifyInstance = buildTestApp();
    await registerApiDocs(app);
    await registerRoutes(app);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    paths = res.json<OpenApiDocument>().paths;
  });

  const operations = () =>
    Object.entries(paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({ path, method, operation })),
    );

  it('lists every route of the API', () => {
    expect(Object.keys(paths).sort()).toEqual([
      '/api/cams',
      '/api/cams/nearest',
      '/api/cams/summary',
      '/api/explain',
      '/api/explain/context',
      '/api/fires',
      '/api/fires/range',
      '/api/latest-date',
      '/api/power-plants',
      '/api/station-readings/history',
      '/api/station-readings/latest',
      '/api/stations',
      '/api/stations/{id}',
      '/api/stations/{stationId}/baseline',
      '/api/stations/{stationId}/history',
      '/api/weather',
      '/api/weather/wind',
      '/health',
    ]);
  });

  it('describes every route with a summary and a tag', () => {
    const undescribed = operations().filter(
      ({ operation }) => !operation.summary || !operation.tags?.length,
    );

    expect(undescribed).toEqual([]);
  });

  it('documents the 500 every route can answer with', () => {
    const without500 = operations()
      .filter(({ path }) => path !== '/health')
      .filter(({ operation }) => !('500' in operation.responses));

    expect(without500).toEqual([]);
  });

  it('leaves out the Rollbar relay', () => {
    expect(Object.keys(paths)).not.toContain('/api/rollbar');
  });
});
