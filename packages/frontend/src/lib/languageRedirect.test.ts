// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveLanguageRedirect } from './languageRedirect';

function resolve(
  path: string,
  { cookie, acceptLanguage }: { cookie?: string; acceptLanguage?: string | null } = {},
) {
  return resolveLanguageRedirect({
    url: new URL(path, 'https://fahsai.fyi'),
    cookieLang: cookie,
    acceptLanguage: acceptLanguage ?? null,
  });
}

describe('the language switch (?lang=)', () => {
  it('records Thai and goes to the Thai page', () => {
    expect(resolve('/?lang=th')).toEqual({ location: '/th/', rememberAs: 'th' });
  });

  it('records English and goes to the clean English page', () => {
    expect(resolve('/?lang=en')).toEqual({ location: '/', rememberAs: 'en' });
  });

  it('wins over the cookie and the browser language', () => {
    const asEnglish = resolve('/?lang=en', { cookie: 'th', acceptLanguage: 'th' });
    const asThai = resolve('/?lang=th', { cookie: 'en', acceptLanguage: 'en-US' });

    expect(asEnglish).toEqual({ location: '/', rememberAs: 'en' });
    expect(asThai).toEqual({ location: '/th/', rememberAs: 'th' });
  });

  it('keeps the rest of the query: map position, date and selection', () => {
    const redirect = resolve(
      '/?lat=15.5&lng=101&zoom=5.5&lang=th&date=2026-10-20&sel=station:6123215',
    );

    expect(redirect?.location).toBe(
      '/th/?lat=15.5&lng=101&zoom=5.5&date=2026-10-20&sel=station%3A6123215',
    );
  });

  it('leaves no empty ? behind when it was the only parameter', () => {
    expect(resolve('/?date=2026-10-20&lang=en')?.location).toBe('/?date=2026-10-20');
    expect(resolve('/?lang=en')?.location).toBe('/');
  });

  it('uses the first value when it is given twice, and removes both', () => {
    expect(resolve('/?lang=th&lang=en')).toEqual({ location: '/th/', rememberAs: 'th' });
  });

  it.each(['fr', 'TH', '', 'th '])('ignores the value %j', (value) => {
    expect(resolve(`/?lang=${encodeURIComponent(value)}`)).toBeNull();
  });
});

describe('the language preference (cookie)', () => {
  it('sends a visitor who chose Thai to the Thai page, keeping the query as it was', () => {
    const redirect = resolve('/?date=2026-10-20&sel=station:6123215', { cookie: 'th' });

    expect(redirect).toEqual({
      location: '/th/?date=2026-10-20&sel=station:6123215',
      rememberAs: null,
    });
  });

  it('serves the English page to a visitor who chose English, whatever the browser says', () => {
    expect(resolve('/', { cookie: 'en', acceptLanguage: 'th-TH,th;q=0.9' })).toBeNull();
  });

  it('wins over the browser language', () => {
    expect(resolve('/', { cookie: 'th', acceptLanguage: 'en-US,en;q=0.9' })?.location).toBe('/th/');
  });

  it.each(['fr', 'TH', ''])(
    'ignores the value %j and falls back to the browser language',
    (cookie) => {
      expect(resolve('/', { cookie, acceptLanguage: 'th' })?.location).toBe('/th/');
      expect(resolve('/', { cookie, acceptLanguage: 'en' })).toBeNull();
    },
  );
});

describe('the browser language (Accept-Language)', () => {
  it.each([
    ['th'],
    ['th-TH'],
    ['TH'],
    ['th-TH,th;q=0.9,en;q=0.8'],
    ['en;q=0.5,th;q=0.9'],
    ['th,en'],
  ])('sends %j to the Thai page, without recording a preference', (acceptLanguage) => {
    expect(resolve('/', { acceptLanguage })).toEqual({ location: '/th/', rememberAs: null });
  });

  it.each([
    ['en-US,en;q=0.9,th;q=0.8'],
    ['en,th'],
    ['th;q=0.5,en;q=0.8'],
    ['th;q=0,en'],
    ['de,fr;q=0.5'],
    ['*'],
    [''],
    ['not a header;;;'],
  ])('serves English for %j', (acceptLanguage) => {
    expect(resolve('/', { acceptLanguage })).toBeNull();
  });

  it('serves English when there is no header', () => {
    expect(resolve('/')).toBeNull();
  });

  it('keeps the query', () => {
    expect(resolve('/?date=2026-10-20', { acceptLanguage: 'th' })?.location).toBe(
      '/th/?date=2026-10-20',
    );
  });
});

describe('addresses other than the English entry page', () => {
  it.each(['/th/', '/th', '/th/?lang=en', '/th/?date=2026-10-20', '/anything', '/city/chiang-mai'])(
    'never redirects %s: the address a visitor asked for wins',
    (path) => {
      const redirect = resolve(path, { cookie: 'en', acceptLanguage: 'th' });
      expect(redirect).toBeNull();
      expect(resolve(path, { cookie: 'th', acceptLanguage: 'en' })).toBeNull();
    },
  );
});
