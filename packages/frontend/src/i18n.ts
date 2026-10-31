import { setI18n } from 'react-i18next';
import { createI18n } from './i18n-instance';
import { useSettingsStore } from './store/settingsStore';
import type { Language } from './store/settingsStore';

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

const i18n = createI18n(initialLang);
setI18n(i18n);

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

document.documentElement.lang = initialLang;

export default i18n;
