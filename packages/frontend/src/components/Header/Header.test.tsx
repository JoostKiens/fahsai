// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { createI18n } from '@/i18n-instance';
import { Header } from './Header';

function render(context?: 'map' | 'page'): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={createI18n('en')}>
        <Header context={context} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('Header on the server', () => {
  it('has the brand, subtitle and language pill in the HTML', () => {
    const html = render('page');

    expect(html).toContain('Fahsai');
    expect(html).toContain('Causes of cross-border PM2.5 pollution');
    expect(html).toContain('aria-label="Select language"');
  });

  it('is the page’s h1 on the map page, where the header is the only heading', () => {
    expect(render()).toContain('<h1 class="sr-only">');
  });

  it('is not a heading on a content page, which has its own h1', () => {
    const html = render('page');

    expect(html).not.toContain('<h1');
    expect(html).toContain('<p class="sr-only">');
  });

  it('keeps About and GitHub but has no Settings on a content page', () => {
    const page = render('page');
    const map = render('map');

    expect(page).toContain('aria-label="About"');
    expect(page).toContain('aria-label="GitHub"');
    expect(page).not.toContain('aria-label="Settings"');
    expect(map).toContain('aria-label="Settings"');
  });

  it('links the brand to the map on a content page, and not on the map page', () => {
    expect(render('page')).toContain('<a href="/"');
    expect(render('map')).not.toContain('<a href="/"');
  });
});
