import type { TradeRecord } from '../types/trade';

export const TRADE_SHEET_NAME = 'Trade Records';
export const TRADE_SHEET_HEADERS = [
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

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetId: number;
}

export class GoogleSheetsError extends Error {
  readonly status: number;
  readonly isAuthError: boolean;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GoogleSheetsError';
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
  }
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new GoogleSheetsError(
      'Network error while connecting to Google Sheets. Please check your internet connection.',
      0
    );
  }

  if (!response.ok) {
    let apiMessage = '';
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      apiMessage = errBody.error?.message || '';
    } catch {
      // Ignore JSON parse failure on error body
    }

    if (response.status === 401) {
      throw new GoogleSheetsError(
        'Your Google session has expired. Please sign in again to reconnect Google Sheets.',
        401
      );
    }
    if (response.status === 403) {
      throw new GoogleSheetsError(
        apiMessage || 'Permission denied. Ensure your account has edit access to this spreadsheet.',
        403
      );
    }
    if (response.status === 404) {
      throw new GoogleSheetsError(
        'Spreadsheet not found. Double-check the Spreadsheet ID or URL and try again.',
        404
      );
    }
    if (response.status === 429) {
      throw new GoogleSheetsError(
        'Google Sheets API rate limit reached. Please wait a few seconds and retry.',
        429
      );
    }
    throw new GoogleSheetsError(
      apiMessage || `Google Sheets request failed (HTTP ${response.status}).`,
      response.status
    );
  }

  return (await response.json()) as T;
}

function quoteSheetRange(range: string): string {
  return encodeURIComponent(`'${TRADE_SHEET_NAME}'!${range}`);
}

interface SpreadsheetMetadataResponse {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

/**
 * Ensures cell G2 holds the live Google Sheets formula `=SUM(C2:C)`
 * under column G ("Total Profit&Loss") so the total automatically sums
 * all recorded profit and loss rows.
 */
async function syncTotalProfitLossCell(
  accessToken: string,
  spreadsheetId: string
): Promise<void> {
  await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('G2')}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [[TOTAL_PROFIT_LOSS_FORMULA]],
      }),
    }
  );
}

async function writeHeaderRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('A1:G1')}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [[...TRADE_SHEET_HEADERS]],
      }),
    }
  );

  // Format header row bold with light neutral background across A1:G1
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: TRADE_SHEET_HEADERS.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.96, blue: 0.98 },
                textFormat: { bold: true },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    }),
  });
}

/**
 * Automatically creates a new Google Spreadsheet initialized with the "Trade Records"
 * tab, frozen header row (A1:G1 including Total Profit&Loss), and live SUM formula in G2.
 */
export async function createTradeSpreadsheet(
  accessToken: string,
  title = 'My Trading Profit Tracker'
): Promise<SpreadsheetInfo> {
  const created = await sheetsFetch<SpreadsheetMetadataResponse>(SHEETS_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: TRADE_SHEET_NAME,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  const spreadsheetId = created.spreadsheetId;
  const sheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  await writeHeaderRow(accessToken, spreadsheetId, sheetId);
  await syncTotalProfitLossCell(accessToken, spreadsheetId);

  return {
    spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl:
      created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheetId,
  };
}

/**
 * Connects to an existing Google Spreadsheet by ID, inspects its tab metadata
 * (never assuming "Sheet1"), creates the "Trade Records" tab if missing, and
 * ensures all 7 header columns (including Total Profit&Loss) and G2 SUM formula exist.
 */
export async function verifyAndInitializeSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetInfo> {
  const metadata = await sheetsFetch<SpreadsheetMetadataResponse>(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  const existingTab = metadata.sheets?.find((s) => s.properties?.title === TRADE_SHEET_NAME);

  let sheetId: number;
  if (existingTab?.properties?.sheetId !== undefined) {
    sheetId = existingTab.properties.sheetId;
  } else {
    const added = await sheetsFetch<{
      replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }>;
    }>(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: TRADE_SHEET_NAME,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      }),
    });
    sheetId = added.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  }

  // Verify all 7 header columns (A1:G1); initialize or upgrade if Total Profit&Loss is missing
  const headerResp = await sheetsFetch<{ values?: unknown[][] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('A1:G1')}`,
    accessToken
  );
  const firstRow = headerResp.values?.[0] || [];
  const hasAllHeaders =
    firstRow.length >= TRADE_SHEET_HEADERS.length &&
    String(firstRow[0] ?? '').trim().toLowerCase() === 'id' &&
    String(firstRow[6] ?? '').trim() === 'Total Profit&Loss';

  if (!hasAllHeaders) {
    await writeHeaderRow(accessToken, spreadsheetId, sheetId);
  }

  await syncTotalProfitLossCell(accessToken, spreadsheetId);

  return {
    spreadsheetId: metadata.spreadsheetId,
    title: metadata.properties?.title || 'Connected Spreadsheet',
    spreadsheetUrl:
      metadata.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheetId,
  };
}

function parseSheetNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  const cleaned = str.replace(/[₹,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts a spreadsheet date cell (either YYYY-MM-DD string or Google Sheets serial number)
 * to consistent YYYY-MM-DD format.
 */
function parseSheetDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const epochMs = Date.UTC(1899, 11, 30);
    const date = new Date(epochMs + Math.round(raw) * 86_400_000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return null;
}

/**
 * Reads all trade records from the "Trade Records" sheet (columns A2:F).
 * Preserves negative values if manually recorded as losses so Total Profit&Loss stays exact.
 */
export async function fetchTradeRecords(
  accessToken: string,
  spreadsheetId: string
): Promise<TradeRecord[]> {
  const resp = await sheetsFetch<{ values?: unknown[][] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('A2:F')}?valueRenderOption=UNFORMATTED_VALUE`,
    accessToken
  );

  const rows = resp.values || [];
  const records: TradeRecord[] = [];

  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const id = String(row[0] ?? '').trim();
    const tradeDate = parseSheetDate(row[1]);
    const myProfit = parseSheetNumber(row[2]);
    if (!id || !tradeDate || myProfit === null || myProfit === 0) continue;

    // Preserve null when Capital Used cell is empty — NEVER convert empty cell to 0!
    const rawCapital = row[3];
    const capitalUsed =
      rawCapital === undefined || rawCapital === null || String(rawCapital).trim() === ''
        ? null
        : parseSheetNumber(rawCapital);

    const createdAt =
      row[4] && String(row[4]).trim() ? String(row[4]).trim() : `${tradeDate}T00:00:00.000Z`;
    const updatedAt = row[5] && String(row[5]).trim() ? String(row[5]).trim() : createdAt;

    records.push({
      id,
      tradeDate,
      myProfit,
      capitalUsed,
      createdAt,
      updatedAt,
    });
  }

  return records;
}

function recordToRow(record: TradeRecord): Array<string | number> {
  return [
    record.id,
    record.tradeDate,
    record.myProfit,
    record.capitalUsed === null ? '' : record.capitalUsed,
    record.createdAt,
    record.updatedAt,
  ];
}

/**
 * Appends a new trade entry row (A:F) to Google Sheets and ensures Total Profit&Loss (G2) is synced.
 */
export async function appendTradeRecord(
  accessToken: string,
  spreadsheetId: string,
  record: TradeRecord
): Promise<void> {
  await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('A:F')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [recordToRow(record)],
      }),
    }
  );
  await syncTotalProfitLossCell(accessToken, spreadsheetId);
}

async function findRowNumberById(
  accessToken: string,
  spreadsheetId: string,
  recordId: string
): Promise<number> {
  const resp = await sheetsFetch<{ values?: unknown[][] }>(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${quoteSheetRange('A2:A')}?valueRenderOption=UNFORMATTED_VALUE`,
    accessToken
  );

  const rows = resp.values || [];
  const idx = rows.findIndex((r) => String(r[0] ?? '').trim() === recordId);
  if (idx === -1) {
    throw new GoogleSheetsError(
      'Record could not be found in Google Sheets. It may have been deleted elsewhere. Refresh and try again.',
      404
    );
  }
  return idx + 2; // 1-based sheet row number (row 1 is header)
}

/**
 * Updates an existing trade entry row in Google Sheets by matching its ID in Column A
 * and ensures Total Profit&Loss (G2) stays synced.
 */
export async function updateTradeRecordInSheet(
  accessToken: string,
  spreadsheetId: string,
  record: TradeRecord
): Promise<void> {
  const rowNumber = await findRowNumberById(accessToken, spreadsheetId, record.id);
  const range = quoteSheetRange(`A${rowNumber}:F${rowNumber}`);

  await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [recordToRow(record)],
      }),
    }
  );
  await syncTotalProfitLossCell(accessToken, spreadsheetId);
}

/**
 * Deletes an existing trade entry row from Google Sheets using deleteDimension
 * and restores the Total Profit&Loss (G2) SUM formula if row 2 shifted.
 */
export async function deleteTradeRecordFromSheet(
  accessToken: string,
  spreadsheetId: string,
  recordId: string
): Promise<void> {
  const [info, rowNumber] = await Promise.all([
    verifyAndInitializeSpreadsheet(accessToken, spreadsheetId),
    findRowNumberById(accessToken, spreadsheetId, recordId),
  ]);

  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: info.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-based inclusive
              endIndex: rowNumber, // 0-based exclusive
            },
          },
        },
      ],
    }),
  });
  await syncTotalProfitLossCell(accessToken, spreadsheetId);
}
