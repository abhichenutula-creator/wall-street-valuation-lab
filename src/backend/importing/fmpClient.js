import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';

// secrets.getSecretValue requires SECRETS_VAULT.SECRET_READ, which our own
// Permissions.Anyone web method doesn't have by default — elevate() runs it
// with the site owner's permission instead. Confirmed against Wix's current
// (non-deprecated) Secrets API docs, not the older `wix-secrets-backend`
// getSecret(), which is deprecated, and not `@wix/secrets`, which isn't
// available as a built-in module on classic Velo sites (caused a real
// "Cannot find module" bug during Phase 4 live testing — fixed here).
const elevatedGetSecretValue = elevate(secrets.getSecretValue);

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

async function getApiKey() {
  const value = await elevatedGetSecretValue('FMP_API_KEY');
  if (!value) {
    throw new Error('FMP_API_KEY secret is empty or not found in Secrets Manager');
  }
  return value;
}

async function fetchFmp(path, params) {
  const apiKey = await getApiKey();
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${FMP_BASE_URL}/${path}?${query.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    // Never include the URL (contains the API key) in thrown error messages —
    // those can end up in logs or, worse, in a client-visible error payload.
    // FMP's error response body (no key in it) names the exact cause (bad key
    // vs. plan/endpoint restriction), so surface that text for diagnosis.
    let bodyText = '';
    try { bodyText = await response.text(); } catch (e) { /* ignore */ }
    throw new Error(`FMP request to "${path}" failed with status ${response.status}: ${bodyText.slice(0, 300)}`);
  }
  return response.json();
}

export async function fetchCompanyProfile(ticker) {
  return fetchFmp('profile', { symbol: ticker });
}

export async function fetchIncomeStatements(ticker, limit = 5) {
  return fetchFmp('income-statement', { symbol: ticker, period: 'annual', limit: String(limit) });
}

export async function fetchBalanceSheets(ticker, limit = 5) {
  return fetchFmp('balance-sheet-statement', { symbol: ticker, period: 'annual', limit: String(limit) });
}

export async function fetchCashFlows(ticker, limit = 5) {
  return fetchFmp('cash-flow-statement', { symbol: ticker, period: 'annual', limit: String(limit) });
}
