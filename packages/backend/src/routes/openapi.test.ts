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
      '/api/v1/cams',
      '/api/v1/cams/nearest',
      '/api/v1/cams/summary',
      '/api/v1/explain',
      '/api/v1/explain/context',
      '/api/v1/fires',
      '/api/v1/fires/range',
      '/api/v1/latest-date',
      '/api/v1/power-plants',
      '/api/v1/station-readings/history',
      '/api/v1/station-readings/latest',
      '/api/v1/stations',
      '/api/v1/stations/{id}',
      '/api/v1/stations/{stationId}/baseline',
      '/api/v1/stations/{stationId}/history',
      '/api/v1/weather',
      '/api/v1/weather/wind',
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

  it('leaves out the unversioned aliases of the routes', () => {
    expect(Object.keys(paths).filter((path) => /^\/api\/(?!v1\/)/.test(path))).toEqual([]);
  });

  it('leaves out the Rollbar relay', () => {
    expect(Object.keys(paths)).not.toContain('/api/rollbar');
  });
});
