// Historical valuation multiples: compares the target's current multiple to
// its own 5-year trading history. Requires historical market cap /
// enterprise value per fiscal year (from FMP's key-metrics endpoint,
// keyed by `marketCap`/`enterpriseValue` per period, matched by `date`).
//
// If that data is unavailable, or FMP's response doesn't contain those
// fields for any period, this returns `available: false` with a stated
// reason rather than fabricating a number — per Phase 6's explicit
// requirement not to invent historical multiples when the underlying data
// isn't there.

import { median, mean, percentile } from './compsCalc.js';

export const HISTORICAL_METRIC_DEFS = {
  peRatio: { label: 'P / E' },
  evToRevenue: { label: 'EV / Revenue' },
  evToEbitda: { label: 'EV / EBITDA' },
  priceToFcf: { label: 'Price / FCF' },
};

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function computeSeriesValue(key, row) {
  if (key === 'peRatio') return row.marketCap !== null && row.netIncome > 0 ? row.marketCap / row.netIncome : null;
  if (key === 'evToRevenue') return row.enterpriseValue !== null && row.revenue > 0 ? row.enterpriseValue / row.revenue : null;
  if (key === 'evToEbitda') return row.enterpriseValue !== null && row.ebitda > 0 ? row.enterpriseValue / row.ebitda : null;
  if (key === 'priceToFcf') return row.marketCap !== null && row.fcf > 0 ? row.marketCap / row.fcf : null;
  return null;
}

// keyMetricsRaw: FMP key-metrics response, an array of per-period rows each
// with a `date` and (if present) `marketCap`/`enterpriseValue`.
// financialsByYear: oldest-first array of {fiscalYear, revenue, ebitda,
// netIncome, fcf} in millions (from metrics.js's buildFinancialsSeries),
// matched to key-metrics rows by fiscalYear === date.
export function buildHistoricalMultiples(keyMetricsRaw, financialsByYear) {
  if (!Array.isArray(keyMetricsRaw) || keyMetricsRaw.length === 0) {
    return { available: false, reason: 'FMP returned no historical key-metrics data for this ticker', metrics: null };
  }

  const byDate = {};
  keyMetricsRaw.forEach((row) => { byDate[row.date] = row; });

  const rows = financialsByYear.map((f) => {
    const km = byDate[f.fiscalYear];
    return {
      ...f,
      marketCap: km ? num(km.marketCap) : null,
      enterpriseValue: km ? num(km.enterpriseValue) : null,
    };
  });

  const haveAny = rows.some((r) => r.marketCap !== null || r.enterpriseValue !== null);
  if (!haveAny) {
    return {
      available: false,
      reason: 'FMP key-metrics response did not include marketCap/enterpriseValue for any historical period',
      metrics: null,
    };
  }

  const metrics = {};
  Object.keys(HISTORICAL_METRIC_DEFS).forEach((key) => {
    const series = rows.map((r) => computeSeriesValue(key, r));
    const valid = series.filter((v) => v !== null);
    if (valid.length === 0) {
      metrics[key] = { available: false, current: null, median: null, mean: null, p25: null, p75: null, range: null, series: [] };
      return;
    }
    metrics[key] = {
      available: true,
      current: series[series.length - 1],
      median: median(series),
      mean: mean(series),
      p25: percentile(series, 25),
      p75: percentile(series, 75),
      range: [Math.min(...valid), Math.max(...valid)],
      series: rows.map((r, i) => ({ fiscalYear: r.fiscalYear, value: series[i] })),
    };
  });

  return { available: true, metrics };
}
