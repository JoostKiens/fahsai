// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '@/i18n-instance';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from '@/components/Sidebar';

// The Astro pages render some components on the server, where there is no window, document or
// navigator. These tests run in a Node environment so a browser-only read at import time or during
// render fails here, not in the Vercel build.
describe('server rendering', () => {
  it('imports the stores without a browser', async () => {
    await expect(import('@/store/uiStore')).resolves.toHaveProperty('useUIStore');
    await expect(import('@/store/timeStore')).resolves.toHaveProperty('useTimeStore');
  });

  it.each([
    ['en', 'Station readings'],
    ['th', 'ค่าวัดจากสถานี'],
  ] as const)('renders the sidebar layer list in %s', (lang, stationReadings) => {
    const html = renderToString(
      <I18nextProvider i18n={createI18n(lang)}>
        <ErrorBoundary name="Sidebar" fallback={null}>
          <Sidebar />
        </ErrorBoundary>
      </I18nextProvider>,
    );

    expect(html).toContain(stationReadings);
  });

  it('renders one switch per layer', () => {
    const html = renderToString(
      <I18nextProvider i18n={createI18n('en')}>
        <Sidebar />
      </I18nextProvider>,
    );

    expect(html.match(/role="switch"/g)).toHaveLength(5);
  });
});
