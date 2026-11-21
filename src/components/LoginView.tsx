import React, { useState } from 'react';
import { AlertCircle, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from './SidebarLayout';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LoginViewProps {
  authProvider: 'firebase' | 'gis' | 'none';
  isAuthBusy: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onGoogleSignIn: () => Promise<void>;
  onContinueLocal: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  authProvider,
  isAuthBusy,
  theme,
  onToggleTheme,
  onGoogleSignIn,
  onContinueLocal,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const handleSignIn = async () => {
    setErrorMessage(null);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Google sign-in failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar with Brand & Theme Toggle */}
      <header className="w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
          My Trading Profit Tracker
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={isDark}
          data-testid="login-theme-toggle"
          className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600 min-h-[40px]"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Dark</span>
            </>
          )}
        </button>
      </header>

      {/* Main Centered Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <section
          aria-labelledby="login-heading"
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-6 sm:p-8"
        >
          <div>
            <h1
              id="login-heading"
              className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            >
              Sign in to your account
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Sign in with the same Google email on mobile and desktop to automatically store and
              sync your 50% trading profit share, dashboard, and history in real time—plus optional
              Google Sheets export.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-800 dark:text-red-200 flex items-start gap-2.5"
            >
              <AlertCircle
                className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {authProvider !== 'none' ? (
              <div className="flex flex-col">
                <GoogleSignInButton
                  onClick={handleSignIn}
                  loading={isAuthBusy}
                  label="Sign in with Google"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                Google OAuth is not configured in this environment yet. You can continue in local
                storage mode and review setup instructions in Settings.
              </div>
            )}

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-slate-900 px-3 text-slate-500 dark:text-slate-400">
                  or
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onContinueLocal}
              data-testid="continue-local-button"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Continue without Google (Local Mode)
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <p>Access tokens stay in memory only and are never saved to browser storage.</p>
            <p>Entered profits are recorded directly as your 50% share.</p>
          </div>
        </section>
      </main>
    </div>
  );
};
