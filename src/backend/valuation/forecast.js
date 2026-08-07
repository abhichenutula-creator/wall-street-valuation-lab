import { assertPositive, assertFiniteNumber, assertRequired } from './validation.js';

export function calculateRevenueForecast(baseRevenue, growthRates, years) {
  assertPositive(baseRevenue, 'baseRevenue');
  assertPositive(years, 'years');
  assertRequired(growthRates, 'growthRates');

  const rates = Array.isArray(growthRates) ? growthRates : Array(years).fill(growthRates);
  if (rates.length !== years) {
    throw new Error(`growthRates array length (${rates.length}) must equal years (${years})`);
  }
  rates.forEach((r, i) => {
    assertFiniteNumber(r, `growthRates[${i}]`);
    if (r <= -1) {
      throw new Error(`growthRates[${i}] (${r}) must be greater than -1 (-100%)`);
    }
  });

  const revenue = [];
  let prev = baseRevenue;
  for (let t = 0; t < years; t++) {
    const current = prev * (1 + rates[t]);
    revenue.push(current);
    prev = current;
  }
  return revenue;
}

function requireNonEmptyArray(value, name) {
  assertRequired(value, name);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
}

export function calculateEBIT(revenue, ebitMargin) {
  requireNonEmptyArray(revenue, 'revenue');
  assertFiniteNumber(ebitMargin, 'ebitMargin');
  return revenue.map((r) => r * ebitMargin);
}

export function calculateNOPAT(ebit, taxRate) {
  requireNonEmptyArray(ebit, 'ebit');
  assertFiniteNumber(taxRate, 'taxRate');
  if (taxRate < 0 || taxRate > 1) {
    throw new Error(`taxRate must be between 0 and 1, got ${taxRate}`);
  }
  return ebit.map((e) => e * (1 - taxRate));
}

export function calculateEBITDA(ebit, da) {
  requireNonEmptyArray(ebit, 'ebit');
  requireNonEmptyArray(da, 'da');
  if (ebit.length !== da.length) {
    throw new Error('ebit and da must be arrays of equal length');
  }
  return ebit.map((e, i) => e + da[i]);
}
