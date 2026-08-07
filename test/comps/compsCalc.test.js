import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, median, percentile,
  calculateMultiple, calculateAllMultiples,
  buildCompsTable, impliedSharePrice, buildImpliedValueRanges,
} from '../../src/backend/comps/compsCalc.js';

const TARGET = {
  ticker: 'MSFT', marketCap: 3726502, enterpriseValue: 3834311,
  revenue: 331839, ebitda: 218000, ebit: 155000, netIncome: 135000, fcf: 100000,
  cash: 20935, debt: 128808, dilutedShares: 7453,
};

test('calculateMultiple excludes a negative or zero denominator', () => {
  const negEbit = { ...TARGET, ebit: -5000 };
  assert.equal(calculateMultiple(negEbit, 'evToEbit'), null);
  const zeroRevenue = { ...TARGET, revenue: 0 };
  assert.equal(calculateMultiple(zeroRevenue, 'evToRevenue'), null);
  assert.ok(calculateMultiple(TARGET, 'evToRevenue') > 0);
});

test('calculateAllMultiples computes every metric for a clean entity', () => {
  const m = calculateAllMultiples(TARGET);
  assert.ok(Math.abs(m.evToRevenue - 3834311 / 331839) < 1e-9);
  assert.ok(Math.abs(m.peRatio - 3726502 / 135000) < 1e-9);
});

test('median/mean/percentile handle nulls and standard cases', () => {
  assert.equal(median([1, 2, 3, null, undefined]), 2);
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(percentile([1, 2, 3, 4], 25), 1.75);
  assert.equal(median([]), null);
});

test('buildCompsTable excludes a negative-EBIT peer from evToEbit stats but keeps it in the table', () => {
  const peers = [
    { ticker: 'A', marketCap: 3000000, enterpriseValue: 3100000, revenue: 300000, ebitda: 200000, ebit: 150000, netIncome: 120000, fcf: 90000, cash: 10000, debt: 20000, dilutedShares: 5000 },
    { ticker: 'B', marketCap: 1000000, enterpriseValue: 1050000, revenue: 100000, ebitda: -5000, ebit: -8000, netIncome: 3000, fcf: 2000, cash: 5000, debt: 6000, dilutedShares: 1000 },
  ];
  const table = buildCompsTable(TARGET, peers);
  assert.equal(table.peers[1].multiples.evToEbit, null);
  assert.equal(table.peers[1].multiples.evToEbitda, null);
  // stats.evToEbit should only reflect peer A (peer B's is null and excluded automatically)
  assert.ok(Math.abs(table.stats.evToEbit.median - table.peers[0].multiples.evToEbit) < 1e-9);
});

test('buildCompsTable respects an explicitly excluded peer in its stats', () => {
  const peers = [
    { ticker: 'A', marketCap: 3000000, enterpriseValue: 3100000, revenue: 300000, ebitda: 200000, ebit: 150000, netIncome: 120000, fcf: 90000, cash: 10000, debt: 20000, dilutedShares: 5000 },
    { ticker: 'B', marketCap: 1000000, enterpriseValue: 1050000, revenue: 100000, ebitda: 60000, ebit: 50000, netIncome: 40000, fcf: 30000, cash: 5000, debt: 6000, dilutedShares: 1000 },
  ];
  const allIncluded = buildCompsTable(TARGET, peers);
  const bExcluded = buildCompsTable(TARGET, [peers[0], { ...peers[1], included: false }]);
  assert.notEqual(allIncluded.stats.evToRevenue.median, bExcluded.stats.evToRevenue.median);
  assert.ok(Math.abs(bExcluded.stats.evToRevenue.median - bExcluded.peers[0].multiples.evToRevenue) < 1e-9);
});

test('impliedSharePrice bridges an EV-based multiple through EV -> equity -> price', () => {
  const price = impliedSharePrice('evToEbitda', 12, TARGET);
  const expectedEquity = 12 * TARGET.ebitda + TARGET.cash - TARGET.debt;
  assert.ok(Math.abs(price - expectedEquity / TARGET.dilutedShares) < 1e-9);
});

test('impliedSharePrice bridges an equity-based multiple (P/E) directly', () => {
  const price = impliedSharePrice('peRatio', 25, TARGET);
  assert.ok(Math.abs(price - (25 * TARGET.netIncome) / TARGET.dilutedShares) < 1e-9);
});

test('impliedSharePrice returns null when the multiple or target denominator is unavailable', () => {
  assert.equal(impliedSharePrice('evToEbit', null, TARGET), null);
  assert.equal(impliedSharePrice('evToEbit', 10, { ...TARGET, ebit: null }), null);
  assert.equal(impliedSharePrice('evToEbit', 10, { ...TARGET, ebit: -1000 }), null);
});

test('buildImpliedValueRanges produces low <= mid <= high for a normal peer set', () => {
  const peers = [
    { ticker: 'A', marketCap: 3000000, enterpriseValue: 3100000, revenue: 300000, ebitda: 200000, ebit: 150000, netIncome: 120000, fcf: 90000, cash: 10000, debt: 20000, dilutedShares: 5000 },
    { ticker: 'B', marketCap: 2000000, enterpriseValue: 2100000, revenue: 200000, ebitda: 150000, ebit: 100000, netIncome: 90000, fcf: 70000, cash: 8000, debt: 9000, dilutedShares: 3000 },
    { ticker: 'C', marketCap: 4000000, enterpriseValue: 4200000, revenue: 400000, ebitda: 300000, ebit: 220000, netIncome: 180000, fcf: 150000, cash: 15000, debt: 25000, dilutedShares: 6000 },
  ];
  const table = buildCompsTable(TARGET, peers);
  const ranges = buildImpliedValueRanges(table, TARGET);
  Object.keys(ranges).forEach((k) => {
    const r = ranges[k];
    if (r.low !== null && r.high !== null) assert.ok(r.low <= r.high, `${k}: low should be <= high`);
  });
});
