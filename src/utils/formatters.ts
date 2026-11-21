const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrFixedFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Formats a number in Indian Rupee grouping (e.g. ₹1,25,000 or ₹42,500.50).
 */
export function formatINR(value: number, options?: { showSign?: boolean; forceDecimals?: boolean }): string {
  if (!Number.isFinite(value)) {
    return '₹0';
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  const abs = Math.abs(normalized);
  const formattedAbs = options?.forceDecimals
    ? inrFixedFormatter.format(abs)
    : inrFormatter.format(abs);

  if (normalized < 0) {
    return `-${formattedAbs}`;
  }
  if (options?.showSign && normalized > 0) {
    return `+${formattedAbs}`;
  }
  return formattedAbs;
}

/**
 * Compact Indian Rupee format for chart axis ticks (e.g. ₹1.2L, ₹45k, ₹500).
 */
export function formatCompactINR(value: number): string {
  if (!Number.isFinite(value)) return '₹0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10_000_000) {
    const cr = abs / 10_000_000;
    return `${sign}₹${Number.isInteger(cr) ? cr : cr.toFixed(1)}Cr`;
  }
  if (abs >= 100_000) {
    const lakh = abs / 100_000;
    return `${sign}₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(1)}L`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${sign}₹${Math.round(abs)}`;
}

/**
 * Formats a percentage value cleanly with optional leading plus sign.
 */
export function formatPercentage(value: number, options?: { showSign?: boolean; decimals?: number }): string {
  if (!Number.isFinite(value)) return '—';
  const decimals = options?.decimals ?? 2;
  const fixed = Math.abs(value).toFixed(decimals);
  if (value < 0) return `-${fixed}%`;
  if (options?.showSign && value > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

/**
 * Parses a YYYY-MM-DD string into integer parts without timezone shifts.
 */
export function parseISODateParts(isoDate: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Displays a stored YYYY-MM-DD date in Indian DD/MM/YYYY format.
 */
export function formatIndianDate(isoDate: string): string {
  const parts = parseISODateParts(isoDate);
  if (!parts) return isoDate;
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  return `${dd}/${mm}/${parts.year}`;
}

/**
 * Displays a stored YYYY-MM-DD date in readable Indian format (e.g. 20 Nov 2026).
 */
export function formatIndianDateLong(isoDate: string): string {
  const parts = parseISODateParts(isoDate);
  if (!parts) return isoDate;
  const dd = String(parts.day).padStart(2, '0');
  return `${dd} ${SHORT_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function getMonthName(monthIndexZeroBased: number, style: 'short' | 'long' = 'long'): string {
  const idx = ((monthIndexZeroBased % 12) + 12) % 12;
  return style === 'short' ? SHORT_MONTHS[idx] : LONG_MONTHS[idx];
}

/**
 * Returns today's local date in YYYY-MM-DD format.
 */
export function getTodayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats an ISO timestamp in Indian date & time format.
 */
export function formatIndianDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Extracts a Google Spreadsheet ID from either a full Google Sheets URL or raw ID string.
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{15,120}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
