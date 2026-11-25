import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshCityPages } from './refreshCityPages.js';

const NOW = new Date('2026-11-24T12:50:00Z');
const TOKEN = 'a'.repeat(32);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

function setup(responses: (Response | Error)[]) {
  const deleteCacheKeys = vi.fn<(...keys: string[]) => Promise<void>>(() => Promise.resolve());
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchFn.mockRejectedValueOnce(r);
    else fetchFn.mockResolvedValueOnce(r);
  }
  return { deleteCacheKeys, fetchFn };
}

describe('refreshCityPages', () => {
  it("deletes this hour's cached pages, then revalidates each page with the token", async () => {
    const { deleteCacheKeys, fetchFn } = setup([new Response(null), new Response(null)]);

    const result = await refreshCityPages({
      slugs: ['chiang-mai', 'lamphun'],
      now: NOW,
      latestDate: '2026-11-23',
      deleteCacheKeys,
      bypassToken: TOKEN,
      fetchFn,
    });

    expect(deleteCacheKeys).toHaveBeenCalledWith(
      'city:v4:chiang-mai:2026-11-23:2026-11-24T12',
      'city:v4:lamphun:2026-11-23:2026-11-24T12',
    );
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
    const { deleteCacheKeys, fetchFn } = setup([
      new Error('network down'),
      new Response(null, { status: 500 }),
      new Response(null),
    ]);

    const result = await refreshCityPages({
      slugs: ['a', 'b', 'c'],
      now: NOW,
      latestDate: '2026-11-23',
      deleteCacheKeys,
      bypassToken: TOKEN,
      fetchFn,
    });

    expect(result).toEqual({ revalidated: ['c'], failed: ['a', 'b'] });
  });

  it('still clears the cache without a token, and calls nothing else', async () => {
    const { deleteCacheKeys, fetchFn } = setup([]);

    await refreshCityPages({
      slugs: ['chiang-mai'],
      now: NOW,
      latestDate: '2026-11-23',
      deleteCacheKeys,
      bypassToken: undefined,
      fetchFn,
    });

    expect(deleteCacheKeys).toHaveBeenCalledOnce();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips the cache delete when there is no complete day', async () => {
    const { deleteCacheKeys, fetchFn } = setup([new Response(null)]);

    await refreshCityPages({
      slugs: ['chiang-mai'],
      now: NOW,
      latestDate: null,
      deleteCacheKeys,
      bypassToken: TOKEN,
      fetchFn,
    });

    expect(deleteCacheKeys).not.toHaveBeenCalled();
  });
});
