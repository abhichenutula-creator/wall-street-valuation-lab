import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePresentValue,
  calculateDCF,
  calculateEquityValue,
  calculateImpliedSharePrice,
} from '../../src/engine/dcf.js';

const BASE_CASE = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  exitMultiple: 10,
};

test('calculatePresentValue discounts a single cash flow', () => {
  const pv = calculatePresentValue(143, 0.09, 1);
  assert.ok(Math.abs(pv - 143 / 1.09) < 1e-9);
});

test('calculatePresentValue rejects a rate at or below -100%', () => {
  assert.throws(() => calculatePresentValue(100, -1, 1));
});

test('calculateDCF produces internally consistent forecast arrays', () => {
  const result = calculateDCF(BASE_CASE);
  assert.equal(result.revenue.length, 5);
  assert.ok(Math.abs(result.revenue[4] - 1610.51) < 1e-6);
  assert.ok(Math.abs(result.ufcf[0] - 143) < 1e-6);
  assert.ok(Math.abs(result.ebitda[4] - 402.6275) < 1e-6);
});

test('calculateDCF sums discounted UFCFs correctly', () => {
  const result = calculateDCF(BASE_CASE);
  const manualSum = result.ufcf.reduce(
    (sum, cf, i) => sum + calculatePresentValue(cf, BASE_CASE.wacc, i + 1),
    0
  );
  assert.ok(Math.abs(result.sumPvUFCF - manualSum) < 1e-9);
});

test('calculateDCF enterprise value equals sum of PV(UFCF) + PV(terminal value), both methods', () => {
  const result = calculateDCF(BASE_CASE);
  assert.ok(Math.abs(result.enterpriseValueGordon - (result.sumPvUFCF + result.pvTerminalValueGordon)) < 1e-9);
  assert.ok(Math.abs(result.enterpriseValueExitMultiple - (result.sumPvUFCF + result.pvTerminalValueExitMultiple)) < 1e-9);
});

test('calculateDCF omits exit-multiple fields when exitMultiple is not provided', () => {
  const { exitMultiple, ...withoutExitMultiple } = BASE_CASE;
  const result = calculateDCF(withoutExitMultiple);
  assert.equal(result.terminalValueExitMultiple, null);
  assert.equal(result.enterpriseValueExitMultiple, null);
  assert.ok(result.enterpriseValueGordon > 0);
});

test('calculateEquityValue adds cash and subtracts debt', () => {
  const eq = calculateEquityValue(2000, 200, 300);
  assert.ok(Math.abs(eq - 1900) < 1e-9);
});

test('calculateEquityValue rejects negative cash or debt', () => {
  assert.throws(() => calculateEquityValue(2000, -1, 300));
  assert.throws(() => calculateEquityValue(2000, 200, -1));
});

test('calculateImpliedSharePrice divides equity value by diluted shares', () => {
  const price = calculateImpliedSharePrice(1900, 100);
  assert.ok(Math.abs(price - 19) < 1e-9);
});

test('calculateImpliedSharePrice rejects zero or negative shares (division-by-zero guard)', () => {
  assert.throws(() => calculateImpliedSharePrice(1900, 0));
  assert.throws(() => calculateImpliedSharePrice(1900, -10));
});

test('calculateDCF throws on missing required fields instead of defaulting to zero', () => {
  const { taxRate, ...missingTaxRate } = BASE_CASE;
  assert.throws(() => calculateDCF(missingTaxRate));
});

test('calculateDCF throws when wacc is zero or negative', () => {
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: 0 }));
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: -0.01 }));
});
