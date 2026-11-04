import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityListItem, CityPage } from '@thailand-aq/types';
import { clearTables, seed } from '../test/integration/db.js';
import { buildTestApp } from '../test/test-app.js';
import { FULL_CONTEXT } from '../test/fixtures/scientific-context.js';
import { citiesRoutes } from './cities.js';

const { redisGet, redisSet } = vi.hoisted(() => ({ redisGet: vi.fn(), redisSet: vi.fn() }));
vi.mock('../cache/client.js', () => ({ redis: { get: redisGet, set: redisSet } }));

// What counts as a complete day is tested in latest-date.integration.test.ts; here it is given.
const { getLatestCompleteDate } = vi.hoisted(() => ({ getLatestCompleteDate: vi.fn() }));
vi.mock('../lib/latestDate.js', () => ({
  getLatestCompleteDate,
  LATEST_DATE_LOOKBACK_DAYS: 7,
}));

// The context has its own tests; here it is given, so what is checked is the choice of station and
// what the page takes from it.
const { computeScientificContext } = vi.hoisted(() => ({ computeScientificContext: vi.fn() }));
vi.mock('../lib/computeScientificContext.js', () => ({ computeScientificContext }));

const DATE = '2026-10-17';
// One degree of latitude is about 111.2 km.
const KM = 1 / 111.2;
const CHIANG_MAI = { lat: 18.7883, lng: 98.9853 };
const LAMPHUN = { lat: 18.5745, lng: 99.0087 };
const BANGKOK = { lat: 13.7563, lng: 100.5018 };

function station(id: string, centre: { lat: number; lng: number }, kmNorth = 0) {
  return {
    id,
    name: `Station ${id}`,
    lat: centre.lat + kmNorth * KM,
    lng: centre.lng,
    country: 'TH',
    provider: 'OpenAQ',
  };
}

// A day's reading, at 12:00 Bangkok time.
function reading(stationId: string, date: string, value: number) {
  return { station_id: stationId, value, measured_at: `${date}T05:00:00Z` };
}

async function get(url: string) {
  const app = buildTestApp();
  void app.register(citiesRoutes, { prefix: '/api/v1' });
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  return res;
}

describe('GET /api/v1/cities against a real database', () => {
  beforeEach(async () => {
    await clearTables();
    redisGet.mockReset().mockResolvedValue(null);
    redisSet.mockReset().mockResolvedValue('OK');
    getLatestCompleteDate.mockReset().mockResolvedValue(DATE);
    computeScientificContext.mockReset().mockResolvedValue(null);
  });

  it('lists the cities with their slug, name and country', async () => {
    const res = await get('/api/v1/cities');

    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: CityListItem[] }>();
    expect(data.map((city) => city.slug)).toEqual([
      'bangkok',
      'chiang-mai',
      'chiang-rai',
      'lampang',
      'lamphun',
    ]);
    expect(data[1]).toEqual({ slug: 'chiang-mai', name: 'Chiang Mai', country: 'TH' });
  });

  describe('/cities/:slug', () => {
    async function seedChiangMai() {
      await seed('stations', [
        station('near', CHIANG_MAI, 1),
        station('mid', CHIANG_MAI, 10),
        station('edge', CHIANG_MAI, 15),
        station('too-far', CHIANG_MAI, 30),
        station('lamphun', LAMPHUN),
        station('bangkok', BANGKOK),
      ]);
      await seed('station_readings', [
        reading('near', DATE, 10),
        reading('mid', DATE, 20),
        reading('edge', DATE, 30),
        reading('too-far', DATE, 999),
        reading('lamphun', DATE, 33),
        reading('bangkok', DATE, 41),
        // the three days before: only two stations report
        reading('near', '2026-10-16', 14),
        reading('mid', '2026-10-16', 18),
        reading('near', '2026-10-15', 50),
        // 2026-10-14 to 2026-10-11: nobody
      ]);
    }

    it('gives the day’s median of the stations within 20 km, with the trend and nearby cities', async () => {
      await seedChiangMai();

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(200);
      const page = res.json<CityPage>();
      expect(page).toMatchObject({
        slug: 'chiang-mai',
        name: 'Chiang Mai',
        country: 'TH',
        zoom: 10,
        date: DATE,
        pm25: 20,
        stationCount: 3,
        whoMultiple: 1.3,
        drivers: null,
      });
      expect(page.stations.map((s) => [s.id, s.pm25])).toEqual([
        ['near', 10],
        ['mid', 20],
        ['edge', 30],
      ]);
      expect(page.trend.map((day) => [day.date, day.pm25, day.stationCount])).toEqual([
        ['2026-10-11', null, 0],
        ['2026-10-12', null, 0],
        ['2026-10-13', null, 0],
        ['2026-10-14', null, 0],
        ['2026-10-15', 50, 1],
        ['2026-10-16', 16, 2],
        [DATE, 20, 3],
      ]);
      expect(page.summary).toEqual([
        {
          key: 'city.summary.level',
          params: { city: 'Chiang Mai', date: DATE, pm25: 20, count: 3, multiple: 1.3 },
        },
      ]);
      // every city within 250 km, nearest first; a city nobody reported for has no figure
      expect(page.nearby).toEqual([
        { slug: 'lamphun', name: 'Lamphun', pm25: 33 },
        { slug: 'lampang', name: 'Lampang', pm25: null },
        { slug: 'chiang-rai', name: 'Chiang Rai', pm25: null },
      ]);
    });

    it('caches the page for the day under its own key', async () => {
      await seedChiangMai();

      await get('/api/v1/cities/chiang-mai');

      expect(redisSet).toHaveBeenCalledWith(
        `city:v1:chiang-mai:${DATE}`,
        expect.objectContaining({ slug: 'chiang-mai', pm25: 20 }),
        { ex: 3600 },
      );
    });

    it('serves a cached page without reading the database', async () => {
      const cached: CityPage = {
        slug: 'chiang-mai',
        name: 'Cached',
        country: 'TH',
        lat: 18.7883,
        lng: 98.9853,
        zoom: 10,
        date: DATE,
        pm25: 7,
        stationCount: 1,
        stations: [],
        trend: [],
        drivers: null,
        summary: [],
        nearby: [],
        whoMultiple: 0.5,
      };
      redisGet.mockImplementation((key: string) =>
        Promise.resolve(key === `city:v1:chiang-mai:${DATE}` ? cached : null),
      );

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(cached);
    });

    it('answers 200 with no figure when no station reported that day', async () => {
      await seed('stations', [station('near', CHIANG_MAI, 1)]);

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(200);
      const page = res.json<CityPage>();
      expect(page).toMatchObject({ pm25: null, stationCount: 0, whoMultiple: null, summary: [] });
      expect(page.stations.map((s) => [s.id, s.pm25, s.readingCount])).toEqual([['near', null, 0]]);
      expect(page.trend.every((day) => day.pm25 === null)).toBe(true);
    });

    it('takes the drivers from the context of the station closest to the city figure', async () => {
      await seedChiangMai();
      await seed('cams_grid', [
        { date: DATE, lat: 18.8, lng: 99.0, pm25: 37.5 },
        { date: DATE, lat: 18.4, lng: 99.4, pm25: 20 },
      ]);
      computeScientificContext.mockResolvedValue(FULL_CONTEXT);

      const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

      // the readings are 10, 20 and 30: the city figure is 20, so the station reading 20 stands for it
      expect(computeScientificContext).toHaveBeenCalledWith(
        'mid',
        expect.closeTo(CHIANG_MAI.lat + 10 * KM, 4),
        CHIANG_MAI.lng,
        DATE,
      );
      expect(page.summary.map((sentence) => sentence.key)).toEqual([
        'city.summary.level',
        'city.summary.fires',
        'city.summary.wind',
        'city.summary.baseline.above',
      ]);
      expect(page.drivers).toEqual({
        originInDataArea: true,
        upwindFireCount: 34,
        windSpeedKmh: 12.4,
        windFrom: 'NNE',
        camsPm25: 37.5,
        baselineCategory: 'above',
        representativeStationId: 'mid',
      });
    });

    it('gives no CAMS figure when the grid has nothing near the city', async () => {
      await seedChiangMai();
      computeScientificContext.mockResolvedValue(FULL_CONTEXT);

      const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

      expect(page.drivers?.camsPm25).toBeNull();
    });

    it('still gives the page, without drivers, when the context fails', async () => {
      await seedChiangMai();
      computeScientificContext.mockRejectedValue(new Error('context failed'));

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(200);
      expect(res.json<CityPage>()).toMatchObject({ pm25: 20, drivers: null });
    });

    it('does not ask for a context when no station reported', async () => {
      await seed('stations', [station('near', CHIANG_MAI, 1)]);

      await get('/api/v1/cities/chiang-mai');

      expect(computeScientificContext).not.toHaveBeenCalled();
    });

    it('answers 404 not_found for a city that is not in the list', async () => {
      const res = await get('/api/v1/cities/atlantis');

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: 'not_found' });
    });

    it('answers 404 no_data when no day has complete data', async () => {
      getLatestCompleteDate.mockResolvedValue(null);

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ code: 'no_data' });
    });

    it('only lists cities within 250 km as nearby, nearest first', async () => {
      await seedChiangMai();

      const bangkok = (await get('/api/v1/cities/bangkok')).json<CityPage>();

      expect(bangkok.nearby).toEqual([]);
    });
  });
});
