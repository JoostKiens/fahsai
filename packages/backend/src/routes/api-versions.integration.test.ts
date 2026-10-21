import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearTables, seed } from '../test/integration/db.js';
import { buildTestApp } from '../test/test-app.js';
import { registerRoutes } from './index.js';

// /api/v1 is the API; /api/* is the same handlers, kept for the published fahsai-mcp-server. This
// pins that the two cannot drift: the same request gets the same status, body and caching headers.

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
  HISTORICAL_TTL_SECONDS: 7 * 24 * 60 * 60,
  CACHE_CONTROL_IMMUTABLE: `public, max-age=${7 * 24 * 60 * 60}`,
}));
vi.mock('../cache/ratelimit.js', () => ({ explainRatelimit: {}, explainContextRatelimit: {} }));

// Every route once. The seeded data makes the stations and power plants answer 200; the rest are
// errors, which are as much part of the contract.
const REQUESTS = [
  'GET /stations',
  'GET /stations?bbox=nonsense',
  'GET /stations/s1',
  'GET /stations/nope',
  'GET /stations/s1/history?days=0',
  'GET /stations/s1/baseline?year=x',
  'GET /power-plants',
  'GET /latest-date',
  'GET /fires?date=2026-10-17',
  'GET /fires',
  'GET /fires/range?start=2026-10-17',
  'GET /weather?date=2026-10-17',
  'GET /weather/wind',
  'GET /cams?date=2026-10-17',
  'GET /cams/nearest?date=2026-10-17&lat=x&lng=1',
  'GET /cams/summary',
  'GET /station-readings/latest?date=2026-10-17',
  'GET /station-readings/history',
  'GET /explain/context?lat=1&lng=1',
  'POST /explain',
] as const;

describe('the versioned API and its unversioned aliases', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await registerRoutes(app);
    await app.ready();
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await clearTables();
    await seed('stations', [{ id: 's1', name: 'Din Daeng', lat: 13.77, lng: 100.55 }]);
    await seed('power_plants', [
      { id: 1, name: 'Mae Moh', country: 'THA', fuel_type: 'Coal', lat: 18.3, lng: 99.7 },
    ]);
  });

  async function send(request: string, prefix: string) {
    const [method, path] = request.split(' ') as ['GET' | 'POST', string];
    const res = await app.inject({
      method,
      url: `${prefix}${path}`,
      payload: method === 'POST' ? {} : undefined,
    });
    return {
      status: res.statusCode,
      body: res.json<unknown>(),
      cacheControl: res.headers['cache-control'],
      contentType: res.headers['content-type'],
    };
  }

  it.each(REQUESTS)('%s answers the same on /api/v1 and /api', async (request) => {
    expect(await send(request, '/api/v1')).toEqual(await send(request, '/api'));
  });

  it('answers a seeded request with data, not just errors', async () => {
    expect((await send('GET /stations', '/api/v1')).status).toBe(200);
    expect((await send('GET /power-plants', '/api')).status).toBe(200);
  });

  it('keeps /health out of the versioned API', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(404);
  });
});
