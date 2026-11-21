import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type {
  GoogleConnectionState,
  NavSection,
  StorageMode,
  TradeRecord,
  ValidatedTradePayload,
} from './types/trade';
import {
  clearCachedAccessToken,
  getAccessToken,
  getAuthProviderType,
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
} from './services/googleAuth';
import {
  appendTradeRecord,
  createTradeSpreadsheet,
  deleteTradeRecordFromSheet,
  fetchTradeRecords,
  GoogleSheetsError,
  updateTradeRecordInSheet,
  verifyAndInitializeSpreadsheet,
} from './services/googleSheets';
import {
  createTradeId,
  loadLocalRecords,
  loadSavedSpreadsheetMeta,
  saveLocalRecords,
  saveSpreadsheetMeta,
} from './services/localRepository';
import { calculateTotalProfitLoss } from './utils/calculations';
import { SidebarLayout, type ThemeMode } from './components/SidebarLayout';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { AddEntryView } from './components/AddEntryView';
import { AnalysisView } from './components/AnalysisView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';

const THEME_STORAGE_KEY = 'my_trading_profit_tracker_theme_v1';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage read errors
  }
  return 'light';
}

function hasAutostartParam(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  } catch {
    return false;
  }
}

export const App: React.FC = () => {
  const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(() => hasAutostartParam());
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [localEntries, setLocalEntries] = useState<TradeRecord[]>(() => loadLocalRecords());
  const [sheetEntries, setSheetEntries] = useState<TradeRecord[]>([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [googleState, setGoogleState] = useState<GoogleConnectionState>(() => {
    const savedMeta = loadSavedSpreadsheetMeta();
    return {
      authProvider: getAuthProviderType(),
      isSignedIn: false,
      userEmail: null,
      userName: null,
      spreadsheetId: savedMeta?.spreadsheetId ?? null,
      spreadsheetTitle: savedMeta?.spreadsheetTitle ?? null,
      spreadsheetUrl: savedMeta?.spreadsheetUrl ?? null,
      lastSyncedAt: null,
    };
  });

  const storageMode: StorageMode =
    googleState.isSignedIn && Boolean(googleState.spreadsheetId) ? 'sheets' : 'local';

  const entries = storageMode === 'sheets' ? sheetEntries : localEntries;

  const handleSheetsError = useCallback((err: unknown): never => {
    if (err instanceof GoogleSheetsError && err.status === 401) {
      clearCachedAccessToken();
      setGoogleState((prev) => ({
        ...prev,
        isSignedIn: false,
      }));
    }
    throw err;
  }, []);

  const syncFromGoogleSheet = useCallback(
    async (spreadsheetId: string, explicitToken?: string) => {
      const token = explicitToken || getAccessToken();
      if (!token) {
        throw new Error('Your Google session is not active. Please sign in again in Settings.');
      }
      setIsLoadingSheet(true);
      setGlobalError(null);
      try {
        const info = await verifyAndInitializeSpreadsheet(token, spreadsheetId);
        const records = await fetchTradeRecords(token, info.spreadsheetId);
        setSheetEntries(records);
        saveSpreadsheetMeta({
          spreadsheetId: info.spreadsheetId,
          spreadsheetTitle: info.title,
          spreadsheetUrl: info.spreadsheetUrl,
        });
        setGoogleState((prev) => ({
          ...prev,
          spreadsheetId: info.spreadsheetId,
          spreadsheetTitle: info.title,
          spreadsheetUrl: info.spreadsheetUrl,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sync with Google Sheets.';
        setGlobalError(message);
        handleSheetsError(err);
      } finally {
        setIsLoadingSheet(false);
      }
    },
    [handleSheetsError]
  );

  // Initialize auth listener on mount
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleState((prev) => ({
          ...prev,
          isSignedIn: true,
          userEmail: user.email,
          userName: user.displayName,
        }));
        setHasEnteredApp(true);
        const savedMeta = loadSavedSpreadsheetMeta();
        if (savedMeta?.spreadsheetId) {
          syncFromGoogleSheet(savedMeta.spreadsheetId, token).catch(() => {
            // Handled via globalError state
          });
        }
      },
      () => {
        setGoogleState((prev) => ({
          ...prev,
          isSignedIn: false,
          userEmail: null,
          userName: null,
        }));
      }
    );
    return unsubscribe;
  }, [syncFromGoogleSheet]);

  const handleGoogleSignIn = async () => {
    setIsAuthBusy(true);
    setGlobalError(null);
    try {
      const result = await signInWithGoogle();
      setGoogleState((prev) => ({
        ...prev,
        isSignedIn: true,
        userEmail: result.user.email,
        userName: result.user.displayName,
      }));
      setHasEnteredApp(true);
      const savedMeta = loadSavedSpreadsheetMeta();
      if (savedMeta?.spreadsheetId) {
        await syncFromGoogleSheet(savedMeta.spreadsheetId, result.accessToken);
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setGlobalError(null);
    await signOutGoogle();
    setSheetEntries([]);
    setGoogleState((prev) => ({
      ...prev,
      isSignedIn: false,
      userEmail: null,
      userName: null,
      lastSyncedAt: null,
    }));
    setHasEnteredApp(false);
  };

  const handleCreateSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token) {
      throw new Error('Please sign in with Google before creating a spreadsheet.');
    }
    setIsLoadingSheet(true);
    setGlobalError(null);
    try {
      const created = await createTradeSpreadsheet(token, 'My Trading Profit Tracker');
      saveSpreadsheetMeta({
        spreadsheetId: created.spreadsheetId,
        spreadsheetTitle: created.title,
        spreadsheetUrl: created.spreadsheetUrl,
      });
      setSheetEntries([]);
      setGoogleState((prev) => ({
        ...prev,
        spreadsheetId: created.spreadsheetId,
        spreadsheetTitle: created.title,
        spreadsheetUrl: created.spreadsheetUrl,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (err) {
      handleSheetsError(err);
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleConnectSpreadsheet = async (spreadsheetId: string) => {
    await syncFromGoogleSheet(spreadsheetId);
  };

  const handleSyncNow = async () => {
    if (!googleState.spreadsheetId) return;
    await syncFromGoogleSheet(googleState.spreadsheetId);
  };

  const handleMigrateLocalToSheet = async () => {
    const token = getAccessToken();
    if (!token || !googleState.spreadsheetId) {
      throw new Error('Connect a Google Spreadsheet before copying local entries.');
    }
    setIsLoadingSheet(true);
    try {
      const existingIds = new Set(sheetEntries.map((r) => r.id));
      for (const localRecord of localEntries) {
        if (!existingIds.has(localRecord.id)) {
          await appendTradeRecord(token, googleState.spreadsheetId, localRecord);
        }
      }
      const updated = await fetchTradeRecords(token, googleState.spreadsheetId);
      setSheetEntries(updated);
      setLocalEntries([]);
      saveLocalRecords([]);
      setGoogleState((prev) => ({
        ...prev,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (err) {
      handleSheetsError(err);
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const handleSaveEntry = async (payload: ValidatedTradePayload) => {
    const now = new Date().toISOString();
    const newRecord: TradeRecord = {
      id: createTradeId(),
      tradeDate: payload.tradeDate,
      myProfit: payload.myProfit,
      capitalUsed: payload.capitalUsed,
      createdAt: now,
      updatedAt: now,
    };

    if (storageMode === 'sheets' && googleState.spreadsheetId) {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Your Google session expired. Sign in again under Settings.');
      }
      try {
        await appendTradeRecord(token, googleState.spreadsheetId, newRecord);
        const refreshed = await fetchTradeRecords(token, googleState.spreadsheetId);
        setSheetEntries(refreshed);
        setGoogleState((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err) {
        handleSheetsError(err);
      }
      return;
    }

    const updated = [newRecord, ...localEntries];
    setLocalEntries(updated);
    saveLocalRecords(updated);
  };

  const handleUpdateEntry = async (id: string, payload: ValidatedTradePayload) => {
    const existing = entries.find((item) => item.id === id);
    if (!existing) {
      throw new Error('Selected trade entry no longer exists.');
    }

    const updatedRecord: TradeRecord = {
      ...existing,
      tradeDate: payload.tradeDate,
      myProfit: payload.myProfit,
      capitalUsed: payload.capitalUsed,
      updatedAt: new Date().toISOString(),
    };

    if (storageMode === 'sheets' && googleState.spreadsheetId) {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Your Google session expired. Sign in again under Settings.');
      }
      try {
        await updateTradeRecordInSheet(token, googleState.spreadsheetId, updatedRecord);
        const refreshed = await fetchTradeRecords(token, googleState.spreadsheetId);
        setSheetEntries(refreshed);
        setGoogleState((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err) {
        handleSheetsError(err);
      }
      return;
    }

    const updatedList = localEntries.map((item) => (item.id === id ? updatedRecord : item));
    setLocalEntries(updatedList);
    saveLocalRecords(updatedList);
  };

  const handleDeleteEntry = async (id: string) => {
    if (storageMode === 'sheets' && googleState.spreadsheetId) {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Your Google session expired. Sign in again under Settings.');
      }
      try {
        await deleteTradeRecordFromSheet(token, googleState.spreadsheetId, id);
        const refreshed = await fetchTradeRecords(token, googleState.spreadsheetId);
        setSheetEntries(refreshed);
        setGoogleState((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      } catch (err) {
        handleSheetsError(err);
      }
      return;
    }

    const updatedList = localEntries.filter((item) => item.id !== id);
    setLocalEntries(updatedList);
    saveLocalRecords(updatedList);
  };

  const totalProfitLoss = calculateTotalProfitLoss(entries);

  if (!hasEnteredApp && !googleState.isSignedIn) {
    return (
      <LoginView
        authProvider={googleState.authProvider}
        isAuthBusy={isAuthBusy}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onGoogleSignIn={handleGoogleSignIn}
        onContinueLocal={() => setHasEnteredApp(true)}
      />
    );
  }

  return (
    <SidebarLayout
      activeSection={activeSection}
      onNavigate={setActiveSection}
      storageMode={storageMode}
      spreadsheetTitle={googleState.spreadsheetTitle}
      isSignedIn={googleState.isSignedIn}
      userEmail={googleState.userEmail}
      isSyncing={isLoadingSheet}
      onRefreshSheets={() => {
        handleSyncNow().catch(() => {
          // Handled via globalError
        });
      }}
      onOpenLogin={() => setHasEnteredApp(false)}
      onSignOut={() => {
        handleGoogleSignOut().catch(() => {
          // Handled gracefully
        });
      }}
      theme={theme}
      onToggleTheme={handleToggleTheme}
    >
      {globalError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/50 px-4 py-3.5 text-sm text-red-800 dark:text-red-200 flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle
              className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{globalError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGlobalError(null)}
            className="text-xs font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeSection === 'dashboard' && (
        <DashboardView
          entries={entries}
          isLoading={isLoadingSheet && entries.length === 0}
          storageMode={storageMode}
          theme={theme}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'add' && (
        <AddEntryView
          onSaveEntry={handleSaveEntry}
          storageMode={storageMode}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'analysis' && (
        <AnalysisView
          entries={entries}
          isLoading={isLoadingSheet && entries.length === 0}
          theme={theme}
        />
      )}

      {activeSection === 'history' && (
        <HistoryView
          entries={entries}
          isLoading={isLoadingSheet && entries.length === 0}
          storageMode={storageMode}
          onUpdateEntry={handleUpdateEntry}
          onDeleteEntry={handleDeleteEntry}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'settings' && (
        <SettingsView
          storageMode={storageMode}
          googleState={googleState}
          localEntriesCount={localEntries.length}
          totalProfitLoss={totalProfitLoss}
          isSyncing={isLoadingSheet}
          isAuthBusy={isAuthBusy}
          theme={theme}
          onSetTheme={setTheme}
          onOpenLogin={() => setHasEnteredApp(false)}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onCreateSpreadsheet={handleCreateSpreadsheet}
          onConnectSpreadsheet={handleConnectSpreadsheet}
          onSyncNow={handleSyncNow}
          onMigrateLocalToSheet={handleMigrateLocalToSheet}
        />
      )}
    </SidebarLayout>
  );
};

export default App;
