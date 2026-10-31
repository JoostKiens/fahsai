import '@/i18n';
import { StrictMode, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/lib/queryClient';

interface Props {
  /** Names the island in error reports */
  name: string;
  /** Shown in the island's place if it throws; the other islands keep running */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * What every island on the page wraps itself in. Importing `@/i18n` here sets up the language the
 * first time any island loads; later imports reuse it.
 */
export function IslandRoot({ name, fallback, children }: Props) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary name={name} fallback={fallback}>
          {children}
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>
  );
}
