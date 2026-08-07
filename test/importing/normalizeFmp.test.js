import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfile,
  normalizeIncomeStatements,
  normalizeBalanceSheets,
  normalizeCashFlows,
  deriveEngineInputs,
} from '../../src/backend/importing/normalizeFmp.js';

// Fixtures shaped like FMP's documented response format (field names confirmed
// against site.financialmodelingprep.com/developer/docs/stable/*), with
// plausible-but-illustrative magnitudes — not real MSFT filings.

const PROFILE_FIXTURE = [{
  symbol: 'MSFT',
  companyName: 'Microsoft Corporation',
  price: 420.5,
  mktCap: 3120000000000,
  beta: 0.9,
  sector: 'Technology',
  industry: 'Software - Infrastructure',
  exchangeShortName: 'NASDAQ',
  currency: 'USD',
}];

// Most-recent-first, as FMP returns them.
const INCOME_FIXTURE = [
  { date: '2026-06-30', period: 'FY', revenue: 250000000000, operatingIncome: 110000000000, ebitda: 125000000000, depreciationAndAmortization: 15000000000, incomeBeforeTax: 108000000000, incomeTaxExpense: 21600000000, weightedAverageShsOutDil: 7430000000 },
  { date: '2025-06-30', period: 'FY', revenue: 230000000000, operatingIncome: 100000000000, ebitda: 114000000000, depreciationAndAmortization: 14000000000, incomeBeforeTax: 98000000000, incomeTaxExpense: 19600000000, weightedAverageShsOutDil: 7440000000 },
  { date: '2024-06-30', period: 'FY', revenue: 210000000000, operatingIncome: 90000000000, ebitda: 103000000000, depreciationAndAmortization: 13000000000, incomeBeforeTax: 88000000000, incomeTaxExpense: 17600000000, weightedAverageShsOutDil: 7450000000 },
  { date: '2023-06-30', period: 'FY', revenue: 195000000000, operatingIncome: 82000000000, ebitda: 94000000000, depreciationAndAmortization: 12000000000, incomeBeforeTax: 80000000000, incomeTaxExpense: 16000000000, weightedAverageShsOutDil: 7460000000 },
  { date: '2022-06-30', period: 'FY', revenue: 180000000000, operatingIncome: 75000000000, ebitda: 86000000000, depreciationAndAmortization: 11000000000, incomeBeforeTax: 73000000000, incomeTaxExpense: 14600000000, weightedAverageShsOutDil: 7470000000 },
];

const BALANCE_FIXTURE = [
  { date: '2026-06-30', cashAndCashEquivalents: 75000000000, totalDebt: 45000000000 },
  { date: '2025-06-30', cashAndCashEquivalents: 70000000000, totalDebt: 47000000000 },
  { date: '2024-06-30', cashAndCashEquivalents: 65000000000, totalDebt: 48000000000 },
  { date: '2023-06-30', cashAndCashEquivalents: 60000000000, totalDebt: 50000000000 },
  { date: '2022-06-30', cashAndCashEquivalents: 55000000000, totalDebt: 52000000000 },
];

const CASHFLOW_FIXTURE = [
  { date: '2026-06-30', depreciationAndAmortization: 15000000000, capitalExpenditure: -55000000000, changeInWorkingCapital: -2000000000 },
  { date: '2025-06-30', depreciationAndAmortization: 14000000000, capitalExpenditure: -50000000000, changeInWorkingCapital: -1500000000 },
  { date: '2024-06-30', depreciationAndAmortization: 13000000000, capitalExpenditure: -44000000000, changeInWorkingCapital: -1000000000 },
  { date: '2023-06-30', depreciationAndAmortization: 12000000000, capitalExpenditure: -30000000000, changeInWorkingCapital: -800000000 },
  { date: '2022-06-30', depreciationAndAmortization: 11000000000, capitalExpenditure: -25000000000, changeInWorkingCapital: -600000000 },
];

test('normalizeProfile extracts and scales fields correctly', () => {
  const { profile, warnings } = normalizeProfile(PROFILE_FIXTURE);
  assert.equal(profile.name, 'Microsoft Corporation');
  assert.equal(profile.ticker, 'MSFT');
  assert.equal(profile.exchange, 'NASDAQ');
  assert.equal(profile.sector, 'Technology');
  assert.equal(profile.price, 420.5);
  assert.ok(Math.abs(profile.marketCap - 3120000) < 1e-6); // millions
  assert.equal(profile.beta, 0.9);
  assert.equal(warnings.length, 0);
});

test('normalizeProfile warns on missing critical fields', () => {
  const { profile, warnings } = normalizeProfile([{ symbol: 'X', companyName: 'X Corp' }]);
  assert.equal(profile.price, null);
  assert.ok(warnings.some((w) => w.includes('price')));
  assert.ok(warnings.some((w) => w.includes('beta')));
});

test('normalizeIncomeStatements sorts oldest-first and computes effective tax rate', () => {
  const { periods, warnings } = normalizeIncomeStatements(INCOME_FIXTURE);
  assert.equal(periods.length, 5);
  assert.equal(periods[0].fiscalYear, '2022-06-30');
  assert.equal(periods[4].fiscalYear, '2026-06-30');
  // 21600000000 / 108000000000 = 0.20
  assert.ok(Math.abs(periods[4].effectiveTaxRate - 0.20) < 1e-9);
  assert.equal(warnings.length, 0);
});

test('normalizeIncomeStatements discards out-of-range effective tax rate', () => {
  const bad = [{ date: '2026-01-01', revenue: 100, operatingIncome: 20, incomeBeforeTax: 10, incomeTaxExpense: 9 }]; // 90% rate
  const { periods, warnings } = normalizeIncomeStatements(bad);
  assert.equal(periods[0].effectiveTaxRate, null);
  assert.ok(warnings.some((w) => w.includes('out of expected')));
});

test('normalizeBalanceSheets falls back to shortTermDebt + longTermDebt when totalDebt missing', () => {
  const raw = [{ date: '2026-01-01', cashAndCashEquivalents: 100, shortTermDebt: 10, longTermDebt: 40 }];
  const { periods, warnings } = normalizeBalanceSheets(raw);
  assert.equal(periods[0].debt, 50);
  assert.ok(warnings.some((w) => w.includes('summed shortTermDebt')));
});

test('normalizeCashFlows flips changeInWorkingCapital sign to "increase in NWC" convention', () => {
  const { periods } = normalizeCashFlows(CASHFLOW_FIXTURE);
  // changeInWorkingCapital -2,000,000,000 (cash outflow) => NWC increase of +2,000,000,000
  const latest = periods[periods.length - 1];
  assert.equal(latest.nwcIncrease, 2000000000);
  assert.equal(latest.capitalExpenditure, 55000000000); // abs value
});

test('deriveEngineInputs produces engine-ready shared/base inputs in millions with no warnings on clean fixture', () => {
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements(INCOME_FIXTURE);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(CASHFLOW_FIXTURE);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });

  assert.equal(result.warnings.length, 0);
  assert.ok(Math.abs(result.shared.baseRevenue - 250000) < 1e-6); // $250,000M
  assert.ok(Math.abs(result.shared.dilutedShares - 7430) < 1e-6); // 7,430M shares
  assert.ok(Math.abs(result.shared.cash - 75000) < 1e-6);
  assert.ok(Math.abs(result.shared.debt - 45000) < 1e-6);
  assert.ok(Math.abs(result.shared.taxRate - 0.20) < 1e-9); // median of five identical 20% years
  // EBIT margin suggestion: 3-year average (2024, 2025, 2026), not latest-year-only
  const expectedEbitMargin = (90000000000 / 210000000000 + 100000000000 / 230000000000 + 110000000000 / 250000000000) / 3;
  assert.ok(Math.abs(result.base.ebitMargin - expectedEbitMargin) < 1e-9);
  assert.equal(result.suggestions.ebitMargin.methodology, '3-year average');
  // 5 periods, revenue 180B -> 250B over 4 years
  const expectedCagr = Math.pow(250000000000 / 180000000000, 1 / 4) - 1;
  assert.ok(Math.abs(result.base.revenueGrowth - expectedCagr) < 1e-9);
  assert.equal(result.historical.length, 5);
  assert.equal(result.historical[0].fiscalYear, '2022-06-30');
});

test('deriveEngineInputs uses a full-history average for change in NWC (noisy, non-trending)', () => {
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements(INCOME_FIXTURE);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(CASHFLOW_FIXTURE);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });

  const expected = (600000000 / 180000000000 + 800000000 / 195000000000 + 1000000000 / 210000000000 +
    1500000000 / 230000000000 + 2000000000 / 250000000000) / 5;
  assert.ok(Math.abs(result.shared.nwcChangePctRevenue - expected) < 1e-9);
  assert.equal(result.suggestions.nwcChangePctRevenue.methodology, '5-year average');
});

test('deriveEngineInputs uses the median tax rate, robust to a single anomalous year', () => {
  // Oldest year gets an anomalously low one-off rate; the other four stay at 20%.
  const outlierIncome = INCOME_FIXTURE.map((row) =>
    row.date === '2022-06-30' ? { ...row, incomeTaxExpense: 1000000000 } : row);
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements(outlierIncome);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(CASHFLOW_FIXTURE);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });

  assert.ok(Math.abs(result.shared.taxRate - 0.20) < 1e-6); // median unaffected by the one outlier year
  assert.equal(result.suggestions.taxRate.methodology, 'median across 5 years');
});

test('deriveEngineInputs flags an elevated latest-year CapEx ratio and blends it instead of perpetuating it', () => {
  // Latest year's capex jumps to 35% of revenue vs. a prior trailing average around 19%.
  const spikeCashflow = CASHFLOW_FIXTURE.map((row) =>
    row.date === '2026-06-30' ? { ...row, capitalExpenditure: -87500000000 } : row);
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements(INCOME_FIXTURE);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(spikeCashflow);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });

  const latestYearRatio = 87500000000 / 250000000000; // 0.35
  assert.ok(result.shared.capexPctRevenue < latestYearRatio, 'suggestion should not equal the latest-year spike');
  assert.ok(result.shared.capexPctRevenue > 0.20 && result.shared.capexPctRevenue < 0.30);
  assert.ok(result.suggestions.capexPctRevenue.warning !== null);
  assert.ok(result.suggestions.capexPctRevenue.warning.toLowerCase().includes('capex'));
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes('capex')));
});

test('deriveEngineInputs falls back to 21% tax rate and warns when effective rate is unavailable', () => {
  const badIncome = INCOME_FIXTURE.map((row) => ({ ...row, incomeBeforeTax: undefined, incomeTaxExpense: undefined }));
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements(badIncome);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(CASHFLOW_FIXTURE);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });
  assert.equal(result.shared.taxRate, 0.21);
  assert.ok(result.warnings.some((w) => w.includes('falling back to 21%')));
});

test('deriveEngineInputs surfaces a warning and empty result when a statement type is empty', () => {
  const profile = normalizeProfile(PROFILE_FIXTURE);
  const income = normalizeIncomeStatements([]);
  const balance = normalizeBalanceSheets(BALANCE_FIXTURE);
  const cashflow = normalizeCashFlows(CASHFLOW_FIXTURE);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });
  assert.equal(result.shared, null);
  assert.ok(result.warnings.some((w) => w.includes('zero periods')));
});
