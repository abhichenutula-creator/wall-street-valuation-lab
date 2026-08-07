// Pure trading-comps calculations: multiples, cross-peer statistics, and
// bridging a multiple back to an implied share price. No Wix imports, no
// network calls. Does not touch normalizeFmp.js or the DCF engine.

function validNumbers(values) {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

export function mean(values) {
  const v = validNumbers(values);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
}

export function median(values) {
  const v = validNumbers(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[mid];
}

// Linear-interpolation percentile (standard "inclusive" method).
export function percentile(values, p) {
  const v = validNumbers(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  if (v.length === 1) return v[0];
  const idx = (p / 100) * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

// kind 'ev': multiple = enterpriseValue / denominator, bridged EV -> equity -> price.
// kind 'equity': multiple = marketCap / denominator, already an equity-value multiple.
export const METRIC_DEFS = {
  evToRevenue: { kind: 'ev', numerator: 'enterpriseValue', denominator: 'revenue', label: 'EV / Revenue' },
  evToEbitda: { kind: 'ev', numerator: 'enterpriseValue', denominator: 'ebitda', label: 'EV / EBITDA' },
  evToEbit: { kind: 'ev', numerator: 'enterpriseValue', denominator: 'ebit', label: 'EV / EBIT' },
  peRatio: { kind: 'equity', numerator: 'marketCap', denominator: 'netIncome', label: 'P / E' },
  priceToFcf: { kind: 'equity', numerator: 'marketCap', denominator: 'fcf', label: 'Price / FCF' },
};

// A multiple is excluded (null) when its denominator is missing, zero, or
// negative — dividing by a negative/zero EBIT, EBITDA, net income, revenue,
// or FCF is not economically meaningful and must never be shown as a
// multiple, per Phase 6's explicit requirement.
export function calculateMultiple(entity, metricKey) {
  const def = METRIC_DEFS[metricKey];
  const numeratorValue = entity[def.numerator];
  const denominatorValue = entity[def.denominator];
  if (numeratorValue === null || numeratorValue === undefined) return null;
  if (denominatorValue === null || denominatorValue === undefined || denominatorValue <= 0) return null;
  return numeratorValue / denominatorValue;
}

export function calculateAllMultiples(entity) {
  const out = {};
  Object.keys(METRIC_DEFS).forEach((k) => { out[k] = calculateMultiple(entity, k); });
  return out;
}

// Builds the full comps table: target's own multiples, each peer's
// multiples (tagged `included`, defaulting to true), and cross-peer
// median/mean/p25/p75 computed only over INCLUDED peers for each metric —
// so unchecking a peer in the UI and recomputing this changes the stats.
export function buildCompsTable(target, peers) {
  const targetMultiples = calculateAllMultiples(target);
  const peerRows = peers.map((p) => ({
    ...p,
    included: p.included !== false,
    multiples: calculateAllMultiples(p),
  }));
  const stats = {};
  Object.keys(METRIC_DEFS).forEach((k) => {
    const includedValues = peerRows.filter((p) => p.included).map((p) => p.multiples[k]);
    stats[k] = {
      median: median(includedValues),
      mean: mean(includedValues),
      p25: percentile(includedValues, 25),
      p75: percentile(includedValues, 75),
    };
  });
  return { target: { ...target, multiples: targetMultiples }, peers: peerRows, stats };
}

// Bridges a peer/statistic multiple back to an implied per-share price for
// the target company:
//   EV-based:     EV = multiple * targetDenominator; equity = EV + cash - debt; price = equity / shares
//   Equity-based: equity = multiple * targetDenominator; price = equity / shares
export function impliedSharePrice(metricKey, multiple, target) {
  const def = METRIC_DEFS[metricKey];
  if (multiple === null || multiple === undefined) return null;
  const targetMetric = target[def.denominator];
  if (targetMetric === null || targetMetric === undefined || targetMetric <= 0) return null;
  if (target.dilutedShares === null || target.dilutedShares === undefined || target.dilutedShares <= 0) return null;

  let equityValue;
  if (def.kind === 'ev') {
    if (target.cash === null || target.debt === null) return null;
    equityValue = multiple * targetMetric + target.cash - target.debt;
  } else {
    equityValue = multiple * targetMetric;
  }
  return equityValue / target.dilutedShares;
}

// For each metric: low/mid/high implied share price from the peer
// p25/median/p75 multiples — a range, not one false-precision number.
export function buildImpliedValueRanges(compsTable, target) {
  const ranges = {};
  Object.keys(METRIC_DEFS).forEach((k) => {
    const s = compsTable.stats[k];
    ranges[k] = {
      low: impliedSharePrice(k, s.p25, target),
      mid: impliedSharePrice(k, s.median, target),
      high: impliedSharePrice(k, s.p75, target),
    };
  });
  return ranges;
}
