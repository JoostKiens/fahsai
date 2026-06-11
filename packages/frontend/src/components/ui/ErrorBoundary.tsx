import { ErrorBoundary as RollbarErrorBoundary } from '@rollbar/react';
import type { ReactNode } from 'react';

interface Props {
  name: string;
  fallback: ReactNode;
  children: ReactNode;
}

export function ErrorBoundary({ name, fallback, children }: Props) {
  return (
    <RollbarErrorBoundary extra={{ component: name }} fallbackUI={() => <>{fallback}</>}>
      {children}
    </RollbarErrorBoundary>
  );
}
