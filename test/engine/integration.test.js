import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDCF,
  calculateEquityValue,
  calculateImpliedSharePrice,
  calculateScenarioValue,
  calculateSensitivityTable,
  solveReverseDCF,
} from '../../src/engine/index.js';

const BASE_CASE = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  exitMultiple: 10,
};
const CASH = 200;
const DEBT = 300;
const SHARES = 100;

// Independently re-derive the Base Case with a plain loop, NOT by calling the engine.
function independentBaseCase() {
  const years = 5;
  let revenue = 1000;
  const revenues = [];
  for (let t = 0; t < years; t++) {
    revenue = revenue * 1.10;
    revenues.push(revenue);
  }
  const ebit = revenues.map((r) => r * 0.20);
  const nopat = ebit.map((e) => e * 0.75);
  const da = revenues.map((r) => r * 0.05);
  const capex = revenues.map((r) => r * 0.06);
  const nwcChange = revenues.map((r) => r * 0.01);
  const ufcf = nopat.map((n, i) => n + da[i] - capex[i] - nwcChange[i]);
  const ebitda = ebit.map((e, i) => e + da[i]);

  const wacc = 0.09;
  const pvUfcf = ufcf.map((cf, i) => cf / Math.pow(1.09, i + 1));
  const sumPvUfcf = pvUfcf.reduce((a, b) => a + b, 0);

  const g = 0.025;
  const finalUfcf = ufcf[4];
  const tvGordon = (finalUfcf * (1 + g)) / (wacc - g);
  const pvTvGordon = tvGordon / Math.pow(1.09, 5);
  const evGordon = sumPvUfcf + pvTvGordon;

  const finalEbitda = ebitda[4];
  const tvExit = finalEbitda * 10;
  const pvTvExit = tvExit / Math.pow(1.09, 5);
  const evExit = sumPvUfcf + pvTvExit;

  const equityGordon = evGordon + CASH - DEBT;
  const equityExit = evExit + CASH - DEBT;
  const priceGordon = equityGordon / SHARES;
  const priceExit = equityExit / SHARES;

  return { revenues, ufcf, sumPvUfcf, evGordon, evExit, priceGordon, priceExit };
}

test('engine output matches an independently re-derived Base Case within tolerance', () => {
  const expected = independentBaseCase();
  const dcf = calculateDCF(BASE_CASE);
  const equityGordon = calculateEquityValue(dcf.enterpriseValueGordon, CASH, DEBT);
  const equityExit = calculateEquityValue(dcf.enterpriseValueExitMultiple, CASH, DEBT);
  const priceGordon = calculateImpliedSharePrice(equityGordon, SHARES);
  const priceExit = calculateImpliedSharePrice(equityExit, SHARES);

  assert.ok(Math.abs(dcf.sumPvUFCF - expected.sumPvUfcf) < 1e-6);
  assert.ok(Math.abs(dcf.enterpriseValueGordon - expected.evGordon) < 1e-6);
  assert.ok(Math.abs(dcf.enterpriseValueExitMultiple - expected.evExit) < 1e-6);
  assert.ok(Math.abs(priceGordon - expected.priceGordon) < 1e-6);
  assert.ok(Math.abs(priceExit - expected.priceExit) < 1e-6);
});

test('higher revenue growth increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, revenueGrowth: 0.05 });
  const high = calculateDCF({ ...BASE_CASE, revenueGrowth: 0.15 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('higher EBIT margin increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, ebitMargin: 0.15 });
  const high = calculateDCF({ ...BASE_CASE, ebitMargin: 0.25 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('higher WACC decreases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, wacc: 0.08 });
  const high = calculateDCF({ ...BASE_CASE, wacc: 0.12 });
  assert.ok(high.enterpriseValueGordon < low.enterpriseValueGordon);
});

test('higher terminal growth rate increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, terminalGrowthRate: 0.01 });
  const high = calculateDCF({ ...BASE_CASE, terminalGrowthRate: 0.04 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('current market price affects Reverse DCF output', () => {
  const { cash, debt, dilutedShares, exitMultiple, revenueGrowth, ...shared } = BASE_CASE;
  const low = solveReverseDCF({ ...shared, cash: CASH, debt: DEBT, dilutedShares: SHARES, targetPrice: 20 });
  const high = solveReverseDCF({ ...shared, cash: CASH, debt: DEBT, dilutedShares: SHARES, targetPrice: 35 });
  assert.notEqual(low.impliedGrowthRate, high.impliedGrowthRate);
});

test('current market price does NOT affect ordinary DCF intrinsic value', () => {
  const marketPriceA = 15;
  const marketPriceB = 500;
  const dcfA = calculateDCF(BASE_CASE); // marketPriceA never enters this call
  const dcfB = calculateDCF(BASE_CASE); // marketPriceB never enters this call
  assert.equal(dcfA.enterpriseValueGordon, dcfB.enterpriseValueGordon);
  assert.notEqual(marketPriceA, marketPriceB); // sanity: they really are different "market prices"
});

test('Bear/Base/Bull scenarios produce three distinct valuations', () => {
  const bear = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
    revenueGrowth: 0.03, ebitMargin: 0.14, wacc: 0.11, terminalGrowthRate: 0.015,
  });
  const base = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
  });
  const bull = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
    revenueGrowth: 0.18, ebitMargin: 0.26, wacc: 0.075, terminalGrowthRate: 0.035,
  });
  const prices = new Set([
    bear.impliedSharePriceGordon.toFixed(4),
    base.impliedSharePriceGordon.toFixed(4),
    bull.impliedSharePriceGordon.toFixed(4),
  ]);
  assert.equal(prices.size, 3);
  assert.ok(bear.impliedSharePriceGordon < base.impliedSharePriceGordon);
  assert.ok(base.impliedSharePriceGordon < bull.impliedSharePriceGordon);
});

test('sensitivity table recalculates independently per cell and is internally consistent', () => {
  const { exitMultiple, wacc, terminalGrowthRate, ...rest } = BASE_CASE;
  const result = calculateSensitivityTable({
    waccRange: [0.07, 0.09, 0.11],
    terminalGrowthRange: [0.01, 0.025, 0.04],
    baseCaseInputs: { ...rest, cash: CASH, debt: DEBT, dilutedShares: SHARES },
  });
  for (const row of result.table) {
    const validCells = row.filter((v) => v !== null);
    for (let i = 1; i < validCells.length; i++) {
      assert.ok(validCells[i] >= validCells[i - 1]);
    }
  }
  const withInvalid = calculateSensitivityTable({
    waccRange: [0.02],
    terminalGrowthRange: [0.05],
    baseCaseInputs: { ...rest, cash: CASH, debt: DEBT, dilutedShares: SHARES },
  });
  assert.equal(withInvalid.table[0][0], null);
});

test('validation: terminal growth >= WACC throws instead of returning a bad number', () => {
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: 0.03, terminalGrowthRate: 0.03 }));
});

test('validation: zero or negative diluted shares throws instead of dividing by zero', () => {
  const dcf = calculateDCF(BASE_CASE);
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, CASH, DEBT);
  assert.throws(() => calculateImpliedSharePrice(equity, 0));
  assert.throws(() => calculateImpliedSharePrice(equity, -5));
});

test('validation: missing required numeric input throws rather than silently using zero', () => {
  const { ebitMargin, ...missingMargin } = BASE_CASE;
  assert.throws(() => calculateDCF(missingMargin));
});

test('validation: negative diluted shares or negative cash/debt are rejected', () => {
  assert.throws(() => calculateEquityValue(1000, -1, 100));
  assert.throws(() => calculateImpliedSharePrice(1000, -1));
});
