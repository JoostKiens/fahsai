import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { clearTables, seed } from '../test/integration/db.js';
import { stationsRoutes } from './stations.js';

const BASE_STATIONS = [
  { id: 'bkk-1', name: 'Bangkok Din Daeng', lat: 13.77, lng: 100.55, country: 'TH', provider: 'x' },
  { id: 'bkk-2', name: 'BANGKOK Thonburi', lat: 13.72, lng: 100.48, country: 'TH', provider: null },
  { id: 'cm-1', name: 'Chiang Mai Old Town', lat: 18.79, lng: 98.99, country: null },
  // exactly on the north-east corner of the bbox used below
  { id: 'edge-1', name: 'Edge Station', lat: 14, lng: 101, country: 'TH' },
  { id: 'nocoord', name: 'No Coordinates', lat: null, lng: null },
  { id: 'beijing', name: 'Beijing', lat: 39.9, lng: 116.4, country: 'CN' },
  // names with LIKE wildcards in them, and one that only matches if they are not escaped
  { id: 'wild-1', name: 'st_a%b Station', lat: 16, lng: 100 },
  { id: 'wild-2', name: 'stXaYb Station', lat: 16, lng: 100.1 },
];

const BANGKOK_BBOX = 'bbox=100,13,101,14';

describe('stations routes against a real database', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = Fastify();
    stationsRoutes(app);
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await clearTables();
    await seed('stations', BASE_STATIONS);
  });

  async function listIds(query: string): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: `/api/stations?${query}` });
    expect(res.statusCode).toBe(200);
    return res.json<{ data: { id: string }[] }>().data.map((s) => s.id);
  }

  describe('GET /api/stations', () => {
    it('defaults to the whole region, ordered by id, without coordinate-less or far stations', async () => {
      const ids = await listIds('');

      expect(ids).toEqual(['bkk-1', 'bkk-2', 'cm-1', 'edge-1', 'wild-1', 'wild-2']);
    });

    it('maps rows to the public shape, with a missing country as an empty string', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/stations?q=chiang' });

      expect(res.json()).toEqual({
        data: [
          {
            id: 'cm-1',
            name: 'Chiang Mai Old Town',
            lat: 18.79,
            lng: 98.99,
            country: '',
            provider: null,
          },
        ],
      });
    });

    it('includes stations exactly on the bbox edge', async () => {
      expect(await listIds(BANGKOK_BBOX)).toEqual(['bkk-1', 'bkk-2', 'edge-1']);
    });

    it('matches q as a case-insensitive substring', async () => {
      expect(await listIds('q=bangkok')).toEqual(['bkk-1', 'bkk-2']);
    });

    it('composes bbox and q as AND', async () => {
      // wild-* also have "Station" in the name but lie outside the bbox
      expect(await listIds(`${BANGKOK_BBOX}&q=station`)).toEqual(['edge-1']);
    });

    it('treats a literal % or _ in q as text, not as a LIKE wildcard', async () => {
      // unescaped, `_` would also match "stXaYb Station"
      expect(await listIds(`q=${encodeURIComponent('st_a%b')}`)).toEqual(['wild-1']);
    });

    it('treats a whitespace-only q as no filter', async () => {
      expect(await listIds(`q=${encodeURIComponent('   ')}`)).toHaveLength(6);
    });

    it('uses the first value when q is repeated', async () => {
      expect(await listIds('q=chiang&q=zzz')).toEqual(['cm-1']);
    });

    it('returns every station past the 1000-row server cap', async () => {
      await seed(
        'stations',
        Array.from({ length: 1200 }, (_, i) => ({
          id: `bulk-${String(i).padStart(4, '0')}`,
          name: `Bulk ${i}`,
          lat: 5.5,
          lng: 102.5,
        })),
      );

      const ids = await listIds('bbox=102,5,103,6');

      expect(ids).toHaveLength(1200);
      expect(new Set(ids).size).toBe(1200);
    });
  });

  describe('GET /api/stations/:id', () => {
    it('returns the station', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/stations/bkk-1' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: 'bkk-1',
        name: 'Bangkok Din Daeng',
        lat: 13.77,
        lng: 100.55,
        country: 'TH',
        provider: 'x',
      });
    });

    it('returns 404 for an unknown id (the real PGRST116 from .single())', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/stations/nope' });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Station not found' });
    });
  });
});
