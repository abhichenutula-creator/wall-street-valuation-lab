// Pure functions for Phase 6 (multi-method valuation: comps, historical
// multiples, football field). No Wix imports, no network calls. Entirely
// additive — does not modify normalizeFmp.js or the DCF engine.

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toMillions(value) {
  return value === null ? null : value / 1e6;
}

// FMP returns statements most-recent-first; re-sort oldest-first so callers
// can align by index/year, matching normalizeFmp.js's convention.
function sortOldestFirst(rawArray) {
  return [...rawArray].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// FCF: prefer FMP's own `freeCashFlow` field (confirmed present on real
// responses); fall back to operating cash flow minus capex if it's missing.
function extractFcfMillions(cashflowRow) {
  if (!cashflowRow) return null;
  const fcfRaw = num(cashflowRow.freeCashFlow);
  if (fcfRaw !== null) return toMillions(fcfRaw);
  const ocf = num(cashflowRow.netCashProvidedByOperatingActivities);
  const capex = num(cashflowRow.capitalExpenditure);
  return ocf !== null && capex !== null ? toMillions(ocf - Math.abs(capex)) : null;
}

function extractNetIncomeMillions(incomeRow) {
  const incomeBeforeTax = num(incomeRow.incomeBeforeTax);
  const incomeTaxExpense = num(incomeRow.incomeTaxExpense);
  return incomeBeforeTax !== null && incomeTaxExpense !== null ? toMillions(incomeBeforeTax - incomeTaxExpense) : null;
}

// Builds one company's comps-relevant metrics (millions, matching the
// dashboard/engine convention) from its latest raw FMP profile/
// income-statement/balance-sheet/cash-flow-statement responses.
export function buildEntityMetrics(ticker, { profileRaw, incomeRaw, balanceRaw, cashflowRaw }) {
  const warnings = [];
  const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
  const income = Array.isArray(incomeRaw) ? incomeRaw[0] : incomeRaw;
  const balance = Array.isArray(balanceRaw) ? balanceRaw[0] : balanceRaw;
  const cashflow = Array.isArray(cashflowRaw) ? cashflowRaw[0] : cashflowRaw;

  if (!profile || !income || !balance || !cashflow) {
    return { metrics: null, warnings: [`${ticker}: missing one or more statement types, excluded`] };
  }

  const price = num(profile.price);
  const dilutedShares = toMillions(num(income.weightedAverageShsOutDil));
  const marketCap = price !== null && dilutedShares !== null
    ? price * dilutedShares
    : toMillions(num(profile.mktCap ?? profile.marketCap));

  const cash = toMillions(num(balance.cashAndCashEquivalents));
  let debt = toMillions(num(balance.totalDebt));
  if (debt === null) {
    const shortTerm = toMillions(num(balance.shortTermDebt)) ?? 0;
    const longTerm = toMillions(num(balance.longTermDebt)) ?? 0;
    if (num(balance.shortTermDebt) !== null || num(balance.longTermDebt) !== null) debt = shortTerm + longTerm;
  }
  const enterpriseValue = marketCap !== null && cash !== null && debt !== null ? marketCap - cash + debt : null;

  const revenue = toMillions(num(income.revenue));
  const ebitda = toMillions(num(income.ebitda));
  const ebit = toMillions(num(income.operatingIncome));
  const netIncome = extractNetIncomeMillions(income);
  const fcf = extractFcfMillions(cashflow);

  if (marketCap === null) warnings.push(`${ticker}: could not determine market cap`);
  if (enterpriseValue === null) warnings.push(`${ticker}: could not determine enterprise value`);
  if (dilutedShares === null) warnings.push(`${ticker}: could not determine diluted shares`);

  return {
    metrics: {
      ticker,
      name: profile.companyName ?? ticker,
      price,
      dilutedShares,
      marketCap,
      cash,
      debt,
      enterpriseValue,
      revenue,
      ebitda,
      ebit,
      netIncome,
      fcf,
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
    },
    warnings,
  };
}

// Oldest-first per-year series of {fiscalYear, revenue, ebitda, netIncome,
// fcf} in millions, for pairing with historical market-cap/EV data (from
// FMP's key-metrics endpoint) to build historical multiples.
export function buildFinancialsSeries(incomeRawArray, cashflowRawArray) {
  const income = sortOldestFirst(Array.isArray(incomeRawArray) ? incomeRawArray : []);
  const cashflow = sortOldestFirst(Array.isArray(cashflowRawArray) ? cashflowRawArray : []);
  return income.map((row, i) => ({
    fiscalYear: row.date ?? null,
    revenue: toMillions(num(row.revenue)),
    ebitda: toMillions(num(row.ebitda)),
    netIncome: extractNetIncomeMillions(row),
    fcf: extractFcfMillions(cashflow[i]),
  }));
}
