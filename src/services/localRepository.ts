import type { TradeRecord } from '../types/trade';

const LOCAL_RECORDS_KEY = 'my_trading_profit_tracker_records_v1';
const SHEET_META_KEY = 'my_trading_profit_tracker_sheet_meta_v1';

export interface SavedSpreadsheetMeta {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
}

/**
 * Loads locally stored records (used only when Google Sheets is not yet connected).
 * Starts empty — never injects fake data as real records.
 */
export function loadLocalRecords(): TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TradeRecord =>
        item &&
        typeof item.id === 'string' &&
        typeof item.tradeDate === 'string' &&
        typeof item.myProfit === 'number' &&
        Number.isFinite(item.myProfit) &&
        (item.capitalUsed === null ||
          (typeof item.capitalUsed === 'number' && Number.isFinite(item.capitalUsed)))
    );
  } catch {
    return [];
  }
}

export function saveLocalRecords(records: TradeRecord[]): void {
  try {
    window.localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadSavedSpreadsheetMeta(): SavedSpreadsheetMeta | null {
  try {
    const raw = window.localStorage.getItem(SHEET_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.spreadsheetId === 'string' &&
      typeof parsed.spreadsheetTitle === 'string' &&
      typeof parsed.spreadsheetUrl === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSpreadsheetMeta(meta: SavedSpreadsheetMeta | null): void {
  try {
    if (!meta) {
      window.localStorage.removeItem(SHEET_META_KEY);
    } else {
      window.localStorage.setItem(SHEET_META_KEY, JSON.stringify(meta));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function createTradeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `TRD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `TRD-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}
