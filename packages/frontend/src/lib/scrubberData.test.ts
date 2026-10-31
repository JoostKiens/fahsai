// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { fetchScrubberData } from './scrubberData';

const LATEST_DATE = '2026-10-30';
const TIMELINE = [
  { date: '2026-10-29', pm25: 31 },
  { date: '2026-10-30', pm25: 44 },
];

type Answer = object | number;

const working = { latestDate: { date: LATEST_DATE }, summary: { data: TIMELINE } };

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

// Answers by path: a body, a status code (an error response, with a valid body, so only its status
// can make it fail) or an Error (a network failure).
function fakeFetch(routes: { latestDate?: Answer; summary?: Answer }) {
  return vi.fn<typeof fetch>((input) => {
    const isLatestDate = urlOf(input).includes('/latest-date');
    const answer = isLatestDate ? routes.latestDate : routes.summary;
    if (answer instanceof Error) return Promise.reject(answer);
    if (typeof answer === 'number') {
      const validBody = isLatestDate ? working.latestDate : working.summary;
      return Promise.resolve(Response.json(validBody, { status: answer }));
    }
    return Promise.resolve(Response.json(answer));
  });
}

describe('fetchScrubberData', () => {
  it('asks for the latest date, then the default 120 days ending on it', async () => {
    const fetchFn = fakeFetch(working);

    await fetchScrubberData({ fetchFn });

    const urls = fetchFn.mock.calls.map(([url]) => urlOf(url));
    expect(urls[0]).toMatch(/\/latest-date$/);
    expect(urls[1]).toMatch(/\/cams\/summary\?start=2026-07-03&end=2026-10-30$/);
  });

  it('gives both requests one deadline, so a slow API holds the page up once, not twice', async () => {
    const fetchFn = fakeFetch(working);

    await fetchScrubberData({ fetchFn });

    const [first, second] = fetchFn.mock.calls.map(([, init]) => init?.signal);
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it('returns the latest date and the timeline', async () => {
    expect(await fetchScrubberData({ fetchFn: fakeFetch(working) })).toEqual({
      latestDate: LATEST_DATE,
      timeline: TIMELINE,
    });
  });

  it('keeps an empty timeline (the API answers a range with no data with an empty list)', async () => {
    const fetchFn = fakeFetch({ ...working, summary: { data: [] } });

    expect(await fetchScrubberData({ fetchFn })).toEqual({ latestDate: LATEST_DATE, timeline: [] });
  });

  it.each([
    ['a network error', new Error('connection refused')],
    ['an error response', 503],
    ['a body without a date', {}],
    ['a date that is not a day', { date: 'yesterday' }],
  ])('gives up on the whole page data after %s for the latest date', async (_, latestDate) => {
    const fetchFn = fakeFetch({ ...working, latestDate });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchScrubberData({ fetchFn })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it.each([
    ['a network error', new Error('connection refused')],
    ['an error response', 500],
    ['a body that is not a list', { data: 'none' }],
    ['entries that are not days', { data: [{ date: '2026-10-30' }] }],
  ])('keeps the date after %s for the timeline', async (_, summary) => {
    const fetchFn = fakeFetch({ ...working, summary });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchScrubberData({ fetchFn })).toEqual({
      latestDate: LATEST_DATE,
      timeline: null,
    });
    warn.mockRestore();
  });

  it('abandons a request that never answers', async () => {
    const hanging = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchScrubberData({ fetchFn: hanging, timeoutMs: 20 })).toBeNull();
    warn.mockRestore();
  });
});
