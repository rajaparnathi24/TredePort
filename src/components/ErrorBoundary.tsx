import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isQuotaError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

function parseErrorMessage(error: Error): { message: string; isQuotaError: boolean } {
  const raw = error.message || 'An unexpected application error occurred.';
  const lower = raw.toLowerCase();
  if (lower.includes('resource-exhausted') || lower.includes('quota')) {
    return {
      message:
        'Cloud database quota has been temporarily reached. Please try again shortly or continue with your cached view.',
      isQuotaError: true,
    };
  }
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('permission')) {
        return {
          message:
            'Cloud sync permission check failed. Please sign out and sign in again with your Google account.',
          isQuotaError: false,
        };
      }
      return { message: parsed.error, isQuotaError: false };
    }
  } catch {
    // Not a JSON-serialized Firestore error
  }
  return { message: raw, isQuotaError: false };
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isQuotaError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const parsed = parseErrorMessage(error);
    return {
      hasError: true,
      errorMessage: parsed.message,
      isQuotaError: parsed.isQuotaError,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 flex items-center justify-center shrink-0">
                <AlertTriangle
                  className="w-5 h-5 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {this.state.isQuotaError ? 'Cloud Sync Limit Reached' : 'Something went wrong'}
                </h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                  {this.state.errorMessage}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
