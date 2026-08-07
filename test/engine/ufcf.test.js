import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateUFCF, percentOfRevenueToDollars } from '../../src/engine/ufcf.js';

test('percentOfRevenueToDollars scales each year by pct', () => {
  const result = percentOfRevenueToDollars([1100, 1210], 0.05, 'daPctRevenue');
  assert.ok(Math.abs(result[0] - 55) < 1e-9);
  assert.ok(Math.abs(result[1] - 60.5) < 1e-9);
});

test('calculateUFCF follows NOPAT + D&A - CapEx - deltaNWC', () => {
  const ufcf = calculateUFCF([165, 181.5], [55, 60.5], [66, 72.6], [11, 12.1]);
  assert.ok(Math.abs(ufcf[0] - 143) < 1e-9);
  assert.ok(Math.abs(ufcf[1] - 157.3) < 1e-9);
});

test('calculateUFCF rejects mismatched array lengths', () => {
  assert.throws(() => calculateUFCF([165, 181.5], [55], [66, 72.6], [11, 12.1]));
});

test('calculateUFCF rejects empty arrays', () => {
  assert.throws(() => calculateUFCF([], [], [], []));
});

test('calculateUFCF propagates negative NWC change (a source of cash) correctly', () => {
  const ufcf = calculateUFCF([100], [10], [20], [-5]);
  assert.ok(Math.abs(ufcf[0] - 95) < 1e-9);
});
