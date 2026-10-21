import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearTables } from '../test/integration/db.js';
import { camsRoutes } from './cams.js';
import { firesRoutes } from './fires.js';
import { latestDateRoutes } from './latest-date.js';
import { powerPlantsRoutes } from './power-plants.js';
import { stationReadingsRoutes } from './station-readings.js';
import { stationsRoutes } from './stations.js';
import { weatherRoutes } from './weather.js';
import { buildTestApp } from '../test/test-app.js';

// Every error the data routes send on purpose, against an empty database. Bodies are exactly
// { error, code }: the human text is unchanged from before the error contract (JOO-76).

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
  HISTORICAL_TTL_SECONDS: 7 * 24 * 60 * 60,
  CACHE_CONTROL_IMMUTABLE: `public, max-age=${7 * 24 * 60 * 60}`,
}));

type Detail = { path: string; message: string };
type ErrorCase = [
  name: string,
  url: string,
  status: number,
  error: string,
  code: string,
  details?: Detail[],
];

// details are only there when the request failed schema validation
const invalid = (name: string, url: string, error: string, details?: Detail[]): ErrorCase => [
  name,
  url,
  400,
  error,
  'invalid_request',
  details,
];
const noData = (name: string, url: string, error: string): ErrorCase => [
  name,
  url,
  404,
  error,
  'no_data',
];

// What a request that fails schema validation gets: the readable text, and which fields.
const missing = (name: string, url: string, ...params: string[]): ErrorCase =>
  invalid(
    name,
    url,
    `Missing required parameter${params.length > 1 ? 's' : ''}: ${params.join(', ')}`,
    params.map((name) => ({ path: `/${name}`, message: 'is required' })),
  );
const badDate = (name: string, url: string, param: string): ErrorCase =>
  invalid(name, url, `Invalid parameter ${param}: expected a calendar day, YYYY-MM-DD`, [
    { path: `/${param}`, message: 'must match format "date"' },
  ]);
const badBbox = (name: string, url: string): ErrorCase =>
  invalid(name, url, BAD_BBOX_SCHEMA, [{ path: '/bbox', message: 'must match format "bbox"' }]);

// The validator would coerce these to 0, 1 and 16; a client that sent them made a mistake.
const notANumber = (name: string, url: string, param: string): ErrorCase =>
  invalid(name, url, `Invalid parameter ${param}: must be a number`, [
    { path: `/${param}`, message: 'must be a number' },
  ]);

const BAD_BBOX_SCHEMA =
  'Invalid parameter bbox: expected west,south,east,north (for example 100,13,101,14)';
const NO_CAMS = 'No CAMS grid data for this date. Run the ingest job.';

const CASES: Record<string, ErrorCase[]> = {
  fires: [
    missing('missing date', '/api/fires', 'date'),
    badDate('malformed date', '/api/fires?date=17-10-2026', 'date'),
    badBbox('bad bbox', '/api/fires?date=2026-10-17&bbox=nonsense'),
    noData('no fires', '/api/fires?date=2026-10-17', 'No fire data for this date.'),
    missing('range without start', '/api/fires/range?end=2026-10-17', 'start'),
    missing('range without end', '/api/fires/range?start=2026-10-17', 'end'),
    badDate('range bad start', '/api/fires/range?start=x&end=2026-10-17', 'start'),
    badDate('range bad end', '/api/fires/range?start=2026-10-17&end=x', 'end'),
    invalid(
      'range reversed',
      '/api/fires/range?start=2026-10-17&end=2026-10-16',
      'start must be before end',
    ),
    invalid(
      'range too long',
      '/api/fires/range?start=2026-10-01&end=2026-10-17',
      'Date range cannot exceed 10 days',
    ),
    noData(
      'no fires in range',
      '/api/fires/range?start=2026-10-16&end=2026-10-17',
      'No fire data for this date range.',
    ),
  ],
  weather: [
    missing('weather without date', '/api/weather', 'date'),
    badDate('wind with a malformed date', '/api/weather/wind?date=x', 'date'),
    noData(
      'no weather',
      '/api/weather?date=2026-10-17',
      'No weather data for this date. Run the ingest job.',
    ),
    noData(
      'no wind',
      '/api/weather/wind?date=2026-10-17',
      'No wind data for this date. Run the ingest job.',
    ),
  ],
  cams: [
    missing('cams without date', '/api/cams', 'date'),
    noData('no cams grid', '/api/cams?date=2026-10-17', NO_CAMS),
    missing('nearest without date', '/api/cams/nearest?lat=1&lng=1', 'date'),
    missing('nearest without coordinates', '/api/cams/nearest?date=2026-10-17', 'lat', 'lng'),
    noData('no cams grid for nearest', '/api/cams/nearest?date=2026-10-17&lat=13&lng=100', NO_CAMS),
    notANumber(
      'nearest with an empty lat',
      '/api/cams/nearest?date=2026-10-17&lat=&lng=100',
      'lat',
    ),
    notANumber('nearest with lng=true', '/api/cams/nearest?date=2026-10-17&lat=13&lng=true', 'lng'),
    notANumber(
      'nearest with a hex lat',
      '/api/cams/nearest?date=2026-10-17&lat=0x10&lng=100',
      'lat',
    ),
    missing('summary without dates', '/api/cams/summary', 'start', 'end'),
    invalid(
      'summary reversed',
      '/api/cams/summary?start=2026-10-17&end=2026-10-16',
      'start must be on or before end',
    ),
    invalid(
      'summary too long',
      '/api/cams/summary?start=2020-01-01&end=2026-10-17',
      'range exceeds 140 days',
    ),
  ],
  'station readings': [
    badBbox('latest with a bad bbox', '/api/station-readings/latest?bbox=nonsense'),
    badDate('latest with a malformed date', '/api/station-readings/latest?date=x', 'date'),
    noData(
      'no latest readings',
      '/api/station-readings/latest?date=2026-10-17',
      'No station readings for this date.',
    ),
    missing('history without station', '/api/station-readings/history', 'station_id'),
    invalid(
      'history with hours=0',
      '/api/station-readings/history?station_id=s1&hours=0',
      'Invalid parameter hours: must be >= 1',
      [{ path: '/hours', message: 'must be >= 1' }],
    ),
    invalid(
      'history with too many hours',
      '/api/station-readings/history?station_id=s1&hours=169',
      'Invalid parameter hours: must be <= 168',
      [{ path: '/hours', message: 'must be <= 168' }],
    ),
    notANumber(
      'history with hours=true',
      '/api/station-readings/history?station_id=s1&hours=true',
      'hours',
    ),
    invalid(
      'history with fractional hours',
      '/api/station-readings/history?station_id=s1&hours=1.5',
      'Invalid parameter hours: must be a whole number',
      [{ path: '/hours', message: 'must be multiple of 1' }],
    ),
    invalid(
      'station history with fractional days',
      '/api/stations/s1/history?days=2.5',
      'Invalid parameter days: must be a whole number',
      [{ path: '/days', message: 'must be multiple of 1' }],
    ),
    invalid(
      'station history with days=0',
      '/api/stations/s1/history?days=0',
      'Invalid parameter days: must be >= 1',
      [{ path: '/days', message: 'must be >= 1' }],
    ),
    invalid(
      'station history with too many days',
      '/api/stations/s1/history?days=31',
      'Invalid parameter days: must be <= 30',
      [{ path: '/days', message: 'must be <= 30' }],
    ),
    badDate(
      'station history with an impossible date',
      '/api/stations/s1/history?date=2026-13-45',
      'date',
    ),
  ],
  stations: [
    badBbox('list with a bad bbox', '/api/stations?bbox=nonsense'),
    ['unknown station', '/api/stations/nope', 404, 'Station not found', 'not_found'],
  ],
  'power plants': [
    [
      'no power plants ingested',
      '/api/power-plants',
      503,
      'Power plant data unavailable — run ingest:power-plants',
      'unavailable',
    ],
  ],
  'latest date': [
    noData('no complete day', '/api/latest-date', 'No complete date found in the last 7 days'),
  ],
};

describe('error responses of the data routes against a real database', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildTestApp();
    firesRoutes(app);
    weatherRoutes(app);
    camsRoutes(app);
    stationReadingsRoutes(app);
    stationsRoutes(app);
    powerPlantsRoutes(app);
    latestDateRoutes(app);
  });

  afterAll(() => app.close());

  beforeEach(clearTables);

  describe.each(Object.entries(CASES))('%s', (_group, cases) => {
    it.each(cases)('%s', async (_name, url, status, error, code, details) => {
      const res = await app.inject({ method: 'GET', url });

      expect({ status: res.statusCode, body: res.json<unknown>() }).toEqual({
        status,
        body: { error, code, ...(details ? { details } : {}) },
      });
    });
  });
});
