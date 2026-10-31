import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VRM ErrorBoundary] Uncaught runtime error caught:', error, errorInfo);
    this.setState({ errorInfo });

    // Handle chunk loading failure (e.g. after a new production deployment)
    const isChunkFailure =
      error?.name === 'ChunkLoadError' ||
      /loading chunk|failed to fetch dynamically imported module|unexpected token '<'/i.test(error?.message || '');

    if (isChunkFailure) {
      const alreadyReloaded = window.sessionStorage.getItem('vrm_chunk_reload_attempted');
      if (!alreadyReloaded) {
        console.warn('[VRM ErrorBoundary] New deployment detected or chunk failed. Auto-reloading with latest assets...');
        window.sessionStorage.setItem('vrm_chunk_reload_attempted', 'true');
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    window.sessionStorage.removeItem('vrm_chunk_reload_attempted');
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    window.sessionStorage.removeItem('vrm_chunk_reload_attempted');
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const isChunkFailure =
        this.state.error?.name === 'ChunkLoadError' ||
        /loading chunk|failed to fetch dynamically imported module|unexpected token '<'/i.test(
          this.state.error?.message || ''
        );

      return (
        <div
          style={{
            minHeight: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
              padding: '36px 32px',
              maxWidth: '560px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <AlertTriangle size={28} />
            </div>

            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#1E293B',
                margin: '0 0 8px 0',
              }}
            >
              {isChunkFailure ? 'App Update Available' : (this.props.fallbackTitle || 'Module Temporarily Unavailable')}
            </h3>

            <p
              style={{
                fontSize: '0.88rem',
                color: '#64748B',
                margin: '0 0 20px 0',
                lineHeight: 1.5,
              }}
            >
              {isChunkFailure
                ? 'A new version of the application was deployed. Please refresh to load the latest features.'
                : 'An unexpected error occurred while rendering this module. You can reload the module or return to the dashboard.'}
            </p>

            {this.state.error && !isChunkFailure && (
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  color: '#94A3B8',
                  textAlign: 'left',
                  marginBottom: '20px',
                  maxHeight: '80px',
                  overflowY: 'auto',
                }}
              >
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: '#0E7490',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = '#0891B2')}
                onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = '#0E7490')}
              >
                <RotateCcw size={16} />
                {isChunkFailure ? 'Update & Refresh' : 'Reload Module'}
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#F1F5F9',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = '#E2E8F0')}
                onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = '#F1F5F9')}
              >
                <Home size={16} />
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
