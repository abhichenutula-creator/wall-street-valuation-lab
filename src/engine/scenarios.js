import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';

export function calculateScenarioValue({ cash, debt, dilutedShares, ...dcfInputs }) {
  const dcf = calculateDCF(dcfInputs);

  const equityValueGordon = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
  const impliedSharePriceGordon = calculateImpliedSharePrice(equityValueGordon, dilutedShares);

  let equityValueExitMultiple = null;
  let impliedSharePriceExitMultiple = null;
  if (dcf.enterpriseValueExitMultiple !== null) {
    equityValueExitMultiple = calculateEquityValue(dcf.enterpriseValueExitMultiple, cash, debt);
    impliedSharePriceExitMultiple = calculateImpliedSharePrice(equityValueExitMultiple, dilutedShares);
  }

  return {
    dcf,
    equityValueGordon,
    equityValueExitMultiple,
    impliedSharePriceGordon,
    impliedSharePriceExitMultiple,
  };
}
