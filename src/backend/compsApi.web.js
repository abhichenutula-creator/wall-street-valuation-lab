import { webMethod, Permissions } from '@wix/web-methods';
import { fetchCompanyProfile, fetchIncomeStatements, fetchBalanceSheets, fetchCashFlows, fetchKeyMetrics } from './importing/fmpClient.js';
import { buildEntityMetrics, buildFinancialsSeries } from './comps/metrics.js';
import { buildCompsTable, buildImpliedValueRanges } from './comps/compsCalc.js';
import { buildHistoricalMultiples } from './comps/historicalMultiples.js';

// Phase 6: comps + historical-multiples data. Same PRIVATE DEV/TEST-ONLY FMP
// account and server-side-only fetch discipline as companyImport.web.js —
// see that file's header comment. This file is purely additive: it does not
// import or alter the DCF engine, valuationApi.web.js, or Phase 5's
// normalizeFmp.js.

const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;

async function fetchEntityMetrics(ticker) {
  const [profileRaw, incomeRaw, balanceRaw, cashflowRaw] = await Promise.all([
    fetchCompanyProfile(ticker),
    fetchIncomeStatements(ticker, 1),
    fetchBalanceSheets(ticker, 1),
    fetchCashFlows(ticker, 1),
  ]);
  return buildEntityMetrics(ticker, { profileRaw, incomeRaw, balanceRaw, cashflowRaw });
}

export const runMultiMethodValuation = webMethod(Permissions.Anyone, async (rawTicker, rawPeerTickers) => {
  const ticker = String(rawTicker || '').trim().toUpperCase();
  if (!ticker || !TICKER_PATTERN.test(ticker)) {
    throw new Error(`Invalid ticker: "${rawTicker}"`);
  }
  const peerTickers = (Array.isArray(rawPeerTickers) ? rawPeerTickers : [])
    .map((t) => String(t || '').trim().toUpperCase())
    .filter((t, i, arr) => TICKER_PATTERN.test(t) && t !== ticker && arr.indexOf(t) === i)
    .slice(0, 8); // sanity cap on peer-set size

  const warnings = [];

  const targetResult = await fetchEntityMetrics(ticker);
  warnings.push(...targetResult.warnings);
  if (!targetResult.metrics) {
    throw new Error(`Could not build comps metrics for ${ticker}: ${targetResult.warnings.join('; ')}`);
  }

  const peerResults = await Promise.all(peerTickers.map(async (peerTicker) => {
    try {
      return await fetchEntityMetrics(peerTicker);
    } catch (err) {
      return { metrics: null, warnings: [`${peerTicker}: fetch failed — ${err.message}`] };
    }
  }));
  peerResults.forEach((r) => warnings.push(...r.warnings));

  // Flag (never silently exclude) a peer whose sector differs from the
  // target's, so the user can judge comparability rather than the tool
  // deciding for them — the peer list stays fully user-editable either way.
  const peerMetrics = peerResults
    .filter((r) => r.metrics)
    .map((r) => ({
      ...r.metrics,
      sectorMismatch: Boolean(targetResult.metrics.sector && r.metrics.sector && r.metrics.sector !== targetResult.metrics.sector),
    }));

  const compsTable = buildCompsTable(targetResult.metrics, peerMetrics);
  const impliedRanges = buildImpliedValueRanges(compsTable, targetResult.metrics);

  const [incomeHistRaw, cashflowHistRaw, keyMetricsRaw] = await Promise.all([
    fetchIncomeStatements(ticker, 5),
    fetchCashFlows(ticker, 5),
    fetchKeyMetrics(ticker, 5).catch((err) => {
      warnings.push(`${ticker}: key-metrics fetch failed — ${err.message}`);
      return [];
    }),
  ]);
  const financialsByYear = buildFinancialsSeries(incomeHistRaw, cashflowHistRaw);
  const historicalMultiples = buildHistoricalMultiples(keyMetricsRaw, financialsByYear);
  if (!historicalMultiples.available) warnings.push(`Historical multiples: ${historicalMultiples.reason}`);

  return {
    ticker,
    target: targetResult.metrics,
    compsTable,
    impliedRanges,
    historicalMultiples,
    requestedPeers: peerTickers,
    warnings,
  };
});
