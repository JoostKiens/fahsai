import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AppError } from './app-error.js';
import { registerErrorHandling } from './error-handler.js';

// asymmetric matchers are typed `any`; typing them `unknown` keeps no-unsafe-assignment satisfied
const anyRequestId: unknown = expect.any(String);
const mentionsDate: unknown = expect.stringContaining('date');

const reportError = vi.fn();
const reportWarning = vi.fn();

// pino writes one JSON line per log call; these are lines we produce ourselves, so the cast is safe
type LogLine = { level: number; msg?: string; err?: { message?: string } };

function buildApp(logLines: LogLine[] = []): FastifyInstance {
  const app = Fastify({
    logger: {
      level: 'info',
      stream: { write: (line: string) => logLines.push(JSON.parse(line) as LogLine) },
    },
  });
  registerErrorHandling(app, { reportError, reportWarning });

  app.get('/invalid', () => {
    throw new AppError({ code: 'invalid_request', message: 'start must be before end' });
  });
  app.get('/not-found', () => {
    throw new AppError({ code: 'not_found', message: 'Station not found' });
  });
  app.get('/no-data', () => {
    throw new AppError({ code: 'no_data', message: 'No fire data for this date.' });
  });
  app.get('/rate-limited', () => {
    throw new AppError({
      code: 'rate_limited',
      message: 'Rate limit exceeded',
      reason: 'ip_ratelimit',
      resetAtMs: 1_700_000_000_000,
    });
  });
  app.get('/unavailable', () => {
    throw new AppError({ code: 'unavailable', message: 'Power plant data unavailable' });
  });
  app.get('/boom', () => {
    throw new Error('relation "secret_table" does not exist');
  });
  app.get(
    '/validated',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['date'],
          properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
    () => ({ ok: true }),
  );
  app.get('/library-error', () => {
    throw Object.assign(new Error('upstream said no'), { statusCode: 400 });
  });
  app.post('/json', () => ({ ok: true }));
  return app;
}

describe('central error handling', () => {
  let app: FastifyInstance;

  let logLines: LogLine[];

  beforeEach(() => {
    reportError.mockReset();
    reportWarning.mockReset();
    logLines = [];
    app = buildApp(logLines);
  });

  afterEach(() => app.close());

  async function get(url: string) {
    const res = await app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
  }

  describe('errors thrown on purpose', () => {
    it.each([
      ['/invalid', 400, { error: 'start must be before end', code: 'invalid_request' }],
      ['/not-found', 404, { error: 'Station not found', code: 'not_found' }],
      ['/no-data', 404, { error: 'No fire data for this date.', code: 'no_data' }],
      ['/unavailable', 503, { error: 'Power plant data unavailable', code: 'unavailable' }],
    ])('%s answers %i with only error and code', async (url, status, body) => {
      expect(await get(url)).toEqual({ status, body });
    });

    it('keeps the rate-limit reason and reset time', async () => {
      expect(await get('/rate-limited')).toEqual({
        status: 429,
        body: {
          error: 'Rate limit exceeded',
          code: 'rate_limited',
          reason: 'ip_ratelimit',
          resetAtMs: 1_700_000_000_000,
        },
      });
    });
  });

  describe('errors Fastify raises itself', () => {
    it('answers a missing query parameter with invalid_request and its path', async () => {
      const { status, body } = await get('/validated');

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'invalid_request',
        details: [{ path: 'date', message: mentionsDate }],
      });
    });

    it('answers a malformed value with the path of the property', async () => {
      const { body } = await get('/validated?date=tomorrow');

      expect(body).toMatchObject({ code: 'invalid_request', details: [{ path: '/date' }] });
    });

    it('answers malformed JSON with invalid_request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/json',
        headers: { 'content-type': 'application/json' },
        payload: '{not json',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'invalid_request' });
    });

    it('answers an unknown route with not_found', async () => {
      expect(await get('/no-such-route')).toEqual({
        status: 404,
        body: { error: 'Route not found', code: 'not_found' },
      });
    });
  });

  describe('unexpected errors', () => {
    it('hides the internal message from the client', async () => {
      const { status, body } = await get('/boom');

      expect(status).toBe(500);
      expect(body).toEqual({ error: 'Internal server error', code: 'internal' });
    });

    it('reports the original error with the request context', async () => {
      await get('/boom');

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'relation "secret_table" does not exist' }),
        { path: '/boom', method: 'GET', requestId: anyRequestId },
      );
    });
  });

  describe('what is logged', () => {
    const errorLevel = 50;
    const warnLevel = 40;
    const infoLevel = 30;

    it('logs an unexpected error at error level with the original message', async () => {
      await get('/boom');

      expect(
        logLines.find(
          (line) => line.level === errorLevel && line.err?.message?.includes('secret_table'),
        ),
      ).toBeDefined();
    });

    it('logs an unavailable dataset as a warning', async () => {
      await get('/unavailable');

      expect(logLines.some((line) => line.level === warnLevel)).toBe(true);
      expect(logLines.some((line) => line.level === errorLevel)).toBe(false);
    });

    it('logs a client error below error level', async () => {
      await get('/invalid');

      expect(logLines.some((line) => line.level >= warnLevel)).toBe(false);
      expect(
        logLines.some(
          (line) => line.level === infoLevel && line.msg === 'start must be before end',
        ),
      ).toBe(true);
    });
  });

  describe('an error with a 4xx status that did not come from Fastify', () => {
    it('is answered as an unexpected error, without its message', async () => {
      const { status, body } = await get('/library-error');

      expect(status).toBe(500);
      expect(body).toEqual({ error: 'Internal server error', code: 'internal' });
    });

    it('is reported, because it is our failure to call the library', async () => {
      await get('/library-error');

      expect(reportError).toHaveBeenCalledTimes(1);
    });
  });

  describe('what reaches Rollbar', () => {
    it('reports an unavailable dataset as a warning, not an error', async () => {
      await get('/unavailable');

      expect(reportWarning).toHaveBeenCalledWith('Power plant data unavailable', {
        path: '/unavailable',
        method: 'GET',
        requestId: anyRequestId,
      });
      expect(reportError).not.toHaveBeenCalled();
    });

    it.each(['/invalid', '/not-found', '/no-data', '/rate-limited', '/validated', '/nope'])(
      'does not report the client error from %s',
      async (url) => {
        await get(url);

        expect(reportError).not.toHaveBeenCalled();
        expect(reportWarning).not.toHaveBeenCalled();
      },
    );
  });

  it.each(['/invalid', '/no-data', '/rate-limited', '/validated', '/boom', '/nope'])(
    'never adds a message, statusCode or stack field (%s)',
    async (url) => {
      const { body } = await get(url);

      expect(
        Object.keys(body).filter((key) => ['message', 'statusCode', 'stack'].includes(key)),
      ).toEqual([]);
    },
  );
});
