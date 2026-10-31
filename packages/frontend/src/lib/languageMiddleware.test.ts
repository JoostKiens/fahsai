// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { languageMiddleware } from './languageMiddleware';

const SERVED = 'the page';

function run(
  url: string,
  {
    cookie,
    acceptLanguage,
    method = 'GET',
  }: { cookie?: string; acceptLanguage?: string; method?: string } = {},
) {
  const next = vi.fn(() => Promise.resolve(new Response(SERVED)));
  const request = new Request(url, {
    method,
    headers: acceptLanguage ? { 'Accept-Language': acceptLanguage } : {},
  });
  const cookies = {
    get: (name: string) => (name === 'lang' && cookie ? { value: cookie } : undefined),
  };
  return { next, result: languageMiddleware({ request, url: new URL(url), cookies }, next) };
}

describe('a redirect', () => {
  it('records the language of the switch in a cookie and goes to that page', async () => {
    const { next, result } = run('https://fahsai.fyi/?lang=th&date=2026-10-20');
    const res = await result;

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/th/?date=2026-10-20');
    expect(res.headers.get('Set-Cookie')).toBe(
      'lang=th; Max-Age=31536000; Path=/; SameSite=Lax; Secure; HttpOnly',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('goes back to the clean English page for ?lang=en', async () => {
    const res = await run('https://fahsai.fyi/?lang=en', { cookie: 'th' }).result;

    expect(res.headers.get('Location')).toBe('/');
    expect(res.headers.get('Set-Cookie')).toContain('lang=en;');
  });

  it('is never cached, and varies on what it was decided by', async () => {
    const res = await run('https://fahsai.fyi/?lang=th').result;

    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie');
  });

  it.each([
    ['the cookie', { cookie: 'th' }],
    ['the browser language', { acceptLanguage: 'th-TH,th;q=0.9' }],
  ])('follows %s without setting a cookie', async (_, signals) => {
    const res = await run('https://fahsai.fyi/?date=2026-10-20', signals).result;

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/th/?date=2026-10-20');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('also answers HEAD requests', async () => {
    const res = await run('https://fahsai.fyi/', { acceptLanguage: 'th', method: 'HEAD' }).result;

    expect(res.status).toBe(302);
  });

  it('leaves out Secure on plain http, which is local development', async () => {
    const res = await run('http://localhost:5173/?lang=th').result;

    expect(res.headers.get('Set-Cookie')).toBe(
      'lang=th; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly',
    );
  });
});

describe('a request that is served as it is', () => {
  it.each([
    ['no signals', {}],
    ['an English browser', { acceptLanguage: 'en-US,en;q=0.9' }],
    ['an English preference against a Thai browser', { cookie: 'en', acceptLanguage: 'th' }],
  ])('for %s', async (_, signals) => {
    const { next, result } = run('https://fahsai.fyi/', signals);
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(await res.text()).toBe(SERVED);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it.each(['/th/', '/th/?lang=en', '/_astro/app.js', '/robots.txt'])('%s', async (path) => {
    const { next, result } = run(`https://fahsai.fyi${path}`, {
      cookie: 'en',
      acceptLanguage: 'th',
    });
    await result;

    expect(next).toHaveBeenCalledOnce();
  });

  it('for a POST', async () => {
    const { next, result } = run('https://fahsai.fyi/?lang=th', { method: 'POST' });
    await result;

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('when deciding fails', () => {
  it('serves the page instead of failing it, and says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const next = vi.fn(() => Promise.resolve(new Response(SERVED)));
    const cookies = {
      get: () => {
        throw new Error('cookie parsing broke');
      },
    };
    const url = 'https://fahsai.fyi/';

    const res = await languageMiddleware(
      { request: new Request(url), url: new URL(url), cookies },
      next,
    );

    expect(await res.text()).toBe(SERVED);
    expect(next).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
