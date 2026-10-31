import './i18n';
import { StrictMode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { shouldRetry } from '@/lib/api';
import { handleQueryError } from '@/lib/queryErrors';

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});

// The whole app as one browser-only island (client:only in src/pages): i18n, stores and Rollbar
// read window/location at import, so this module must never load on the server.
export function AppIsland() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Analytics />
      </QueryClientProvider>
    </StrictMode>
  );
}
