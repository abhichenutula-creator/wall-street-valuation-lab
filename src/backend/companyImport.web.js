import { webMethod, Permissions } from '@wix/web-methods';
import { fetchCompanyProfile, fetchIncomeStatements, fetchBalanceSheets, fetchCashFlows } from './importing/fmpClient.js';
import { normalizeProfile, normalizeIncomeStatements, normalizeBalanceSheets, normalizeCashFlows, deriveEngineInputs } from './importing/normalizeFmp.js';

// FMP account: PRIVATE DEVELOPMENT/TESTING ONLY (see Terms of Service —
// display/redistribution of FMP data to the public requires a separate
// Data Display and Licensing Agreement, not yet in place). All FMP requests
// happen here, server-side; the API key never leaves this file — it is never
// included in the response returned to the frontend.

export const importCompanyData = webMethod(Permissions.Anyone, async (rawTicker) => {
  const ticker = String(rawTicker || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
    throw new Error(`Invalid ticker: "${rawTicker}"`);
  }

  const [profileRaw, incomeRaw, balanceRaw, cashflowRaw] = await Promise.all([
    fetchCompanyProfile(ticker),
    fetchIncomeStatements(ticker, 5),
    fetchBalanceSheets(ticker, 5),
    fetchCashFlows(ticker, 5),
  ]);

  const profile = normalizeProfile(profileRaw);
  const income = normalizeIncomeStatements(incomeRaw);
  const balance = normalizeBalanceSheets(balanceRaw);
  const cashflow = normalizeCashFlows(cashflowRaw);

  const result = deriveEngineInputs({ profile, income, balance, cashflow });

  return { ticker, ...result };
});

// TEMPORARY (Phase 5 forecast-initialization audit) — per-year ratio
// breakdown using the same normalized periods deriveEngineInputs uses, so
// the audit reflects exactly what production normalization produces.
// Remove once the audit is complete.
export const debugForecastAudit = webMethod(Permissions.Anyone, async (rawTicker) => {
  const ticker = String(rawTicker || '').trim().toUpperCase();
  const [incomeRaw, cashflowRaw] = await Promise.all([
    fetchIncomeStatements(ticker, 5),
    fetchCashFlows(ticker, 5),
  ]);
  const income = normalizeIncomeStatements(incomeRaw);
  const cashflow = normalizeCashFlows(cashflowRaw);
  const rows = income.periods.map((p, i) => {
    const cf = cashflow.periods[i] || {};
    const prevRevenue = i > 0 ? income.periods[i - 1].revenue : null;
    const revenueGrowthYoY = prevRevenue ? p.revenue / prevRevenue - 1 : null;
    const ebitMargin = p.revenue && p.ebit !== null ? p.ebit / p.revenue : null;
    const daPctRevenue = p.revenue && cf.depreciationAndAmortization != null ? cf.depreciationAndAmortization / p.revenue : null;
    const capexPctRevenue = p.revenue && cf.capitalExpenditure != null ? cf.capitalExpenditure / p.revenue : null;
    const nwcChangePctRevenue = p.revenue && cf.nwcIncrease != null ? cf.nwcIncrease / p.revenue : null;
    return {
      fiscalYear: p.fiscalYear,
      revenue: p.revenue,
      revenueGrowthYoY,
      ebitMargin,
      daPctRevenue,
      capexPctRevenue,
      nwcChangePctRevenue,
      effectiveTaxRate: p.effectiveTaxRate,
    };
  });
  return { ticker, rows };
});
