import '@/i18n';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import { Scrubber, URL_DATE_FALLBACK_MS } from './Scrubber';

// React only flushes act() updates in environments that opt in.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderScrubber() {
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Scrubber initialData={{ latestDate: '2026-11-20', timeline: null }} />
      </QueryClientProvider>,
    ),
  );
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

describe('Scrubber with a date in the link', () => {
  let unmount = () => {};

  afterEach(() => {
    unmount();
    document.documentElement.removeAttribute('data-url-date');
    useTimeStore.setState(useTimeStore.getInitialState());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the placeholders while the latest date is unknown', () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-url-date', '');
    unmount = renderScrubber();

    act(() => {
      vi.advanceTimersByTime(URL_DATE_FALLBACK_MS - 1);
    });

    expect(document.documentElement.hasAttribute('data-url-date')).toBe(true);
  });

  it('shows the date if the latest date never arrives', () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-url-date', '');
    unmount = renderScrubber();

    act(() => {
      vi.advanceTimersByTime(URL_DATE_FALLBACK_MS);
    });

    expect(document.documentElement.hasAttribute('data-url-date')).toBe(false);
  });

  it('shows the date once the latest date is known', () => {
    document.documentElement.setAttribute('data-url-date', '');
    unmount = renderScrubber();

    act(() => useTimeStore.getState().setLatestDate('2026-11-20'));

    expect(document.documentElement.hasAttribute('data-url-date')).toBe(false);
  });
});
