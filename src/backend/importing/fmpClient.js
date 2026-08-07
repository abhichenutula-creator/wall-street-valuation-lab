import { secrets } from '@wix/secrets';

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

async function getApiKey() {
  const { value } = await secrets.getSecretValue({ name: 'FMP_API_KEY' });
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
    throw new Error(`FMP request to "${path}" failed with status ${response.status}`);
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
