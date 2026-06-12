import { Component, type ReactNode } from 'react';
import { rollbar } from '../../lib/rollbar';

interface Props {
  name: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    rollbar?.error(error, { component: this.props.name });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
