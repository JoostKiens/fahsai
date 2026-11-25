import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityListItem, CityPage } from '@thailand-aq/types';
import { clearTables, seed } from '../test/integration/db.js';
import { buildTestApp } from '../test/test-app.js';
import { FULL_CONTEXT } from '../test/fixtures/scientific-context.js';
import { buildCityPage } from '../lib/buildCityPage.js';
import { fetchCityCamsAt } from '../lib/fetchCityCams.js';
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

vi.mock('../lib/fetchCityCams.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/fetchCityCams.js')>();
  return { fetchCityCamsAt: vi.fn(actual.fetchCityCamsAt) };
});

const DATE = '2026-10-17';
// One degree of latitude is about 111.2 km.
const KM = 1 / 111.2;
const CHIANG_MAI = { lat: 18.7883, lng: 98.9853 };
const LAMPHUN = { lat: 18.5745, lng: 99.0087 };
const BANGKOK = { lat: 13.7563, lng: 100.5018 };
const HOUR_MS = 3_600_000;

// The hour the page reads, and the next one too, so a test that runs across the hour still finds it.
function seedCamsNow(citySlug: string, pm25: number, hoursAhead = [0, 1]) {
  const thisHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return seed(
    'city_cams_hourly',
    hoursAhead.map((hours) => ({
      city_slug: citySlug,
      valid_at: new Date(thisHour + hours * HOUR_MS).toISOString(),
      pm25,
      run_at: new Date(thisHour - 12 * HOUR_MS).toISOString(),
      lead_hour: 12 + hours,
    })),
  );
}

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
        radiusKm: 20,
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

    it('caches the page for the day and hour under its own key', async () => {
      await seedChiangMai();

      await get('/api/v1/cities/chiang-mai');

      expect(redisSet).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^city:v4:chiang-mai:${DATE}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`),
        ),
        expect.objectContaining({ slug: 'chiang-mai', pm25: 20 }),
        { ex: 3600 },
      );
    });

    it('gives the hourly value of the last 24 h and each station’s latest measured hour', async () => {
      await seedChiangMai();
      const thisHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
      const at = (hoursAgo: number) => new Date(thisHour - hoursAgo * HOUR_MS).toISOString();
      const blend = (citySlug: string, hoursAgo: number, pm25: number) => ({
        city_slug: citySlug,
        valid_at: at(hoursAgo),
        pm25,
        station_median: pm25,
        station_count: 2,
        station_weight: 0.5,
        cams_pm25: 18,
      });
      await seed('city_pm25_hourly', [
        blend('chiang-mai', 24, 300), // outside the 24 h window
        // hours 23 to 12 ago at 20, hours 11 to 0 ago at 40: mean 30
        ...Array.from({ length: 24 }, (_, hoursAgo) =>
          blend('chiang-mai', hoursAgo, hoursAgo < 12 ? 40 : 20),
        ),
        blend('lamphun', 0, 90), // another city
      ]);
      const hourly = (stationId: string, hoursAgo: number, pm25: number) => ({
        station_id: stationId,
        measured_at: at(hoursAgo),
        pm25,
        sensor_id: 1,
      });
      await seed('station_readings_hourly', [
        hourly('near', 1, 22),
        hourly('near', 0, 25),
        hourly('mid', 3, 60), // older than 2 h
        hourly('too-far', 0, 99), // outside the footprint
      ]);

      const res = await get('/api/v1/cities/chiang-mai');

      expect(res.statusCode).toBe(200);
      const page = res.json<CityPage>();
      expect(page.now).toEqual({
        pm25: 30,
        band: 2,
        isBandRaised: false,
        hours: 24,
        latest: {
          validAt: at(0),
          pm25: 40,
          stationCount: 2,
          stationWeight: 0.5,
          camsPm25: 18,
        },
      });
      expect(page.measured).toEqual([
        { id: 'near', name: 'Station near', pm25: 25, measuredAt: at(0) },
      ]);
    });

    it('gives the newest forecast issued in the last 2 h', async () => {
      await seedChiangMai();
      const thisHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
      const at = (hoursAgo: number) => new Date(thisHour - hoursAgo * HOUR_MS).toISOString();
      // today and the next two Bangkok days, from the test's clock
      const day = (offset: number) =>
        new Date(Date.now() + 7 * HOUR_MS + offset * 24 * HOUR_MS).toISOString().slice(0, 10);
      const row = (hoursAgo: number, offset: number, pm25: number) => ({
        city_slug: 'chiang-mai',
        issued_at: at(hoursAgo),
        day: day(offset),
        pm25,
        hours: 24,
        factor: 1.5,
        cams_run_at: at(12),
      });
      await seed('city_forecast_daily', [
        row(0, 0, 20),
        row(0, 1, 30),
        row(0, 2, 80),
        row(1, 0, 99), // an older issue
      ]);

      const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

      expect(page.forecast).toEqual({
        issuedAt: at(0),
        factor: 1.5,
        days: [
          { date: day(0), pm25: 20, band: 1, hours: 24 },
          { date: day(1), pm25: 30, band: 2, hours: 24 },
          { date: day(2), pm25: 80, band: 4, hours: 24 },
        ],
      });
    });

    it('has no hourly value before the first blend', async () => {
      await seedChiangMai();

      const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

      expect(page).toMatchObject({ now: null, measured: [], forecast: null });
    });

    it('serves a cached page without reading the database', async () => {
      const cached: CityPage = {
        slug: 'chiang-mai',
        name: 'Cached',
        country: 'TH',
        lat: 18.7883,
        lng: 98.9853,
        zoom: 10,
        radiusKm: 20,
        date: DATE,
        pm25: 7,
        stationCount: 1,
        stations: [],
        trend: [],
        drivers: null,
        summary: [],
        nearby: [],
        whoMultiple: 0.5,
        now: null,
        measured: [],
        forecast: null,
      };
      redisGet.mockImplementation((key: string) =>
        Promise.resolve(key.startsWith(`city:v4:chiang-mai:${DATE}:`) ? cached : null),
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
      await seedCamsNow('chiang-mai', 37.5);
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

    it('gives no CAMS figure when no hour is stored for the city', async () => {
      await seedChiangMai();
      // a later hour and another city do not stand in for this one
      await seedCamsNow('chiang-mai', 50, [3]);
      await seedCamsNow('lamphun', 50);
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

    // A page that lacks what a blip kept from it must not stay for the hour
    describe('when part of the day could not be read', () => {
      const cachedFor = () => redisSet.mock.calls.map((call: unknown[]) => call[2]);

      it('caches the page for a minute, not an hour, when the context failed', async () => {
        await seedChiangMai();
        computeScientificContext.mockRejectedValue(new Error('context failed'));

        await get('/api/v1/cities/chiang-mai');

        expect(cachedFor()).toEqual([{ ex: 60 }]);
      });

      it('keeps the drivers when only the CAMS lookup fails, without a CAMS figure, for a minute', async () => {
        await seedChiangMai();
        computeScientificContext.mockResolvedValue(FULL_CONTEXT);
        vi.mocked(fetchCityCamsAt).mockRejectedValueOnce(new Error('cams down'));

        const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

        expect(page.drivers).toMatchObject({ upwindFireCount: 34, camsPm25: null });
        expect(cachedFor()).toEqual([{ ex: 60 }]);
      });

      it('says nothing about fires, and caches for a minute, when the fire data was not read', async () => {
        await seedChiangMai();
        const transport = FULL_CONTEXT.transport!;
        computeScientificContext.mockResolvedValue({
          ...FULL_CONTEXT,
          transport: {
            ...transport,
            fire: { ...transport.fire, pathFireCount: 0, dataAvailable: false },
          },
        });

        const page = (await get('/api/v1/cities/chiang-mai')).json<CityPage>();

        expect(page.drivers?.upwindFireCount).toBeNull();
        expect(page.summary.map((sentence) => sentence.key)).not.toContain('city.summary.noFires');
        expect(cachedFor()).toEqual([{ ex: 60 }]);
      });

      it('gives up on the drivers after the deadline, and the page still comes', async () => {
        await seedChiangMai();
        computeScientificContext.mockReturnValue(new Promise(() => undefined));

        const page = await buildCityPage('chiang-mai', { driversDeadlineMs: 20 });

        expect(page).toMatchObject({ pm25: 20, drivers: null });
        expect(cachedFor()).toEqual([{ ex: 60 }]);
      });

      it('caches a complete page for the hour', async () => {
        await seedChiangMai();
        computeScientificContext.mockResolvedValue(FULL_CONTEXT);

        await get('/api/v1/cities/chiang-mai');

        expect(cachedFor()).toEqual([{ ex: 3600 }]);
      });
    });

    it('builds a page once for requests that arrive together', async () => {
      await seedChiangMai();
      computeScientificContext.mockResolvedValue(FULL_CONTEXT);

      const [first, second] = await Promise.all([
        buildCityPage('chiang-mai'),
        buildCityPage('chiang-mai'),
      ]);

      expect(computeScientificContext).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
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
