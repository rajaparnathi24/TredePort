import React, { useMemo, useState } from 'react';
import { AlertCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  HistoryFilters,
  NavSection,
  StorageMode,
  TradeRecord,
  TradeValidationErrors,
  ValidatedTradePayload,
} from '../types/trade';
import {
  calculateDashboardMetrics,
  calculateTradeROI,
  filterAndSortEntries,
  validateTradeInput,
} from '../utils/calculations';
import { formatIndianDate, formatINR, formatPercentage } from '../utils/formatters';

interface HistoryViewProps {
  entries: TradeRecord[];
  isLoading: boolean;
  storageMode: StorageMode;
  onUpdateEntry: (id: string, payload: ValidatedTradePayload) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  entries,
  isLoading,
  storageMode,
  onUpdateEntry,
  onDeleteEntry,
  onNavigate,
}) => {
  const [filters, setFilters] = useState<HistoryFilters>({
    search: '',
    fromDate: '',
    toDate: '',
  });

  // Edit Modal state
  const [editingEntry, setEditingEntry] = useState<TradeRecord | null>(null);
  const [editProfit, setEditProfit] = useState('');
  const [editCapital, setEditCapital] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editErrors, setEditErrors] = useState<TradeValidationErrors>({});
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete Confirmation Modal state
  const [deletingEntry, setDeletingEntry] = useState<TradeRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalCapitalUsed = useMemo(
    () => calculateDashboardMetrics(entries).totalCapitalUsed,
    [entries]
  );

  const filteredEntries = useMemo(
    () => filterAndSortEntries(entries, filters),
    [entries, filters]
  );

  const hasActiveFilters = Boolean(filters.search || filters.fromDate || filters.toDate);

  const openEditModal = (entry: TradeRecord) => {
    setEditingEntry(entry);
    setEditProfit(String(entry.myProfit));
    setEditCapital(entry.capitalUsed !== null ? String(entry.capitalUsed) : '');
    setEditDate(entry.tradeDate);
    setEditErrors({});
    setEditSubmitError(null);
  };

  const closeEditModal = () => {
    if (isUpdating) return;
    setEditingEntry(null);
    setEditErrors({});
    setEditSubmitError(null);
  };

  const handleConfirmUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingEntry) return;
    setEditSubmitError(null);

    const validation = validateTradeInput({
      myProfit: editProfit,
      capitalUsed: editCapital,
      tradeDate: editDate,
    });

    if (!validation.valid) {
      setEditErrors(validation.errors);
      return;
    }

    setEditErrors({});
    setIsUpdating(true);
    try {
      await onUpdateEntry(editingEntry.id, validation.value);
      setEditingEntry(null);
    } catch (err) {
      setEditSubmitError(
        err instanceof Error ? err.message : 'Failed to update entry. Please try again.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await onDeleteEntry(deletingEntry.id);
      setDeletingEntry(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete entry. Please try again.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-xl p-6 space-y-4 animate-pulse">
        <div className="h-10 bg-slate-100 dark:bg-burgundy-elevated rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 bg-slate-100 dark:bg-burgundy-elevated/70 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Search & Date Filters */}
      <section
        aria-label="Filter trade history"
        className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-3.5 sm:p-4"
      >
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 sm:gap-3 items-end">
          <div className="col-span-2 md:col-span-5">
            <label
              htmlFor="history-search"
              className="block text-xs font-medium text-slate-600 dark:text-burgundy-muted"
            >
              Search
            </label>
            <div className="mt-1 relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-burgundy-muted/70"
                aria-hidden="true"
              />
              <input
                id="history-search"
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search by date, profit, capital..."
                className="block w-full rounded-xl sm:rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input pl-9 pr-3 py-2.5 sm:py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-burgundy-muted/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
              />
            </div>
          </div>

          <div className="col-span-1 md:col-span-3">
            <label
              htmlFor="history-from-date"
              className="block text-xs font-medium text-slate-600 dark:text-burgundy-muted"
            >
              From Date
            </label>
            <input
              id="history-from-date"
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className="mt-1 block w-full rounded-xl sm:rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input px-2.5 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
            />
          </div>

          <div className="col-span-1 md:col-span-3">
            <label
              htmlFor="history-to-date"
              className="block text-xs font-medium text-slate-600 dark:text-burgundy-muted"
            >
              To Date
            </label>
            <input
              id="history-to-date"
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className="mt-1 block w-full rounded-xl sm:rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input px-2.5 sm:px-3 py-2.5 sm:py-2 text-xs sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
            />
          </div>

          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button
              type="button"
              onClick={() => setFilters({ search: '', fromDate: '', toDate: '' })}
              disabled={!hasActiveFilters}
              className="w-full md:w-auto px-3 py-2.5 sm:py-2 rounded-xl sm:rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-xs font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover disabled:opacity-40 whitespace-nowrap"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* Trade History List / Table */}
      <section className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-burgundy-border flex items-center justify-between gap-4">
          <p className="text-xs text-slate-600 dark:text-burgundy-muted">
            Showing{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {filteredEntries.length}
            </span>{' '}
            of{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {entries.length}
            </span>{' '}
            {entries.length === 1 ? 'entry' : 'entries'} · Newest first
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="px-5 sm:px-6 py-10 sm:py-12 text-center">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No trade entries yet
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-burgundy-muted">
              Your logged profit entries will appear here in newest-first order.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('add')}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl sm:rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover transition-colors min-h-[44px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add First Entry</span>
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-5 sm:px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No entries match your filters
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-burgundy-muted">
              Try adjusting your search query or date range.
            </p>
            <button
              type="button"
              onClick={() => setFilters({ search: '', fromDate: '', toDate: '' })}
              className="mt-4 px-4 py-2.5 rounded-xl sm:rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Compact Entry Rows (zero horizontal overflow) */}
            <div className="sm:hidden divide-y divide-slate-100 dark:divide-burgundy-border/70">
              {filteredEntries.map((entry) => {
                const roi = calculateTradeROI(entry.myProfit, entry.capitalUsed, totalCapitalUsed);
                const dateFormatted = formatIndianDate(entry.tradeDate);
                return (
                  <div
                    key={entry.id}
                    className="px-4 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono tabular-nums text-xs font-medium text-slate-600 dark:text-slate-200">
                          {dateFormatted}
                        </span>
                        <span
                          className={`font-mono tabular-nums text-base font-bold ${
                            entry.myProfit < 0
                              ? 'text-red-600 dark:text-[#ff4545]'
                              : 'text-emerald-600 dark:text-[#00e000]'
                          }`}
                        >
                          {formatINR(entry.myProfit)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-burgundy-muted">
                        <span className="font-mono tabular-nums truncate">
                          Capital:{' '}
                          {entry.capitalUsed !== null ? formatINR(entry.capitalUsed) : '—'}
                        </span>
                        <span
                          className={`font-mono tabular-nums shrink-0 ${
                            roi !== null && roi < 0 ? 'text-red-600 dark:text-[#ff4545]' : ''
                          }`}
                        >
                          ROI: {roi !== null ? formatPercentage(roi) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(entry)}
                        aria-label={`Edit ${formatINR(entry.myProfit)} entry on ${dateFormatted}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-burgundy-hover"
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingEntry(entry);
                          setDeleteError(null);
                        }}
                        aria-label={`Delete ${formatINR(entry.myProfit)} entry on ${dateFormatted}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-red-200 dark:border-red-500/40 bg-white dark:bg-burgundy-elevated text-red-600 dark:text-[#ff4545] hover:bg-red-50 dark:hover:bg-red-950/60"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet 5-Column Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-burgundy-border bg-slate-50/80 dark:bg-burgundy-elevated/80 text-xs font-semibold text-slate-600 dark:text-burgundy-muted">
                    <th className="py-3 pl-6 pr-4">Date</th>
                    <th className="py-3 px-4 text-right">My Profit</th>
                    <th className="py-3 px-4 text-right">Capital Used</th>
                    <th className="py-3 px-4 text-right">ROI</th>
                    <th className="py-3 pl-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-burgundy-border/70 text-sm">
                  {filteredEntries.map((entry) => {
                    const roi = calculateTradeROI(
                      entry.myProfit,
                      entry.capitalUsed,
                      totalCapitalUsed
                    );
                    const dateFormatted = formatIndianDate(entry.tradeDate);
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-burgundy-elevated/70 transition-colors"
                      >
                        <td className="py-3.5 pl-6 pr-4 font-mono tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            entry.myProfit < 0
                              ? 'text-red-600 dark:text-[#ff4545]'
                              : 'text-emerald-600 dark:text-[#00e000]'
                          }`}
                        >
                          {formatINR(entry.myProfit)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {entry.capitalUsed !== null ? formatINR(entry.capitalUsed) : '—'}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap ${
                            roi !== null && roi < 0
                              ? 'text-red-600 dark:text-[#ff4545]'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {roi !== null ? formatPercentage(roi) : '—'}
                        </td>
                        <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              aria-label={`Edit ${formatINR(entry.myProfit)} entry on ${dateFormatted}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-xs font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-burgundy-hover transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingEntry(entry);
                                setDeleteError(null);
                              }}
                              aria-label={`Delete ${formatINR(entry.myProfit)} entry on ${dateFormatted}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-500/40 bg-white dark:bg-burgundy-elevated text-xs font-medium text-red-700 dark:text-[#ff4545] hover:bg-red-50 dark:hover:bg-red-950/60 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-entry-title"
        >
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border-strong rounded-xl w-full max-w-md overflow-hidden shadow-lg">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-burgundy-border flex items-center justify-between">
              <h2
                id="edit-entry-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Edit Profit Entry
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                aria-label="Close edit dialog"
                className="p-1.5 rounded-lg text-slate-500 dark:text-burgundy-muted hover:bg-slate-100 dark:hover:bg-burgundy-elevated"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleConfirmUpdate} noValidate className="p-6 space-y-4">
              {editSubmitError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-950/60 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200 flex items-start gap-2"
                >
                  <AlertCircle
                    className="w-4 h-4 text-red-600 dark:text-[#ff4545] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{editSubmitError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="edit-profit"
                  className="block text-sm font-medium text-slate-900 dark:text-slate-100"
                >
                  My Profit / Loss Amount (₹) <span className="text-red-600 dark:text-[#ff4545]">*</span>
                </label>
                <input
                  id="edit-profit"
                  type="number"
                  step="any"
                  value={editProfit}
                  onChange={(e) => {
                    setEditProfit(e.target.value);
                    setEditErrors((prev) => ({ ...prev, myProfit: undefined }));
                  }}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
                />
                {editErrors.myProfit && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-[#ff4545]">
                    {editErrors.myProfit}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-capital"
                  className="block text-sm font-medium text-slate-900 dark:text-slate-100"
                >
                  Capital Used (₹){' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-burgundy-muted">
                    Optional
                  </span>
                </label>
                <input
                  id="edit-capital"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={editCapital}
                  onChange={(e) => {
                    setEditCapital(e.target.value);
                    setEditErrors((prev) => ({ ...prev, capitalUsed: undefined }));
                  }}
                  placeholder="Leave blank if not tracked"
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-burgundy-muted/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
                />
                {editErrors.capitalUsed && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-[#ff4545]">
                    {editErrors.capitalUsed}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-date"
                  className="block text-sm font-medium text-slate-900 dark:text-slate-100"
                >
                  Trade Date <span className="text-red-600 dark:text-[#ff4545]">*</span>
                </label>
                <input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => {
                    setEditDate(e.target.value);
                    setEditErrors((prev) => ({ ...prev, tradeDate: undefined }));
                  }}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-input px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-accent-cyan/25 focus:border-emerald-600 dark:focus:border-accent-cyan"
                />
                {editErrors.tradeDate && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-[#ff4545]">
                    {editErrors.tradeDate}
                  </p>
                )}
              </div>

              {(storageMode === 'sheets' || storageMode === 'cloud') && (
                <p className="text-xs text-slate-600 dark:text-burgundy-muted bg-slate-50 dark:bg-burgundy-elevated border border-slate-200 dark:border-burgundy-border rounded-lg px-3 py-2">
                  Confirming will update entry <span className="font-mono text-slate-900 dark:text-slate-100">{editingEntry.id}</span>{' '}
                  {storageMode === 'sheets'
                    ? 'across your synced devices and connected Google Sheet.'
                    : 'across all devices signed into your Google account.'}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover disabled:opacity-60"
                >
                  {isUpdating ? 'Saving...' : 'Confirm & Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-title"
        >
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border-strong rounded-xl w-full max-w-md overflow-hidden shadow-lg">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-burgundy-border flex items-center justify-between">
              <h2
                id="delete-entry-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Delete Profit Entry
              </h2>
              <button
                type="button"
                onClick={() => !isDeleting && setDeletingEntry(null)}
                aria-label="Close delete confirmation"
                className="p-1.5 rounded-lg text-slate-500 dark:text-burgundy-muted hover:bg-slate-100 dark:hover:bg-burgundy-elevated"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 dark:text-burgundy-muted">
                Are you sure you want to permanently delete this entry
                {storageMode === 'sheets'
                  ? ' from your synced Cloud Account and Google Sheet'
                  : storageMode === 'cloud'
                    ? ' from your synced Cloud Account across all devices'
                    : ''}
                ? This action cannot be undone.
              </p>

              <div className="rounded-lg border border-slate-200 dark:border-burgundy-border bg-slate-50 dark:bg-burgundy-elevated px-4 py-3 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-burgundy-muted">Trade Date</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {formatIndianDate(deletingEntry.tradeDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-burgundy-muted">My Profit</span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      deletingEntry.myProfit < 0
                        ? 'text-red-600 dark:text-[#ff4545]'
                        : 'text-emerald-700 dark:text-[#00e000]'
                    }`}
                  >
                    {formatINR(deletingEntry.myProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-burgundy-muted">Capital Used</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {deletingEntry.capitalUsed !== null
                      ? formatINR(deletingEntry.capitalUsed)
                      : 'Not recorded'}
                  </span>
                </div>
              </div>

              {deleteError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-950/60 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200"
                >
                  {deleteError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingEntry(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
