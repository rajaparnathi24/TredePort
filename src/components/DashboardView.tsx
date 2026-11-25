import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Plus, TrendingUp } from 'lucide-react';
import type { NavSection, StorageMode, TradeRecord } from '../types/trade';
import type { ThemeMode } from './SidebarLayout';
import {
  calculateDashboardMetrics,
  calculatePeriodAnalysis,
  calculateTradeROI,
  filterAndSortEntries,
} from '../utils/calculations';
import {
  formatCompactINR,
  formatIndianDate,
  formatINR,
  formatPercentage,
  getTodayISODate,
} from '../utils/formatters';

interface DashboardViewProps {
  entries: TradeRecord[];
  isLoading: boolean;
  storageMode: StorageMode;
  theme: ThemeMode;
  onNavigate: (section: NavSection) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  entries,
  isLoading,
  storageMode,
  theme,
  onNavigate,
}) => {
  const isDark = theme === 'dark';
  const metrics = useMemo(() => calculateDashboardMetrics(entries), [entries]);
  const recentEntries = useMemo(
    () => filterAndSortEntries(entries, { search: '', fromDate: '', toDate: '' }).slice(0, 6),
    [entries]
  );

  // Anchor the 14-day overview on today or the newest entry date if later
  const trendAnchor = useMemo(() => {
    const today = getTodayISODate();
    if (recentEntries.length > 0 && recentEntries[0].tradeDate > today) {
      return recentEntries[0].tradeDate;
    }
    return today;
  }, [recentEntries]);

  const dailyTrend = useMemo(
    () => calculatePeriodAnalysis(entries, 'daily', trendAnchor),
    [entries, trendAnchor]
  );

  const chartColors = {
    grid: isDark ? '#522034' : '#e2e8f0',
    axis: isDark ? '#6e2c46' : '#e2e8f0',
    tick: isDark ? '#d1b8c1' : '#64748b',
    cursor: isDark ? 'rgba(6, 182, 212, 0.12)' : '#f1f5f9',
    bar: isDark ? '#00e000' : '#00c400',
    lossBar: isDark ? '#ff0000' : '#e60000',
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading dashboard metrics">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className={`bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 animate-pulse ${
                idx === 0 ? 'col-span-2 xl:col-span-1' : ''
              }`}
            >
              <div className="h-3.5 w-24 bg-slate-200 dark:bg-burgundy-elevated rounded" />
              <div className="mt-3 h-7 w-28 bg-slate-200 dark:bg-burgundy-elevated rounded" />
              <div className="mt-2.5 h-3 w-24 bg-slate-100 dark:bg-burgundy-elevated/70 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-5 h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Primary KPI Grid — 5 requested metrics (mobile: hero card + 2x2 grid; desktop: 5 cols) */}
      <section aria-label="Key trading profit metrics">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          {/* 1. Total Net Profit */}
          <div className="col-span-2 xl:col-span-1 bg-emerald-50/75 dark:bg-burgundy-elevated xl:bg-white xl:dark:bg-burgundy-card border border-emerald-200/80 dark:border-accent-cyan/40 xl:border-slate-200 xl:dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 flex items-center justify-between gap-3 xl:flex-col xl:items-stretch xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-900/80 dark:text-accent-cyan xl:text-slate-500 xl:dark:text-burgundy-muted">
                Total Net Profit
              </p>
              <p
                data-testid="kpi-total-profit"
                className={`mt-1.5 sm:mt-2.5 text-3xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight truncate ${
                  metrics.totalNetProfit > 0
                    ? 'text-emerald-700 dark:text-[#00e000]'
                    : metrics.totalNetProfit < 0
                      ? 'text-red-600 dark:text-[#ff4545]'
                      : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatINR(metrics.totalNetProfit)}
              </p>
              <p className="mt-1.5 sm:mt-2 text-xs text-slate-600 dark:text-burgundy-muted">
                Your 50% share · stored directly
              </p>
            </div>
            <span
              className="xl:hidden w-12 h-12 rounded-xl bg-emerald-600/10 dark:bg-accent-cyan/15 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-accent-cyan" />
            </span>
          </div>

          {/* 2. Total Recorded Capital Used */}
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">
              Capital Used
            </p>
            <p
              data-testid="kpi-total-capital"
              className="mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-100 truncate"
            >
              {metrics.entriesWithCapitalCount > 0 || metrics.totalCapitalUsed > 0
                ? formatINR(metrics.totalCapitalUsed)
                : '—'}
            </p>
            <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted leading-snug">
              {metrics.totalEntries === 0
                ? 'Optional field'
                : metrics.entriesWithCapitalCount > 0
                  ? `${metrics.entriesWithCapitalCount} of ${metrics.totalEntries} ${
                      metrics.totalEntries === 1 ? 'entry' : 'entries'
                    }`
                  : 'No capital entered'}
            </p>
          </div>

          {/* 3. Total Number of Entries */}
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">Total Entries</p>
            <p
              data-testid="kpi-total-entries"
              className="mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-100"
            >
              {metrics.totalEntries}
            </p>
            <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted leading-snug">
              {storageMode === 'sheets'
                ? 'Cloud + Sheets'
                : storageMode === 'cloud'
                  ? 'Synced across devices'
                  : 'Local storage'}
            </p>
          </div>

          {/* 4. Average Profit per Entry */}
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">
              Avg Profit / Entry
            </p>
            <p
              data-testid="kpi-average-profit"
              className={`mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight truncate ${
                metrics.averageProfit > 0
                  ? 'text-emerald-600 dark:text-[#00e000]'
                  : metrics.averageProfit < 0
                    ? 'text-red-600 dark:text-[#ff4545]'
                    : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {metrics.totalEntries > 0 ? formatINR(metrics.averageProfit) : '—'}
            </p>
            <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted leading-snug">
              {metrics.totalEntries > 0 ? 'Mean per trade' : 'Waiting for entries'}
            </p>
          </div>

          {/* 5. Overall ROI */}
          <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">Overall ROI</p>
            <p
              data-testid="kpi-overall-roi"
              className={`mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight ${
                metrics.overallROI === null
                  ? 'text-slate-400 dark:text-burgundy-muted/70'
                  : metrics.overallROI >= 0
                    ? 'text-emerald-600 dark:text-[#00e000]'
                    : 'text-red-600 dark:text-[#ff4545]'
              }`}
            >
              {metrics.overallROI !== null ? formatPercentage(metrics.overallROI) : '—'}
            </p>
            <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted leading-snug">
              {metrics.overallROI === null ? 'Needs capital' : 'Total Profit ÷ Capital × 100'}
            </p>
          </div>
        </div>
      </section>

      {/* Honest Empty State when no real records exist */}
      {entries.length === 0 ? (
        <section className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl px-5 sm:px-6 py-10 sm:py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            No profit entries recorded yet
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-burgundy-muted max-w-md mx-auto">
            Add your first trading profit entry to start tracking net profit, ROI, and trends. Enter
            only your 50% share—amounts are saved exactly as entered.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('add')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-lg bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-accent-cyan-hover transition-colors whitespace-nowrap min-h-[44px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add First Entry</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-slate-700 dark:text-slate-100 text-sm font-medium hover:bg-slate-50 dark:hover:bg-burgundy-hover transition-colors whitespace-nowrap min-h-[44px]"
            >
              <span>Connect Google Sheets</span>
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* 14-Day Profit Trend Preview */}
          <section className="xl:col-span-7 bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Profit Trend
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-burgundy-muted">
                  {dailyTrend.chartRangeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('analysis')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-accent-cyan hover:text-emerald-800 dark:hover:text-accent-cyan-hover whitespace-nowrap shrink-0 min-h-[36px]"
              >
                <span>Full Analysis</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 sm:mt-5 h-52 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyTrend.series}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: chartColors.tick }}
                    axisLine={{ stroke: chartColors.axis }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                    tick={{ fontSize: 11, fill: chartColors.tick }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip
                    cursor={{ fill: chartColors.cursor }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const point = payload[0]?.payload as
                        | {
                            fullLabel: string;
                            profit: number;
                            entries: number;
                          }
                        | undefined;
                      if (!point) return null;
                      return (
                        <div className="bg-white dark:bg-burgundy-input border border-slate-200 dark:border-burgundy-border-strong rounded-lg px-3 py-2 text-xs shadow-sm">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {point.fullLabel}
                          </p>
                          <p
                            className={`mt-1 font-mono tabular-nums font-semibold ${
                              point.profit < 0
                                ? 'text-red-600 dark:text-[#ff4545]'
                                : 'text-emerald-600 dark:text-[#00e000]'
                            }`}
                          >
                            {formatINR(point.profit)}
                          </p>
                          <p className="mt-0.5 text-slate-500 dark:text-burgundy-muted">
                            {point.entries} {point.entries === 1 ? 'entry' : 'entries'}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke={chartColors.axis} />
                  <Bar
                    dataKey="profit"
                    fill={chartColors.bar}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={false}
                  >
                    {dailyTrend.series.map((point) => (
                      <Cell
                        key={point.key}
                        fill={point.profit < 0 ? chartColors.lossBar : chartColors.bar}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Recent Entries Table */}
          <section className="xl:col-span-5 bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-burgundy-border flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Recent Entries
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-burgundy-muted">
                  Latest logged profit records
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-accent-cyan hover:text-emerald-800 dark:hover:text-accent-cyan-hover whitespace-nowrap shrink-0 min-h-[36px]"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-burgundy-border bg-slate-50/80 dark:bg-burgundy-elevated/80 text-xs font-medium text-slate-500 dark:text-burgundy-muted">
                    <th className="py-2.5 pl-4 sm:pl-6 pr-2 sm:pr-3">Date</th>
                    <th className="py-2.5 px-2 sm:px-3 text-right">My Profit</th>
                    <th className="py-2.5 pl-2 sm:pl-3 pr-4 sm:pr-6 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-burgundy-border/70 text-sm">
                  {recentEntries.map((entry) => {
                    const roi = calculateTradeROI(
                      entry.myProfit,
                      entry.capitalUsed,
                      metrics.totalCapitalUsed
                    );
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-burgundy-elevated/70 transition-colors"
                      >
                        <td className="py-3 pl-4 sm:pl-6 pr-2 sm:pr-3 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {formatIndianDate(entry.tradeDate)}
                        </td>
                        <td
                          className={`py-3 px-2 sm:px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            entry.myProfit < 0
                              ? 'text-red-600 dark:text-[#ff4545]'
                              : 'text-emerald-600 dark:text-[#00e000]'
                          }`}
                        >
                          {formatINR(entry.myProfit)}
                        </td>
                        <td
                          className={`py-3 pl-2 sm:pl-3 pr-4 sm:pr-6 text-right font-mono tabular-nums text-xs whitespace-nowrap ${
                            roi !== null && roi < 0
                              ? 'text-red-600 dark:text-[#ff4545]'
                              : 'text-slate-600 dark:text-slate-200'
                          }`}
                        >
                          {roi !== null ? formatPercentage(roi) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
