import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearTables, seed } from '../test/integration/db.js';
import { camsRoutes } from './cams.js';
import { firesRoutes } from './fires.js';
import { powerPlantsRoutes } from './power-plants.js';
import { stationReadingsRoutes } from './station-readings.js';
import { weatherRoutes } from './weather.js';
import { buildTestApp } from '../test/test-app.js';

// Characterization tests: they pin the CURRENT success responses (status, Cache-Control, body) of
// the data routes against a real database, so later refactors (schemas, versioning) can prove
// nothing changed. Error responses are deliberately not pinned: JOO-76 changes their shape.
// Not covered: /api/stations(/:id) (stations.integration.test.ts), /api/latest-date,
// /api/explain*, /health, /api/rollbar.

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
  HISTORICAL_TTL_SECONDS: 7 * 24 * 60 * 60,
  CACHE_CONTROL_IMMUTABLE: `public, max-age=${7 * 24 * 60 * 60}`,
}));

// 10:00 on 2026-10-18 in Bangkok; "yesterday" is 2026-10-17
const NOW = new Date('2026-10-18T03:00:00Z');
const D = '2026-10-17';
const D_BEFORE = '2026-10-16';

type Row = Record<string, number | string | null>;
const byId = (a: Row, b: Row) => Number(a.id) - Number(b.id);
const byLatLng = (a: Row, b: Row) => Number(a.lat) - Number(b.lat) || Number(a.lng) - Number(b.lng);

const STATIONS = [
  { id: 's1', name: 'Din Daeng', lat: 13.77, lng: 100.55, country: 'TH', provider: 'AirBKK' },
  { id: 's2', name: 'Chiang Mai', lat: 18.79, lng: 98.99, country: null, provider: null },
  { id: 's3', name: 'Beijing', lat: 39.9, lng: 116.4, country: 'CN', provider: 'x' },
];

async function seedFixtures() {
  await seed('stations', STATIONS);
  await seed('station_readings', [
    { station_id: 's1', value: 40, measured_at: '2026-10-17T05:00:00Z' },
    { station_id: 's1', value: 55, measured_at: '2026-10-17T08:00:00Z' },
    { station_id: 's1', value: 30, measured_at: '2026-10-16T05:00:00Z' },
    { station_id: 's2', value: 20, measured_at: '2026-10-17T06:00:00Z' },
    { station_id: 's3', value: 99, measured_at: '2026-10-17T06:00:00Z' },
  ]);
  await seed('station_weather', [
    {
      station_id: 's1',
      date: D,
      wind_speed_kmh: 12.5,
      wind_direction_deg: 270,
      precipitation_sum: 0.4,
      relative_humidity_2m: 70,
    },
    { station_id: 's1', date: D_BEFORE },
  ]);
  await seed('station_baseline', [
    ...[16, 17].map((day) => ({
      station_id: 's1',
      month: 10,
      day,
      median_pm25: 25.5,
      p25_pm25: 15,
      p75_pm25: 35.2,
      n: 40,
      min_year: 2019,
      max_year: 2025,
    })),
    { station_id: 's1', month: 10, day: 18, median_pm25: 20, p25_pm25: 10, p75_pm25: 30, n: 12 },
  ]);
  await seed('fire_points', [
    {
      id: 101,
      detected_at: '2026-10-17T06:08:00Z',
      lat: 13.5,
      lng: 100.5,
      frp: 15.47,
      confidence: 'n',
      daynight: 'D',
    },
    {
      id: 102,
      detected_at: '2026-10-17T07:30:00Z',
      lat: 18.5,
      lng: 99,
      frp: null,
      confidence: null,
      daynight: null,
    },
    {
      id: 103,
      detected_at: '2026-10-17T07:31:00Z',
      lat: 0.5,
      lng: 100,
      frp: 3,
      confidence: 'h',
      daynight: 'D',
    },
    {
      id: 104,
      detected_at: '2026-10-16T06:00:00Z',
      lat: 13.6,
      lng: 100.6,
      frp: 8.2,
      confidence: 'l',
      daynight: 'D',
    },
  ]);
  await seed('cams_grid', [
    { date: D, lat: 13.75, lng: 100.5, pm25: 45.2 },
    { date: D, lat: 13.5, lng: 100.75, pm25: 30 },
    { date: D, lat: 18.75, lng: 99, pm25: 12.1 },
    { date: D, lat: 5, lng: 105, pm25: 9.9 },
  ]);
  await seed('weather_readings', [
    {
      date: D,
      lat: 13.75,
      lng: 100.5,
      wind_speed_kmh: 10.2,
      wind_direction_deg: 180,
      relative_humidity_2m: 65,
      precipitation_sum: 0,
    },
    {
      date: D,
      lat: 18.75,
      lng: 99,
      wind_speed_kmh: 7.5,
      wind_direction_deg: 45,
      relative_humidity_2m: null,
      precipitation_sum: null,
    },
    { date: D, lat: 5, lng: 105, wind_speed_kmh: 3, wind_direction_deg: 90 },
  ]);
  await seed(
    'cams_daily_summary',
    [
      ['2026-10-15', 31.4, 4599],
      ['2026-10-16', 28, 4599],
      ['2026-10-17', 35.9, 4599],
    ].map(([date, pm25_p95, point_count]) => ({ date, pm25_p95, point_count })),
  );
  await seed('power_plants', [
    {
      id: 1,
      name: 'Mae Moh',
      country: 'THA',
      fuel_type: 'Coal',
      capacity_mw: 2400,
      owner: 'EGAT',
      commissioned_year: 1978,
      lat: 18.3,
      lng: 99.7,
    },
    { id: 2, name: 'Small Gas', country: 'LAO', fuel_type: 'Gas', lat: 17.9, lng: 102.6 },
  ]);
}

describe('current success responses of the data routes', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildTestApp();
    void app.register(firesRoutes, { prefix: '/api' });
    void app.register(weatherRoutes, { prefix: '/api' });
    void app.register(camsRoutes, { prefix: '/api' });
    void app.register(stationReadingsRoutes, { prefix: '/api' });
    void app.register(powerPlantsRoutes, { prefix: '/api' });
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    await clearTables();
    await seedFixtures();
    // only Date: supabase-js and fastify still need real timers
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function get(url: string) {
    const res = await app.inject({ method: 'GET', url });
    return {
      status: res.statusCode,
      cacheControl: res.headers['cache-control'],
      body: res.json<unknown>(),
    };
  }

  // These routes have no ORDER BY, so Postgres may return rows in any order: sort before pinning.
  async function getSorted(url: string, compare: (a: Row, b: Row) => number) {
    const res = await get(url);
    const body = res.body as { data: Row[] };
    return { ...res, body: { data: [...body.data].sort(compare) } };
  }

  // The columnar grid: pin the column names, and the rows they describe in a stable order.
  async function getCams(url: string) {
    const res = await get(url);
    const { data } = res.body as { data: { lats: number[]; lngs: number[]; pm25s: number[] } };
    const rows = data.lats
      .map((lat, i) => ({ lat, lng: data.lngs[i], pm25: data.pm25s[i] }))
      .sort((a, b) => a.lat - b.lat || a.lng - b.lng);
    return { ...res, body: { columns: Object.keys(data), rows } };
  }

  describe('fires', () => {
    it('GET /api/fires (default bbox)', async () => {
      expect(await getSorted(`/api/fires?date=${D}`, byId)).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "confidence": "n",
                "daynight": "D",
                "detectedAt": "2026-10-17T06:08:00+00:00",
                "frp": 15.47,
                "id": 101,
                "lat": 13.5,
                "lng": 100.5,
              },
              {
                "confidence": null,
                "daynight": null,
                "detectedAt": "2026-10-17T07:30:00+00:00",
                "frp": null,
                "id": 102,
                "lat": 18.5,
                "lng": 99,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/fires with a bbox', async () => {
      expect(await getSorted(`/api/fires?date=${D}&bbox=100,13,101,14`, byId))
        .toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "confidence": "n",
                "daynight": "D",
                "detectedAt": "2026-10-17T06:08:00+00:00",
                "frp": 15.47,
                "id": 101,
                "lat": 13.5,
                "lng": 100.5,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/fires/range', async () => {
      expect(await getSorted(`/api/fires/range?start=${D_BEFORE}&end=${D}`, byId))
        .toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "confidence": "n",
                "daynight": "D",
                "detectedAt": "2026-10-17T06:08:00+00:00",
                "frp": 15.47,
                "id": 101,
                "lat": 13.5,
                "lng": 100.5,
              },
              {
                "confidence": null,
                "daynight": null,
                "detectedAt": "2026-10-17T07:30:00+00:00",
                "frp": null,
                "id": 102,
                "lat": 18.5,
                "lng": 99,
              },
              {
                "confidence": "l",
                "daynight": "D",
                "detectedAt": "2026-10-16T06:00:00+00:00",
                "frp": 8.2,
                "id": 104,
                "lat": 13.6,
                "lng": 100.6,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });
  });

  describe('weather', () => {
    it('GET /api/weather', async () => {
      expect(await getSorted(`/api/weather?date=${D}`, byLatLng)).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "lat": 5,
                "lng": 105,
                "precipitation_sum": null,
                "relative_humidity_2m": null,
                "wind_direction_deg": 90,
                "wind_speed_kmh": 3,
              },
              {
                "lat": 13.75,
                "lng": 100.5,
                "precipitation_sum": 0,
                "relative_humidity_2m": 65,
                "wind_direction_deg": 180,
                "wind_speed_kmh": 10.2,
              },
              {
                "lat": 18.75,
                "lng": 99,
                "precipitation_sum": null,
                "relative_humidity_2m": null,
                "wind_direction_deg": 45,
                "wind_speed_kmh": 7.5,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/weather with a bbox', async () => {
      expect(await getSorted(`/api/weather?date=${D}&bbox=100,13,101,14`, byLatLng))
        .toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "lat": 13.75,
                "lng": 100.5,
                "precipitation_sum": 0,
                "relative_humidity_2m": 65,
                "wind_direction_deg": 180,
                "wind_speed_kmh": 10.2,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    // weather_readings.wind_speed_kmh is nullable but the ingest never writes null (JOO-92), and the
    // frontend treats it as a number: the response schema sends a stray null as 0.
    it('sends a null wind speed as 0', async () => {
      await seed('weather_readings', [
        { date: '2026-10-15', lat: 1.5, lng: 1.5, wind_speed_kmh: null, wind_direction_deg: 90 },
      ]);

      const { body } = await get('/api/weather/wind?date=2026-10-15&bbox=1,1,2,2');

      expect(body).toEqual({
        data: [{ lat: 1.5, lng: 1.5, wind_speed_kmh: 0, wind_direction_deg: 90 }],
      });
    });

    it('GET /api/weather/wind', async () => {
      expect(await getSorted(`/api/weather/wind?date=${D}`, byLatLng)).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "lat": 5,
                "lng": 105,
                "wind_direction_deg": 90,
                "wind_speed_kmh": 3,
              },
              {
                "lat": 13.75,
                "lng": 100.5,
                "wind_direction_deg": 180,
                "wind_speed_kmh": 10.2,
              },
              {
                "lat": 18.75,
                "lng": 99,
                "wind_direction_deg": 45,
                "wind_speed_kmh": 7.5,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });
  });

  describe('cams', () => {
    it('GET /api/cams (columnar arrays)', async () => {
      expect(await getCams(`/api/cams?date=${D}`)).toMatchInlineSnapshot(`
        {
          "body": {
            "columns": [
              "lats",
              "lngs",
              "pm25s",
            ],
            "rows": [
              {
                "lat": 5,
                "lng": 105,
                "pm25": 9.9,
              },
              {
                "lat": 13.5,
                "lng": 100.75,
                "pm25": 30,
              },
              {
                "lat": 13.75,
                "lng": 100.5,
                "pm25": 45.2,
              },
              {
                "lat": 18.75,
                "lng": 99,
                "pm25": 12.1,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/cams with a bbox', async () => {
      expect(await getCams(`/api/cams?date=${D}&bbox=100,13,101,14`)).toMatchInlineSnapshot(`
        {
          "body": {
            "columns": [
              "lats",
              "lngs",
              "pm25s",
            ],
            "rows": [
              {
                "lat": 13.5,
                "lng": 100.75,
                "pm25": 30,
              },
              {
                "lat": 13.75,
                "lng": 100.5,
                "pm25": 45.2,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/cams/nearest', async () => {
      expect(await get(`/api/cams/nearest?date=${D}&lat=13.8&lng=100.5`)).toMatchInlineSnapshot(`
        {
          "body": {
            "data": {
              "lat": 13.75,
              "lng": 100.5,
              "pm25": 45.2,
            },
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/cams/summary', async () => {
      expect(await get('/api/cams/summary?start=2026-10-15&end=2026-10-17')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "date": "2026-10-15",
                "pm25": 31.4,
              },
              {
                "date": "2026-10-16",
                "pm25": 28,
              },
              {
                "date": "2026-10-17",
                "pm25": 35.9,
              },
            ],
          },
          "cacheControl": "public, max-age=3600",
          "status": 200,
        }
      `);
    });

    it('GET /api/cams/summary with nothing in range (no-store)', async () => {
      expect(await get('/api/cams/summary?start=2026-01-01&end=2026-01-02')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [],
          },
          "cacheControl": "no-store",
          "status": 200,
        }
      `);
    });
  });

  describe('station readings', () => {
    it('GET /api/station-readings/latest for a date', async () => {
      expect(await get(`/api/station-readings/latest?date=${D}`)).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "country": "TH",
                "lat": 13.77,
                "lng": 100.55,
                "measuredAt": "2026-10-17T08:00:00+00:00",
                "provider": "AirBKK",
                "stationId": "s1",
                "stationName": "Din Daeng",
                "value": 55,
              },
              {
                "country": null,
                "lat": 18.79,
                "lng": 98.99,
                "measuredAt": "2026-10-17T06:00:00+00:00",
                "provider": null,
                "stationId": "s2",
                "stationName": "Chiang Mai",
                "value": 20,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/station-readings/latest with a bbox', async () => {
      expect(await get(`/api/station-readings/latest?date=${D}&bbox=100,13,101,14`))
        .toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "country": "TH",
                "lat": 13.77,
                "lng": 100.55,
                "measuredAt": "2026-10-17T08:00:00+00:00",
                "provider": "AirBKK",
                "stationId": "s1",
                "stationName": "Din Daeng",
                "value": 55,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/station-readings/latest without a date (rolling 24h)', async () => {
      expect(await get('/api/station-readings/latest')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "country": "TH",
                "lat": 13.77,
                "lng": 100.55,
                "measuredAt": "2026-10-17T08:00:00+00:00",
                "provider": "AirBKK",
                "stationId": "s1",
                "stationName": "Din Daeng",
                "value": 55,
              },
              {
                "country": null,
                "lat": 18.79,
                "lng": 98.99,
                "measuredAt": "2026-10-17T06:00:00+00:00",
                "provider": null,
                "stationId": "s2",
                "stationName": "Chiang Mai",
                "value": 20,
              },
            ],
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/station-readings/history', async () => {
      expect(await get('/api/station-readings/history?station_id=s1&hours=24'))
        .toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "measuredAt": "2026-10-17T05:00:00+00:00",
                "stationId": "s1",
                "value": 40,
              },
              {
                "measuredAt": "2026-10-17T08:00:00+00:00",
                "stationId": "s1",
                "value": 55,
              },
            ],
          },
          "cacheControl": undefined,
          "status": 200,
        }
      `);
    });

    it('GET /api/station-readings/history (default hours)', async () => {
      expect(await get('/api/station-readings/history?station_id=s1')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "measuredAt": "2026-10-17T05:00:00+00:00",
                "stationId": "s1",
                "value": 40,
              },
              {
                "measuredAt": "2026-10-17T08:00:00+00:00",
                "stationId": "s1",
                "value": 55,
              },
            ],
          },
          "cacheControl": undefined,
          "status": 200,
        }
      `);
    });
  });

  describe('station history and baseline', () => {
    it('GET /api/stations/:id/history for a past date (immutable)', async () => {
      expect(await get(`/api/stations/s1/history?days=3&date=${D}`)).toMatchInlineSnapshot(`
        {
          "body": {
            "days": [
              {
                "baseline": null,
                "date": "2026-10-15",
                "pm25": 0,
                "readingCount": 0,
                "weather": null,
              },
              {
                "baseline": {
                  "medianPm25": 25.5,
                  "n": 40,
                  "p25Pm25": 15,
                  "p75Pm25": 35.2,
                },
                "date": "2026-10-16",
                "pm25": 30,
                "readingCount": 1,
                "weather": {
                  "precipitationSumMm": null,
                  "relativeHumidity2m": null,
                  "windDirectionDeg": null,
                  "windSpeedKmh": null,
                },
              },
              {
                "baseline": {
                  "medianPm25": 25.5,
                  "n": 40,
                  "p25Pm25": 15,
                  "p75Pm25": 35.2,
                },
                "date": "2026-10-17",
                "pm25": 55,
                "readingCount": 2,
                "weather": {
                  "precipitationSumMm": 0.4,
                  "relativeHumidity2m": 70,
                  "windDirectionDeg": 270,
                  "windSpeedKmh": 12.5,
                },
              },
            ],
            "stationId": "s1",
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/stations/:id/history for the current date (1h cache)', async () => {
      expect(await get('/api/stations/s1/history?days=2')).toMatchInlineSnapshot(`
        {
          "body": {
            "days": [
              {
                "baseline": {
                  "medianPm25": 25.5,
                  "n": 40,
                  "p25Pm25": 15,
                  "p75Pm25": 35.2,
                },
                "date": "2026-10-17",
                "pm25": 55,
                "readingCount": 2,
                "weather": {
                  "precipitationSumMm": 0.4,
                  "relativeHumidity2m": 70,
                  "windDirectionDeg": 270,
                  "windSpeedKmh": 12.5,
                },
              },
              {
                "baseline": {
                  "medianPm25": 20,
                  "n": 12,
                  "p25Pm25": 10,
                  "p75Pm25": 30,
                },
                "date": "2026-10-18",
                "pm25": 0,
                "readingCount": 0,
                "weather": null,
              },
            ],
            "stationId": "s1",
          },
          "cacheControl": "public, max-age=3600",
          "status": 200,
        }
      `);
    });

    it('GET /api/stations/:id/history for an unknown station is 200 with zeros', async () => {
      expect(await get(`/api/stations/nope/history?days=2&date=${D}`)).toMatchInlineSnapshot(`
        {
          "body": {
            "days": [
              {
                "baseline": null,
                "date": "2026-10-16",
                "pm25": 0,
                "readingCount": 0,
                "weather": null,
              },
              {
                "baseline": null,
                "date": "2026-10-17",
                "pm25": 0,
                "readingCount": 0,
                "weather": null,
              },
            ],
            "stationId": "nope",
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });

    it('GET /api/stations/:id/baseline', async () => {
      expect(await get('/api/stations/s1/baseline')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [
              {
                "day": 16,
                "medianPm25": 25.5,
                "month": 10,
                "n": 40,
                "p25Pm25": 15,
                "p75Pm25": 35.2,
              },
              {
                "day": 17,
                "medianPm25": 25.5,
                "month": 10,
                "n": 40,
                "p25Pm25": 15,
                "p75Pm25": 35.2,
              },
              {
                "day": 18,
                "medianPm25": 20,
                "month": 10,
                "n": 12,
                "p25Pm25": 10,
                "p75Pm25": 30,
              },
            ],
            "maxYear": 2025,
            "minYear": 2019,
          },
          "cacheControl": "public, max-age=21600",
          "status": 200,
        }
      `);
    });

    it('GET /api/stations/:id/baseline for an unknown station is 200 and empty', async () => {
      expect(await get('/api/stations/nope/baseline')).toMatchInlineSnapshot(`
        {
          "body": {
            "data": [],
            "maxYear": null,
            "minYear": null,
          },
          "cacheControl": "public, max-age=21600",
          "status": 200,
        }
      `);
    });
  });

  describe('power plants', () => {
    it('GET /api/power-plants', async () => {
      expect(await get('/api/power-plants')).toMatchInlineSnapshot(`
        {
          "body": {
            "features": [
              {
                "geometry": {
                  "coordinates": [
                    99.7,
                    18.3,
                  ],
                  "type": "Point",
                },
                "properties": {
                  "capacity_mw": 2400,
                  "commissioned_year": 1978,
                  "country": "THA",
                  "fuel_type": "Coal",
                  "id": 1,
                  "name": "Mae Moh",
                  "owner": "EGAT",
                },
                "type": "Feature",
              },
              {
                "geometry": {
                  "coordinates": [
                    102.6,
                    17.9,
                  ],
                  "type": "Point",
                },
                "properties": {
                  "capacity_mw": null,
                  "commissioned_year": null,
                  "country": "LAO",
                  "fuel_type": "Gas",
                  "id": 2,
                  "name": "Small Gas",
                  "owner": null,
                },
                "type": "Feature",
              },
            ],
            "type": "FeatureCollection",
          },
          "cacheControl": "public, max-age=604800",
          "status": 200,
        }
      `);
    });
  });
});
