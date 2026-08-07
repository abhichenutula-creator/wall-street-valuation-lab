import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCostOfEquity,
  calculateAfterTaxCostOfDebt,
  calculateWACC,
} from '../../src/engine/wacc.js';

test('calculateCostOfEquity applies CAPM', () => {
  const coe = calculateCostOfEquity(0.04, 1.2, 0.05);
  assert.ok(Math.abs(coe - 0.10) < 1e-9);
});

test('calculateAfterTaxCostOfDebt applies (1 - taxRate)', () => {
  const atcod = calculateAfterTaxCostOfDebt(0.06, 0.25);
  assert.ok(Math.abs(atcod - 0.045) < 1e-9);
});

test('calculateAfterTaxCostOfDebt rejects negative pre-tax cost of debt', () => {
  assert.throws(() => calculateAfterTaxCostOfDebt(-0.01, 0.25));
});

test('calculateWACC weights cost of equity and after-tax cost of debt by capital structure', () => {
  const wacc = calculateWACC({ costOfEquity: 0.10, afterTaxCostOfDebt: 0.045, equityValue: 700, debtValue: 300 });
  assert.ok(Math.abs(wacc - 0.0835) < 1e-9);
});

test('calculateWACC with zero debt equals cost of equity', () => {
  const wacc = calculateWACC({ costOfEquity: 0.12, afterTaxCostOfDebt: 0.05, equityValue: 500, debtValue: 0 });
  assert.ok(Math.abs(wacc - 0.12) < 1e-9);
});

test('calculateWACC rejects zero total capital (division by zero guard)', () => {
  assert.throws(() => calculateWACC({ costOfEquity: 0.1, afterTaxCostOfDebt: 0.05, equityValue: 0, debtValue: 0 }));
});

test('calculateWACC rejects negative capital values', () => {
  assert.throws(() => calculateWACC({ costOfEquity: 0.1, afterTaxCostOfDebt: 0.05, equityValue: -1, debtValue: 100 }));
});
