export interface TradeRecord {
  id: string;
  tradeDate: string; // Stored consistently as YYYY-MM-DD
  myProfit: number; // Already the user's 50% share — never halved
  capitalUsed: number | null; // Optional: null when not provided
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface TradeFormInput {
  tradeDate: string;
  myProfit: string;
  capitalUsed: string;
}

export interface ValidatedTradePayload {
  tradeDate: string;
  myProfit: number;
  capitalUsed: number | null;
}

export interface TradeValidationErrors {
  tradeDate?: string;
  myProfit?: string;
  capitalUsed?: string;
}

export type AnalysisPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type ChartType = 'bar' | 'line';

export type NavSection = 'dashboard' | 'add' | 'analysis' | 'history' | 'settings';

export type StorageMode = 'sheets' | 'local';

export interface HistoryFilters {
  search: string;
  fromDate: string;
  toDate: string;
}

export interface DashboardMetrics {
  totalNetProfit: number;
  totalCapitalUsed: number;
  totalEntries: number;
  entriesWithCapitalCount: number;
  averageProfit: number;
  overallROI: number | null;
  isPartialROI: boolean;
}

export interface PeriodSeriesPoint {
  key: string;
  label: string;
  fullLabel: string;
  profit: number;
  capital: number;
  entries: number;
}

export interface PeriodAnalysisResult {
  period: AnalysisPeriod;
  periodLabel: string;
  previousPeriodLabel: string;
  chartRangeLabel: string;
  currentProfit: number;
  previousProfit: number;
  profitChange: number;
  profitChangePercent: number | null;
  currentEntriesCount: number;
  previousEntriesCount: number;
  currentCapitalUsed: number;
  previousCapitalUsed: number;
  currentROI: number | null;
  isPartialROI: boolean;
  entriesWithCapitalCount: number;
  series: PeriodSeriesPoint[];
}

export interface GoogleConnectionState {
  authProvider: 'firebase' | 'gis' | 'none';
  isSignedIn: boolean;
  userEmail: string | null;
  userName: string | null;
  spreadsheetId: string | null;
  spreadsheetTitle: string | null;
  spreadsheetUrl: string | null;
  lastSyncedAt: string | null;
}
