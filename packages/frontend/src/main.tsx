import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { shouldRetry } from '@/lib/api';
import { handleQueryError } from '@/lib/queryErrors';
import './index.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Analytics />
    </QueryClientProvider>
  </StrictMode>,
);
