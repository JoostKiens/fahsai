import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Skip real backoff waits; the retry logic under test only cares that it sleeps, not for how long.
vi.mock('node:timers/promises', () => ({ setTimeout: () => Promise.resolve() }));

import { fetchSensorDailyAverage } from './openaq.js';

const targetDate = '2026-10-04';

const okResponse = () =>
  new Response(
    JSON.stringify({
      results: [
        { value: 12.3, period: { datetimeFrom: { local: `${targetDate}T00:00:00+07:00` } } },
      ],
    }),
    { status: 200 },
  );

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchSensorDailyAverage', () => {
  it('returns the reading when a 500 is followed by a 200', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(okResponse());

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.readings).toEqual([{ value: 12.3, dateUtc: `${targetDate}T00:00:00Z` }]);
    expect(result.failed).toBe(false);
  });

  it('flags failed after retries are exhausted on persistent 5xx', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.readings).toEqual([]);
    expect(result.failed).toBe(true);
    // 1 initial request + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('flags failed after retries are exhausted on network errors', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.failed).toBe(true);
  });

  it('does not flag a 404 as failed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.readings).toEqual([]);
    expect(result.failed).toBe(false);
  });

  it('does not flag an empty result as failed', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.failed).toBe(false);
  });

  it('throws on a 4xx so a bad API key is not silently skipped for every sensor', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 401, statusText: 'Unauthorized' }),
    );

    await expect(fetchSensorDailyAverage('key', 1, targetDate)).rejects.toThrow(
      'OpenAQ sensor 1 error: 401 Unauthorized',
    );
  });
});
