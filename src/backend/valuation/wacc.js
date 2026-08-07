import { assertFiniteNumber, assertNonNegative } from './validation.js';

export function calculateCostOfEquity(riskFreeRate, beta, equityRiskPremium) {
  assertFiniteNumber(riskFreeRate, 'riskFreeRate');
  assertFiniteNumber(beta, 'beta');
  assertFiniteNumber(equityRiskPremium, 'equityRiskPremium');
  return riskFreeRate + beta * equityRiskPremium;
}

export function calculateAfterTaxCostOfDebt(preTaxCostOfDebt, taxRate) {
  assertNonNegative(preTaxCostOfDebt, 'preTaxCostOfDebt');
  assertFiniteNumber(taxRate, 'taxRate');
  if (taxRate < 0 || taxRate > 1) {
    throw new Error(`taxRate must be between 0 and 1, got ${taxRate}`);
  }
  return preTaxCostOfDebt * (1 - taxRate);
}

export function calculateWACC({ costOfEquity, afterTaxCostOfDebt, equityValue, debtValue }) {
  assertFiniteNumber(costOfEquity, 'costOfEquity');
  assertFiniteNumber(afterTaxCostOfDebt, 'afterTaxCostOfDebt');
  assertNonNegative(equityValue, 'equityValue');
  assertNonNegative(debtValue, 'debtValue');
  const total = equityValue + debtValue;
  if (total <= 0) {
    throw new Error('equityValue + debtValue must be greater than zero to calculate WACC');
  }
  const equityWeight = equityValue / total;
  const debtWeight = debtValue / total;
  return equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;
}
