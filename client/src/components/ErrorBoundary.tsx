import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected interface error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CAPITALLOOP UI ErrorBoundary caught error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetHome = () => {
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="home-screen" role="alert">
          <div className="panel-card home-card" style={{ maxWidth: 440, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>CAPITALLOOP Recovered From an Error</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
              {this.state.errorMessage}
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              Your active multiplayer match stays safe on the server. Reload to reconnect automatically.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={this.handleReload}>
                Reload &amp; Reconnect
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={this.handleResetHome}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
