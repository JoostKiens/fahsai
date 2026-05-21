import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import th from './locales/th.json';
import { useSettingsStore } from './store/settingsStore';
import type { Language } from './store/settingsStore';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}

const pathLang: Language | null = window.location.pathname.startsWith('/th') ? 'th' : null;

const urlParam = new URLSearchParams(window.location.search).get('lang') as Language | null;
const urlLang: Language | null = urlParam === 'en' || urlParam === 'th' ? urlParam : null;

const storedLang = useSettingsStore.getState().language;
const browserLang: Language = navigator.language.startsWith('th') ? 'th' : 'en';
const initialLang: Language = pathLang ?? urlLang ?? storedLang ?? browserLang;

const explicitLang = pathLang ?? urlLang;
if (explicitLang) {
  useSettingsStore.getState().setLanguage(explicitLang);
}

// If the resolved language doesn't match the current path, redirect so the
// correct static HTML (with its og:tags) is served and the URL stays consistent.
if (!pathLang && initialLang === 'th') {
  window.location.replace('/th/' + window.location.search);
} else if (pathLang === 'th' && initialLang === 'en') {
  window.location.replace('/' + window.location.search);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    th: { translation: th },
  },
  lng: initialLang,
  fallbackLng: 'en',
  supportedLngs: ['en', 'th'],
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

document.documentElement.lang = initialLang;

export default i18n;

export function dateLocale(lang: string): string {
  return lang === 'th' ? 'th-TH-u-ca-gregory-nu-latn' : 'en-GB';
}
