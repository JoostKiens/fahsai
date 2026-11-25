import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshCityPages } from './refreshCityPages.js';

const TOKEN = 'a'.repeat(32);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

function fetchWith(responses: (Response | Error)[]) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchFn.mockRejectedValueOnce(r);
    else fetchFn.mockResolvedValueOnce(r);
  }
  return fetchFn;
}

describe('refreshCityPages', () => {
  it('revalidates each page with the token', async () => {
    const fetchFn = fetchWith([new Response(null), new Response(null)]);

    const result = await refreshCityPages({
      slugs: ['chiang-mai', 'lamphun'],
      bypassToken: TOKEN,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://fahsai.fyi/city/chiang-mai',
      expect.objectContaining({
        method: 'HEAD',
        headers: { 'x-prerender-revalidate': TOKEN },
      }),
    );
    expect(result).toEqual({ revalidated: ['chiang-mai', 'lamphun'], failed: [] });
  });

  it('counts a failed page and goes on with the others', async () => {
    const fetchFn = fetchWith([
      new Error('network down'),
      new Response(null, { status: 500 }),
      new Response(null),
    ]);

    const result = await refreshCityPages({ slugs: ['a', 'b', 'c'], bypassToken: TOKEN, fetchFn });

    expect(result).toEqual({ revalidated: ['c'], failed: ['a', 'b'] });
  });

  it('calls nothing without a token', async () => {
    const fetchFn = fetchWith([]);

    await refreshCityPages({ slugs: ['chiang-mai'], bypassToken: undefined, fetchFn });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('calls nothing when no city got a blend', async () => {
    const fetchFn = fetchWith([]);

    const result = await refreshCityPages({ slugs: [], bypassToken: TOKEN, fetchFn });

    expect(result).toEqual({ revalidated: [], failed: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
