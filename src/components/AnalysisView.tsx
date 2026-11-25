import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, ChevronLeft, ChevronRight, LineChart as LineChartIcon } from 'lucide-react';
import type { AnalysisPeriod, ChartType, PeriodSeriesPoint, TradeRecord } from '../types/trade';
import type { ThemeMode } from './SidebarLayout';
import { calculatePeriodAnalysis, shiftAnchorDate } from '../utils/calculations';
import {
  formatCompactINR,
  formatINR,
  formatPercentage,
  getTodayISODate,
} from '../utils/formatters';

interface AnalysisViewProps {
  entries: TradeRecord[];
  isLoading: boolean;
  theme: ThemeMode;
}

const PERIOD_OPTIONS: Array<{ id: AnalysisPeriod; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

export const AnalysisView: React.FC<AnalysisViewProps> = ({ entries, isLoading, theme }) => {
  const isDark = theme === 'dark';
  const [period, setPeriod] = useState<AnalysisPeriod>('monthly');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [anchorDate, setAnchorDate] = useState<string>(() => getTodayISODate());

  const analysis = useMemo(
    () => calculatePeriodAnalysis(entries, period, anchorDate),
    [entries, period, anchorDate]
  );

  const todayISO = getTodayISODate();

  const handleShiftPeriod = (direction: -1 | 1) => {
    setAnchorDate((prev) => shiftAnchorDate(prev, period, direction));
  };

  const chartColors = {
    grid: isDark ? '#522034' : '#e2e8f0',
    axis: isDark ? '#6e2c46' : '#e2e8f0',
    tick: isDark ? '#d1b8c1' : '#64748b',
    cursor: isDark ? 'rgba(6, 182, 212, 0.12)' : '#f1f5f9',
    series: isDark ? '#00e000' : '#00c400',
    lossSeries: isDark ? '#ff0000' : '#e60000',
    lineStroke: isDark ? '#06b6d4' : '#00b800',
    activeDot: isDark ? '#22d3ee' : '#00a000',
    activeDotStroke: isDark ? '#280d17' : '#ffffff',
  };

  const renderTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: PeriodSeriesPoint }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
      <div className="bg-white dark:bg-burgundy-input border border-slate-200 dark:border-burgundy-border-strong rounded-lg px-3.5 py-2.5 text-xs shadow-sm">
        <p className="font-semibold text-slate-900 dark:text-slate-100">{point.fullLabel}</p>
        <div className="mt-1.5 space-y-1 font-mono tabular-nums">
          <p
            className={`font-semibold ${
              point.profit < 0
                ? 'text-red-600 dark:text-[#ff4545]'
                : 'text-emerald-700 dark:text-[#00e000]'
            }`}
          >
            My Profit / Loss: {formatINR(point.profit)}
          </p>
          <p className="text-slate-600 dark:text-slate-200">
            Capital Used: {point.capital > 0 ? formatINR(point.capital) : '—'}
          </p>
          <p className="text-slate-500 dark:text-burgundy-muted font-sans">
            {point.entries} {point.entries === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading profit analysis">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-xl p-5 h-28 animate-pulse"
            />
          ))}
        </div>
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-xl p-6 h-96 animate-pulse" />
      </div>
    );
  }

  const comparisonTone =
    analysis.profitChange > 0
      ? 'text-emerald-600 dark:text-[#00e000]'
      : analysis.profitChange < 0
        ? 'text-red-600 dark:text-[#ff4545]'
        : 'text-slate-700 dark:text-burgundy-muted';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filter & Navigation Toolbar */}
      <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
        {/* Period Filter Segmented Control */}
        <div
          role="tablist"
          aria-label="Analysis period filter"
          className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-burgundy-input rounded-xl sm:rounded-lg w-full sm:w-auto sm:self-start"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(opt.id)}
                className={`px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs font-semibold whitespace-nowrap text-center focus-visible:outline-2 focus-visible:outline-emerald-600 dark:focus-visible:outline-accent-cyan ${
                  active
                    ? 'bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas shadow-xs'
                    : 'text-slate-600 dark:text-burgundy-muted hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Date Period Stepper */}
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <button
            type="button"
            onClick={() => handleShiftPeriod(-1)}
            aria-label={`Previous ${period} period`}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span
            data-testid="analysis-period-label"
            className="px-2 sm:px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono tabular-nums whitespace-nowrap text-center truncate"
          >
            {analysis.periodLabel}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleShiftPeriod(1)}
              aria-label={`Next ${period} period`}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            {anchorDate !== todayISO && (
              <button
                type="button"
                onClick={() => setAnchorDate(todayISO)}
                className="px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 dark:border-burgundy-border-strong bg-white dark:bg-burgundy-elevated text-xs font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-burgundy-hover whitespace-nowrap"
              >
                Current
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Period Summary Cards */}
      <section
        aria-label="Selected period metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* Total Profit for Selected Period */}
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted truncate">
            Profit ({analysis.periodLabel})
          </p>
          <p
            data-testid="analysis-period-profit"
            className={`mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight truncate ${
              analysis.currentProfit > 0
                ? 'text-emerald-600 dark:text-[#00e000]'
                : analysis.currentProfit < 0
                  ? 'text-red-600 dark:text-[#ff4545]'
                  : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatINR(analysis.currentProfit)}
          </p>
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted truncate">
            Prev:{' '}
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
              {formatINR(analysis.previousProfit)}
            </span>
          </p>
        </div>

        {/* Comparison with Previous Period */}
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">
            vs. Previous
          </p>
          <p
            data-testid="analysis-period-change"
            className={`mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight truncate ${comparisonTone}`}
          >
            {formatINR(analysis.profitChange, { showSign: true })}
          </p>
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted truncate">
            {analysis.profitChangePercent !== null ? (
              <span className={`font-mono tabular-nums font-medium ${comparisonTone}`}>
                {formatPercentage(analysis.profitChangePercent, { showSign: true, decimals: 1 })}
              </span>
            ) : analysis.currentProfit > 0 ? (
              <span>No prev profit</span>
            ) : (
              <span>No change</span>
            )}
          </p>
        </div>

        {/* Number of Entries */}
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">Entries</p>
          <p
            data-testid="analysis-period-entries"
            className="mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-100"
          >
            {analysis.currentEntriesCount}
          </p>
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted">
            Previous:{' '}
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
              {analysis.previousEntriesCount}
            </span>
          </p>
        </div>

        {/* Capital Used During Period */}
        <div className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-burgundy-muted">
            Capital Used
          </p>
          <p
            data-testid="analysis-period-capital"
            className="mt-2 sm:mt-2.5 text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-100 truncate"
          >
            {analysis.currentCapitalUsed > 0 ? formatINR(analysis.currentCapitalUsed) : '—'}
          </p>
          <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 dark:text-burgundy-muted truncate">
            {analysis.currentROI !== null ? (
              <>
                ROI:{' '}
                <span
                  className={`font-mono tabular-nums font-medium ${
                    analysis.currentROI < 0
                      ? 'text-red-600 dark:text-[#ff4545]'
                      : 'text-emerald-700 dark:text-[#00e000]'
                  }`}
                >
                  {formatPercentage(analysis.currentROI)}
                </span>
              </>
            ) : (
              'No capital recorded'
            )}
          </p>
        </div>
      </section>

      {/* Chart Section with Bar / Line Switcher */}
      <section className="bg-white dark:bg-burgundy-card border border-slate-200 dark:border-burgundy-border rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Profit Trend
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-burgundy-muted">
              {analysis.chartRangeLabel}
            </p>
          </div>

          {/* Chart-Type Switch Button */}
          <div
            role="group"
            aria-label="Chart type selector"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-burgundy-input rounded-xl sm:rounded-lg w-full sm:w-auto"
          >
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-pressed={chartType === 'bar'}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs font-semibold whitespace-nowrap ${
                chartType === 'bar'
                  ? 'bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas shadow-xs'
                  : 'text-slate-600 dark:text-burgundy-muted hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Bar Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              aria-pressed={chartType === 'line'}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs font-semibold whitespace-nowrap ${
                chartType === 'line'
                  ? 'bg-emerald-600 dark:bg-accent-cyan text-white dark:text-burgundy-canvas shadow-xs'
                  : 'text-slate-600 dark:text-burgundy-muted hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Line Chart</span>
            </button>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 h-64 sm:h-80 w-full" data-testid={`analysis-chart-${chartType}`}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={analysis.series} margin={{ top: 10, right: 8, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickLine={false}
                  interval={period === 'monthly' ? 2 : 0}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactINR(Number(v))}
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip cursor={{ fill: chartColors.cursor }} content={renderTooltip} />
                <ReferenceLine y={0} stroke={chartColors.axis} />
                <Bar
                  dataKey="profit"
                  fill={chartColors.series}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={false}
                >
                  {analysis.series.map((point) => (
                    <Cell
                      key={point.key}
                      fill={point.profit < 0 ? chartColors.lossSeries : chartColors.series}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={analysis.series} margin={{ top: 10, right: 8, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  axisLine={{ stroke: chartColors.axis }}
                  tickLine={false}
                  interval={period === 'monthly' ? 2 : 0}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactINR(Number(v))}
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={renderTooltip} />
                <ReferenceLine y={0} stroke={chartColors.axis} />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke={chartColors.lineStroke}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: chartColors.lineStroke, strokeWidth: 0 }}
                  activeDot={{
                    r: 5.5,
                    fill: chartColors.activeDot,
                    stroke: chartColors.activeDotStroke,
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {entries.length === 0 && (
          <p className="mt-4 text-center text-xs text-slate-500 dark:text-burgundy-muted">
            No profit records have been logged yet. Add entries to populate this chart.
          </p>
        )}
      </section>
    </div>
  );
};
