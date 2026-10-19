import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandling } from '../lib/error-handler.js';
import { clearTables } from '../test/integration/db.js';
import { noReporters } from '../test/no-reporters.js';
import { camsRoutes } from './cams.js';
import { firesRoutes } from './fires.js';
import { latestDateRoutes } from './latest-date.js';
import { powerPlantsRoutes } from './power-plants.js';
import { stationReadingsRoutes } from './station-readings.js';
import { stationsRoutes } from './stations.js';
import { weatherRoutes } from './weather.js';

// Every error the data routes send on purpose, against an empty database. Bodies are exactly
// { error, code }: the human text is unchanged from before the error contract (JOO-76).

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
  HISTORICAL_TTL_SECONDS: 7 * 24 * 60 * 60,
  CACHE_CONTROL_IMMUTABLE: `public, max-age=${7 * 24 * 60 * 60}`,
}));

type ErrorCase = [name: string, url: string, status: number, error: string, code: string];

const invalid = (name: string, url: string, error: string): ErrorCase => [
  name,
  url,
  400,
  error,
  'invalid_request',
];
const noData = (name: string, url: string, error: string): ErrorCase => [
  name,
  url,
  404,
  error,
  'no_data',
];

const BAD_BBOX = 'Invalid bbox: "nonsense" — expected "west,south,east,north"';
const NO_CAMS = 'No CAMS grid data for this date. Run the ingest job.';
const DATE_REQUIRED = 'date param required (YYYY-MM-DD)';

const CASES: Record<string, ErrorCase[]> = {
  fires: [
    invalid('missing date', '/api/fires', 'Missing required param: date'),
    invalid(
      'malformed date',
      '/api/fires?date=17-10-2026',
      'Invalid date format, expected YYYY-MM-DD',
    ),
    invalid('bad bbox', '/api/fires?date=2026-10-17&bbox=nonsense', BAD_BBOX),
    noData('no fires', '/api/fires?date=2026-10-17', 'No fire data for this date.'),
    invalid(
      'range without start',
      '/api/fires/range?end=2026-10-17',
      'Missing required param: start',
    ),
    invalid(
      'range without end',
      '/api/fires/range?start=2026-10-17',
      'Missing required param: end',
    ),
    invalid(
      'range bad start',
      '/api/fires/range?start=x&end=2026-10-17',
      'Invalid start date format',
    ),
    invalid('range bad end', '/api/fires/range?start=2026-10-17&end=x', 'Invalid end date format'),
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
    invalid('weather without date', '/api/weather', DATE_REQUIRED),
    invalid('wind with a malformed date', '/api/weather/wind?date=x', DATE_REQUIRED),
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
    invalid('cams without date', '/api/cams', DATE_REQUIRED),
    noData('no cams grid', '/api/cams?date=2026-10-17', NO_CAMS),
    invalid('nearest without date', '/api/cams/nearest?lat=1&lng=1', DATE_REQUIRED),
    invalid(
      'nearest without coordinates',
      '/api/cams/nearest?date=2026-10-17',
      'lat and lng params required (numeric)',
    ),
    noData('no cams grid for nearest', '/api/cams/nearest?date=2026-10-17&lat=13&lng=100', NO_CAMS),
    invalid(
      'summary without dates',
      '/api/cams/summary',
      'start and end params required (YYYY-MM-DD)',
    ),
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
    invalid('latest with a bad bbox', '/api/station-readings/latest?bbox=nonsense', BAD_BBOX),
    noData(
      'no latest readings',
      '/api/station-readings/latest?date=2026-10-17',
      'No station readings for this date.',
    ),
    invalid(
      'history without station',
      '/api/station-readings/history',
      'Missing required param: station_id',
    ),
    invalid(
      'history with hours=0',
      '/api/station-readings/history?station_id=s1&hours=0',
      'hours must be a positive number',
    ),
    invalid(
      'history with too many hours',
      '/api/station-readings/history?station_id=s1&hours=169',
      'hours cannot exceed 168 (7 days)',
    ),
    invalid(
      'station history with days=0',
      '/api/stations/s1/history?days=0',
      'days must be a positive number',
    ),
    invalid(
      'station history with too many days',
      '/api/stations/s1/history?days=31',
      'days cannot exceed 30',
    ),
  ],
  stations: [
    invalid('list with a bad bbox', '/api/stations?bbox=nonsense', BAD_BBOX),
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
    app = Fastify();
    registerErrorHandling(app, noReporters);
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
    it.each(cases)('%s', async (_name, url, status, error, code) => {
      const res = await app.inject({ method: 'GET', url });

      expect({ status: res.statusCode, body: res.json<unknown>() }).toEqual({
        status,
        body: { error, code },
      });
    });
  });
});
