// Cross-ticker integrity regression tests. Verifies the normalization
// pipeline has no shared/module-level mutable state that could leak one
// ticker's data into another's result when the same warm backend process
// handles multiple companies' requests (a real risk class in serverless
// backends), and that Forecast Year 1 Revenue is continuous with the
// historical base revenue that feeds it (catches unit/state bugs like the
// reported META forecast producing $5,842M from a $200,966M historical base).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfile, normalizeIncomeStatements, normalizeBalanceSheets, normalizeCashFlows, deriveEngineInputs,
} from '../../src/backend/importing/normalizeFmp.js';
import { calculateRevenueForecast } from '../../src/engine/forecast.js';

function buildFixture(ticker, name, revenueLatest, sharesLatest) {
  const dates = ['2022-06-30', '2023-06-30', '2024-06-30', '2025-06-30', '2026-06-30'];
  const growthPath = [0.85, 0.90, 0.94, 0.97, 1.0]; // revenue as a fraction of the latest year, oldest-first
  const profile = [{ symbol: ticker, companyName: name, price: 100, mktCap: revenueLatest * 3, beta: 1.0, sector: 'Technology', industry: 'Software', exchangeShortName: 'NASDAQ', currency: 'USD' }];
  const income = dates.map((date, i) => {
    const revenue = revenueLatest * growthPath[i];
    return {
      date, period: 'FY', revenue,
      operatingIncome: revenue * 0.35, ebitda: revenue * 0.4,
      depreciationAndAmortization: revenue * 0.05,
      incomeBeforeTax: revenue * 0.33, incomeTaxExpense: revenue * 0.33 * 0.2,
      weightedAverageShsOutDil: sharesLatest * 1e6,
    };
  }).reverse(); // most-recent-first, as FMP returns them
  const balance = [{ date: dates[4], cashAndCashEquivalents: revenueLatest * 0.1, totalDebt: revenueLatest * 0.15 }];
  const cashflow = dates.map((date, i) => {
    const revenue = revenueLatest * growthPath[i];
    return { date, depreciationAndAmortization: revenue * 0.05, capitalExpenditure: -(revenue * 0.08), changeInWorkingCapital: -(revenue * 0.01) };
  }).reverse();
  return { profile, income, balance, cashflow };
}

function runPipeline(fixture) {
  const profile = normalizeProfile(fixture.profile);
  const income = normalizeIncomeStatements(fixture.income);
  const balance = normalizeBalanceSheets(fixture.balance);
  const cashflow = normalizeCashFlows(fixture.cashflow);
  return deriveEngineInputs({ profile, income, balance, cashflow });
}

test('processing ticker A then ticker B produces fully independent results (no shared mutable state)', () => {
  const fixtureA = buildFixture('MSFT', 'Microsoft Corporation', 331839e6, 7453);
  const fixtureB = buildFixture('META', 'Meta Platforms, Inc.', 200966e6, 2565);

  const resultA = runPipeline(fixtureA);
  const resultB = runPipeline(fixtureB);

  assert.ok(Math.abs(resultA.shared.baseRevenue - 331839) < 1, 'ticker A baseRevenue should reflect only ticker A data');
  assert.ok(Math.abs(resultB.shared.baseRevenue - 200966) < 1, 'ticker B baseRevenue should reflect only ticker B data');
  assert.ok(Math.abs(resultA.shared.dilutedShares - 7453) < 1);
  assert.ok(Math.abs(resultB.shared.dilutedShares - 2565) < 1);
  assert.equal(resultA.company.name, 'Microsoft Corporation');
  assert.equal(resultB.company.name, 'Meta Platforms, Inc.');
});

test('re-running ticker A after ticker B returns byte-for-byte the same numbers as the first A run', () => {
  const fixtureA = buildFixture('MSFT', 'Microsoft Corporation', 331839e6, 7453);
  const fixtureB = buildFixture('META', 'Meta Platforms, Inc.', 200966e6, 2565);

  const firstA = runPipeline(fixtureA);
  runPipeline(fixtureB); // interleave a different ticker
  const secondA = runPipeline(fixtureA);

  assert.equal(firstA.shared.baseRevenue, secondA.shared.baseRevenue);
  assert.equal(firstA.base.revenueGrowth, secondA.base.revenueGrowth);
  assert.equal(firstA.base.ebitMargin, secondA.base.ebitMargin);
  assert.equal(firstA.shared.dilutedShares, secondA.shared.dilutedShares);
});

test('Forecast Year 1 Revenue is continuous with the historical base revenue that feeds it (any ticker)', () => {
  const fixture = buildFixture('META', 'Meta Platforms, Inc.', 200966e6, 2565);
  const result = runPipeline(fixture);

  const years = 5;
  const revenue = calculateRevenueForecast(result.shared.baseRevenue, result.base.revenueGrowth, years);

  const expectedY1 = result.shared.baseRevenue * (1 + result.base.revenueGrowth);
  assert.ok(Math.abs(revenue[0] - expectedY1) < 1e-6, 'Y1 revenue must equal baseRevenue * (1 + growth)');
  // Sanity bound matching the bug report's own worked example: should be in
  // the same order of magnitude as the historical base, never off by 30x+.
  assert.ok(revenue[0] > result.shared.baseRevenue * 0.5 && revenue[0] < result.shared.baseRevenue * 2);
});
