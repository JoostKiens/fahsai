import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTables, gridPoints, seed } from '../test/integration/db.js';
import { latestDateRoutes } from './latest-date.js';
import { buildTestApp } from '../test/test-app.js';

const { redisGet, redisSet } = vi.hoisted(() => ({ redisGet: vi.fn(), redisSet: vi.fn() }));
vi.mock('../cache/client.js', () => ({ redis: { get: redisGet, set: redisSet } }));

// 10:00 in Bangkok on 2026-10-18, so "yesterday" is the Bangkok day 2026-10-17, which spans
// 2026-10-16T17:00:00Z (inclusive) to 2026-10-17T17:00:00Z (exclusive).
const NOW = new Date('2026-10-18T03:00:00Z');
const MIN_ROWS = 4000;

type DayRows = {
  cams?: number;
  weather?: number;
  readingAt?: string | null;
};

// A complete day by default; override a field to make one gate fail.
async function seedDay(date: string, { cams = MIN_ROWS, weather = MIN_ROWS, readingAt }: DayRows) {
  await seed(
    'cams_grid',
    gridPoints(cams).map((p) => ({ date, ...p, pm25: 20 })),
  );
  await seed(
    'weather_readings',
    gridPoints(weather).map((p) => ({ date, ...p, wind_direction_deg: 90 })),
  );
  if (readingAt !== null) {
    await seed('station_readings', [
      { station_id: 's1', value: 20, measured_at: readingAt ?? `${date}T05:00:00Z` },
    ]);
  }
}

async function resetDb() {
  await clearTables();
  await seed('stations', [{ id: 's1', name: 'Station 1' }]);
}

async function getLatestDate() {
  const app = buildTestApp();
  void app.register(latestDateRoutes, { prefix: '/api' });
  const res = await app.inject({ method: 'GET', url: '/api/latest-date' });
  await app.close();
  return res;
}

describe('GET /api/latest-date against a real database', () => {
  beforeEach(async () => {
    await resetDb();
    redisGet.mockReset().mockResolvedValue(null);
    redisSet.mockReset().mockResolvedValue('OK');
    // only Date: supabase-js and fastify still need real timers
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns yesterday (Bangkok) when every gate passes, and caches it', async () => {
    await seedDay('2026-10-17', {});

    const res = await getLatestDate();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ date: '2026-10-17' });
    expect(res.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=60');
    expect(redisSet).toHaveBeenCalledWith('latest-complete-date', '2026-10-17', { ex: 1800 });
  });

  it('serves the cached date without writing to the cache again', async () => {
    redisGet.mockResolvedValue('2026-10-01');

    const res = await getLatestDate();

    expect(res.json()).toEqual({ date: '2026-10-01' });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it.each([
    ['cams_grid below 4000 rows', { cams: MIN_ROWS - 1 }],
    ['weather_readings below 4000 rows', { weather: MIN_ROWS - 1 }],
    ['no station_readings in the Bangkok day', { readingAt: null }],
  ] satisfies [string, DayRows][])('skips a day with %s and falls back', async (_name, broken) => {
    await seedDay('2026-10-17', broken);
    await seedDay('2026-10-16', {});

    const res = await getLatestDate();

    expect(res.json()).toEqual({ date: '2026-10-16' });
  });

  it('returns 404 when no day in the lookback window is complete', async () => {
    const res = await getLatestDate();

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: 'No complete date found in the last 7 days',
      code: 'no_data',
    });
  });

  it('looks back 7 days: the 7th day back counts, the 8th does not', async () => {
    await seedDay('2026-10-11', {});
    expect((await getLatestDate()).json()).toEqual({ date: '2026-10-11' });

    await resetDb();
    await seedDay('2026-10-10', {});
    expect((await getLatestDate()).statusCode).toBe(404);
  });

  // The day boundary is Bangkok midnight (17:00Z), not UTC midnight.
  it.each([
    ['2026-10-16T16:59:59Z', 404], // 23:59:59 on the previous Bangkok day
    ['2026-10-16T17:00:00Z', 200], // 00:00:00, first instant of the day (inclusive)
    ['2026-10-17T16:59:59Z', 200], // 23:59:59, last instant of the day
    ['2026-10-17T17:00:00Z', 404], // 00:00:00 the next day (exclusive)
  ])('counts a reading at %s toward 2026-10-17 -> %i', async (readingAt, status) => {
    await seedDay('2026-10-17', { readingAt });

    const res = await getLatestDate();

    expect(res.statusCode).toBe(status);
  });
});
