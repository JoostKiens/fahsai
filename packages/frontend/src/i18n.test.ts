import '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import i18next from 'i18next';
import en from '@/locales/en.json';

// `lib/queryErrors.ts` and `ExplainButton/useExplain.ts` use the default i18next object directly,
// not a React hook, so the browser bootstrap has to initialise that one.
describe('browser i18n bootstrap', () => {
  it('initialises the default i18next instance', () => {
    expect(i18next.language).toBe('en');
  });

  it('translates with the default instance', () => {
    expect(i18next.t('toast.loadFailed')).toBe(en['toast.loadFailed']);
  });
});

// The page language is the address's, nothing else: the server's redirect (see languageRedirect.ts)
// is what turns a preference or a browser language into an address.
describe('the page language in the browser', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'set-by-the-server';
  });

  async function languageAt(path: string) {
    vi.resetModules();
    window.history.replaceState(null, '', path);
    await import('@/i18n');
    return (await import('i18next')).default.language;
  }

  it.each([
    ['/', 'en'],
    ['/th/', 'th'],
    ['/th', 'th'],
    ['/th/?lat=15.5&date=2026-10-20', 'th'],
    ['/thailand', 'en'],
  ])('at %s is %s', async (path, language) => {
    expect(await languageAt(path)).toBe(language);
  });

  it('ignores ?lang=: the redirect at / has already acted on it', async () => {
    expect(await languageAt('/?lang=th')).toBe('en');
  });

  it('ignores the language an older version saved in the browser', async () => {
    localStorage.setItem(
      'taqm:settings',
      JSON.stringify({ state: { scrubberDays: 120, language: 'th' }, version: 3 }),
    );

    expect(await languageAt('/')).toBe('en');
  });

  it('saves nothing and leaves <html lang> to the server', async () => {
    await languageAt('/th/');

    expect(localStorage.getItem('taqm:settings')).toBeNull();
    expect(document.documentElement.lang).toBe('set-by-the-server');
  });
});
