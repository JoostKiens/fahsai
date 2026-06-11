import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as RollbarProvider } from '@rollbar/react';
import App from './App';
import { rollbar } from './lib/rollbar';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const appTree = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

createRoot(rootEl).render(
  rollbar ? <RollbarProvider instance={rollbar}>{appTree}</RollbarProvider> : appTree,
);
