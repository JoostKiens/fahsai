import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DayCompleteness } from '../lib/dayCompleteness.js';

const { mockCheckDayCompleteness } = vi.hoisted(() => ({
  mockCheckDayCompleteness: vi.fn<(date: string) => Promise<DayCompleteness>>(),
}));

vi.mock('../lib/dayCompleteness.js', () => ({ checkDayCompleteness: mockCheckDayCompleteness }));

import { runPipelineHealth } from './pipeline-health.js';

const mockFetch = vi.fn<typeof fetch>();
const run = () => runPipelineHealth({ apiBaseUrl: 'https://api.example', date: '2026-10-29' });
const healthResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const completeDay: DayCompleteness = {
  isComplete: true,
  counts: { camsGrid: 4599, stationReadings: 900, weatherReadings: 4599 },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  mockCheckDayCompleteness.mockResolvedValue(completeDay);
  mockFetch.mockResolvedValue(
    healthResponse(200, { status: 'ok', cache: 'connected', db: 'connected' }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runPipelineHealth', () => {
  it('finds no problems when the day is complete and the API is healthy', async () => {
    expect(await run()).toEqual([]);
  });

  it('checks the given day against the API it was given', async () => {
    await run();
    expect(mockCheckDayCompleteness).toHaveBeenCalledWith('2026-10-29');
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.example/health');
  });

  it('reports an incomplete day with its row counts', async () => {
    mockCheckDayCompleteness.mockResolvedValue({
      isComplete: false,
      counts: { camsGrid: 0, stationReadings: 900, weatherReadings: 4599 },
    });
    expect(await run()).toEqual([
      {
        message: 'Pipeline data incomplete',
        details: { date: '2026-10-29', camsGrid: 0, stationReadings: 900, weatherReadings: 4599 },
      },
    ]);
  });

  it('reports a stopped cache, which the API itself serves through', async () => {
    const body = { status: 'degraded', cache: 'error', db: 'connected' };
    mockFetch.mockResolvedValue(healthResponse(200, body));
    expect(await run()).toEqual([
      { message: 'API health degraded', details: { status: 200, body } },
    ]);
  });

  it('reports a database outage', async () => {
    const body = { status: 'degraded', cache: 'connected', db: 'error' };
    mockFetch.mockResolvedValue(healthResponse(503, body));
    expect(await run()).toEqual([
      { message: 'API health degraded', details: { status: 503, body } },
    ]);
  });

  it('reports an unreachable API', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    expect(await run()).toEqual([
      { message: 'API health check failed', details: { error: 'fetch failed' } },
    ]);
  });

  it('reports every problem it finds, not just the first', async () => {
    mockCheckDayCompleteness.mockResolvedValue({ ...completeDay, isComplete: false });
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    expect((await run()).map((p) => p.message)).toEqual([
      'Pipeline data incomplete',
      'API health check failed',
    ]);
  });
});
