import test from 'node:test';
import assert from 'node:assert/strict';
import type { TradeRecord } from '../types/trade';
import {
  calculateDashboardMetrics,
  calculateEntryROI,
  calculatePeriodAnalysis,
  calculateTotalProfitLoss,
  filterAndSortEntries,
  shiftAnchorDate,
  validateTradeInput,
} from './calculations';
import {
  extractSpreadsheetId,
  formatIndianDate,
  formatIndianDateLong,
  formatINR,
} from './formatters';

const makeRecord = (
  id: string,
  tradeDate: string,
  myProfit: number,
  capitalUsed: number | null,
  createdAt = `${tradeDate}T10:00:00.000Z`
): TradeRecord => ({
  id,
  tradeDate,
  myProfit,
  capitalUsed,
  createdAt,
  updatedAt: createdAt,
});

test('entered profit is NEVER divided by 2 (already user 50% share)', () => {
  const entries = [
    makeRecord('1', '2026-11-20', 12500, 100000),
    makeRecord('2', '2026-11-19', 7500, 50000),
  ];

  const metrics = calculateDashboardMetrics(entries);
  assert.equal(metrics.totalNetProfit, 20000);
  assert.equal(metrics.totalCapitalUsed, 150000);
  assert.equal(metrics.totalEntries, 2);
  assert.equal(metrics.averageProfit, 10000);
  assert.ok(metrics.overallROI !== null);
  assert.equal(Number(metrics.overallROI.toFixed(2)), 13.33);
  assert.equal(metrics.isPartialROI, false);
});

test('missing capital is NEVER treated as zero for ROI calculations', () => {
  // No capital on any entry -> overallROI must be null
  const noCapitalMetrics = calculateDashboardMetrics([
    makeRecord('1', '2026-11-20', 15000, null),
    makeRecord('2', '2026-11-19', 5000, null),
  ]);
  assert.equal(noCapitalMetrics.totalNetProfit, 20000);
  assert.equal(noCapitalMetrics.totalCapitalUsed, 0);
  assert.equal(noCapitalMetrics.overallROI, null);
  assert.equal(noCapitalMetrics.entriesWithCapitalCount, 0);

  // Mixed entries: Entry 1 has ₹10,000 profit on ₹1,00,000 capital (10% ROI),
  // Entry 2 has ₹50,000 profit with NO capital recorded.
  // Overall ROI must stay 10% (based on Entry 1), NOT jump to 60%!
  const mixedMetrics = calculateDashboardMetrics([
    makeRecord('1', '2026-11-20', 10000, 100000),
    makeRecord('2', '2026-11-19', 50000, null),
  ]);
  assert.equal(mixedMetrics.totalNetProfit, 60000);
  assert.equal(mixedMetrics.totalCapitalUsed, 100000);
  assert.equal(mixedMetrics.entriesWithCapitalCount, 1);
  assert.equal(mixedMetrics.isPartialROI, true);
  assert.ok(mixedMetrics.overallROI !== null);
  assert.equal(Number(mixedMetrics.overallROI.toFixed(2)), 10);

  // Explicit zero capital yields null per-entry ROI (no Infinity)
  assert.equal(calculateEntryROI(5000, 0), null);
  assert.equal(calculateEntryROI(5000, null), null);
  assert.equal(calculateEntryROI(5000, 50000), 10);
});

test('trade input validation enforces positive profit, optional non-negative capital, and valid date', () => {
  const emptyProfit = validateTradeInput({ tradeDate: '2026-11-20', myProfit: '', capitalUsed: '' });
  assert.equal(emptyProfit.valid, false);
  if (!emptyProfit.valid) assert.ok(emptyProfit.errors.myProfit);

  const zeroProfit = validateTradeInput({ tradeDate: '2026-11-20', myProfit: '0', capitalUsed: '50000' });
  assert.equal(zeroProfit.valid, false);

  const negativeProfit = validateTradeInput({ tradeDate: '2026-11-20', myProfit: '-500', capitalUsed: '' });
  assert.equal(negativeProfit.valid, false);

  const negativeCapital = validateTradeInput({ tradeDate: '2026-11-20', myProfit: '5000', capitalUsed: '-1' });
  assert.equal(negativeCapital.valid, false);
  if (!negativeCapital.valid) assert.ok(negativeCapital.errors.capitalUsed);

  const validWithoutCapital = validateTradeInput({
    tradeDate: '2026-11-20',
    myProfit: '12500.5',
    capitalUsed: '',
  });
  assert.equal(validWithoutCapital.valid, true);
  if (validWithoutCapital.valid) {
    assert.equal(validWithoutCapital.value.myProfit, 12500.5);
    assert.equal(validWithoutCapital.value.capitalUsed, null);
  }

  const validZeroCapital = validateTradeInput({
    tradeDate: '2026-11-20',
    myProfit: '4200',
    capitalUsed: '0',
  });
  assert.equal(validZeroCapital.valid, true);
  if (validZeroCapital.valid) {
    assert.equal(validZeroCapital.value.capitalUsed, 0);
  }
});

test('period analysis calculates Daily, Weekly, Monthly, Yearly comparisons accurately', () => {
  const entries = [
    makeRecord('1', '2026-11-20', 10000, 100000),
    makeRecord('2', '2026-11-19', 5000, 50000),
    makeRecord('3', '2026-11-10', 8000, 80000),
    makeRecord('4', '2026-10-15', 12000, 100000),
    makeRecord('5', '2025-08-05', 20000, 200000),
  ];

  // Daily: 2026-11-20 vs 2026-11-19
  const daily = calculatePeriodAnalysis(entries, 'daily', '2026-11-20');
  assert.equal(daily.currentProfit, 10000);
  assert.equal(daily.previousProfit, 5000);
  assert.equal(daily.profitChange, 5000);
  assert.equal(daily.profitChangePercent, 100);
  assert.equal(daily.series.length, 14);

  // Weekly: week of 2026-11-20 (Mon 16 Nov – Sun 22 Nov) vs prev week (Mon 9 Nov – Sun 15 Nov)
  const weekly = calculatePeriodAnalysis(entries, 'weekly', '2026-11-20');
  assert.equal(weekly.currentProfit, 15000);
  assert.equal(weekly.previousProfit, 8000);
  assert.equal(weekly.currentEntriesCount, 2);
  assert.equal(weekly.currentCapitalUsed, 150000);
  assert.equal(weekly.series.length, 7);

  // Monthly: Nov 2026 vs Oct 2026
  const monthly = calculatePeriodAnalysis(entries, 'monthly', '2026-11-20');
  assert.equal(monthly.currentProfit, 23000);
  assert.equal(monthly.previousProfit, 12000);
  assert.equal(monthly.currentEntriesCount, 3);
  assert.equal(monthly.series.length, 30);

  // Yearly: 2026 vs 2025
  const yearly = calculatePeriodAnalysis(entries, 'yearly', '2026-11-20');
  assert.equal(yearly.currentProfit, 35000);
  assert.equal(yearly.previousProfit, 20000);
  assert.equal(yearly.currentEntriesCount, 4);
  assert.equal(yearly.series.length, 12);

  // Period shifting
  assert.equal(shiftAnchorDate('2026-11-20', 'daily', -1), '2026-11-19');
  assert.equal(shiftAnchorDate('2026-11-20', 'weekly', -1), '2026-11-13');
  assert.equal(shiftAnchorDate('2026-11-20', 'monthly', -1), '2026-10-01');
  assert.equal(shiftAnchorDate('2026-11-20', 'yearly', -1), '2025-01-01');
});

test('history sorting places newest entries first and filters by search & date range', () => {
  const entries = [
    makeRecord('a', '2026-11-10', 4000, 40000),
    makeRecord('b', '2026-11-20', 12000, 100000),
    makeRecord('c', '2026-11-15', 8500, null),
  ];

  const sorted = filterAndSortEntries(entries, { search: '', fromDate: '', toDate: '' });
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['b', 'c', 'a']
  );

  const byDateRange = filterAndSortEntries(entries, {
    search: '',
    fromDate: '2026-11-12',
    toDate: '2026-11-18',
  });
  assert.deepEqual(
    byDateRange.map((e) => e.id),
    ['c']
  );

  const bySearch = filterAndSortEntries(entries, {
    search: '20/11/2026',
    fromDate: '',
    toDate: '',
  });
  assert.deepEqual(
    bySearch.map((e) => e.id),
    ['b']
  );
});

test('Indian currency, Indian date formatting, and Spreadsheet ID parsing work accurately', () => {
  assert.equal(formatINR(125000), '₹1,25,000');
  assert.equal(formatINR(42500.5), '₹42,500.5');
  assert.equal(formatINR(-15000), '-₹15,000');
  assert.equal(formatIndianDate('2026-11-20'), '20/11/2026');
  assert.equal(formatIndianDateLong('2026-11-20'), '20 Nov 2026');

  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(
    extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(extractSpreadsheetId('short'), null);
});

test('calculateTotalProfitLoss sums all profit and loss entries accurately', () => {
  assert.equal(calculateTotalProfitLoss([]), 0);
  const mixed = [
    makeRecord('1', '2026-11-20', 15000, 100000),
    makeRecord('2', '2026-11-19', -4500.5, 50000),
    makeRecord('3', '2026-11-18', 8200.25, null),
  ];
  assert.equal(calculateTotalProfitLoss(mixed), 18699.75);
});
