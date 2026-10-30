import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTestApp } from '../test/test-app.js';
import { healthRoutes } from './health.js';

const { mockPing, mockLimit } = vi.hoisted(() => ({ mockPing: vi.fn(), mockLimit: vi.fn() }));

vi.mock('../cache/client.js', () => ({ redis: { ping: mockPing } }));
vi.mock('../db/client.js', () => ({
  supabase: { from: () => ({ select: () => ({ limit: mockLimit }) }) },
}));

async function getHealth() {
  const app = buildTestApp();
  await app.register(healthRoutes);
  return app.inject({ method: 'GET', url: '/health' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPing.mockResolvedValue('PONG');
  mockLimit.mockResolvedValue({ error: null });
});

describe('GET /health', () => {
  it('answers 200 ok when the cache and the database are up', async () => {
    const res = await getHealth();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', cache: 'connected', db: 'connected' });
  });

  it('answers 200 degraded when only the cache is down, since routes serve from the database', async () => {
    mockPing.mockRejectedValue(new Error('database is stopped'));
    const res = await getHealth();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'degraded', cache: 'error', db: 'connected' });
  });

  it('answers 503 degraded when the database is down', async () => {
    mockLimit.mockResolvedValue({ error: { message: 'connection refused' } });
    const res = await getHealth();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', cache: 'connected', db: 'error' });
  });
});
