import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldRetry } from '@/lib/api';
import { useTimeStore } from '@/store/timeStore';
import { useUIStore } from '@/store/uiStore';
import { useSelectionHydration } from './useSelectionHydration';

// act() needs to know it runs in a test
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useSelectionHydration when a source fails to load', () => {
  let root: Root;

  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17', latestDateResolved: true });
    useUIStore.setState({ selectedPoint: null, pendingSelection: { kind: 'station', id: 's1' } });
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    useUIStore.setState({ pendingSelection: null });
  });

  async function renderWithResponses(respond: (url: string) => Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(respond(url))),
    );
    function Probe() {
      useSelectionHydration();
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
    act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
    // each attempt gets its own act(), so React renders what the finished requests changed
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(useUIStore.getState().pendingSelection).toBeNull();
    });
  }

  it('stops waiting for a station list that came back as an unknown route', async () => {
    await renderWithResponses((url) =>
      url.includes('/station-readings/')
        ? Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 })
        : Response.json({ data: [] }),
    );

    expect(useUIStore.getState().selectedPoint).toBeNull();
  });
});
