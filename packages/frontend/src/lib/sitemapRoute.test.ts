// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { GET } from '@/pages/sitemap.xml';

afterEach(() => vi.unstubAllGlobals());

function callGet() {
  return GET({} as APIContext) as Promise<Response>;
}

describe('GET /sitemap.xml', () => {
  it('lists the cities the API returns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ data: [{ slug: 'bangkok', name: 'B', country: 'TH' }] })),
      ),
    );

    const res = await callGet();

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('/city/bangkok');
  });

  it('answers 503 that nothing may keep, when the API cannot say which cities there are', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );

    const res = await callGet();

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
