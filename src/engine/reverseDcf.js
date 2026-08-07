import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';
import { assertPositive } from './validation.js';

export function solveReverseDCF({
  targetPrice,
  baseRevenue,
  ebitMargin,
  taxRate,
  daPctRevenue,
  capexPctRevenue,
  nwcChangePctRevenue,
  years,
  wacc,
  terminalGrowthRate,
  cash,
  debt,
  dilutedShares,
  minGrowth = -0.9,
  maxGrowth = 5,
  tolerance = 1e-6,
  maxIterations = 200,
}) {
  assertPositive(targetPrice, 'targetPrice');

  const priceForGrowth = (growth) => {
    const dcf = calculateDCF({
      baseRevenue,
      revenueGrowth: growth,
      ebitMargin,
      taxRate,
      daPctRevenue,
      capexPctRevenue,
      nwcChangePctRevenue,
      years,
      wacc,
      terminalGrowthRate,
    });
    const equityValue = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
    return calculateImpliedSharePrice(equityValue, dilutedShares);
  };

  let lo = minGrowth;
  let hi = maxGrowth;
  const priceLo = priceForGrowth(lo);
  const priceHi = priceForGrowth(hi);

  if (priceLo > targetPrice || priceHi < targetPrice) {
    throw new Error(
      `targetPrice (${targetPrice}) is unreachable within growth bounds [${minGrowth}, ${maxGrowth}]: ` +
        `implied price ranges from ${priceLo.toFixed(2)} to ${priceHi.toFixed(2)}. Widen minGrowth/maxGrowth.`
    );
  }

  let mid = (lo + hi) / 2;
  let priceMid = priceForGrowth(mid);
  let iterations = 0;
  while (iterations < maxIterations && Math.abs(priceMid - targetPrice) >= tolerance) {
    if (priceMid < targetPrice) {
      lo = mid;
    } else {
      hi = mid;
    }
    mid = (lo + hi) / 2;
    priceMid = priceForGrowth(mid);
    iterations += 1;
  }

  return {
    impliedGrowthRate: mid,
    iterations,
    converged: Math.abs(priceMid - targetPrice) < tolerance,
    impliedPrice: priceMid,
  };
}
