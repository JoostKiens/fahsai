import type { Preview } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
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

// Stories mock the network with MSW (`parameters.msw.handlers`). A request to our API or Mapbox
// that no handler answers fails the story, so none silently reaches localhost or production.
async function startMockWorker() {
  const worker = setupWorker();
  await worker.start({
    quiet: true,
    onUnhandledRequest(request, print) {
      const url = new URL(request.url);
      const isAppRequest = url.pathname.startsWith('/api/') || url.hostname.endsWith('mapbox.com');
      if (isAppRequest) print.error();
    },
  });
  return worker;
}

// One client per story, so cached responses never carry over; created in beforeEach rather than
// the decorator so re-renders from Controls keep the cache.
let queryClient = createQueryClient();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

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
  loaders: [mswLoader(startMockWorker)],
  // The stores are module singletons: reset them so no story sees another's state. Stories set
  // the state they need in their own beforeEach.
  beforeEach: () => {
    queryClient = createQueryClient();
    for (const store of [useLayerStore, useSettingsStore, useTimeStore, useUIStore]) {
      store.setState(store.getInitialState(), true);
    }
  },
  decorators: [
    (Story, { globals }) => {
      // Resources are bundled, so this switches before the story renders.
      void i18n.changeLanguage(globals.locale);
      document.documentElement.lang = globals.locale;
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
