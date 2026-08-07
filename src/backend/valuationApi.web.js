import { webMethod, Permissions } from '@wix/web-methods';
import { calculateScenarioValue } from './valuation/scenarios.js';
import { solveReverseDCF } from './valuation/reverseDcf.js';
import { calculateSensitivityTable } from './valuation/sensitivity.js';
import { calculateCostOfEquity, calculateAfterTaxCostOfDebt, calculateWACC } from './valuation/wacc.js';

// Thin pass-through wrappers only — no financial logic lives here.
// All formulas live in ./valuation/*.js, unchanged from the tested local engine.

export const runWaccCalculation = webMethod(Permissions.Anyone, (inputs) => {
  const costOfEquity = calculateCostOfEquity(inputs.riskFreeRate, inputs.beta, inputs.equityRiskPremium);
  const afterTaxCostOfDebt = calculateAfterTaxCostOfDebt(inputs.preTaxCostOfDebt, inputs.taxRate);
  const wacc = calculateWACC({
    costOfEquity,
    afterTaxCostOfDebt,
    equityValue: inputs.marketValueOfEquity,
    debtValue: inputs.debt,
  });
  return { costOfEquity, afterTaxCostOfDebt, wacc };
});

export const runScenarioValuation = webMethod(Permissions.Anyone, (inputs) => {
  return calculateScenarioValue(inputs);
});

export const runReverseDcf = webMethod(Permissions.Anyone, (inputs) => {
  return solveReverseDCF(inputs);
});

export const runSensitivityTable = webMethod(Permissions.Anyone, (inputs) => {
  return calculateSensitivityTable(inputs);
});
