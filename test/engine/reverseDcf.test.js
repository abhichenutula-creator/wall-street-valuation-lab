import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveReverseDCF } from '../../src/engine/reverseDcf.js';
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from '../../src/engine/dcf.js';

const SHARED = {
  baseRevenue: 1000,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

function impliedPriceForGrowth(growth) {
  const dcf = calculateDCF({ ...SHARED, revenueGrowth: growth });
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, SHARED.cash, SHARED.debt);
  return calculateImpliedSharePrice(equity, SHARED.dilutedShares);
}

test('solveReverseDCF finds a growth rate whose implied price matches the target within tolerance', () => {
  const targetPrice = impliedPriceForGrowth(0.15);
  const result = solveReverseDCF({ ...SHARED, targetPrice });
  assert.ok(result.converged);
  assert.ok(Math.abs(result.impliedGrowthRate - 0.15) < 1e-3);
  assert.ok(Math.abs(result.impliedPrice - targetPrice) < 1e-3);
});

test('solveReverseDCF result is consistent with directly recomputing price at the solved growth rate', () => {
  const targetPrice = 27;
  const result = solveReverseDCF({ ...SHARED, targetPrice });
  const recomputed = impliedPriceForGrowth(result.impliedGrowthRate);
  assert.ok(Math.abs(recomputed - targetPrice) < 1e-3);
});

test('a higher target price yields a higher market-implied growth rate', () => {
  const low = solveReverseDCF({ ...SHARED, targetPrice: 20 });
  const high = solveReverseDCF({ ...SHARED, targetPrice: 35 });
  assert.ok(high.impliedGrowthRate > low.impliedGrowthRate);
});

test('solveReverseDCF throws when the target price is unreachable within growth bounds', () => {
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: 1000000 }));
});

test('solveReverseDCF rejects a non-positive target price', () => {
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: 0 }));
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: -10 }));
});
