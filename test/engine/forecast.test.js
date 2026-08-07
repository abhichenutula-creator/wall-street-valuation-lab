import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRevenueForecast,
  calculateEBIT,
  calculateNOPAT,
  calculateEBITDA,
} from '../../src/engine/forecast.js';

test('calculateRevenueForecast compounds a constant growth rate', () => {
  const revenue = calculateRevenueForecast(1000, 0.10, 5);
  assert.equal(revenue.length, 5);
  assert.ok(Math.abs(revenue[0] - 1100) < 1e-9);
  assert.ok(Math.abs(revenue[1] - 1210) < 1e-9);
  assert.ok(Math.abs(revenue[4] - 1610.51) < 1e-6);
});

test('calculateRevenueForecast accepts a per-year growth array', () => {
  const revenue = calculateRevenueForecast(1000, [0.10, 0.05, 0.05, 0, -0.02], 5);
  assert.ok(Math.abs(revenue[0] - 1100) < 1e-9);
  assert.ok(Math.abs(revenue[1] - 1155) < 1e-9);
  assert.ok(Math.abs(revenue[4] - revenue[3] * 0.98) < 1e-9);
});

test('calculateRevenueForecast rejects non-positive base revenue', () => {
  assert.throws(() => calculateRevenueForecast(0, 0.1, 5));
  assert.throws(() => calculateRevenueForecast(-100, 0.1, 5));
});

test('calculateRevenueForecast rejects a growth array of the wrong length', () => {
  assert.throws(() => calculateRevenueForecast(1000, [0.1, 0.1], 5));
});

test('calculateRevenueForecast rejects growth rates <= -100%', () => {
  assert.throws(() => calculateRevenueForecast(1000, -1, 5));
  assert.throws(() => calculateRevenueForecast(1000, -1.5, 5));
});

test('calculateEBIT applies a constant margin to each year', () => {
  const ebit = calculateEBIT([1100, 1210], 0.20);
  assert.ok(Math.abs(ebit[0] - 220) < 1e-9);
  assert.ok(Math.abs(ebit[1] - 242) < 1e-9);
});

test('calculateEBIT rejects an empty revenue array', () => {
  assert.throws(() => calculateEBIT([], 0.2));
});

test('calculateNOPAT applies (1 - taxRate)', () => {
  const nopat = calculateNOPAT([220, 242], 0.25);
  assert.ok(Math.abs(nopat[0] - 165) < 1e-9);
  assert.ok(Math.abs(nopat[1] - 181.5) < 1e-9);
});

test('calculateNOPAT rejects an out-of-range tax rate', () => {
  assert.throws(() => calculateNOPAT([220], 1.5));
  assert.throws(() => calculateNOPAT([220], -0.1));
});

test('calculateEBITDA sums EBIT and D&A elementwise', () => {
  const ebitda = calculateEBITDA([220, 242], [55, 60.5]);
  assert.ok(Math.abs(ebitda[0] - 275) < 1e-9);
  assert.ok(Math.abs(ebitda[1] - 302.5) < 1e-9);
});

test('calculateEBITDA rejects mismatched array lengths', () => {
  assert.throws(() => calculateEBITDA([220, 242], [55]));
});
