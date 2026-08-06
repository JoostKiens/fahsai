import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ScientificContext } from '../lib/buildScientificContext.js';

const { mockCompute, mockLimit } = vi.hoisted(() => ({
  mockCompute: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('../lib/computeScientificContext.js', () => ({
  computeScientificContext: mockCompute,
}));

vi.mock('../cache/ratelimit.js', () => ({
  explainRatelimit: { limit: vi.fn() },
  explainContextRatelimit: { limit: mockLimit },
}));

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  HISTORICAL_TTL_SECONDS: 604800,
  CACHE_CONTROL_IMMUTABLE: 'public, max-age=604800',
}));

// Only the fields the route touches (it forwards the object as-is) matter for this fixture.
const FIXTURE_CONTEXT = {
  station: { name: 'Test Station', lat: 18.79, lng: 98.98 },
  currentPm25: 42,
} as unknown as ScientificContext;

describe('GET /api/explain/context', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // IP_RATELIMIT_ENABLED is computed from NODE_ENV at module load, so stub before importing.
    vi.stubEnv('NODE_ENV', 'production');
    const { explainRoutes } = await import('./explain.js');
    app = Fastify();
    await app.register(explainRoutes);
  });

  beforeEach(() => {
    mockCompute.mockReset();
    mockLimit.mockReset();
    mockLimit.mockResolvedValue({ success: true, reset: 0 });
  });

  it('returns the scientific context on success', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FIXTURE_CONTEXT);
    expect(mockCompute).toHaveBeenCalledWith('abc', 18.79, 98.98, expect.any(String));
  });

  it('returns 400 when stationId is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('returns 400 when lat is not numeric', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=not-a-number&lng=98.98',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('returns 400 when date is not in YYYY-MM-DD format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98&date=not-a-date',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('sets an immutable Cache-Control header for a historical date', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98&date=2020-01-01',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toMatch(/^public, max-age=\d+$/);
  });

  it('omits Cache-Control when no date is given (defaults to today)', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('returns 404 when computeScientificContext finds no station', async () => {
    mockCompute.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=unknown&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Station not found' });
  });

  it('returns 429 when the rate limiter trips', async () => {
    mockLimit.mockResolvedValue({ success: false, reset: 1_234_567_890 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ type: 'ip_ratelimit', resetAtMs: 1_234_567_890 });
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('fails open and still serves the request when Upstash errors', async () => {
    mockLimit.mockRejectedValue(new Error('Upstash unreachable'));
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FIXTURE_CONTEXT);
  });
});
