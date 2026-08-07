import { assertFiniteNumber, assertRequired } from './validation.js';

function requireNonEmptyArray(value, name) {
  assertRequired(value, name);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
}

export function percentOfRevenueToDollars(revenue, pct, name) {
  requireNonEmptyArray(revenue, 'revenue');
  assertFiniteNumber(pct, name);
  return revenue.map((r) => r * pct);
}

export function calculateUFCF(nopat, da, capex, nwcChange) {
  requireNonEmptyArray(nopat, 'nopat');
  requireNonEmptyArray(da, 'da');
  requireNonEmptyArray(capex, 'capex');
  requireNonEmptyArray(nwcChange, 'nwcChange');
  const n = nopat.length;
  if (da.length !== n || capex.length !== n || nwcChange.length !== n) {
    throw new Error('nopat, da, capex, and nwcChange must all be arrays of equal length');
  }
  return nopat.map((val, i) => {
    assertFiniteNumber(da[i], `da[${i}]`);
    assertFiniteNumber(capex[i], `capex[${i}]`);
    assertFiniteNumber(nwcChange[i], `nwcChange[${i}]`);
    return val + da[i] - capex[i] - nwcChange[i];
  });
}
