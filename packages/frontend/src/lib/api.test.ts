import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, fetchApiData, HttpError, isNoData, shouldRetry } from './api';

afterEach(() => vi.unstubAllGlobals());

const noData = () => Response.json({ error: 'No fire data', code: 'no_data' }, { status: 404 });

describe('apiUrl', () => {
  it('puts a route under /api/v1', () => {
    expect(apiUrl('/fires?date=2026-10-17')).toMatch(/\/api\/v1\/fires\?date=2026-10-17$/);
  });
});

describe('isNoData', () => {
  it('is true for a 404 that says there is no data', async () => {
    expect(await isNoData(noData())).toBe(true);
  });

  it.each([
    ['an unknown resource', Response.json({ code: 'not_found' }, { status: 404 })],
    ['an unknown route', Response.json({ code: 'not_found' }, { status: 404 })],
    ['a 404 with no readable body', new Response('<html>', { status: 404 })],
    ['a 404 with a JSON null body', Response.json(null, { status: 404 })],
    ['a 200', Response.json({ data: [] })],
    ['a 500 that says no_data', Response.json({ code: 'no_data' }, { status: 500 })],
  ])('is false for %s', async (_name, res) => {
    expect(await isNoData(res)).toBe(false);
  });

  it('leaves the body readable for the caller', async () => {
    const res = noData();

    await isNoData(res);

    expect(await res.json()).toEqual({ error: 'No fire data', code: 'no_data' });
  });
});

describe('fetchApiData', () => {
  const stubFetch = (res: Response) => {
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('returns the data of the response', async () => {
    stubFetch(Response.json({ data: [1, 2] }));

    expect(await fetchApiData<number[]>('/x', 'x', [])).toEqual([1, 2]);
  });

  it('returns the empty value for a day with no data', async () => {
    stubFetch(noData());

    expect(await fetchApiData<number[] | null>('/x', 'x', null)).toBeNull();
  });

  it('fails with the status of any other 404', async () => {
    stubFetch(Response.json({ code: 'not_found' }, { status: 404 }));

    await expect(fetchApiData('/x', 'fires', [])).rejects.toMatchObject({
      name: 'HttpError',
      message: 'fires fetch failed: 404',
      status: 404,
    });
  });

  it('fails with the status of a server error', async () => {
    stubFetch(new Response('boom', { status: 503 }));

    await expect(fetchApiData('/x', 'wind', [])).rejects.toMatchObject({ status: 503 });
  });

  it('passes the request options on', async () => {
    const fetchMock = stubFetch(Response.json({ data: [] }));

    await fetchApiData('/x', 'x', [], { cache: 'no-cache' });

    expect(fetchMock).toHaveBeenCalledWith(apiUrl('/x'), { cache: 'no-cache' });
  });
});

describe('shouldRetry', () => {
  it.each([400, 404, 429])('does not retry a %i', (status) => {
    expect(shouldRetry(0, new HttpError('failed', status))).toBe(false);
  });

  it.each([
    ['a 500', new HttpError('failed', 500)],
    ['a dropped connection', new TypeError('Failed to fetch')],
  ])('retries %s up to three times', (_name, error) => {
    expect([0, 1, 2, 3].map((failureCount) => shouldRetry(failureCount, error))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});
