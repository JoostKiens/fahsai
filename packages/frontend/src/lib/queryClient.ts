import { QueryCache, QueryClient } from '@tanstack/react-query';
import { shouldRetry } from '@/lib/api';
import { handleQueryError } from '@/lib/queryErrors';

// One client for every island on the page: each island is its own React root, so they share this
// module-level instance (and its cache) instead of creating their own.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});
