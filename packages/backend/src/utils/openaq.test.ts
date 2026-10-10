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

  it('gives a 5xx its full retry budget after earlier network errors', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(okResponse());

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.failed).toBe(false);
    expect(result.readings).toHaveLength(1);
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

  it('picks the target-date bucket when a sensor west of +07:00 returns the previous day first', async () => {
    // A +06:00 sensor's local day is shifted an hour against our +07:00 window, so OpenAQ
    // returns a 1-hour stub of the previous local day before the real target day.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { value: 28.5, period: { datetimeFrom: { local: '2026-10-03T00:00:00+06:00' } } },
            { value: 43.3, period: { datetimeFrom: { local: `${targetDate}T00:00:00+06:00` } } },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.readings).toEqual([{ value: 43.3, dateUtc: `${targetDate}T00:00:00Z` }]);
  });

  it('skips stale data when no bucket matches the target date', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            { value: 28.5, period: { datetimeFrom: { local: '2026-09-30T00:00:00+07:00' } } },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchSensorDailyAverage('key', 1, targetDate);

    expect(result.readings).toEqual([]);
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
