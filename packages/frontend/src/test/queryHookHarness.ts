import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { shouldRetry } from '@/lib/api';

// act() needs to know it runs in a test
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mountedRoots: Root[] = [];

// Renders a hook that uses TanStack Query inside the app's retry rule, with every request
// answered by `respond`. Call unmountQueryHooks() in afterEach.
export function renderQueryHook<T>(useHook: () => T, respond: (url: string) => Response) {
  const fetchMock = vi.fn((url: string) => Promise.resolve(respond(url)));
  vi.stubGlobal('fetch', fetchMock);
  const results: T[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
  const root = createRoot(document.createElement('div'));
  mountedRoots.push(root);

  function Probe() {
    results.push(useHook());
    return null;
  }
  act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));

  // React holds its updates back until act() exits, so each poll gets its own act()
  async function settle(isSettled: () => boolean) {
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      if (!isSettled()) throw new Error('not settled yet');
    });
  }

  return { client, fetchMock, settle, latest: () => results[results.length - 1] };
}

export function unmountQueryHooks() {
  for (const root of mountedRoots.splice(0)) act(() => root.unmount());
  vi.unstubAllGlobals();
}
