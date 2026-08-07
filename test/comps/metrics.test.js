import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntityMetrics, buildFinancialsSeries } from '../../src/backend/comps/metrics.js';

const PROFILE = [{ symbol: 'MSFT', companyName: 'Microsoft Corporation', price: 500, sector: 'Technology', industry: 'Software' }];
const INCOME = [{ date: '2026-06-30', revenue: 250000000000, operatingIncome: 110000000000, ebitda: 125000000000, incomeBeforeTax: 108000000000, incomeTaxExpense: 21600000000, weightedAverageShsOutDil: 7430000000 }];
const BALANCE = [{ date: '2026-06-30', cashAndCashEquivalents: 75000000000, totalDebt: 45000000000 }];
const CASHFLOW = [{ date: '2026-06-30', freeCashFlow: 66987000000, netCashProvidedByOperatingActivities: 182935000000, capitalExpenditure: -115948000000 }];

test('buildEntityMetrics derives a full metrics set from clean FMP-shaped data', () => {
  const { metrics, warnings } = buildEntityMetrics('MSFT', {
    profileRaw: PROFILE, incomeRaw: INCOME, balanceRaw: BALANCE, cashflowRaw: CASHFLOW,
  });
  assert.equal(warnings.length, 0);
  assert.equal(metrics.name, 'Microsoft Corporation');
  assert.ok(Math.abs(metrics.dilutedShares - 7430) < 1e-6); // millions
  assert.ok(Math.abs(metrics.marketCap - 500 * 7430) < 1e-6); // price * shares(M)
  assert.ok(Math.abs(metrics.netIncome - (108000000000 - 21600000000) / 1e6) < 1e-6);
  assert.ok(Math.abs(metrics.fcf - 66987000000 / 1e6) < 1e-6); // prefers freeCashFlow field directly
  const expectedEV = metrics.marketCap - metrics.cash + metrics.debt;
  assert.ok(Math.abs(metrics.enterpriseValue - expectedEV) < 1e-6);
});

test('buildEntityMetrics falls back to operating-cash-flow minus capex when freeCashFlow is missing', () => {
  const cashflowNoFcf = [{ date: '2026-06-30', netCashProvidedByOperatingActivities: 182935000000, capitalExpenditure: -115948000000 }];
  const { metrics } = buildEntityMetrics('MSFT', { profileRaw: PROFILE, incomeRaw: INCOME, balanceRaw: BALANCE, cashflowRaw: cashflowNoFcf });
  assert.ok(Math.abs(metrics.fcf - (182935000000 - 115948000000) / 1e6) < 1e-6);
});

test('buildEntityMetrics returns null metrics with a warning when a statement type is missing', () => {
  const { metrics, warnings } = buildEntityMetrics('XYZ', { profileRaw: [], incomeRaw: INCOME, balanceRaw: BALANCE, cashflowRaw: CASHFLOW });
  assert.equal(metrics, null);
  assert.ok(warnings.some((w) => w.includes('XYZ')));
});

test('buildFinancialsSeries sorts oldest-first and aligns income/cashflow rows by index', () => {
  const incomeArr = [
    { date: '2026-06-30', revenue: 250000000000, ebitda: 125000000000, incomeBeforeTax: 108000000000, incomeTaxExpense: 21600000000 },
    { date: '2025-06-30', revenue: 230000000000, ebitda: 114000000000, incomeBeforeTax: 98000000000, incomeTaxExpense: 19600000000 },
  ];
  const cashflowArr = [
    { date: '2026-06-30', freeCashFlow: 66987000000 },
    { date: '2025-06-30', freeCashFlow: 60000000000 },
  ];
  const series = buildFinancialsSeries(incomeArr, cashflowArr);
  assert.equal(series[0].fiscalYear, '2025-06-30');
  assert.equal(series[1].fiscalYear, '2026-06-30');
  assert.ok(Math.abs(series[1].fcf - 66987000000 / 1e6) < 1e-6);
});
