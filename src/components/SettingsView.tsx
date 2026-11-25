import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Upload,
} from 'lucide-react';
import type { GoogleConnectionState, StorageMode } from '../types/trade';
import type { ThemeMode } from './SidebarLayout';
import {
  TOTAL_PROFIT_LOSS_FORMULA,
  TRADE_SHEET_HEADERS,
  TRADE_SHEET_NAME,
} from '../services/googleSheets';
import {
  DEFAULT_PERMANENT_SHEET_GID,
  DEFAULT_PERMANENT_SHEET_URL,
  DEFAULT_PERMANENT_SPREADSHEET_ID,
  fetchPermanentSheetStatus,
  type PermanentSheetStatus,
  type PermanentSheetSyncResult,
  type SyncPermanentOptions,
} from '../services/backendSheetSync';
import { formatINR } from '../utils/formatters';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SettingsViewProps {
  storageMode: StorageMode;
  googleState: GoogleConnectionState;
  entriesCount: number;
  localEntriesCount: number;
  totalProfitLoss: number;
  isSyncing: boolean;
  isAuthBusy: boolean;
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onOpenLogin: () => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onSyncPermanentSheet: (options?: SyncPermanentOptions) => Promise<PermanentSheetSyncResult>;
  onMigrateLocalToSheet: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  storageMode,
  googleState,
  entriesCount,
  localEntriesCount,
  totalProfitLoss,
  isSyncing,
  isAuthBusy,
  theme,
  onSetTheme,
  onOpenLogin,
  onGoogleSignIn,
  onGoogleSignOut,
  onSyncPermanentSheet,
  onMigrateLocalToSheet,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);

  const [permanentSheetStatus, setPermanentSheetStatus] = useState<PermanentSheetStatus>({
    configured: false,
    spreadsheetId: DEFAULT_PERMANENT_SPREADSHEET_ID,
    sheetGid: DEFAULT_PERMANENT_SHEET_GID,
    spreadsheetUrl: DEFAULT_PERMANENT_SHEET_URL,
    serviceAccountEmail: null,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [isPermanentSyncing, setIsPermanentSyncing] = useState(false);
  const [permanentSyncResult, setPermanentSyncResult] = useState<PermanentSheetSyncResult | null>(
    null
  );

  useEffect(() => {
    let active = true;
    fetchPermanentSheetStatus()
      .then((status) => {
        if (active) {
          setPermanentSheetStatus(status);
          setStatusLoaded(true);
        }
      })
      .catch(() => {
        if (active) setStatusLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const runAction = async (fn: () => Promise<void>, successText?: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setPermanentSyncResult(null);
    try {
      await fn();
      if (successText) setStatusMessage(successText);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handlePermanentSheetSync = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setPermanentSyncResult(null);
    setIsPermanentSyncing(true);
    try {
      const result = await onSyncPermanentSheet({
        serverConfigured: statusLoaded ? permanentSheetStatus.configured : undefined,
        spreadsheetId: permanentSheetStatus.spreadsheetId,
        sheetGid: permanentSheetStatus.sheetGid,
      });
      setPermanentSyncResult(result);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to sync entries to the permanent Google Sheet.'
      );
    } finally {
      setIsPermanentSyncing(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4 sm:space-y-6">
      {/* Appearance / Dark Mode Card */}
      <section className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Appearance
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-burgundy-muted">
              Switch between light and dark theme. Your preference is saved in this browser.
            </p>
          </div>
          <div
            role="group"
            aria-label="Theme mode selector"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-burgundy-input rounded-xl sm:rounded-lg w-full sm:w-auto shrink-0"
          >
            <button
              type="button"
              onClick={() => onSetTheme('light')}
              aria-pressed={theme === 'light'}
              data-testid="settings-theme-light"
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg sm:rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0 ${
                theme === 'light'
                  ? 'bg-emerald-600 sm:bg-white text-white sm:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-burgundy-muted hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => onSetTheme('dark')}
              aria-pressed={theme === 'dark'}
              data-testid="settings-theme-dark"
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg sm:rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0 ${
                theme === 'dark'
                  ? 'bg-accent-cyan text-burgundy-canvas shadow-xs'
                  : 'text-slate-600 dark:text-burgundy-muted hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </section>

      {/* Unified Account, Cloud Sync & Permanent Google Sheet Card */}
      <section
        data-testid="permanent-sheet-sync-section"
        className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-burgundy-border">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Account &amp; Google Sheet Sync
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-burgundy-muted">
              {googleState.isSignedIn
                ? 'Synced across mobile and desktop via your Google account. Append new trade entries directly to your permanent Google Sheet.'
                : 'Sign in with Google to sync across mobile and desktop and append new entries to your permanent Google Sheet.'}
            </p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-xs text-slate-500 dark:text-burgundy-muted">Current Storage</p>
            <p
              data-testid="settings-storage-status"
              className={`mt-0.5 text-sm font-semibold ${
                storageMode === 'sheets' || storageMode === 'cloud'
                  ? 'text-emerald-700 dark:text-accent-cyan'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {storageMode === 'sheets'
                ? 'Cloud Sync + Google Sheets'
                : storageMode === 'cloud'
                  ? 'Cloud Account Sync (Active)'
                  : 'Local Storage (Not Connected)'}
            </p>
          </div>
        </div>

        {/* Account Row (single Sign In / Sign Out control) */}
        {googleState.authProvider === 'none' ? (
          <div className="rounded-lg border border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated/80 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Google OAuth 2.0 setup required before connecting
            </p>
            <p className="text-sm text-slate-600 dark:text-burgundy-muted leading-relaxed">
              Once Google OAuth is configured (or{' '}
              <code className="font-mono text-xs bg-white dark:bg-burgundy-input border border-slate-200 dark:border-burgundy-border-strong px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
                VITE_GOOGLE_CLIENT_ID
              </code>{' '}
              is set), you can sign in and sync directly to Google Sheets.
            </p>
          </div>
        ) : googleState.isSignedIn ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated/80 px-4 py-3">
            <div className="text-sm">
              <p className="text-xs text-slate-500 dark:text-burgundy-muted">
                Signed in Google Account (Cross-Device Cloud Sync Active)
              </p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {googleState.userEmail || googleState.userName || 'Connected Google User'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => runAction(onGoogleSignOut, 'Signed out of your Google account.')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-burgundy-hover"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated/80 p-4">
            <GoogleSignInButton
              onClick={() =>
                runAction(
                  onGoogleSignIn,
                  'Signed in with Google. Your trade entries now sync automatically across mobile and desktop.'
                )
              }
              loading={isAuthBusy}
            />
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sm:rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover min-h-[44px] sm:min-h-0 whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>Login Page</span>
            </button>
          </div>
        )}

        {/* Local entries migration notice (only when local entries exist after sign-in) */}
        {googleState.isSignedIn && localEntriesCount > 0 && (
          <div className="rounded-lg border border-emerald-200 dark:border-accent-cyan/40 bg-emerald-50/50 dark:bg-burgundy-elevated px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-700 dark:text-slate-200">
              You have <strong className="font-mono">{localEntriesCount}</strong> locally saved{' '}
              {localEntriesCount === 1 ? 'entry' : 'entries'} on this device from before signing in.
            </p>
            <button
              type="button"
              onClick={() => setConfirmMigrateOpen(true)}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy Local Entries to Cloud</span>
            </button>
          </div>
        )}

        {/* Permanent Sheet Details + Live Column G Total */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated/80 p-4 text-xs">
          <div className="sm:col-span-1">
            <p className="text-slate-500 dark:text-burgundy-muted font-medium">Spreadsheet ID</p>
            <p
              data-testid="permanent-spreadsheet-id"
              className="mt-1 font-mono text-slate-900 dark:text-slate-100 break-all"
            >
              {permanentSheetStatus.spreadsheetId}
            </p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-burgundy-muted font-medium">Sheet GID</p>
            <p
              data-testid="permanent-sheet-gid"
              className="mt-1 font-mono text-slate-900 dark:text-slate-100"
            >
              {permanentSheetStatus.sheetGid}
            </p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-burgundy-muted font-medium">
              Column G · Total Profit&amp;Loss ({TOTAL_PROFIT_LOSS_FORMULA})
            </p>
            <p
              data-testid="settings-total-profit-loss"
              className={`mt-1 text-base font-bold font-mono tabular-nums whitespace-nowrap ${
                totalProfitLoss > 0
                  ? 'text-emerald-600 dark:text-[#00e000]'
                  : totalProfitLoss < 0
                    ? 'text-red-600 dark:text-[#ff4545]'
                    : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatINR(totalProfitLoss)}
            </p>
          </div>
        </div>

        {/* Unified Feedback Banners */}
        {permanentSyncResult && (
          <div
            role="status"
            data-testid="permanent-sheet-sync-result"
            className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2.5 ${
              permanentSyncResult.status === 'synced'
                ? 'border-emerald-200 dark:border-accent-cyan/40 bg-emerald-50 dark:bg-burgundy-elevated text-emerald-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated text-slate-800 dark:text-slate-200'
            }`}
          >
            <CheckCircle2
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                permanentSyncResult.status === 'synced'
                  ? 'text-emerald-600 dark:text-accent-cyan'
                  : 'text-slate-500 dark:text-burgundy-muted'
              }`}
              aria-hidden="true"
            />
            <span>{permanentSyncResult.message}</span>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 dark:border-accent-cyan/40 bg-emerald-50 dark:bg-burgundy-elevated px-4 py-3 text-sm text-emerald-900 dark:text-slate-100 flex items-start gap-2.5"
          >
            <CheckCircle2
              className="w-4 h-4 text-emerald-600 dark:text-accent-cyan mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            data-testid="permanent-sheet-sync-error"
            className="rounded-lg border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm text-red-800 dark:text-red-200 flex items-start gap-2.5"
          >
            <AlertCircle
              className="w-4 h-4 text-red-600 dark:text-[#ff4545] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Single Sheet Action Bar (one Open Sheet + one Sync button) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <p className="text-xs text-slate-600 dark:text-burgundy-muted">
            {googleState.isSignedIn ? (
              <>
                Ready to check <strong className="font-mono text-slate-900 dark:text-slate-100">{entriesCount}</strong>{' '}
                {entriesCount === 1 ? 'trade entry' : 'trade entries'}. Already-added entries are
                skipped automatically.
              </>
            ) : (
              'Sign in with Google above to sync your entries to the permanent Google Sheet.'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={permanentSheetStatus.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-xl sm:rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-xs font-semibold text-emerald-700 dark:text-accent-cyan hover:bg-slate-50 dark:hover:bg-burgundy-hover min-h-[44px] sm:min-h-0 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            <button
              type="button"
              data-testid="permanent-sheet-sync-btn"
              onClick={handlePermanentSheetSync}
              disabled={isPermanentSyncing || !googleState.isSignedIn}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl sm:rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-4 h-4 ${isPermanentSyncing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isPermanentSyncing ? 'Syncing to Sheet...' : 'Sync New Entries to Sheet'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Spreadsheet Schema Reference */}
      <section className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Spreadsheet Structure
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-burgundy-muted">
          Sheet tab name:{' '}
          <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input border border-transparent dark:border-burgundy-border px-2 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
            {TRADE_SHEET_NAME}
          </code>
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated/80 font-semibold text-slate-700 dark:text-slate-200">
                {TRADE_SHEET_HEADERS.map((col, idx) => (
                  <th key={col} className="py-2.5 px-2.5 whitespace-nowrap">
                    {String.fromCharCode(65 + idx)}: {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-burgundy-border/70 font-mono text-slate-600 dark:text-slate-200">
                <td className="py-2.5 px-2.5 whitespace-nowrap">TRD-9F2A1C04</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">2026-11-20</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">12500</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">100000 / blank</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">ISO time</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">ISO time</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap text-emerald-700 dark:text-[#00e000] font-semibold">
                  {TOTAL_PROFIT_LOSS_FORMULA} ({formatINR(totalProfitLoss)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Step-by-Step Google Cloud & Deployment Setup Guide (hidden once setup is complete) */}
      {!googleState.isSignedIn && !permanentSheetStatus.configured && (
        <section
          data-testid="google-cloud-setup-guide"
          className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Google Cloud &amp; OAuth 2.0 Setup Guide
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-burgundy-muted">
            If you deploy this app outside AI Studio or configure your own Google Cloud project,
            follow these exact steps. No client secret is ever placed in frontend code.
          </p>

          <ol className="mt-5 space-y-4 text-sm text-slate-700 dark:text-burgundy-muted list-decimal pl-5">
            <li>
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                Create a Google Cloud Project:
              </strong>{' '}
              Open Google Cloud Console, create or select a project (e.g.{' '}
              <em>My Trading Profit Tracker</em>).
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                Enable the Google Sheets API:
              </strong>{' '}
              Go to <em>APIs &amp; Services → Library</em>, search for{' '}
              <strong>Google Sheets API</strong>, and click <strong>Enable</strong>.
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                Configure OAuth Consent Screen:
              </strong>{' '}
              Go to <em>Google Auth Platform → Branding / Audience</em>, choose <em>External</em>{' '}
              (or Internal), add your email as a test user, and add the scope{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input px-1.5 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
                https://www.googleapis.com/auth/spreadsheets
              </code>
              .
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                Create an OAuth 2.0 Web Client ID:
              </strong>{' '}
              Under <em>Clients → Create Client → Web application</em>, add your origin URL (e.g.{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input px-1.5 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
                http://localhost:3000
              </code>{' '}
              and your production domain) to <strong>Authorized JavaScript origins</strong>. Copy
              the <strong>Client ID</strong> only (never expose any Client Secret).
            </li>
            <li>
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                Set Environment Variables &amp; Deploy:
              </strong>{' '}
              Add your Google Service Account credentials as{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input px-1.5 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
                GOOGLE_SERVICE_ACCOUNT_EMAIL
              </code>{' '}
              and{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input px-1.5 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
                GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
              </code>{' '}
              (or{' '}
              <code className="font-mono text-xs bg-slate-100 dark:bg-burgundy-input px-1.5 py-0.5 rounded text-slate-900 dark:text-accent-cyan">
                GOOGLE_SERVICE_ACCOUNT_JSON
              </code>
              ) in your server/Vercel Secrets, share your Google Sheet with that email as{' '}
              <strong>Editor</strong>, and click <strong>Sync New Entries to Sheet</strong> above.
            </li>
          </ol>
        </section>
      )}

      {/* Migration Confirmation Modal */}
      {confirmMigrateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="migrate-modal-title"
        >
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border-strong rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
            <h2
              id="migrate-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Copy Local Entries to Your Cloud Account?
            </h2>
            <p className="text-sm text-slate-600 dark:text-burgundy-muted">
              This will copy <strong className="font-mono text-slate-900 dark:text-slate-100">{localEntriesCount}</strong> locally
              saved {localEntriesCount === 1 ? 'entry' : 'entries'} into your synced Google account
              so they appear on both mobile and desktop. Duplicate IDs are skipped automatically.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmMigrateOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmMigrateOpen(false);
                  await runAction(
                    onMigrateLocalToSheet,
                    'Copied local entries into your synced Cloud Account.'
                  );
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover"
              >
                Confirm Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
