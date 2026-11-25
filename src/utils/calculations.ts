import type {
  AnalysisPeriod,
  DashboardMetrics,
  HistoryFilters,
  PeriodAnalysisResult,
  PeriodSeriesPoint,
  TradeFormInput,
  TradeRecord,
  TradeValidationErrors,
  ValidatedTradePayload,
} from '../types/trade';
import {
  formatIndianDate,
  formatIndianDateLong,
  getMonthName,
  parseISODateParts,
} from './formatters';

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toISODateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromISODateUTC(isoDate: string): Date {
  const parts = parseISODateParts(isoDate);
  if (!parts) {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Validates trade entry inputs strictly:
 * - Profit / Loss must be a valid non-zero number (positive for profit, negative for loss).
 *   Entered amount is already the user's 50% share.
 * - Capital is optional; when provided, it must be zero or a positive number (>= 0).
 * - Trade Date must be a valid YYYY-MM-DD calendar date.
 */
export function validateTradeInput(
  input: TradeFormInput
): { valid: true; value: ValidatedTradePayload } | { valid: false; errors: TradeValidationErrors } {
  const errors: TradeValidationErrors = {};

  const profitRaw = input.myProfit.trim();
  const parsedProfit = Number(profitRaw);
  if (!profitRaw) {
    errors.myProfit = 'Please enter your profit or loss amount.';
  } else if (!Number.isFinite(parsedProfit) || parsedProfit === 0) {
    errors.myProfit = 'Enter a valid non-zero amount (use a minus sign for loss, e.g. -2500).';
  }

  const capitalRaw = input.capitalUsed.trim();
  let parsedCapital: number | null = null;
  if (capitalRaw !== '') {
    const candidate = Number(capitalRaw);
    if (!Number.isFinite(candidate) || candidate < 0) {
      errors.capitalUsed = 'Capital used must be zero or a positive number.';
    } else {
      parsedCapital = roundCurrency(candidate);
    }
  }

  const dateRaw = input.tradeDate.trim();
  if (!dateRaw) {
    errors.tradeDate = 'Please select a trade date.';
  } else if (!parseISODateParts(dateRaw)) {
    errors.tradeDate = 'Please enter a valid calendar date.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      tradeDate: dateRaw,
      myProfit: roundCurrency(parsedProfit),
      capitalUsed: parsedCapital,
    },
  };
}

/**
 * Calculates single-entry ROI (%).
 * Returns null if capital was omitted or is zero to prevent division by zero or misleading ROI.
 */
export function calculateEntryROI(myProfit: number, capitalUsed: number | null): number | null {
  if (capitalUsed === null || !Number.isFinite(capitalUsed) || capitalUsed <= 0) {
    return null;
  }
  return (myProfit / capitalUsed) * 100;
}

/**
 * Calculates the exact sum of all recorded profits and losses.
 * Matches column G ("Total Profit&Loss": =SUM(C2:C)) in Google Sheets.
 */
export function calculateTotalProfitLoss(entries: TradeRecord[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (Number.isFinite(entry.myProfit)) {
      sum += entry.myProfit;
    }
  }
  return roundCurrency(sum);
}

/**
 * Computes overall dashboard metrics.
 * IMPORTANT:
 * - `myProfit` is already the user's 50% share and is NEVER divided by 2.
 * - Missing capital (`null`) is NEVER treated as zero in ROI calculations.
 * - Overall ROI is computed from entries with recorded capital when total recorded capital > 0.
 */
export function calculateDashboardMetrics(entries: TradeRecord[]): DashboardMetrics {
  const totalEntries = entries.length;
  let totalNetProfit = 0;
  let totalCapitalUsed = 0;
  let profitFromEntriesWithCapital = 0;
  let entriesWithCapitalCount = 0;

  for (const entry of entries) {
    totalNetProfit += entry.myProfit;
    if (entry.capitalUsed !== null && Number.isFinite(entry.capitalUsed)) {
      totalCapitalUsed += entry.capitalUsed;
      if (entry.capitalUsed > 0) {
        entriesWithCapitalCount += 1;
        profitFromEntriesWithCapital += entry.myProfit;
      }
    }
  }

  totalNetProfit = roundCurrency(totalNetProfit);
  totalCapitalUsed = roundCurrency(totalCapitalUsed);
  const averageProfit = totalEntries > 0 ? roundCurrency(totalNetProfit / totalEntries) : 0;

  const overallROI =
    entriesWithCapitalCount > 0 && totalCapitalUsed > 0
      ? (profitFromEntriesWithCapital / totalCapitalUsed) * 100
      : null;

  const isPartialROI = entriesWithCapitalCount > 0 && entriesWithCapitalCount < totalEntries;

  return {
    totalNetProfit,
    totalCapitalUsed,
    totalEntries,
    entriesWithCapitalCount,
    averageProfit,
    overallROI,
    isPartialROI,
  };
}

/**
 * Sorts entries newest-first and applies search + date range filters.
 */
export function filterAndSortEntries(
  entries: TradeRecord[],
  filters: HistoryFilters
): TradeRecord[] {
  const query = filters.search.trim().toLowerCase();
  const fromDate = filters.fromDate.trim();
  const toDate = filters.toDate.trim();

  return [...entries]
    .filter((entry) => {
      if (fromDate && entry.tradeDate < fromDate) return false;
      if (toDate && entry.tradeDate > toDate) return false;

      if (query) {
        const indianDate = formatIndianDate(entry.tradeDate).toLowerCase();
        const longDate = formatIndianDateLong(entry.tradeDate).toLowerCase();
        const profitStr = String(entry.myProfit);
        const capitalStr = entry.capitalUsed !== null ? String(entry.capitalUsed) : '';
        const idStr = entry.id.toLowerCase();
        const haystack = `${entry.tradeDate} ${indianDate} ${longDate} ${profitStr} ${capitalStr} ${idStr}`;
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (a.tradeDate !== b.tradeDate) {
        return b.tradeDate.localeCompare(a.tradeDate);
      }
      if (a.createdAt !== b.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.id.localeCompare(a.id);
    });
}

/**
 * Shifts an anchor YYYY-MM-DD date backwards or forwards by one period unit.
 */
export function shiftAnchorDate(
  anchorDate: string,
  period: AnalysisPeriod,
  direction: -1 | 1
): string {
  const base = fromISODateUTC(anchorDate);
  if (period === 'daily') {
    return toISODateUTC(addDaysUTC(base, direction));
  }
  if (period === 'weekly') {
    return toISODateUTC(addDaysUTC(base, direction * 7));
  }
  if (period === 'monthly') {
    const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + direction, 1));
    return toISODateUTC(target);
  }
  const target = new Date(Date.UTC(base.getUTCFullYear() + direction, 0, 1));
  return toISODateUTC(target);
}

function getMondayStartUTC(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysUTC(date, diffToMonday);
}

function summarizeEntriesInRange(entries: TradeRecord[], startISO: string, endISO: string) {
  let profit = 0;
  let capital = 0;
  let count = 0;
  let profitWithCapital = 0;
  let entriesWithCapitalCount = 0;

  for (const entry of entries) {
    if (entry.tradeDate >= startISO && entry.tradeDate <= endISO) {
      profit += entry.myProfit;
      count += 1;
      if (entry.capitalUsed !== null && Number.isFinite(entry.capitalUsed)) {
        capital += entry.capitalUsed;
        if (entry.capitalUsed > 0) {
          entriesWithCapitalCount += 1;
          profitWithCapital += entry.myProfit;
        }
      }
    }
  }

  profit = roundCurrency(profit);
  capital = roundCurrency(capital);

  const roi =
    entriesWithCapitalCount > 0 && capital > 0 ? (profitWithCapital / capital) * 100 : null;

  return {
    profit,
    capital,
    count,
    roi,
    entriesWithCapitalCount,
    isPartialROI: entriesWithCapitalCount > 0 && entriesWithCapitalCount < count,
  };
}

/**
 * Calculates period totals, previous-period comparison, and chart time-series
 * for Daily, Weekly, Monthly, and Yearly analysis filters.
 * Both Bar Chart and Line Chart consume the exact same returned `series` array.
 */
export function calculatePeriodAnalysis(
  entries: TradeRecord[],
  period: AnalysisPeriod,
  anchorDate: string
): PeriodAnalysisResult {
  const base = fromISODateUTC(anchorDate);
  const series: PeriodSeriesPoint[] = [];

  let currentStart = '';
  let currentEnd = '';
  let prevStart = '';
  let prevEnd = '';
  let periodLabel = '';
  let previousPeriodLabel = '';
  let chartRangeLabel = '';

  if (period === 'daily') {
    currentStart = toISODateUTC(base);
    currentEnd = currentStart;
    const prevDay = addDaysUTC(base, -1);
    prevStart = toISODateUTC(prevDay);
    prevEnd = prevStart;
    periodLabel = formatIndianDateLong(currentStart);
    previousPeriodLabel = formatIndianDateLong(prevStart);

    // 14-day daily trend ending on the selected day
    const windowStart = addDaysUTC(base, -13);
    const windowStartISO = toISODateUTC(windowStart);
    chartRangeLabel = `${formatIndianDate(windowStartISO)} – ${formatIndianDate(currentEnd)} (14 days)`;

    const dayBuckets = new Map<string, { profit: number; capital: number; entries: number }>();
    for (let i = 0; i < 14; i++) {
      const d = toISODateUTC(addDaysUTC(windowStart, i));
      dayBuckets.set(d, { profit: 0, capital: 0, entries: 0 });
    }
    for (const entry of entries) {
      const bucket = dayBuckets.get(entry.tradeDate);
      if (bucket) {
        bucket.profit = roundCurrency(bucket.profit + entry.myProfit);
        if (entry.capitalUsed !== null) {
          bucket.capital = roundCurrency(bucket.capital + entry.capitalUsed);
        }
        bucket.entries += 1;
      }
    }
    for (const [dateKey, data] of dayBuckets.entries()) {
      const parts = parseISODateParts(dateKey);
      const shortLabel = parts
        ? `${String(parts.day).padStart(2, '0')} ${getMonthName(parts.month - 1, 'short')}`
        : dateKey;
      series.push({
        key: dateKey,
        label: shortLabel,
        fullLabel: formatIndianDateLong(dateKey),
        profit: data.profit,
        capital: data.capital,
        entries: data.entries,
      });
    }
  } else if (period === 'weekly') {
    const weekStart = getMondayStartUTC(base);
    const weekEnd = addDaysUTC(weekStart, 6);
    const prevWeekStart = addDaysUTC(weekStart, -7);
    const prevWeekEnd = addDaysUTC(weekStart, -1);

    currentStart = toISODateUTC(weekStart);
    currentEnd = toISODateUTC(weekEnd);
    prevStart = toISODateUTC(prevWeekStart);
    prevEnd = toISODateUTC(prevWeekEnd);

    periodLabel = `${formatIndianDateLong(currentStart)} – ${formatIndianDateLong(currentEnd)}`;
    previousPeriodLabel = `${formatIndianDateLong(prevStart)} – ${formatIndianDateLong(prevEnd)}`;
    chartRangeLabel = `${formatIndianDate(currentStart)} – ${formatIndianDate(currentEnd)} (Mon–Sun)`;

    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayBuckets = new Map<string, { profit: number; capital: number; entries: number }>();
    for (let i = 0; i < 7; i++) {
      const d = toISODateUTC(addDaysUTC(weekStart, i));
      dayBuckets.set(d, { profit: 0, capital: 0, entries: 0 });
    }
    for (const entry of entries) {
      const bucket = dayBuckets.get(entry.tradeDate);
      if (bucket) {
        bucket.profit = roundCurrency(bucket.profit + entry.myProfit);
        if (entry.capitalUsed !== null) {
          bucket.capital = roundCurrency(bucket.capital + entry.capitalUsed);
        }
        bucket.entries += 1;
      }
    }

    let idx = 0;
    for (const [dateKey, data] of dayBuckets.entries()) {
      const parts = parseISODateParts(dateKey);
      const dayNum = parts ? String(parts.day).padStart(2, '0') : '';
      series.push({
        key: dateKey,
        label: `${weekdayNames[idx]} ${dayNum}`,
        fullLabel: `${weekdayNames[idx]}, ${formatIndianDateLong(dateKey)}`,
        profit: data.profit,
        capital: data.capital,
        entries: data.entries,
      });
      idx += 1;
    }
  } else if (period === 'monthly') {
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth(); // 0-based
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    const prevMonthStart = new Date(Date.UTC(year, month - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(year, month, 0));

    currentStart = toISODateUTC(monthStart);
    currentEnd = toISODateUTC(monthEnd);
    prevStart = toISODateUTC(prevMonthStart);
    prevEnd = toISODateUTC(prevMonthEnd);

    periodLabel = `${getMonthName(month, 'long')} ${year}`;
    previousPeriodLabel = `${getMonthName(prevMonthStart.getUTCMonth(), 'long')} ${prevMonthStart.getUTCFullYear()}`;
    chartRangeLabel = `${formatIndianDate(currentStart)} – ${formatIndianDate(currentEnd)}`;

    const daysInMonth = monthEnd.getUTCDate();
    const dayBuckets = new Map<string, { profit: number; capital: number; entries: number }>();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = toISODateUTC(new Date(Date.UTC(year, month, day)));
      dayBuckets.set(d, { profit: 0, capital: 0, entries: 0 });
    }
    for (const entry of entries) {
      const bucket = dayBuckets.get(entry.tradeDate);
      if (bucket) {
        bucket.profit = roundCurrency(bucket.profit + entry.myProfit);
        if (entry.capitalUsed !== null) {
          bucket.capital = roundCurrency(bucket.capital + entry.capitalUsed);
        }
        bucket.entries += 1;
      }
    }
    for (const [dateKey, data] of dayBuckets.entries()) {
      const parts = parseISODateParts(dateKey);
      series.push({
        key: dateKey,
        label: parts ? String(parts.day) : dateKey,
        fullLabel: formatIndianDateLong(dateKey),
        profit: data.profit,
        capital: data.capital,
        entries: data.entries,
      });
    }
  } else {
    // yearly
    const year = base.getUTCFullYear();
    currentStart = `${year}-01-01`;
    currentEnd = `${year}-12-31`;
    prevStart = `${year - 1}-01-01`;
    prevEnd = `${year - 1}-12-31`;

    periodLabel = String(year);
    previousPeriodLabel = String(year - 1);
    chartRangeLabel = `Jan ${year} – Dec ${year}`;

    const monthBuckets = Array.from({ length: 12 }, (_, m) => ({
      key: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: getMonthName(m, 'short'),
      fullLabel: `${getMonthName(m, 'long')} ${year}`,
      profit: 0,
      capital: 0,
      entries: 0,
    }));

    for (const entry of entries) {
      if (entry.tradeDate >= currentStart && entry.tradeDate <= currentEnd) {
        const parts = parseISODateParts(entry.tradeDate);
        if (parts) {
          const bucket = monthBuckets[parts.month - 1];
          bucket.profit = roundCurrency(bucket.profit + entry.myProfit);
          if (entry.capitalUsed !== null) {
            bucket.capital = roundCurrency(bucket.capital + entry.capitalUsed);
          }
          bucket.entries += 1;
        }
      }
    }

    series.push(...monthBuckets);
  }

  const currentSummary = summarizeEntriesInRange(entries, currentStart, currentEnd);
  const previousSummary = summarizeEntriesInRange(entries, prevStart, prevEnd);

  const profitChange = roundCurrency(currentSummary.profit - previousSummary.profit);
  const profitChangePercent =
    previousSummary.profit > 0
      ? ((currentSummary.profit - previousSummary.profit) / previousSummary.profit) * 100
      : null;

  return {
    period,
    periodLabel,
    previousPeriodLabel,
    chartRangeLabel,
    currentProfit: currentSummary.profit,
    previousProfit: previousSummary.profit,
    profitChange,
    profitChangePercent,
    currentEntriesCount: currentSummary.count,
    previousEntriesCount: previousSummary.count,
    currentCapitalUsed: currentSummary.capital,
    previousCapitalUsed: previousSummary.capital,
    currentROI: currentSummary.roi,
    isPartialROI: currentSummary.isPartialROI,
    entriesWithCapitalCount: currentSummary.entriesWithCapitalCount,
    series,
  };
}
