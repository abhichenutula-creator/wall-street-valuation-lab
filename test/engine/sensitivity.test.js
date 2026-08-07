import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSensitivityTable } from '../../src/engine/sensitivity.js';
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from '../../src/engine/dcf.js';

const BASE_CASE_INPUTS = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

test('calculateSensitivityTable matches direct recomputation for a valid cell', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.08, 0.09, 0.10],
    terminalGrowthRange: [0.015, 0.025],
    baseCaseInputs: BASE_CASE_INPUTS,
  });

  const { cash, debt, dilutedShares, ...dcfInputs } = BASE_CASE_INPUTS;
  const dcf = calculateDCF({ ...dcfInputs, wacc: 0.09, terminalGrowthRate: 0.025 });
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
  const expected = calculateImpliedSharePrice(equity, dilutedShares);

  assert.ok(Math.abs(result.table[1][1] - expected) < 1e-6);
});

test('calculateSensitivityTable returns null for invalid terminalGrowth >= wacc combinations', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.02, 0.09],
    terminalGrowthRange: [0.03, 0.025],
    baseCaseInputs: BASE_CASE_INPUTS,
  });
  // wacc=0.02: both g=0.03 and g=0.025 are >= wacc -> invalid
  assert.equal(result.table[0][0], null);
  assert.equal(result.table[0][1], null);
  // wacc=0.09: both g=0.03 and g=0.025 are < wacc -> valid
  assert.ok(typeof result.table[1][0] === 'number');
  assert.ok(typeof result.table[1][1] === 'number');
});

test('implied share price decreases as WACC increases, holding terminal growth fixed', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.08, 0.09, 0.10],
    terminalGrowthRange: [0.02],
    baseCaseInputs: BASE_CASE_INPUTS,
  });
  const [p8, p9, p10] = result.table.map((row) => row[0]);
  assert.ok(p8 > p9);
  assert.ok(p9 > p10);
});

test('calculateSensitivityTable rejects empty ranges', () => {
  assert.throws(() =>
    calculateSensitivityTable({ waccRange: [], terminalGrowthRange: [0.02], baseCaseInputs: BASE_CASE_INPUTS })
  );
  assert.throws(() =>
    calculateSensitivityTable({ waccRange: [0.09], terminalGrowthRange: [], baseCaseInputs: BASE_CASE_INPUTS })
  );
});
