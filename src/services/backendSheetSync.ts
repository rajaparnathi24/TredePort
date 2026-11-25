import type { TradeRecord } from '../types/trade';
import { getFirebaseAuth } from './firebaseClient';
import { clearCachedAccessToken, getAccessToken, signInWithGoogle } from './googleAuth';
import { GoogleSheetsError, syncNewEntriesToSheetByGid } from './googleSheets';

export const DEFAULT_PERMANENT_SPREADSHEET_ID = '1SjefF9r_dWTfn27jT6RB5YerX1rmLkNzd3ZbP7PDzxA';
export const DEFAULT_PERMANENT_SHEET_GID = 257632183;
export const DEFAULT_PERMANENT_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_PERMANENT_SPREADSHEET_ID}/edit#gid=${DEFAULT_PERMANENT_SHEET_GID}`;

export interface PermanentSheetStatus {
  configured: boolean;
  spreadsheetId: string;
  sheetGid: number;
  spreadsheetUrl: string;
  serviceAccountEmail: string | null;
}

export interface PermanentSheetSyncResult {
  status: 'synced' | 'already_added' | 'no_entries';
  addedCount: number;
  skippedCount: number;
  sheetTitle: string | null;
  spreadsheetId: string;
  sheetGid: number;
  spreadsheetUrl: string;
  message: string;
}

export interface SyncPermanentOptions {
  serverConfigured?: boolean;
  spreadsheetId?: string;
  sheetGid?: number;
}

export async function fetchPermanentSheetStatus(): Promise<PermanentSheetStatus> {
  const response = await fetch('/api/sheets/status', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Could not check permanent Google Sheet status.');
  }

  return (await response.json()) as PermanentSheetStatus;
}

async function syncViaUserGoogleAccount(
  entries: TradeRecord[],
  spreadsheetId: string,
  sheetGid: number
): Promise<PermanentSheetSyncResult> {
  let token = getAccessToken();
  if (!token) {
    const signInResult = await signInWithGoogle();
    token = signInResult.accessToken;
  }

  if (!token) {
    throw new Error(
      'Google Sheets permission was not granted. Please sign in with Google and allow spreadsheet access.'
    );
  }

  try {
    return await syncNewEntriesToSheetByGid(token, spreadsheetId, sheetGid, entries);
  } catch (err) {
    if (err instanceof GoogleSheetsError && err.status === 401) {
      clearCachedAccessToken();
      throw new Error(
        'Your Google Sheets token expired. Click "Sync New Entries to Sheet" again to refresh access.'
      );
    }
    throw err;
  }
}

export async function syncNewEntriesToPermanentSheet(
  entries: TradeRecord[],
  options: SyncPermanentOptions = {}
): Promise<PermanentSheetSyncResult> {
  const spreadsheetId = options.spreadsheetId || DEFAULT_PERMANENT_SPREADSHEET_ID;
  const sheetGid =
    typeof options.sheetGid === 'number' ? options.sheetGid : DEFAULT_PERMANENT_SHEET_GID;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetGid}`;

  if (entries.length === 0) {
    return {
      status: 'no_entries',
      addedCount: 0,
      skippedCount: 0,
      sheetTitle: null,
      spreadsheetId,
      sheetGid,
      spreadsheetUrl,
      message: 'No trade entries to sync yet. Add a trade entry first.',
    };
  }

  // If the server service account secret is not yet configured, sync directly with
  // the signed-in user's Google Sheets OAuth token so syncing works immediately.
  if (options.serverConfigured === false) {
    return syncViaUserGoogleAccount(entries, spreadsheetId, sheetGid);
  }

  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error(
      'Please sign in with Google first to sync entries to your permanent Google Sheet.'
    );
  }

  const idToken = await currentUser.getIdToken();

  // Use X-Firebase-Auth instead of Authorization: Bearer so Cloud Run / IAP proxies
  // never intercept Firebase ID tokens with an upstream HTTP 403 error.
  const response = await fetch('/api/sheets/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth': idToken,
    },
    body: JSON.stringify({ entries }),
  });

  let payload: Record<string, unknown> = {};
  let parsedJson = false;
  try {
    payload = (await response.json()) as Record<string, unknown>;
    parsedJson = true;
  } catch {
    // Non-JSON response (e.g. upstream proxy or static host without /api route)
  }

  if (response.ok && parsedJson) {
    return payload as unknown as PermanentSheetSyncResult;
  }

  // If server secret isn't configured (503) or /api route isn't reachable (404 / proxy 403),
  // seamlessly fall back when the user already has a Google Sheets OAuth token in memory.
  const canFallbackToUserToken =
    response.status === 503 ||
    response.status === 404 ||
    (response.status === 403 && !parsedJson);

  if (canFallbackToUserToken && getAccessToken()) {
    return syncViaUserGoogleAccount(entries, spreadsheetId, sheetGid);
  }

  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    throw new Error(payload.error);
  }

  if (response.status === 403) {
    throw new Error(
      'Sync request was blocked (HTTP 403). Make sure the sheet is shared as Editor with your service account email, or reconnect Google Sheets below.'
    );
  }

  throw new Error(`Sync failed (HTTP ${response.status}). Please retry in a moment.`);
}
