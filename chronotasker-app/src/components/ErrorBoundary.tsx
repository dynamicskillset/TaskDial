import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: 'var(--color-text)' }}>
          <h1 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            TaskDial hit an unexpected error. Your tasks are safe in local storage.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text)',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
