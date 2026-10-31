import {
  Canvas,
  Controls,
  Description,
  DocsContext,
  Primary,
  Subtitle,
  Title,
  useOf,
} from '@storybook/addon-docs/blocks';
import type { Preview } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContext } from 'react';
import { MotionGlobalConfig } from 'motion/react';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { configure, expect, waitFor } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';
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

// Not src/i18n.ts: it reads the page's address, which in Storybook is not a page of the site.
// Components take the pure locale helpers from '@/utils/locale', so no story imports it.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, th: { translation: th } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Under test (Playwright sets navigator.webdriver) motion animations finish instantly: Chromium
// throttles animation frames in the busy test iframes, so an exit animation could take seconds.
// The Storybook UI keeps them.
if (navigator.webdriver) MotionGlobalConfig.skipAnimations = true;

// findBy* and waitFor give up after 1 s by default. Fade-ins, exit animations and mocked requests
// take longer than that when the whole suite runs in parallel, so allow 3 s.
configure({ asyncUtilTimeout: 3000 });

// Stories mock the network with MSW (`parameters.msw.handlers`). A request to our API or Mapbox
// that no handler answers is errored, so it never reaches localhost, production or Mapbox (with
// the real token), and is listed when afterEach fails the story.
const unhandledRequests: string[] = [];

async function startMockWorker() {
  const worker = setupWorker();
  await worker.start({
    quiet: true,
    // msw 3 renamed onUnhandledRequest to onUnhandledFrame. Returning lets the request through
    // (defaults.error() only prints); throwing is what makes msw error it.
    onUnhandledFrame({ frame }) {
      const { data }: { data: unknown } = frame;
      const request =
        typeof data === 'object' && data !== null && 'request' in data && data.request;
      if (!(request instanceof Request)) return;
      const url = new URL(request.url);
      const isAppRequest = url.pathname.startsWith('/api/') || url.hostname.endsWith('mapbox.com');
      if (!isAppRequest) return;
      unhandledRequests.push(`${request.method} ${request.url}`);
      throw new Error(`Unmocked request: ${request.method} ${request.url}`);
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

// A Docs page shows only the primary story. With all of them on one page they'd share i18next,
// the stores, the query client and MSW, so one story's language or handlers leak into others.
function DocsPage() {
  const { csfFile } = useOf('meta', ['meta']);
  // Mobile-only components are md:hidden, and a Docs page is desktop width. For a story file with
  // a mobile viewport the primary story renders in an iframe that wide, which media queries
  // measure, so the component shows.
  const viewport = mobileViewport(csfFile.meta.globals?.viewport);
  // The file's first story, as the Primary block picks it.
  const primary = useContext(DocsContext).componentStories()[0];
  return (
    <>
      <Title />
      <Subtitle />
      <Description />
      {viewport && primary ? (
        // Storybook frames an iframe story with an 8 px border on each side, and the story block
        // has a 1 px border, so the iframe itself is exactly the viewport's width.
        <div style={{ maxWidth: `calc(${viewport.styles.width} + 18px)` }}>
          <Canvas of={primary.moduleExport} story={{ inline: false }} />
        </div>
      ) : (
        <Primary />
      )}
      <Controls />
    </>
  );
}

// The phone viewport a story file sets as its `viewport` global, if any.
function mobileViewport(global: unknown) {
  if (typeof global !== 'object' || global === null || !('value' in global)) return undefined;
  const { value } = global;
  return value === 'mobile1' || value === 'mobile2' ? MINIMAL_VIEWPORTS[value] : undefined;
}

const preview: Preview = {
  // A generated Docs page per component, which the MCP's docs-show also reads.
  tags: ['autodocs'],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // iframeHeight applies only to Docs stories rendered in an iframe, the mobile ones; it's
    // mobile1's height, and a story file can set its own.
    docs: { page: DocsPage, story: { iframeHeight: MINIMAL_VIEWPORTS.mobile1.styles.height } },
    // axe runs on every story, and a violation fails it.
    a11y: { test: 'error' },
    // Stories sit on the app background, on Docs pages too (index.css only colours the canvas body).
    backgrounds: { options: { app: { name: 'App', value: 'var(--app-background)' } } },
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
  initialGlobals: { locale: 'en', backgrounds: { value: 'app' } },
  loaders: [mswLoader(startMockWorker)],
  // The stores are module singletons: reset them so no story sees another's state. Stories set
  // the state they need in their own beforeEach.
  beforeEach: () => {
    queryClient = createQueryClient();
    // afterEach doesn't run when a play function throws, so don't inherit that story's list.
    unhandledRequests.length = 0;
    useLayerStore.setState(useLayerStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useTimeStore.setState(useTimeStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  },
  // Queries start fetching on mount, so wait for them to settle before checking.
  afterEach: async () => {
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const unmocked = unhandledRequests.splice(0);
    if (unmocked.length > 0) {
      throw new Error(`Unmocked requests (add an MSW handler): ${unmocked.join(', ')}`);
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
