import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenarioValue } from '../../src/engine/scenarios.js';

const COMMON = {
  baseRevenue: 1000,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

const BEAR = { ...COMMON, revenueGrowth: 0.03, ebitMargin: 0.14, wacc: 0.11, terminalGrowthRate: 0.015 };
const BASE = { ...COMMON, revenueGrowth: 0.10, ebitMargin: 0.20, wacc: 0.09, terminalGrowthRate: 0.025 };
const BULL = { ...COMMON, revenueGrowth: 0.18, ebitMargin: 0.26, wacc: 0.075, terminalGrowthRate: 0.035 };

test('calculateScenarioValue returns a full DCF result plus implied share price', () => {
  const result = calculateScenarioValue(BASE);
  assert.ok(result.dcf.enterpriseValueGordon > 0);
  assert.ok(Math.abs(result.equityValueGordon - (result.dcf.enterpriseValueGordon + 200 - 300)) < 1e-9);
  assert.ok(Math.abs(result.impliedSharePriceGordon - result.equityValueGordon / 100) < 1e-9);
});

test('calculateScenarioValue returns null exit-multiple fields when exitMultiple is omitted', () => {
  const result = calculateScenarioValue(BASE);
  assert.equal(result.impliedSharePriceExitMultiple, null);
});

test('Bear, Base, and Bull scenarios produce strictly increasing implied share prices', () => {
  const bear = calculateScenarioValue(BEAR);
  const base = calculateScenarioValue(BASE);
  const bull = calculateScenarioValue(BULL);
  assert.ok(bear.impliedSharePriceGordon < base.impliedSharePriceGordon);
  assert.ok(base.impliedSharePriceGordon < bull.impliedSharePriceGordon);
});
