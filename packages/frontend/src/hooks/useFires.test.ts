import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { useFires } from './useFires';

// act() needs to know it runs in a test
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('useFires', () => {
  let root: Root;
  let results: ReturnType<typeof useFires>[];

  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17', latestDateResolved: true });
    results = [];
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  const latest = () => results[results.length - 1];

  // The response has to be in place before the first render, which starts the request.
  async function renderWith(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    function Probe() {
      results.push(useFires());
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
    // act holds React's updates back until it exits, so wait for the request in a second one
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return fetchMock;
  }

  it('reads the versioned route', async () => {
    const fetchMock = await renderWith(json({ data: [] }, 200));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/fires\?date=2026-10-17$/),
    );
  });

  it('treats a day with no data as empty', async () => {
    await renderWith(json({ error: 'No fire data for this date.', code: 'no_data' }, 404));

    expect(latest()).toMatchObject({ data: [], isError: false });
  });

  it('treats any other 404 as a failure, not an empty day', async () => {
    await renderWith(json({ error: 'Route not found', code: 'not_found' }, 404));

    expect(latest()).toMatchObject({ isError: true });
  });
});
