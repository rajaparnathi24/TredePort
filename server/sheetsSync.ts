import crypto from 'node:crypto';

export const DEFAULT_PERMANENT_SPREADSHEET_ID = '1SjefF9r_dWTfn27jT6RB5YerX1rmLkNzd3ZbP7PDzxA';
export const DEFAULT_PERMANENT_SHEET_GID = 257632183;

export const SHEET_HEADERS = [
  'ID',
  'Trade Date',
  'My Profit',
  'Capital Used',
  'Created At',
  'Updated At',
  'Total Profit&Loss',
] as const;

export const TOTAL_PROFIT_LOSS_FORMULA = '=SUM(C2:C)';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const MAX_SYNC_BATCH = 500;
const MAX_ABS_PROFIT = 1_000_000_000;
const MAX_CAPITAL = 10_000_000_000;
const ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9_-]{15,120}$/;

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

export interface PermanentSheetConfig {
  spreadsheetId: string;
  sheetGid: number;
  spreadsheetUrl: string;
  credentials: ServiceAccountCredentials | null;
}

export interface ValidatedSyncTrade {
  id: string;
  tradeDate: string;
  myProfit: number;
  capitalUsed: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncOutcome {
  status: 'synced' | 'already_added' | 'no_entries';
  addedCount: number;
  skippedCount: number;
  sheetTitle: string | null;
  spreadsheetId: string;
  sheetGid: number;
  spreadsheetUrl: string;
  message: string;
}

export class SheetSyncError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'SheetSyncError';
    this.status = status;
  }
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizePrivateKey(rawKey: string): string {
  return stripOuterQuotes(rawKey).replace(/\\n/g, '\n').trim();
}

function parseJsonOrBase64Json(rawValue: string): Record<string, unknown> {
  const cleaned = stripOuterQuotes(rawValue);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Support Base64-encoded service account JSON (common in Vercel env vars)
    try {
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        return JSON.parse(decoded) as Record<string, unknown>;
      }
    } catch {
      // Fall through to error
    }
    throw new SheetSyncError(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Please check your server secret.',
      503
    );
  }
}

export function parseServiceAccountFromEnv(
  env: Record<string, string | undefined>
): ServiceAccountCredentials | null {
  const rawJson = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = parseJsonOrBase64Json(rawJson);

    const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
    const privateKey =
      typeof parsed.private_key === 'string' ? normalizePrivateKey(parsed.private_key) : '';
    const tokenUri =
      typeof parsed.token_uri === 'string' && parsed.token_uri.startsWith('https://')
        ? parsed.token_uri.trim()
        : GOOGLE_TOKEN_URI;

    if (!clientEmail || !privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new SheetSyncError(
        'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.',
        503
      );
    }

    return { clientEmail, privateKey, tokenUri };
  }

  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    ? stripOuterQuotes(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    : '';
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    ? normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    : '';

  if (clientEmail && privateKey) {
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new SheetSyncError(
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be a PEM-formatted private key.',
        503
      );
    }
    return {
      clientEmail,
      privateKey,
      tokenUri: GOOGLE_TOKEN_URI,
    };
  }

  return null;
}

export function getPermanentSheetConfig(
  env: Record<string, string | undefined> = process.env
): PermanentSheetConfig {
  const rawId = env.GOOGLE_SPREADSHEET_ID?.trim() || DEFAULT_PERMANENT_SPREADSHEET_ID;
  const spreadsheetId = SPREADSHEET_ID_REGEX.test(rawId)
    ? rawId
    : DEFAULT_PERMANENT_SPREADSHEET_ID;

  const rawGid = env.GOOGLE_SHEET_GID?.trim();
  const parsedGid =
    rawGid && /^\d+$/.test(rawGid) ? Number(rawGid) : DEFAULT_PERMANENT_SHEET_GID;
  const sheetGid = Number.isSafeInteger(parsedGid) ? parsedGid : DEFAULT_PERMANENT_SHEET_GID;

  let credentials: ServiceAccountCredentials | null = null;
  try {
    credentials = parseServiceAccountFromEnv(env);
  } catch {
    credentials = null;
  }

  return {
    spreadsheetId,
    sheetGid,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetGid}`,
    credentials,
  };
}

function isValidCalendarDate(dateStr: string): boolean {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function sanitizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return fallback;
  if (/^[=+\-@]/.test(trimmed)) return fallback;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return fallback;
  return new Date(ms).toISOString();
}

export function validateSyncEntries(rawEntries: unknown): ValidatedSyncTrade[] {
  if (!Array.isArray(rawEntries)) {
    throw new SheetSyncError('Sync payload must include an entries array.', 400);
  }
  if (rawEntries.length > MAX_SYNC_BATCH) {
    throw new SheetSyncError(`Cannot sync more than ${MAX_SYNC_BATCH} entries per request.`, 400);
  }

  const nowIso = new Date().toISOString();
  const validated: ValidatedSyncTrade[] = [];

  for (let i = 0; i < rawEntries.length; i += 1) {
    const item = rawEntries[i];
    if (!item || typeof item !== 'object') {
      throw new SheetSyncError(`Entry at index ${i} is invalid.`, 400);
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!ID_REGEX.test(id)) {
      throw new SheetSyncError(`Entry at index ${i} has an invalid ID.`, 400);
    }

    const tradeDate = typeof record.tradeDate === 'string' ? record.tradeDate.trim() : '';
    if (!isValidCalendarDate(tradeDate)) {
      throw new SheetSyncError(`Entry ${id} has an invalid trade date.`, 400);
    }

    const myProfit = Number(record.myProfit);
    if (!Number.isFinite(myProfit) || myProfit === 0 || Math.abs(myProfit) > MAX_ABS_PROFIT) {
      throw new SheetSyncError(`Entry ${id} has an invalid profit/loss amount.`, 400);
    }

    let capitalUsed: number | null = null;
    if (record.capitalUsed !== null && record.capitalUsed !== undefined && record.capitalUsed !== '') {
      const cap = Number(record.capitalUsed);
      if (!Number.isFinite(cap) || cap < 0 || cap > MAX_CAPITAL) {
        throw new SheetSyncError(`Entry ${id} has an invalid capital used value.`, 400);
      }
      capitalUsed = Math.round(cap * 100) / 100;
    }

    validated.push({
      id,
      tradeDate,
      myProfit: Math.round(myProfit * 100) / 100,
      capitalUsed,
      createdAt: sanitizeIsoTimestamp(record.createdAt, nowIso),
      updatedAt: sanitizeIsoTimestamp(record.updatedAt, nowIso),
    });
  }

  return validated;
}

export function filterNewEntriesForSheet(
  entries: ValidatedSyncTrade[],
  existingSheetIds: Set<string>
): { newEntries: ValidatedSyncTrade[]; alreadyAddedCount: number } {
  const seen = new Set<string>(existingSheetIds);
  const newEntries: ValidatedSyncTrade[] = [];
  let alreadyAddedCount = 0;

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      alreadyAddedCount += 1;
      continue;
    }
    seen.add(entry.id);
    newEntries.push(entry);
  }

  return { newEntries, alreadyAddedCount };
}

export function buildSheetRow(entry: ValidatedSyncTrade): (string | number)[] {
  return [
    entry.id,
    entry.tradeDate,
    entry.myProfit,
    entry.capitalUsed === null ? '' : entry.capitalUsed,
    entry.createdAt,
    entry.updatedAt,
  ];
}

function escapeSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

interface CachedAccessToken {
  email: string;
  token: string;
  expiresAtMs: number;
}

let cachedAccessToken: CachedAccessToken | null = null;

async function getServiceAccountAccessToken(
  credentials: ServiceAccountCredentials
): Promise<string> {
  const nowMs = Date.now();
  if (
    cachedAccessToken &&
    cachedAccessToken.email === credentials.clientEmail &&
    cachedAccessToken.expiresAtMs > nowMs + 60_000
  ) {
    return cachedAccessToken.token;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: SHEETS_SCOPE,
      aud: credentials.tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );

  const signingInput = `${header}.${claimSet}`;
  let signature: string;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = base64UrlEncode(signer.sign(credentials.privateKey));
  } catch {
    throw new SheetSyncError(
      'Unable to sign Google service account credentials. Please verify GOOGLE_SERVICE_ACCOUNT_JSON.',
      503
    );
  }

  const assertion = `${signingInput}.${signature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const tokenRes = await fetch(credentials.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    let reason = `HTTP ${tokenRes.status}`;
    try {
      const errJson = (await tokenRes.json()) as { error_description?: string; error?: string };
      reason = errJson.error_description || errJson.error || reason;
    } catch {
      // ignore parse failure
    }
    throw new SheetSyncError(
      `Google service account authentication failed (${reason}). Check that the key is active and not revoked.`,
      502
    );
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokenData.access_token) {
    throw new SheetSyncError('Google token response did not include an access token.', 502);
  }

  const expiresInMs = (typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600) * 1000;
  cachedAccessToken = {
    email: credentials.clientEmail,
    token: tokenData.access_token,
    expiresAtMs: nowMs + expiresInMs,
  };

  return tokenData.access_token;
}

async function sheetsApiRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${SHEETS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        detail = errBody.error.message;
      }
    } catch {
      // ignore
    }

    if (response.status === 403) {
      throw new SheetSyncError(
        `Permission denied on the Google Sheet. Share the spreadsheet as Editor with your service account email (${detail}).`,
        403
      );
    }
    if (response.status === 404) {
      throw new SheetSyncError(
        'Configured Google Spreadsheet was not found. Verify GOOGLE_SPREADSHEET_ID.',
        404
      );
    }
    throw new SheetSyncError(`Google Sheets API error: ${detail}`, 502);
  }

  return (await response.json()) as T;
}

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

interface ValuesGetResponse {
  values?: unknown[][];
}

export async function syncEntriesToPermanentSheet(
  rawEntries: unknown,
  env: Record<string, string | undefined> = process.env
): Promise<SyncOutcome> {
  const config = getPermanentSheetConfig(env);
  const credentials = parseServiceAccountFromEnv(env);
  if (!credentials) {
    throw new SheetSyncError(
      'Permanent Google Sheet credentials are not configured on the server yet. Add GOOGLE_SERVICE_ACCOUNT_JSON in Settings -> Secrets (or your hosting environment variables).',
      503
    );
  }

  const entries = validateSyncEntries(rawEntries);
  if (entries.length === 0) {
    return {
      status: 'no_entries',
      addedCount: 0,
      skippedCount: 0,
      sheetTitle: null,
      spreadsheetId: config.spreadsheetId,
      sheetGid: config.sheetGid,
      spreadsheetUrl: config.spreadsheetUrl,
      message: 'No trade entries to sync yet. Add a trade entry first.',
    };
  }

  const accessToken = await getServiceAccountAccessToken(credentials);

  const meta = await sheetsApiRequest<SpreadsheetMetadata>(
    accessToken,
    `/${encodeURIComponent(config.spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties(sheetId,title)`
  );

  const matchingTab = (meta.sheets || []).find(
    (sheet) => sheet.properties?.sheetId === config.sheetGid
  );
  if (!matchingTab?.properties?.title) {
    throw new SheetSyncError(
      `Could not find sheet tab with GID ${config.sheetGid} in spreadsheet ${config.spreadsheetId}.`,
      404
    );
  }

  const sheetTitle = matchingTab.properties.title;
  const escapedTab = escapeSheetTitle(sheetTitle);

  // Check and initialize header row (A1:G1) if blank
  const headerRange = encodeURIComponent(`${escapedTab}!A1:G1`);
  const headerResp = await sheetsApiRequest<ValuesGetResponse>(
    accessToken,
    `/${encodeURIComponent(config.spreadsheetId)}/values/${headerRange}`
  );
  const firstHeaderCell = String(headerResp.values?.[0]?.[0] ?? '').trim();

  if (!firstHeaderCell) {
    await sheetsApiRequest(
      accessToken,
      `/${encodeURIComponent(config.spreadsheetId)}/values/${headerRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({
          range: `${escapedTab}!A1:G1`,
          majorDimension: 'ROWS',
          values: [[...SHEET_HEADERS]],
        }),
      }
    );
  }

  // Read existing entry IDs from column A (A2:A)
  const idRange = encodeURIComponent(`${escapedTab}!A2:A`);
  const existingResp = await sheetsApiRequest<ValuesGetResponse>(
    accessToken,
    `/${encodeURIComponent(config.spreadsheetId)}/values/${idRange}`
  );

  const existingIds = new Set<string>();
  for (const row of existingResp.values || []) {
    const id = String(row?.[0] ?? '').trim();
    if (id) existingIds.add(id);
  }

  const { newEntries, alreadyAddedCount } = filterNewEntriesForSheet(entries, existingIds);

  if (newEntries.length === 0) {
    return {
      status: 'already_added',
      addedCount: 0,
      skippedCount: alreadyAddedCount,
      sheetTitle,
      spreadsheetId: config.spreadsheetId,
      sheetGid: config.sheetGid,
      spreadsheetUrl: config.spreadsheetUrl,
      message: `Already added — all ${alreadyAddedCount} ${
        alreadyAddedCount === 1 ? 'entry is' : 'entries are'
      } already in "${sheetTitle}".`,
    };
  }

  // Append only new entries in chronological order (oldest first for clean ledger rows)
  const orderedNewEntries = [...newEntries].sort((a, b) => {
    const dateCmp = a.tradeDate.localeCompare(b.tradeDate);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const appendRange = encodeURIComponent(`${escapedTab}!A:F`);
  await sheetsApiRequest(
    accessToken,
    `/${encodeURIComponent(config.spreadsheetId)}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: orderedNewEntries.map(buildSheetRow),
      }),
    }
  );

  // Keep Column G header and live Total Profit&Loss formula in G2
  const gRange = encodeURIComponent(`${escapedTab}!G1:G2`);
  await sheetsApiRequest(
    accessToken,
    `/${encodeURIComponent(config.spreadsheetId)}/values/${gRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: `${escapedTab}!G1:G2`,
        majorDimension: 'ROWS',
        values: [['Total Profit&Loss'], [TOTAL_PROFIT_LOSS_FORMULA]],
      }),
    }
  );

  const addedLabel = newEntries.length === 1 ? '1 new entry' : `${newEntries.length} new entries`;
  const skippedSuffix =
    alreadyAddedCount > 0 ? ` (${alreadyAddedCount} already added)` : '';

  return {
    status: 'synced',
    addedCount: newEntries.length,
    skippedCount: alreadyAddedCount,
    sheetTitle,
    spreadsheetId: config.spreadsheetId,
    sheetGid: config.sheetGid,
    spreadsheetUrl: config.spreadsheetUrl,
    message: `Added ${addedLabel} to "${sheetTitle}"${skippedSuffix}.`,
  };
}
