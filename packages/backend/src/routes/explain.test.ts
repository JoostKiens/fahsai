import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiError } from '@thailand-aq/types';
import {
  FULL_CONTEXT,
  HIGH_OUTLIER_CONTEXT,
  SPARSE_CONTEXT,
} from '../test/fixtures/scientific-context.js';
import { buildTestApp } from '../test/test-app.js';
import { buildScientificContext } from '../lib/buildScientificContext.js';
import type { ExplainFixture } from '../scripts/eval/types.js';

const {
  mockCompute,
  mockLimit,
  mockPostLimit,
  mockIncr,
  mockGenerateStream,
  mockReportError,
  mockReportWarning,
} = vi.hoisted(() => ({
  mockCompute: vi.fn(),
  mockLimit: vi.fn(),
  mockPostLimit: vi.fn(),
  mockIncr: vi.fn(),
  mockGenerateStream: vi.fn(),
  mockReportError: vi.fn(),
  mockReportWarning: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContentStream: mockGenerateStream };
    }
  },
}));

vi.mock('../lib/buildPrompt.js', () => ({
  buildPrompt: () => 'prompt',
  GEMINI_MODEL: 'test-model',
}));

vi.mock('../lib/rollbar.js', () => ({
  reportError: mockReportError,
  reportWarning: mockReportWarning,
}));

vi.mock('../lib/computeScientificContext.js', () => ({
  computeScientificContext: mockCompute,
}));

vi.mock('../cache/ratelimit.js', () => ({
  explainRatelimit: { limit: mockPostLimit },
  explainContextRatelimit: { limit: mockLimit },
}));

vi.mock('../cache/client.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), incr: mockIncr, expire: vi.fn() },
  HISTORICAL_TTL_SECONDS: 604800,
  CACHE_CONTROL_IMMUTABLE: 'public, max-age=604800',
}));

const FIXTURE_CONTEXT = FULL_CONTEXT;
const FIXTURE_DIR = fileURLToPath(new URL('../scripts/eval/fixtures', import.meta.url));

async function buildApp(): Promise<FastifyInstance> {
  // IP_RATELIMIT_ENABLED is computed from NODE_ENV at module load, so stub before importing.
  vi.stubEnv('NODE_ENV', 'production');
  const { explainRoutes } = await import('./explain.js');
  const app = buildTestApp();
  await app.register(explainRoutes, { prefix: '/api' });
  return app;
}

describe('GET /api/explain/context', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    mockCompute.mockReset();
    mockLimit.mockReset();
    mockLimit.mockResolvedValue({ success: true, reset: 0 });
  });

  it('returns the scientific context on success', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FIXTURE_CONTEXT);
    expect(mockCompute).toHaveBeenCalledWith('abc', 18.79, 98.98, expect.any(String));
  });

  // The response schema must not strip or reject any part of a real context.
  it.each([
    ['a full context', FULL_CONTEXT],
    ['a context with every optional part missing', SPARSE_CONTEXT],
    ['a context for a high outlier', HIGH_OUTLIER_CONTEXT],
  ])('sends %s exactly as computed', async (_name, context) => {
    mockCompute.mockResolvedValue(context);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(context);
  });

  // The fixtures above are typed, so they cannot hold a field the type hides (currentlyUpwind was
  // once stripped that way). A context built by the real code can.
  it.each(readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.ts')))(
    'sends the context built from golden fixture %s exactly as computed',
    async (file) => {
      const { fixture } = (await import(
        `../scripts/eval/fixtures/${file.replace('.ts', '.js')}`
      )) as {
        fixture: ExplainFixture;
      };
      const context = buildScientificContext(fixture.input);
      mockCompute.mockResolvedValue(context);

      const res = await app.inject({
        method: 'GET',
        url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
      });

      expect(res.json()).toEqual(JSON.parse(JSON.stringify(context)));
    },
  );

  it('returns 400 when stationId is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('returns 400 when lat is not numeric', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=not-a-number&lng=98.98',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('returns 400 when date is not in YYYY-MM-DD format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98&date=not-a-date',
    });

    expect(res.statusCode).toBe(400);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('sets an immutable Cache-Control header for a historical date', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98&date=2020-01-01',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toMatch(/^public, max-age=\d+$/);
  });

  it('omits Cache-Control when no date is given (defaults to today)', async () => {
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('returns 404 when computeScientificContext finds no station', async () => {
    mockCompute.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=unknown&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Station not found', code: 'not_found' });
  });

  it('returns 429 when the rate limiter trips', async () => {
    mockLimit.mockResolvedValue({ success: false, reset: 1_234_567_890 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: 'Rate limit exceeded',
      code: 'rate_limited',
      reason: 'ip_ratelimit',
      resetAtMs: 1_234_567_890,
    });
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('fails open and still serves the request when Upstash errors', async () => {
    mockLimit.mockRejectedValue(new Error('Upstash unreachable'));
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);

    const res = await app.inject({
      method: 'GET',
      url: '/api/explain/context?stationId=abc&lat=18.79&lng=98.98',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FIXTURE_CONTEXT);
  });
});

describe('POST /api/explain error responses', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockCompute.mockReset();
    mockPostLimit.mockReset();
    mockPostLimit.mockResolvedValue({ success: true, reset: 0 });
    mockIncr.mockReset();
    mockIncr.mockResolvedValue(1);
  });

  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/explain', payload });
  const validBody = { stationId: 'abc', lat: 18.79, lng: 98.98 };

  it('answers 503 unavailable when no Gemini key is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    const res = await post(validBody);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'AI explanation not configured', code: 'unavailable' });
  });

  it('answers 400 invalid_request when a required field is missing', async () => {
    const res = await post({ lat: 18.79, lng: 98.98 });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'Missing required parameter: stationId',
      code: 'invalid_request',
      details: [{ path: '/stationId', message: 'is required' }],
    });
  });

  it('answers 400 invalid_request for a date that does not exist', async () => {
    const res = await post({ ...validBody, date: '2026-02-30' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'Invalid parameter date: expected a calendar day, YYYY-MM-DD',
      code: 'invalid_request',
    });
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('answers 429 rate_limited with the reset time when the IP limit trips', async () => {
    mockPostLimit.mockResolvedValue({ success: false, reset: 1_700_000_000_000 });

    const res = await post(validBody);

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: 'Rate limit exceeded',
      code: 'rate_limited',
      reason: 'ip_ratelimit',
      resetAtMs: 1_700_000_000_000,
    });
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('answers 429 rate_limited when the daily quota is used up', async () => {
    mockIncr.mockResolvedValue(451);

    const res = await post(validBody);
    const body = res.json<ApiError>();

    expect(res.statusCode).toBe(429);
    expect(body).toMatchObject({
      error: 'Daily quota exceeded',
      code: 'rate_limited',
      reason: 'quota_exceeded',
    });
    expect(body.resetAtMs).toBeGreaterThan(Date.now());
  });

  it('answers 404 not_found when the station is unknown', async () => {
    mockCompute.mockResolvedValue(null);

    const res = await post(validBody);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Station not found', code: 'not_found' });
  });

  it('fails open when Upstash errors, and goes on to look up the station', async () => {
    mockPostLimit.mockRejectedValue(new Error('Upstash unreachable'));
    mockCompute.mockResolvedValue(null);

    const res = await post(validBody);

    expect(res.statusCode).toBe(404);
    expect(mockCompute).toHaveBeenCalledTimes(1);
  });

  it('fails open when the daily quota counter errors, and goes on to look up the station', async () => {
    mockIncr.mockRejectedValue(new Error('database is stopped'));
    mockCompute.mockResolvedValue(null);

    const res = await post(validBody);

    expect(res.statusCode).toBe(404);
    expect(mockCompute).toHaveBeenCalledTimes(1);
  });
});

// Like Gemini's stream: chunks arrive asynchronously, then it either ends or fails.
async function* fakeGeminiStream(chunks: string[], failure?: Error) {
  for (const chunk of chunks) {
    await Promise.resolve();
    yield { text: () => chunk };
  }
  if (failure) throw failure;
}

const anyRequestId: unknown = expect.any(String);

describe('POST /api/explain errors after the stream has started', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockCompute.mockReset();
    mockCompute.mockResolvedValue(FIXTURE_CONTEXT);
    mockPostLimit.mockReset();
    mockPostLimit.mockResolvedValue({ success: true, reset: 0 });
    mockIncr.mockReset();
    mockIncr.mockResolvedValue(1);
    mockGenerateStream.mockReset();
    mockReportError.mockReset();
    mockReportWarning.mockReset();
  });

  // Gemini streams some text, then fails.
  function streamThatFails(error: Error) {
    mockGenerateStream.mockResolvedValue({
      stream: fakeGeminiStream(['The PM2.5 here is '], error),
    });
  }

  const explain = () =>
    app.inject({
      method: 'POST',
      url: '/api/explain',
      payload: { stationId: 'abc', lat: 18.79, lng: 98.98 },
    });

  function streamError(body: string): ApiError | null {
    const match = /\[ERROR_JSON:(.*)\]\s*$/s.exec(body);
    return match ? (JSON.parse(match[1]) as ApiError) : null;
  }

  it('ends the stream with the rate-limit error and reports a warning', async () => {
    streamThatFails(Object.assign(new Error('Too Many Requests'), { status: 429 }));

    const res = await explain();
    const error = streamError(res.body);

    expect(res.body.startsWith('The PM2.5 here is ')).toBe(true);
    expect(error).toMatchObject({
      error: 'Gemini rate limit reached',
      code: 'rate_limited',
      reason: 'gemini_rpm',
    });
    expect(error?.resetAtMs).toBeGreaterThan(Date.now());
    expect(mockReportWarning).toHaveBeenCalledWith('Gemini rate limit hit', {
      reason: 'gemini_rpm',
      resetAtMs: error?.resetAtMs,
    });
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('ends the stream with a generic error, hides the raw message, and reports the original', async () => {
    const failure = new Error('fetch failed: ECONNRESET to generativelanguage.example');
    streamThatFails(failure);

    const res = await explain();

    expect(streamError(res.body)).toEqual({
      error: 'Explanation unavailable',
      code: 'unavailable',
    });
    expect(res.body).not.toContain('ECONNRESET');
    expect(res.body).not.toContain('[ERROR:');
    expect(mockReportError).toHaveBeenCalledWith(failure, {
      path: '/api/explain',
      method: 'POST',
      requestId: anyRequestId,
    });
  });

  // The throttle is module-level, so these use a failure and a limit no other test reports.
  it('reports the same kind of Gemini failure once, whatever its message says', async () => {
    const failure = (id: number) =>
      Object.assign(new Error(`overloaded: request ${id} was refused`), {
        name: 'OverloadedError',
      });
    streamThatFails(failure(1));
    await explain();
    streamThatFails(failure(2));
    await explain();

    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it('reports a failure with another HTTP status even when its error class was just reported', async () => {
    const failure = (status: number) =>
      Object.assign(new Error('request refused'), { name: 'StatusKeyedError', status });
    streamThatFails(failure(503));
    await explain();
    streamThatFails(failure(403));
    await explain();

    expect(mockReportError).toHaveBeenCalledTimes(2);
  });

  it('reports the same Gemini rate limit once, however many requests hit it', async () => {
    const limit = Object.assign(new Error('Too many tokens per minute'), { status: 429 });
    streamThatFails(limit);
    await explain();
    streamThatFails(limit);
    await explain();

    expect(mockReportWarning).toHaveBeenCalledTimes(1);
  });

  it('sends no error line when the stream completes', async () => {
    mockGenerateStream.mockResolvedValue({ stream: fakeGeminiStream(['All good.']) });

    const res = await explain();

    expect(res.body).toBe('All good.');
    expect(streamError(res.body)).toBeNull();
  });
});
