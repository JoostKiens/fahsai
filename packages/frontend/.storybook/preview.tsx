import type { Preview } from '@storybook/react-vite';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../src/locales/en.json';
import th from '../src/locales/th.json';
import { useLayerStore } from '../src/store/layerStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTimeStore } from '../src/store/timeStore';
import { useUIStore } from '../src/store/uiStore';
import '../src/index.css';
import './preview.css';

// Not src/i18n.ts: it redirects the page to /th/ when the stored language is Thai. Components
// take the pure locale helpers from '@/utils/locale', so no story imports it.
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
  globalTypes: {
    locale: {
      description: 'Language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'th', title: 'ภาษาไทย' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'en' },
  // The stores are module singletons: reset them so no story sees another's state. Stories set
  // the state they need in their own beforeEach.
  beforeEach: () => {
    for (const store of [useLayerStore, useSettingsStore, useTimeStore, useUIStore]) {
      store.setState(store.getInitialState(), true);
    }
  },
  decorators: [
    (Story, { globals }) => {
      // Resources are bundled, so this switches before the story renders.
      void i18n.changeLanguage(globals.locale);
      document.documentElement.lang = globals.locale;
      return <Story />;
    },
  ],
};

export default preview;
