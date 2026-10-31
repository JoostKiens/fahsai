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
 * Sets up an i18next instance for one language. It reads nothing from the browser, so it also runs
 * while Astro renders a page.
 */
export function initI18n(instance: i18n, lng: Language): i18n {
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

/**
 * A new instance for one language, to pass to `I18nextProvider` in a server-rendered island.
 * In the browser `i18n.ts` sets up the default `i18next` instead, which code outside React
 * (`queryErrors.ts`, `useExplain.ts`) imports directly.
 */
export function createI18n(lng: Language): i18n {
  return initI18n(i18next.createInstance(), lng);
}
