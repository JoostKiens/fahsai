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
