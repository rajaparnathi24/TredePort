import React, { useState } from 'react';
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
import { extractSpreadsheetId, formatIndianDateTime, formatINR } from '../utils/formatters';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SettingsViewProps {
  storageMode: StorageMode;
  googleState: GoogleConnectionState;
  localEntriesCount: number;
  totalProfitLoss: number;
  isSyncing: boolean;
  isAuthBusy: boolean;
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onOpenLogin: () => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onCreateSpreadsheet: () => Promise<void>;
  onConnectSpreadsheet: (spreadsheetId: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onMigrateLocalToSheet: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  storageMode,
  googleState,
  localEntriesCount,
  totalProfitLoss,
  isSyncing,
  isAuthBusy,
  theme,
  onSetTheme,
  onOpenLogin,
  onGoogleSignIn,
  onGoogleSignOut,
  onCreateSpreadsheet,
  onConnectSpreadsheet,
  onSyncNow,
  onMigrateLocalToSheet,
}) => {
  const [sheetInput, setSheetInput] = useState(googleState.spreadsheetId || '');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);

  const runAction = async (fn: () => Promise<void>, successText?: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await fn();
      if (successText) setStatusMessage(successText);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    }
  };

  const handleConnectExisting = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsedId = extractSpreadsheetId(sheetInput);
    if (!parsedId) {
      setErrorMessage(
        'Please paste a valid Google Spreadsheet URL or Spreadsheet ID (at least 15 characters).'
      );
      return;
    }
    await runAction(
      () => onConnectSpreadsheet(parsedId),
      'Connected to Google Spreadsheet and verified the Trade Records tab.'
    );
  };

  return (
    <div className="max-w-4xl space-y-4 sm:space-y-6">
      {/* Appearance / Dark Mode Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Appearance
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Switch between light and dark theme. Your preference is saved in this browser.
            </p>
          </div>
          <div
            role="group"
            aria-label="Theme mode selector"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl sm:rounded-lg w-full sm:w-auto shrink-0"
          >
            <button
              type="button"
              onClick={() => onSetTheme('light')}
              aria-pressed={theme === 'light'}
              data-testid="settings-theme-light"
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg sm:rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0 ${
                theme === 'light'
                  ? 'bg-emerald-600 sm:bg-white text-white sm:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
                  ? 'bg-emerald-600 sm:bg-slate-950 text-white sm:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </section>

      {/* Connection Status Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Google Sheets Database
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {storageMode === 'sheets'
                ? 'Connected and syncing live records directly with your Google Sheet.'
                : 'Google Sheets is not connected yet. Entries are currently stored only in this browser.'}
            </p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Current Storage</p>
            <p
              data-testid="settings-storage-status"
              className={`mt-0.5 text-sm font-semibold ${
                storageMode === 'sheets'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {storageMode === 'sheets'
                ? 'Google Sheets (Connected)'
                : 'Local Storage (Not Connected)'}
            </p>
          </div>
        </div>

        {/* Live Total Profit&Loss Column Summary */}
        <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Column G · Total Profit&amp;Loss
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Automatically sums all profit &amp; loss entries using{' '}
              <code className="font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
                {TOTAL_PROFIT_LOSS_FORMULA}
              </code>{' '}
              in Google Sheets.
            </p>
          </div>
          <p
            data-testid="settings-total-profit-loss"
            className={`text-lg font-bold font-mono tabular-nums whitespace-nowrap ${
              totalProfitLoss > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : totalProfitLoss < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatINR(totalProfitLoss)}
          </p>
        </div>

        {statusMessage && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5"
          >
            <CheckCircle2
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{statusMessage}</span>
          </div>
        )}

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

        {/* Case 1: OAuth not yet configured in environment */}
        {googleState.authProvider === 'none' ? (
          <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Google OAuth 2.0 setup required before connecting
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              This app does not pretend Google Sheets is connected before OAuth is configured. Once
              Google Sheets OAuth is approved in AI Studio—or when{' '}
              <code className="font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
                VITE_GOOGLE_CLIENT_ID
              </code>{' '}
              is configured for your deployment—the Sign in with Google button will connect directly
              to the Google Sheets API.
            </p>
          </div>
        ) : !googleState.isSignedIn ? (
          /* Case 2: OAuth configured, user needs to sign in */
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Sign in with your Google account to create or connect your{' '}
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                {TRADE_SHEET_NAME}
              </strong>{' '}
              spreadsheet. Access tokens are held strictly in memory and are never saved in browser
              storage.
            </p>
            <GoogleSignInButton
              onClick={() =>
                runAction(
                  onGoogleSignIn,
                  'Signed in with Google. You can now create or connect a spreadsheet.'
                )
              }
              loading={isAuthBusy}
            />
          </div>
        ) : (
          /* Case 3: Signed in with Google */
          <div className="mt-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3">
              <div className="text-sm">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Signed in Google Account
                </p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {googleState.userEmail || googleState.userName || 'Connected Google User'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => runAction(onGoogleSignOut, 'Signed out of Google Sheets.')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Active Spreadsheet Details */}
            {googleState.spreadsheetId && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                      Active Spreadsheet
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {googleState.spreadsheetTitle || 'My Trading Profit Tracker'}
                    </p>
                    <p className="mt-0.5 text-xs font-mono text-slate-600 dark:text-slate-300 break-all">
                      ID: {googleState.spreadsheetId}
                    </p>
                    {googleState.lastSyncedAt && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Last synced: {formatIndianDateTime(googleState.lastSyncedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(onSyncNow, 'Refreshed trade records from Google Sheets.')
                      }
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                    {googleState.spreadsheetUrl && (
                      <a
                        href={googleState.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <span>Open Sheet</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>

                {localEntriesCount > 0 && (
                  <div className="pt-3 border-t border-emerald-200/80 dark:border-emerald-800/80 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      You have <strong className="font-mono">{localEntriesCount}</strong> locally
                      saved {localEntriesCount === 1 ? 'entry' : 'entries'} from before connecting
                      Sheets.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmMigrateOpen(true)}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy Local Entries to Sheet</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Create or Connect Spreadsheet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option A: Create New Spreadsheet
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Automatically creates a new spreadsheet with the{' '}
                  <strong>{TRADE_SHEET_NAME}</strong> sheet and all {TRADE_SHEET_HEADERS.length}{' '}
                  required column headers including <strong>Total Profit&amp;Loss</strong>.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      onCreateSpreadsheet,
                      'Created and initialized your new Google Spreadsheet.'
                    )
                  }
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                  <span>{isSyncing ? 'Creating...' : 'Create & Initialize Sheet'}</span>
                </button>
              </div>

              <form onSubmit={handleConnectExisting} className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Option B: Connect Existing Spreadsheet
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Paste an existing Google Sheets URL or ID. If the{' '}
                  <strong>{TRADE_SHEET_NAME}</strong> tab is missing, it will be initialized
                  automatically.
                </p>
                <div>
                  <label htmlFor="sheet-id-input" className="sr-only">
                    Google Spreadsheet URL or ID
                  </label>
                  <input
                    id="sheet-id-input"
                    type="text"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="Paste Spreadsheet URL or ID..."
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSyncing || !sheetInput.trim()}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  Connect & Verify Sheet
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* Spreadsheet Schema Reference */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Spreadsheet Structure
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Sheet tab name:{' '}
          <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-900 dark:text-slate-100">
            {TRADE_SHEET_NAME}
          </code>
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
                {TRADE_SHEET_HEADERS.map((col, idx) => (
                  <th key={col} className="py-2.5 px-2.5 whitespace-nowrap">
                    {String.fromCharCode(65 + idx)}: {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-slate-800 font-mono text-slate-600 dark:text-slate-300">
                <td className="py-2.5 px-2.5 whitespace-nowrap">TRD-9F2A1C04</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">2026-11-20</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">12500</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">100000 / blank</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">ISO time</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap">ISO time</td>
                <td className="py-2.5 px-2.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400 font-semibold">
                  {TOTAL_PROFIT_LOSS_FORMULA} ({formatINR(totalProfitLoss)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Step-by-Step Google Cloud & Deployment Setup Guide */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Google Cloud &amp; OAuth 2.0 Setup Guide
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          If you deploy this app outside AI Studio or configure your own Google Cloud project,
          follow these exact steps. No client secret is ever placed in frontend code.
        </p>

        <ol className="mt-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
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
            Go to <em>Google Auth Platform → Branding / Audience</em>, choose <em>External</em> (or
            Internal), add your email as a test user, and add the scope{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
              https://www.googleapis.com/auth/spreadsheets
            </code>
            .
          </li>
          <li>
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              Create an OAuth 2.0 Web Client ID:
            </strong>{' '}
            Under <em>Clients → Create Client → Web application</em>, add your origin URL (e.g.{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
              http://localhost:3000
            </code>{' '}
            and your production domain) to <strong>Authorized JavaScript origins</strong>. Copy the{' '}
            <strong>Client ID</strong> only (never expose any Client Secret).
          </li>
          <li>
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              Set Environment Variable &amp; Deploy:
            </strong>{' '}
            Add{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
              VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
            </code>{' '}
            to your{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
              .env
            </code>{' '}
            file or hosting provider, build with{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-900 dark:text-slate-100">
              npm run build
            </code>
            , sign in above, and click <strong>Create &amp; Initialize Sheet</strong>.
          </li>
        </ol>
      </section>

      {/* Account / Login Screen Access */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Account
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {googleState.isSignedIn
                ? `Signed in as ${googleState.userEmail || googleState.userName || 'Google User'}.`
                : 'Currently using Local Mode. Return to the login screen anytime to sign in with Google.'}
            </p>
          </div>
          {googleState.isSignedIn ? (
            <button
              type="button"
              onClick={() => runAction(onGoogleSignOut, 'Signed out of Google Sheets.')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sm:rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[44px] whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Logout</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl sm:rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 min-h-[44px] whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>Login Page</span>
            </button>
          )}
        </div>
      </section>

      {/* Migration Confirmation Modal */}
      {confirmMigrateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="migrate-modal-title"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
            <h2
              id="migrate-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Copy Local Entries to Google Sheets?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will append <strong className="font-mono">{localEntriesCount}</strong> locally
              saved {localEntriesCount === 1 ? 'entry' : 'entries'} to your connected{' '}
              <strong>{TRADE_SHEET_NAME}</strong> sheet. Entries whose ID already exists in the
              sheet will be skipped.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmMigrateOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmMigrateOpen(false);
                  await runAction(
                    onMigrateLocalToSheet,
                    'Copied local entries into your Google Sheet.'
                  );
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
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
