import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

interface ChainMock {
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
}

const { mockSingle, mockEq, mockGte, mockLte, mockIlike, mockOrder, mockRange, mockFrom } =
  vi.hoisted(() => {
    const mockSingle = vi.fn();
    const mockEq = vi.fn(() => ({ single: mockSingle }));

    const mockRange = vi.fn();
    const chain = {} as ChainMock;
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.range = mockRange;

    const mockSelect = vi.fn(() => ({ eq: mockEq, ...chain }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    return {
      mockSingle,
      mockEq,
      mockGte: chain.gte,
      mockLte: chain.lte,
      mockIlike: chain.ilike,
      mockOrder: chain.order,
      mockRange,
      mockFrom,
    };
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

describe('GET /api/stations', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { stationsRoutes } = await import('./stations.js');
    app = Fastify();
    await app.register(stationsRoutes);
  });

  beforeEach(() => {
    mockGte.mockClear();
    mockLte.mockClear();
    mockIlike.mockClear();
    mockOrder.mockClear();
    mockRange.mockReset();
    mockRange.mockResolvedValue({ data: [], error: null });
  });

  it('filters by bbox only when q is omitted', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations?bbox=100,13,101,14' });

    expect(res.statusCode).toBe(200);
    expect(mockGte).toHaveBeenCalledWith('lat', 13);
    expect(mockLte).toHaveBeenCalledWith('lat', 14);
    expect(mockGte).toHaveBeenCalledWith('lng', 100);
    expect(mockLte).toHaveBeenCalledWith('lng', 101);
    expect(mockIlike).not.toHaveBeenCalled();
  });

  it('filters by q only, case-insensitive substring', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=bangkok' });

    expect(res.statusCode).toBe(200);
    expect(mockIlike).toHaveBeenCalledWith('name', '%bangkok%');
  });

  it('composes bbox and q as AND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stations?bbox=100,13,101,14&q=bangkok',
    });

    expect(res.statusCode).toBe(200);
    expect(mockGte).toHaveBeenCalledWith('lat', 13);
    expect(mockIlike).toHaveBeenCalledWith('name', '%bangkok%');
  });

  it('treats a whitespace-only q as no filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/stations?q=${encodeURIComponent('   ')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(mockIlike).not.toHaveBeenCalled();
  });

  it('escapes literal % and _ in q so they are not treated as LIKE wildcards', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/stations?q=${encodeURIComponent('st_a%b')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(mockIlike).toHaveBeenCalledWith('name', '%st\\_a\\%b%');
  });

  it('uses the first value when q is sent as a repeated query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=a&q=b' });

    expect(res.statusCode).toBe(200);
    expect(mockIlike).toHaveBeenCalledWith('name', '%a%');
  });
});
