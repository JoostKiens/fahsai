import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockSingle, mockEq, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockSingle, mockEq, mockSelect, mockFrom };
});

vi.mock('../db/client.js', () => ({ supabase: { from: mockFrom } }));

describe('GET /api/stations/:id', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { stationsRoutes } = await import('./stations.js');
    app = Fastify();
    await app.register(stationsRoutes);
  });

  beforeEach(() => {
    mockSingle.mockReset();
  });

  it('returns the station on a known id', async () => {
    mockSingle.mockResolvedValue({
      data: { id: '10004', name: '南坪', lat: 29.5186, lng: 106.54, country: 'CN', provider: null },
      error: null,
    });

    const res = await app.inject({ method: 'GET', url: '/api/stations/10004' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: '10004',
      name: '南坪',
      lat: 29.5186,
      lng: 106.54,
      country: 'CN',
      provider: null,
    });
    expect(mockEq).toHaveBeenCalledWith('id', '10004');
  });

  it('returns 404 when the id does not exist', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/stations/unknown' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Station not found' });
  });

  it('does not mask a genuine Supabase error as a 404', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST301', message: 'Database connection error' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/stations/10004' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).not.toEqual({ error: 'Station not found' });
  });
});
