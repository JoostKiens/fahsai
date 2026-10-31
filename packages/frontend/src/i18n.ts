import i18next from 'i18next';
import { setI18n } from 'react-i18next';
import { initI18n, type Language } from './i18n-instance';

// The page language is the address's. Which address a visitor should be sent to, from their
// language preference or their browser, is decided on the server (see lib/languageRedirect.ts), and
// the server writes <html lang>.
const pageLanguage: Language = /^\/th(\/|$)/.test(window.location.pathname) ? 'th' : 'en';

// The default instance, not a new one: queryErrors.ts and useExplain.ts import i18next directly.
const i18n = initI18n(i18next, pageLanguage);
setI18n(i18n);

export default i18n;
