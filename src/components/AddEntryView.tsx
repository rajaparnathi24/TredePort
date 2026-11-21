import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Save, TrendingUp } from 'lucide-react';
import type {
  NavSection,
  StorageMode,
  TradeValidationErrors,
  ValidatedTradePayload,
} from '../types/trade';
import { calculateEntryROI, validateTradeInput } from '../utils/calculations';
import {
  formatIndianDate,
  formatINR,
  formatPercentage,
  getTodayISODate,
} from '../utils/formatters';

interface AddEntryViewProps {
  onSaveEntry: (payload: ValidatedTradePayload) => Promise<void>;
  storageMode: StorageMode;
  onNavigate: (section: NavSection) => void;
}

export const AddEntryView: React.FC<AddEntryViewProps> = ({
  onSaveEntry,
  storageMode,
  onNavigate,
}) => {
  const [myProfit, setMyProfit] = useState('');
  const [capitalUsed, setCapitalUsed] = useState('');
  const [tradeDate, setTradeDate] = useState(() => getTodayISODate());
  const [fieldErrors, setFieldErrors] = useState<TradeValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const preview = useMemo(() => {
    const p = Number(myProfit.trim());
    const hasValidProfit = myProfit.trim() !== '' && Number.isFinite(p) && p > 0;
    const cRaw = capitalUsed.trim();
    const c = cRaw === '' ? null : Number(cRaw);
    const hasValidCapital = c !== null && Number.isFinite(c) && c >= 0;
    const roi = hasValidProfit && hasValidCapital ? calculateEntryROI(p, c) : null;
    return {
      profitValue: hasValidProfit ? p : null,
      capitalValue: hasValidCapital ? c : null,
      roi,
    };
  }, [myProfit, capitalUsed]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const validation = validateTradeInput({
      myProfit,
      capitalUsed,
      tradeDate,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await onSaveEntry(validation.value);
      const savedProfitText = formatINR(validation.value.myProfit);
      const savedDateText = formatIndianDate(validation.value.tradeDate);
      setSuccessMessage(
        `Saved ${savedProfitText} for ${savedDateText} to ${
          storageMode === 'sheets'
            ? 'your Cloud Account & Google Sheets'
            : storageMode === 'cloud'
              ? 'your Cloud Account (synced across mobile & desktop)'
              : 'local storage'
        }.`
      );
      setMyProfit('');
      setCapitalUsed('');
      setTradeDate(getTodayISODate());
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to save entry. Please check your connection and try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-xl p-5 sm:p-8">
        <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            New Profit Entry
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Enter only your 50% profit share. The value you enter is saved directly and is never
            divided by 2.
          </p>
        </div>

        {successMessage && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3.5 text-sm text-emerald-900 dark:text-emerald-200"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2
                className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="font-medium">{successMessage}</p>
                <div className="mt-2 flex items-center gap-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => onNavigate('dashboard')}
                    className="text-emerald-800 dark:text-emerald-300 underline underline-offset-2 hover:text-emerald-950 dark:hover:text-emerald-100"
                  >
                    View Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('history')}
                    className="text-emerald-800 dark:text-emerald-300 underline underline-offset-2 hover:text-emerald-950 dark:hover:text-emerald-100"
                  >
                    View Trade History
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/50 px-4 py-3.5 text-sm text-red-800 dark:text-red-200 flex items-start gap-2.5"
          >
            <AlertCircle
              className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          {/* My Profit Amount (₹) */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="entry-profit"
                className="block text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                My Profit Amount (₹) <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              {preview.profitValue !== null && (
                <span className="text-xs font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                  {formatINR(preview.profitValue)}
                </span>
              )}
            </div>
            <div className="mt-1.5 relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 dark:text-slate-400 text-sm font-medium"
                aria-hidden="true"
              >
                ₹
              </span>
              <input
                id="entry-profit"
                name="myProfit"
                type="number"
                inputMode="decimal"
                step="any"
                min="0.01"
                required
                value={myProfit}
                onChange={(e) => {
                  setMyProfit(e.target.value);
                  if (fieldErrors.myProfit) {
                    setFieldErrors((prev) => ({ ...prev, myProfit: undefined }));
                  }
                }}
                placeholder="e.g. 12500"
                aria-invalid={Boolean(fieldErrors.myProfit)}
                aria-describedby={fieldErrors.myProfit ? 'entry-profit-error' : undefined}
                className={`block w-full rounded-xl sm:rounded-lg border pl-8 pr-3.5 py-3 sm:py-2.5 text-base sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 ${
                  fieldErrors.myProfit
                    ? 'border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                }`}
              />
            </div>
            {fieldErrors.myProfit && (
              <p
                id="entry-profit-error"
                role="alert"
                className="mt-1.5 text-xs text-red-600 dark:text-red-400"
              >
                {fieldErrors.myProfit}
              </p>
            )}
          </div>

          {/* Capital Used (₹) — Optional */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="entry-capital"
                className="block text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Capital Used (₹){' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  Optional
                </span>
              </label>
              {preview.capitalValue !== null && (
                <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {formatINR(preview.capitalValue)}
                </span>
              )}
            </div>
            <div className="mt-1.5 relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500 dark:text-slate-400 text-sm font-medium"
                aria-hidden="true"
              >
                ₹
              </span>
              <input
                id="entry-capital"
                name="capitalUsed"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={capitalUsed}
                onChange={(e) => {
                  setCapitalUsed(e.target.value);
                  if (fieldErrors.capitalUsed) {
                    setFieldErrors((prev) => ({ ...prev, capitalUsed: undefined }));
                  }
                }}
                placeholder="Leave blank if not tracked"
                aria-invalid={Boolean(fieldErrors.capitalUsed)}
                aria-describedby="entry-capital-help"
                className={`block w-full rounded-xl sm:rounded-lg border pl-8 pr-3.5 py-3 sm:py-2.5 text-base sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 ${
                  fieldErrors.capitalUsed
                    ? 'border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                }`}
              />
            </div>
            {fieldErrors.capitalUsed ? (
              <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.capitalUsed}
              </p>
            ) : (
              <p id="entry-capital-help" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Optional. Leave empty if unknown—missing capital is never treated as zero in ROI
                calculations.
              </p>
            )}
          </div>

          {/* Trade Date */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="entry-date"
                className="block text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Trade Date <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              {tradeDate && (
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {formatIndianDate(tradeDate)}
                </span>
              )}
            </div>
            <input
              id="entry-date"
              name="tradeDate"
              type="date"
              required
              value={tradeDate}
              onChange={(e) => {
                setTradeDate(e.target.value);
                if (fieldErrors.tradeDate) {
                  setFieldErrors((prev) => ({ ...prev, tradeDate: undefined }));
                }
              }}
              aria-invalid={Boolean(fieldErrors.tradeDate)}
              className={`mt-1.5 block w-full rounded-xl sm:rounded-lg border px-3.5 py-3 sm:py-2.5 text-base sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 ${
                fieldErrors.tradeDate
                  ? 'border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/30'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
              }`}
            />
            {fieldErrors.tradeDate && (
              <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.tradeDate}
              </p>
            )}
          </div>

          {/* Live Profit Summary Card */}
          {preview.profitValue !== null && (
            <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/35 px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-9 h-9 rounded-lg bg-emerald-600/10 dark:bg-emerald-500/15 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Profit Summary
                  </p>
                  <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 truncate">
                    + {formatINR(preview.profitValue)}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Entry ROI</p>
                <p className="text-xs font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {preview.roi !== null ? formatPercentage(preview.roi) : '—'}
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-0 rounded-xl sm:rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{isSubmitting ? 'Saving Entry...' : 'Save Entry'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMyProfit('');
                setCapitalUsed('');
                setTradeDate(getTodayISODate());
                setFieldErrors({});
                setSubmitError(null);
                setSuccessMessage(null);
              }}
              disabled={isSubmitting}
              className="px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 rounded-xl sm:rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
