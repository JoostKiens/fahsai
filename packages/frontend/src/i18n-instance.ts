import i18next, { type i18n } from 'i18next';
import en from './locales/en.json';
import th from './locales/th.json';
import type { Language } from './store/settingsStore';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}

/**
 * A new i18next instance for one language. It reads nothing from the browser, so it also runs while
 * Astro renders a page. Pass it to `I18nextProvider`; `i18n.ts` makes one the global instance in
 * the browser.
 */
export function createI18n(lng: Language): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    resources: {
      en: { translation: en },
      th: { translation: th },
    },
    lng,
    fallbackLng: 'en',
    supportedLngs: ['en', 'th'],
    interpolation: { escapeValue: false },
    // With inline resources the instance is ready when init returns, which server rendering needs.
    initAsync: false,
  });
  return instance;
}
