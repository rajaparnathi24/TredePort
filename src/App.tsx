import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  clearEnsuredProfiles,
  createCloudTrade,
  deleteCloudTrade,
  saveUserSpreadsheetMeta,
  subscribeUserProfile,
  subscribeUserTrades,
  syncRecordsToCloud,
  updateCloudTrade,
} from './services/firestoreService';
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

function formatCloudError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('resource-exhausted') || lower.includes('quota')) {
    return 'Cloud database quota was temporarily reached. Please retry in a few moments.';
  }
  if (lower.includes('client is offline')) {
    return 'Unable to reach Cloud Sync right now. Please check your internet connection—your data will sync automatically once reconnected.';
  }
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      const parsedLower = parsed.error.toLowerCase();
      if (parsedLower.includes('client is offline')) {
        return 'Unable to reach Cloud Sync right now. Please check your internet connection—your data will sync automatically once reconnected.';
      }
      if (parsedLower.includes('permission')) {
        return 'Cloud sync permission check failed. Please sign out and sign in again with your Google account.';
      }
      return parsed.error;
    }
  } catch {
    // Not a JSON-serialized Firestore error
  }
  return raw || 'Unable to sync with your cloud account.';
}

export const App: React.FC = () => {
  const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(() => hasAutostartParam());
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [localEntries, setLocalEntries] = useState<TradeRecord[]>(() => loadLocalRecords());
  const [cloudEntries, setCloudEntries] = useState<TradeRecord[]>([]);
  const [sheetEntries, setSheetEntries] = useState<TradeRecord[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const cloudEntriesRef = useRef<TradeRecord[]>([]);
  useEffect(() => {
    cloudEntriesRef.current = cloudEntries;
  }, [cloudEntries]);

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
      uid: null,
      hasSheetsToken: false,
      userEmail: null,
      userName: null,
      spreadsheetId: savedMeta?.spreadsheetId ?? null,
      spreadsheetTitle: savedMeta?.spreadsheetTitle ?? null,
      spreadsheetUrl: savedMeta?.spreadsheetUrl ?? null,
      lastSyncedAt: null,
    };
  });

  const isCloudAccount = Boolean(googleState.isSignedIn && googleState.uid);

  const storageMode: StorageMode =
    googleState.isSignedIn && googleState.hasSheetsToken && Boolean(googleState.spreadsheetId)
      ? 'sheets'
      : isCloudAccount
        ? 'cloud'
        : 'local';

  const entries = isCloudAccount
    ? cloudEntries
    : storageMode === 'sheets'
      ? sheetEntries
      : localEntries;

  const isLoadingData = (isLoadingCloud || isLoadingSheet) && entries.length === 0;

  const handleSheetsError = useCallback((err: unknown): never => {
    if (err instanceof GoogleSheetsError && err.status === 401) {
      clearCachedAccessToken();
      setGoogleState((prev) => ({
        ...prev,
        hasSheetsToken: false,
      }));
    }
    throw err;
  }, []);

  const syncFromGoogleSheet = useCallback(
    async (spreadsheetId: string, explicitToken?: string, explicitUid?: string | null) => {
      const token = explicitToken || getAccessToken();
      if (!token) {
        throw new Error(
          'Your Google Sheets session token needs to be refreshed. Click "Reconnect Google Sheets" in Settings.'
        );
      }
      setIsLoadingSheet(true);
      setGlobalError(null);
      try {
        const info = await verifyAndInitializeSpreadsheet(token, spreadsheetId);
        const records = await fetchTradeRecords(token, info.spreadsheetId);
        setSheetEntries(records);

        const meta = {
          spreadsheetId: info.spreadsheetId,
          spreadsheetTitle: info.title,
          spreadsheetUrl: info.spreadsheetUrl,
        };
        saveSpreadsheetMeta(meta);

        const activeUid = explicitUid ?? googleState.uid;
        if (activeUid) {
          await saveUserSpreadsheetMeta(activeUid, meta);
          const existingIds = new Set(cloudEntriesRef.current.map((r) => r.id));
          await syncRecordsToCloud(activeUid, records, existingIds);
        }

        setGoogleState((prev) => ({
          ...prev,
          hasSheetsToken: true,
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
    [googleState.uid, handleSheetsError]
  );

  // Initialize Firebase Auth / GIS auth listener on mount
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleState((prev) => ({
          ...prev,
          isSignedIn: true,
          uid: user.uid,
          hasSheetsToken: Boolean(token),
          userEmail: user.email,
          userName: user.displayName,
        }));
        setHasEnteredApp(true);
      },
      () => {
        setCloudEntries([]);
        setSheetEntries([]);
        setIsLoadingCloud(false);
        setGoogleState((prev) => ({
          ...prev,
          isSignedIn: false,
          uid: null,
          hasSheetsToken: false,
          userEmail: null,
          userName: null,
        }));
      }
    );
    return unsubscribe;
  }, []);

  // Real-time Cloud Firestore subscription whenever signed into a Firebase Google account
  useEffect(() => {
    const uid = googleState.uid;
    if (!googleState.isSignedIn || !uid) {
      return;
    }

    let cancelled = false;
    setIsLoadingCloud(true);
    setGlobalError(null);

    const unsubProfile = subscribeUserProfile(
      uid,
      (meta) => {
        if (cancelled) return;
        if (meta && meta.spreadsheetId) {
          saveSpreadsheetMeta(meta);
          setGoogleState((prev) => ({
            ...prev,
            spreadsheetId: meta.spreadsheetId,
            spreadsheetTitle: meta.spreadsheetTitle || prev.spreadsheetTitle,
            spreadsheetUrl: meta.spreadsheetUrl || prev.spreadsheetUrl,
          }));
        }
      },
      (err) => {
        if (!cancelled) {
          setGlobalError(formatCloudError(err));
        }
      }
    );

    const unsubTrades = subscribeUserTrades(
      uid,
      (records) => {
        if (cancelled) return;
        setCloudEntries(records);
        setIsLoadingCloud(false);
        setGlobalError(null);
        setGoogleState((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
      },
      (err) => {
        if (!cancelled) {
          setIsLoadingCloud(false);
          setGlobalError(formatCloudError(err));
        }
      }
    );

    return () => {
      cancelled = true;
      unsubProfile();
      unsubTrades();
    };
  }, [googleState.isSignedIn, googleState.uid]);

  const handleGoogleSignIn = async () => {
    setIsAuthBusy(true);
    setGlobalError(null);
    try {
      const result = await signInWithGoogle();
      setGoogleState((prev) => ({
        ...prev,
        isSignedIn: true,
        uid: result.user.uid,
        hasSheetsToken: Boolean(result.accessToken),
        userEmail: result.user.email,
        userName: result.user.displayName,
      }));
      setHasEnteredApp(true);

      const savedMeta = loadSavedSpreadsheetMeta();
      const targetSheetId = googleState.spreadsheetId || savedMeta?.spreadsheetId;
      if (targetSheetId && result.accessToken) {
        syncFromGoogleSheet(targetSheetId, result.accessToken, result.user.uid).catch(() => {
          // Non-fatal: Firestore cloud sync still loads immediately
        });
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setGlobalError(null);
    clearEnsuredProfiles();
    await signOutGoogle();
    setCloudEntries([]);
    setSheetEntries([]);
    setGoogleState((prev) => ({
      ...prev,
      isSignedIn: false,
      uid: null,
      hasSheetsToken: false,
      userEmail: null,
      userName: null,
      lastSyncedAt: null,
    }));
    setHasEnteredApp(false);
  };

  const handleCreateSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token) {
      throw new Error(
        'Please click "Reconnect Google Sheets" first so this session has permission to create a spreadsheet.'
      );
    }
    setIsLoadingSheet(true);
    setGlobalError(null);
    try {
      const created = await createTradeSpreadsheet(token, 'My Trading Profit Tracker');
      const meta = {
        spreadsheetId: created.spreadsheetId,
        spreadsheetTitle: created.title,
        spreadsheetUrl: created.spreadsheetUrl,
      };
      saveSpreadsheetMeta(meta);
      if (googleState.uid) {
        await saveUserSpreadsheetMeta(googleState.uid, meta);
        // Copy any existing cloud entries into the newly created Google Sheet
        for (const existingRecord of cloudEntriesRef.current) {
          await appendTradeRecord(token, created.spreadsheetId, existingRecord);
        }
      }
      setSheetEntries(cloudEntriesRef.current);
      setGoogleState((prev) => ({
        ...prev,
        hasSheetsToken: true,
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

  const handleMigrateLocalToCloud = async () => {
    if (!googleState.isSignedIn) {
      throw new Error('Sign in with Google before copying local entries.');
    }
    setIsLoadingSheet(true);
    setGlobalError(null);
    try {
      const token = getAccessToken();
      const canMirrorSheet = Boolean(token && googleState.spreadsheetId);

      if (googleState.uid) {
        const existingCloudIds = new Set(cloudEntriesRef.current.map((r) => r.id));
        for (const localRecord of localEntries) {
          if (!existingCloudIds.has(localRecord.id)) {
            await createCloudTrade(googleState.uid, localRecord);
            if (canMirrorSheet && token && googleState.spreadsheetId) {
              await appendTradeRecord(token, googleState.spreadsheetId, localRecord);
            }
          }
        }
      } else if (canMirrorSheet && token && googleState.spreadsheetId) {
        const existingIds = new Set(sheetEntries.map((r) => r.id));
        for (const localRecord of localEntries) {
          if (!existingIds.has(localRecord.id)) {
            await appendTradeRecord(token, googleState.spreadsheetId, localRecord);
          }
        }
        const updated = await fetchTradeRecords(token, googleState.spreadsheetId);
        setSheetEntries(updated);
      } else {
        throw new Error('Connect a cloud account or Google Spreadsheet before copying local entries.');
      }

      setLocalEntries([]);
      saveLocalRecords([]);
      setGoogleState((prev) => ({
        ...prev,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (err) {
      if (err instanceof GoogleSheetsError) {
        handleSheetsError(err);
      }
      throw new Error(formatCloudError(err));
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

    if (googleState.isSignedIn && googleState.uid) {
      try {
        await createCloudTrade(googleState.uid, newRecord);
      } catch (err) {
        throw new Error(formatCloudError(err));
      }

      // Mirror to Google Sheets if linked & active in-memory token exists
      const token = getAccessToken();
      if (token && googleState.spreadsheetId) {
        try {
          await appendTradeRecord(token, googleState.spreadsheetId, newRecord);
        } catch (err) {
          if (err instanceof GoogleSheetsError && err.status === 401) {
            clearCachedAccessToken();
            setGoogleState((prev) => ({ ...prev, hasSheetsToken: false }));
          }
          setGlobalError(
            'Entry saved to your Cloud Account across devices, but Google Sheets mirror needs reconnection in Settings.'
          );
        }
      }
      return;
    }

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

    if (googleState.isSignedIn && googleState.uid) {
      try {
        await updateCloudTrade(googleState.uid, updatedRecord);
      } catch (err) {
        throw new Error(formatCloudError(err));
      }

      const token = getAccessToken();
      if (token && googleState.spreadsheetId) {
        try {
          await updateTradeRecordInSheet(token, googleState.spreadsheetId, updatedRecord);
        } catch (err) {
          if (err instanceof GoogleSheetsError && err.status === 401) {
            clearCachedAccessToken();
            setGoogleState((prev) => ({ ...prev, hasSheetsToken: false }));
          }
          setGlobalError(
            'Entry updated in your Cloud Account across devices, but Google Sheets mirror needs reconnection in Settings.'
          );
        }
      }
      return;
    }

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
    if (googleState.isSignedIn && googleState.uid) {
      try {
        await deleteCloudTrade(googleState.uid, id);
      } catch (err) {
        throw new Error(formatCloudError(err));
      }

      const token = getAccessToken();
      if (token && googleState.spreadsheetId) {
        try {
          await deleteTradeRecordFromSheet(token, googleState.spreadsheetId, id);
        } catch (err) {
          if (err instanceof GoogleSheetsError && err.status === 401) {
            clearCachedAccessToken();
            setGoogleState((prev) => ({ ...prev, hasSheetsToken: false }));
          }
          setGlobalError(
            'Entry deleted from your Cloud Account across devices, but Google Sheets mirror needs reconnection in Settings.'
          );
        }
      }
      return;
    }

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
      isSyncing={isLoadingSheet || isLoadingCloud}
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
          isLoading={isLoadingData}
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
          isLoading={isLoadingData}
          theme={theme}
        />
      )}

      {activeSection === 'history' && (
        <HistoryView
          entries={entries}
          isLoading={isLoadingData}
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
          isSyncing={isLoadingSheet || isLoadingCloud}
          isAuthBusy={isAuthBusy}
          theme={theme}
          onSetTheme={setTheme}
          onOpenLogin={() => setHasEnteredApp(false)}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onCreateSpreadsheet={handleCreateSpreadsheet}
          onConnectSpreadsheet={handleConnectSpreadsheet}
          onSyncNow={handleSyncNow}
          onMigrateLocalToSheet={handleMigrateLocalToCloud}
        />
      )}
    </SidebarLayout>
  );
};

export default App;
