import { webMethod, Permissions } from '@wix/web-methods';
import { fetchCompanyProfile, fetchIncomeStatements, fetchBalanceSheets, fetchCashFlows, debugSecretMeta } from './importing/fmpClient.js';
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

// TEMPORARY debug exports for isolating the 401 — test one endpoint at a
// time instead of the combined Promise.all above. Remove once resolved.
export const debugFetchProfile = webMethod(Permissions.Anyone, async (ticker) => {
  try {
    const data = await fetchCompanyProfile(ticker);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

export const debugFetchIncome = webMethod(Permissions.Anyone, async (ticker) => {
  try {
    const data = await fetchIncomeStatements(ticker, 5);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

export const debugFetchBalance = webMethod(Permissions.Anyone, async (ticker) => {
  try {
    const data = await fetchBalanceSheets(ticker, 5);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

export const debugFetchCashflow = webMethod(Permissions.Anyone, async (ticker) => {
  try {
    const data = await fetchCashFlows(ticker, 5);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

export const debugSecretMetaCheck = webMethod(Permissions.Anyone, async () => {
  return debugSecretMeta();
});
