import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalMultiples } from '../../src/backend/comps/historicalMultiples.js';

const FINANCIALS = [
  { fiscalYear: '2022-06-30', revenue: 180000, ebitda: 86000, netIncome: 58400, fcf: 55000 },
  { fiscalYear: '2023-06-30', revenue: 195000, ebitda: 94000, netIncome: 64000, fcf: 60000 },
  { fiscalYear: '2024-06-30', revenue: 210000, ebitda: 103000, netIncome: 70400, fcf: 65000 },
  { fiscalYear: '2025-06-30', revenue: 230000, ebitda: 114000, netIncome: 78400, fcf: 72000 },
  { fiscalYear: '2026-06-30', revenue: 250000, ebitda: 125000, netIncome: 86400, fcf: 80000 },
];

const KEY_METRICS = [
  { date: '2026-06-30', marketCap: 3500000, enterpriseValue: 3600000 },
  { date: '2025-06-30', marketCap: 2900000, enterpriseValue: 3000000 },
  { date: '2024-06-30', marketCap: 2400000, enterpriseValue: 2500000 },
  { date: '2023-06-30', marketCap: 2000000, enterpriseValue: 2100000 },
  { date: '2022-06-30', marketCap: 1700000, enterpriseValue: 1800000 },
];

test('buildHistoricalMultiples returns unavailable when key-metrics is empty', () => {
  const result = buildHistoricalMultiples([], FINANCIALS);
  assert.equal(result.available, false);
  assert.match(result.reason, /no historical key-metrics/i);
});

test('buildHistoricalMultiples returns unavailable when marketCap/enterpriseValue are absent from every row', () => {
  const barren = KEY_METRICS.map((r) => ({ date: r.date }));
  const result = buildHistoricalMultiples(barren, FINANCIALS);
  assert.equal(result.available, false);
  assert.match(result.reason, /did not include/i);
});

test('buildHistoricalMultiples computes current/median/mean/p25/p75/range for a clean 5-year series', () => {
  const result = buildHistoricalMultiples(KEY_METRICS, FINANCIALS);
  assert.equal(result.available, true);
  const peRatio = result.metrics.peRatio;
  assert.equal(peRatio.available, true);
  // current = latest year: 3500000 / 86400
  assert.ok(Math.abs(peRatio.current - 3500000 / 86400) < 1e-6);
  assert.ok(peRatio.median !== null);
  assert.ok(peRatio.range[0] <= peRatio.median && peRatio.median <= peRatio.range[1]);
  assert.equal(peRatio.series.length, 5);
});

test('buildHistoricalMultiples excludes a year with a negative denominator from that metric only', () => {
  const badFinancials = FINANCIALS.map((f, i) => (i === 2 ? { ...f, netIncome: -1000 } : f));
  const result = buildHistoricalMultiples(KEY_METRICS, badFinancials);
  const peSeries = result.metrics.peRatio.series;
  assert.equal(peSeries[2].value, null);
  // evToRevenue for that year is unaffected since it doesn't depend on netIncome
  assert.ok(result.metrics.evToRevenue.series[2].value !== null);
});
