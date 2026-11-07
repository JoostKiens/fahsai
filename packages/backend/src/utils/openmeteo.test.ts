import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from 'vitest';

// vi.mock is hoisted before imports by Vitest — openmeteo.ts imports grid
// constants from computeStationWeather.ts, which imports db/client.ts at
// module scope and throws when SUPABASE_* env vars are absent in tests.
vi.mock('../db/client.js', () => ({ supabase: {} }));

// The batch pauses and retry delays use node:timers/promises, which fake timers don't
// cover. Resolving at once keeps the grid tests instant; the calls record the delays.
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));

import { setTimeout as sleep } from 'node:timers/promises';
import {
  createTimeoutRetryBudget,
  fetchAirQualityGrid,
  fetchWeatherGridForDate,
  isConnectionError,
  isTimeoutError,
  targetHourIndex,
} from './openmeteo.js';

describe('targetHourIndex', () => {
  it('picks the exact match when the target hour is present', () => {
    const times = ['2026-07-16T00:00', '2026-07-16T13:00', '2026-07-16T14:00', '2026-07-16T15:00'];
    expect(targetHourIndex(times, 14)).toBe(2);
  });

  it('picks the closest hour when the target hour is missing', () => {
    const times = ['2026-07-16T00:00', '2026-07-16T12:00', '2026-07-16T15:00', '2026-07-16T18:00'];
    // 15:00 (diff 1) is closer to the 14:00 target than 12:00 (diff 2).
    expect(targetHourIndex(times, 14)).toBe(2);
  });

  it('returns 0 for an empty array', () => {
    expect(targetHourIndex([], 14)).toBe(0);
  });

  it('ignores entries with no parseable hour', () => {
    const times = ['not-a-time', '2026-07-16T14:00'];
    expect(targetHourIndex(times, 14)).toBe(1);
  });
});

describe('isTimeoutError', () => {
  it('is true for the error AbortSignal.timeout produces', () => {
    expect(isTimeoutError(new DOMException('x', 'TimeoutError'))).toBe(true);
  });

  it('is false for other errors and non-errors', () => {
    expect(isTimeoutError(new TypeError('fetch failed'))).toBe(false);
    expect(isTimeoutError('TimeoutError')).toBe(false);
  });
});

describe('isConnectionError', () => {
  it('is true for timeouts, fetch failures and ETIMEDOUT', () => {
    expect(isConnectionError(new DOMException('x', 'TimeoutError'))).toBe(true);
    expect(isConnectionError(new TypeError('fetch failed'))).toBe(true);
    expect(isConnectionError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe(true);
  });

  it('is false for other errors and non-errors', () => {
    expect(isConnectionError(new Error('Unexpected token < in JSON'))).toBe(false);
    expect(isConnectionError('fetch failed')).toBe(false);
  });
});

describe('fetchWeatherGridForDate timeouts', () => {
  const gridPointCount = 4599;
  const batchCount = 16;
  const hourlyTimes = Array.from(
    { length: 24 },
    (_, hour) => `2026-11-03T${String(hour).padStart(2, '0')}:00`,
  );

  function timeoutError() {
    return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }

  function okResponse(requestBody: string, headers?: Record<string, string>) {
    const { latitude } = JSON.parse(requestBody) as { latitude: number[] };
    const results = latitude.map(() => ({
      hourly: {
        time: hourlyTimes,
        wind_speed_10m: hourlyTimes.map(() => 5),
        wind_direction_10m: hourlyTimes.map(() => 90),
        relative_humidity_2m: hourlyTimes.map(() => 60),
      },
      daily: { time: ['2026-11-03'], precipitation_sum: [0] },
    }));
    return new Response(JSON.stringify(results), { status: 200, headers });
  }

  type FetchInit = { body: string };

  async function runGrid(
    fetchMock: (url: string, init: FetchInit) => Promise<Response>,
    {
      date = '2026-11-03',
      calendarDayBkk = '2026-11-04',
      timeoutRetryBudget = undefined as ReturnType<typeof createTimeoutRetryBudget> | undefined,
    } = {},
  ) {
    const fetchSpy = vi.fn(fetchMock);
    vi.stubGlobal('fetch', fetchSpy);
    const outcome = await fetchWeatherGridForDate(date, {
      calendarDayBkk,
      timeoutRetryBudget,
    }).then(
      (readings) => ({ readings, error: undefined }),
      (error: unknown) => ({ readings: undefined, error }),
    );
    return { ...outcome, fetchSpy };
  }

  let warnSpy: MockInstance<typeof console.warn>;
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.mocked(sleep).mockClear();
  });

  function warnings() {
    return warnSpy.mock.calls.map(([message]) => String(message));
  }

  function logs() {
    return logSpy.mock.calls.map(([message]) => String(message));
  }

  function sleepDelays() {
    return vi.mocked(sleep).mock.calls.map(([delayMs]) => delayMs);
  }

  it('pauses 35 s between batches and never otherwise on a clean run', async () => {
    const { readings, fetchSpy } = await runGrid((_url, init) =>
      Promise.resolve(okResponse(init.body)),
    );

    expect(readings).toHaveLength(gridPointCount);
    expect(fetchSpy).toHaveBeenCalledTimes(batchCount);
    expect(sleepDelays()).toEqual(Array.from({ length: batchCount - 1 }, () => 35_000));
  });

  it('logs the rate-limit budget Open-Meteo reports for every batch', async () => {
    const budget = {
      'x-ratelimit-cost': '300.0',
      'x-ratelimit-remaining': '300.0',
      'x-ratelimit-limit': '600.0',
      'x-ratelimit-window': '60',
    };
    await runGrid((_url, init) => Promise.resolve(okResponse(init.body, budget)));

    const lines = logs().filter((message) => message.includes('rate limit'));
    expect(lines).toHaveLength(batchCount);
    expect(lines[0]).toBe(
      '[openmeteo] weather batch rate limit: cost=300.0 remaining=300.0 limit=600.0 window_s=60',
    );
  });

  it('logs n/a for rate-limit headers a response does not carry', async () => {
    await runGrid((_url, init) => Promise.resolve(okResponse(init.body)));

    const [first] = logs().filter((message) => message.includes('rate limit'));
    expect(first).toBe(
      '[openmeteo] weather batch rate limit: cost=n/a remaining=n/a limit=n/a window_s=n/a',
    );
  });

  it('does not log a rate-limit budget for a failed response', async () => {
    const { error } = await runGrid(() =>
      Promise.resolve(
        new Response('bad gateway', { status: 502, headers: { 'x-ratelimit-remaining': '1.0' } }),
      ),
    );

    expect(error).toBeDefined();
    expect(logs().filter((message) => message.includes('rate limit'))).toEqual([]);
  });

  it('re-fetches only the batch that timed out, after one batch pause', async () => {
    let call = 0;
    const { readings, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      return call === 3 ? Promise.reject(timeoutError()) : Promise.resolve(okResponse(init.body));
    });

    expect(readings).toHaveLength(gridPointCount);
    // 16 batches + exactly one repeat of the batch that timed out.
    expect(fetchSpy).toHaveBeenCalledTimes(batchCount + 1);
    // The 15 inter-batch pauses plus the retry delay, all 35 s.
    expect(sleepDelays()).toEqual(Array.from({ length: batchCount }, () => 35_000));
  });

  it('retries a timed-out archive batch on the forecast endpoint with the same request', async () => {
    const requests: { url: string; body: string }[] = [];
    let call = 0;
    const { readings } = await runGrid((url, init) => {
      call += 1;
      requests.push({ url, body: init.body });
      return call === 3 ? Promise.reject(timeoutError()) : Promise.resolve(okResponse(init.body));
    });

    expect(readings).toHaveLength(gridPointCount);
    const retriedAt = requests.findIndex((r) => r.url === 'https://api.open-meteo.com/v1/forecast');
    const [timedOut, retried, next] = requests.slice(retriedAt - 1, retriedAt + 2);
    expect(timedOut.url).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(retried.url).toBe('https://api.open-meteo.com/v1/forecast');
    expect(retried.body).toBe(timedOut.body);
    // The batch after the retry goes back to the archive endpoint.
    expect(next.url).toBe('https://archive-api.open-meteo.com/v1/archive');
  });

  it('retries a timed-out batch of a day older than two days on the archive endpoint', async () => {
    let call = 0;
    const { readings, fetchSpy } = await runGrid(
      (_url, init) => {
        call += 1;
        return call === 3 ? Promise.reject(timeoutError()) : Promise.resolve(okResponse(init.body));
      },
      { date: '2026-08-01' },
    );

    expect(readings).toHaveLength(gridPointCount);
    const urls = fetchSpy.mock.calls.map(([url]) => url);
    expect(new Set(urls)).toEqual(new Set(['https://archive-api.open-meteo.com/v1/archive']));
    expect(warnings().find((message) => message.includes('timed out after'))).toMatch(
      /on archive-api\.open-meteo\.com, retrying in 35s$/,
    );
  });

  it('does not name another host when a same-day batch times out and retries', async () => {
    let call = 0;
    await runGrid(
      (_url, init) => {
        call += 1;
        return call === 3 ? Promise.reject(timeoutError()) : Promise.resolve(okResponse(init.body));
      },
      { date: '2026-11-04' },
    );

    expect(warnings().find((message) => message.includes('timed out after'))).toMatch(
      /on api\.open-meteo\.com, retrying in 35s$/,
    );
  });

  it('retries a batch whose response body times out while streaming', async () => {
    let call = 0;
    const { readings, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      if (call !== 3) return Promise.resolve(okResponse(init.body));
      const stalledBody = new Response(null, { status: 200 });
      vi.spyOn(stalledBody, 'text').mockRejectedValue(timeoutError());
      return Promise.resolve(stalledBody);
    });

    expect(readings).toHaveLength(gridPointCount);
    expect(fetchSpy).toHaveBeenCalledTimes(batchCount + 1);
  });

  it('gives up on a batch that times out twice without restarting earlier batches', async () => {
    let call = 0;
    const { error, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      return call <= 2 ? Promise.resolve(okResponse(init.body)) : Promise.reject(timeoutError());
    });

    expect(isTimeoutError(error)).toBe(true);
    // Batches 1 and 2 once each, then batch 3: the first try plus one retry.
    expect(fetchSpy).toHaveBeenCalledTimes(2 + 2);
    // Both timeouts are logged with the host and the elapsed time, the last as the final one.
    const timeouts = warnings().filter((message) => message.includes('timed out after'));
    expect(timeouts).toHaveLength(2);
    expect(timeouts[0]).toMatch(
      /after \d+ms on archive-api\.open-meteo\.com, retrying on api\.open-meteo\.com in 35s$/,
    );
    expect(timeouts[1]).toMatch(/after \d+ms on api\.open-meteo\.com, giving up$/);
  });

  it('gives up on a second stalled batch once the run has used its one retry', async () => {
    let call = 0;
    const { error, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      // Call 3 is batch 3 (stalls), call 4 its retry (succeeds), call 5 is batch 4 (stalls).
      return call === 3 || call === 5
        ? Promise.reject(timeoutError())
        : Promise.resolve(okResponse(init.body));
    });

    expect(isTimeoutError(error)).toBe(true);
    // Batches 1 and 2, batch 3 and its retry, then batch 4 once: a second retry would spend
    // another 300 calls of an hour that has 401 to spare.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    const timeouts = warnings().filter((message) => message.includes('timed out after'));
    expect(timeouts).toHaveLength(2);
    expect(timeouts[0]).toMatch(/retrying on api\.open-meteo\.com in 35s$/);
    expect(timeouts[1]).toMatch(/on archive-api\.open-meteo\.com, giving up$/);
  });

  it('shares one timeout retry between two grid fetches of the same run', async () => {
    const timeoutRetryBudget = createTimeoutRetryBudget();
    let firstCalls = 0;
    // First fetch: batch 3 stalls once and its retry succeeds, which spends the run's retry.
    await runGrid(
      (_url, init) => {
        firstCalls += 1;
        return firstCalls === 3
          ? Promise.reject(timeoutError())
          : Promise.resolve(okResponse(init.body));
      },
      { timeoutRetryBudget },
    );
    // Second fetch of the same run (a restart after a 5xx): its first stall must give up.
    const { error, fetchSpy } = await runGrid(() => Promise.reject(timeoutError()), {
      timeoutRetryBudget,
    });

    expect(isTimeoutError(error)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry an error that is not a timeout', async () => {
    const { error, fetchSpy } = await runGrid(() => Promise.reject(new TypeError('fetch failed')));

    expect(error).toBeInstanceOf(TypeError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAirQualityGrid rate-limit logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.mocked(sleep).mockClear();
  });

  it('logs the rate-limit budget for every AQ batch', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.fn((url: string) => {
      const latitudes = new URL(url).searchParams.get('latitude')?.split(',') ?? [];
      const results = latitudes.map((latitude) => ({
        latitude: Number(latitude),
        longitude: 100,
        hourly: { time: ['2026-11-03T00:00'], pm2_5: [12] },
      }));
      return Promise.resolve(
        new Response(JSON.stringify(results), {
          status: 200,
          headers: { 'x-ratelimit-cost': '300.0', 'x-ratelimit-remaining': '300.0' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    await fetchAirQualityGrid('2026-11-03');

    const lines = logSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('rate limit'));
    expect(lines).toHaveLength(16);
    expect(lines[0]).toBe(
      '[openmeteo] AQ batch rate limit: cost=300.0 remaining=300.0 limit=n/a window_s=n/a',
    );
  });
});
