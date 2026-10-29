import type { Preview } from '@storybook/react-vite';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../src/locales/en.json';
import th from '../src/locales/th.json';
import '../src/index.css';
import './preview.css';

// Not src/i18n.ts: it redirects the page to /th/ when the stored language is Thai. Stories that
// import from '@/i18n' (e.g. dateLocale in InfoPanel, Scrubber) would still run that code.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, th: { translation: th } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
