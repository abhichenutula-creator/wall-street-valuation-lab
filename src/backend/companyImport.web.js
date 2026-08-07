import { webMethod, Permissions } from '@wix/web-methods';
import { fetchCompanyProfile, fetchIncomeStatements, fetchBalanceSheets, fetchCashFlows, fetchKeyMetrics } from './importing/fmpClient.js';
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

// TEMPORARY (Phase 6 schema discovery) — dumps the raw key-metrics field
// names/values for one period so the Phase 6 comps/historical-multiples
// parser can be written against confirmed real fields. Remove after use.
export const debugKeyMetrics = webMethod(Permissions.Anyone, async (rawTicker) => {
  const ticker = String(rawTicker || '').trim().toUpperCase();
  try {
    const data = await fetchKeyMetrics(ticker, 5);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
