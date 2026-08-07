import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';

export function calculateSensitivityTable({ waccRange, terminalGrowthRange, baseCaseInputs }) {
  if (!Array.isArray(waccRange) || waccRange.length === 0) {
    throw new Error('waccRange must be a non-empty array');
  }
  if (!Array.isArray(terminalGrowthRange) || terminalGrowthRange.length === 0) {
    throw new Error('terminalGrowthRange must be a non-empty array');
  }

  const { cash, debt, dilutedShares, ...dcfInputs } = baseCaseInputs;

  const table = waccRange.map((wacc) =>
    terminalGrowthRange.map((terminalGrowthRate) => {
      if (terminalGrowthRate >= wacc) {
        return null;
      }
      const dcf = calculateDCF({ ...dcfInputs, wacc, terminalGrowthRate });
      const equityValue = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
      return calculateImpliedSharePrice(equityValue, dilutedShares);
    })
  );

  return { waccValues: waccRange, terminalGrowthValues: terminalGrowthRange, table };
}
