import { calculateRevenueForecast, calculateEBIT, calculateNOPAT, calculateEBITDA } from './forecast.js';
import { calculateUFCF, percentOfRevenueToDollars } from './ufcf.js';
import { calculateGordonGrowthTerminalValue, calculateExitMultipleTerminalValue } from './terminalValue.js';
import { assertFiniteNumber, assertPositive, assertNonNegative } from './validation.js';

export function calculatePresentValue(cashflow, rate, period) {
  assertFiniteNumber(cashflow, 'cashflow');
  assertFiniteNumber(rate, 'rate');
  assertPositive(period, 'period');
  if (rate <= -1) {
    throw new Error(`rate must be greater than -1 (-100%), got ${rate}`);
  }
  return cashflow / Math.pow(1 + rate, period);
}

export function calculateDCF({
  baseRevenue,
  revenueGrowth,
  ebitMargin,
  taxRate,
  daPctRevenue,
  capexPctRevenue,
  nwcChangePctRevenue,
  years,
  wacc,
  terminalGrowthRate,
  exitMultiple,
}) {
  assertPositive(years, 'years');
  assertFiniteNumber(wacc, 'wacc');
  if (wacc <= 0) {
    throw new Error(`wacc must be greater than zero, got ${wacc}`);
  }

  const revenue = calculateRevenueForecast(baseRevenue, revenueGrowth, years);
  const ebit = calculateEBIT(revenue, ebitMargin);
  const nopat = calculateNOPAT(ebit, taxRate);
  const da = percentOfRevenueToDollars(revenue, daPctRevenue, 'daPctRevenue');
  const capex = percentOfRevenueToDollars(revenue, capexPctRevenue, 'capexPctRevenue');
  const nwcChange = percentOfRevenueToDollars(revenue, nwcChangePctRevenue, 'nwcChangePctRevenue');
  const ufcf = calculateUFCF(nopat, da, capex, nwcChange);
  const ebitda = calculateEBITDA(ebit, da);

  const pvUFCF = ufcf.map((cf, i) => calculatePresentValue(cf, wacc, i + 1));
  const sumPvUFCF = pvUFCF.reduce((a, b) => a + b, 0);

  const finalYearUFCF = ufcf[ufcf.length - 1];
  const finalYearEBITDA = ebitda[ebitda.length - 1];

  const terminalValueGordon = calculateGordonGrowthTerminalValue(finalYearUFCF, wacc, terminalGrowthRate);
  const pvTerminalValueGordon = calculatePresentValue(terminalValueGordon, wacc, years);
  const enterpriseValueGordon = sumPvUFCF + pvTerminalValueGordon;

  let terminalValueExitMultiple = null;
  let pvTerminalValueExitMultiple = null;
  let enterpriseValueExitMultiple = null;
  if (exitMultiple !== undefined) {
    terminalValueExitMultiple = calculateExitMultipleTerminalValue(finalYearEBITDA, exitMultiple);
    pvTerminalValueExitMultiple = calculatePresentValue(terminalValueExitMultiple, wacc, years);
    enterpriseValueExitMultiple = sumPvUFCF + pvTerminalValueExitMultiple;
  }

  return {
    years,
    revenue,
    ebit,
    nopat,
    da,
    capex,
    nwcChange,
    ufcf,
    ebitda,
    pvUFCF,
    sumPvUFCF,
    terminalValueGordon,
    pvTerminalValueGordon,
    enterpriseValueGordon,
    terminalValueExitMultiple,
    pvTerminalValueExitMultiple,
    enterpriseValueExitMultiple,
  };
}

export function calculateEquityValue(enterpriseValue, cash, debt) {
  assertFiniteNumber(enterpriseValue, 'enterpriseValue');
  assertNonNegative(cash, 'cash');
  assertNonNegative(debt, 'debt');
  return enterpriseValue + cash - debt;
}

export function calculateImpliedSharePrice(equityValue, dilutedShares) {
  assertFiniteNumber(equityValue, 'equityValue');
  assertPositive(dilutedShares, 'dilutedShares');
  return equityValue / dilutedShares;
}
