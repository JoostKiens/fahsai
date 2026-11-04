import { afterEach, describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted before imports by Vitest — openmeteo.ts imports grid
// constants from computeStationWeather.ts, which imports db/client.ts at
// module scope and throws when SUPABASE_* env vars are absent in tests.
vi.mock('../db/client.js', () => ({ supabase: {} }));

// The batch pauses and retry delays use node:timers/promises, which fake timers don't
// cover. Resolving at once keeps the grid tests instant.
vi.mock('node:timers/promises', () => ({ setTimeout: () => Promise.resolve() }));

import { fetchWeatherGridForDate, isTimeoutError, targetHourIndex } from './openmeteo.js';

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

  function okResponse(requestBody: string) {
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
    return new Response(JSON.stringify(results), { status: 200 });
  }

  type FetchInit = { body: string };

  async function runGrid(fetchMock: (url: string, init: FetchInit) => Promise<Response>) {
    const fetchSpy = vi.fn(fetchMock);
    vi.stubGlobal('fetch', fetchSpy);
    const outcome = await fetchWeatherGridForDate('2026-11-03', {
      calendarDayBkk: '2026-11-04',
    }).then(
      (readings) => ({ readings, error: undefined }),
      (error: unknown) => ({ readings: undefined, error }),
    );
    return { ...outcome, fetchSpy };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-fetches only the batch that timed out', async () => {
    let call = 0;
    const { readings, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      return call === 3 ? Promise.reject(timeoutError()) : Promise.resolve(okResponse(init.body));
    });

    expect(readings).toHaveLength(gridPointCount);
    // 16 batches + exactly one repeat of the batch that timed out.
    expect(fetchSpy).toHaveBeenCalledTimes(batchCount + 1);
  });

  it('gives up on a batch that keeps timing out without restarting earlier batches', async () => {
    let call = 0;
    const { error, fetchSpy } = await runGrid((_url, init) => {
      call += 1;
      return call <= 2 ? Promise.resolve(okResponse(init.body)) : Promise.reject(timeoutError());
    });

    expect(isTimeoutError(error)).toBe(true);
    // Batches 1 and 2 once each, then batch 3: the first try plus two retries.
    expect(fetchSpy).toHaveBeenCalledTimes(2 + 3);
  });

  it('does not retry an error that is not a timeout', async () => {
    const { error, fetchSpy } = await runGrid(() => Promise.reject(new TypeError('fetch failed')));

    expect(error).toBeInstanceOf(TypeError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
