// Pure normalization functions — no Wix imports, no network calls.
// Converts raw FMP JSON (arrays of per-year objects, most-recent-first as
// FMP returns them) into the plain shapes the dashboard/engine consume.
// Every function is defensive: missing/invalid fields produce a warning
// string rather than throwing, since this layer only pre-fills editable
// dashboard inputs — the verified engine's own strict validation is untouched
// and still runs on whatever values actually get submitted to it.

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeProfile(rawProfileArray) {
  const raw = Array.isArray(rawProfileArray) ? rawProfileArray[0] : rawProfileArray;
  const warnings = [];
  if (!raw) {
    return { profile: null, warnings: ['FMP profile response was empty'] };
  }

  const price = num(raw.price);
  const marketCap = num(raw.mktCap ?? raw.marketCap);
  const beta = num(raw.beta);
  if (price === null) warnings.push('profile.price missing or invalid');
  if (marketCap === null) warnings.push('profile.mktCap missing or invalid');
  if (beta === null) warnings.push('profile.beta missing or invalid');

  return {
    profile: {
      name: raw.companyName ?? null,
      ticker: raw.symbol ?? null,
      exchange: raw.exchangeShortName ?? raw.exchange ?? null,
      sector: raw.sector ?? null,
      industry: raw.industry ?? null,
      currency: raw.currency ?? null,
      price,
      marketCap: marketCap === null ? null : marketCap / 1e6, // millions, matching dashboard units
      beta,
    },
    warnings,
  };
}

// FMP returns statements most-recent-first; we re-sort oldest-first so the
// dashboard's historical table reads left (oldest) to right (most recent),
// matching FY-4..FY0 convention.
function sortOldestFirst(rawArray) {
  return [...rawArray].sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function normalizeIncomeStatements(rawArray) {
  const warnings = [];
  if (!Array.isArray(rawArray) || rawArray.length === 0) {
    return { periods: [], warnings: ['FMP income statement response was empty'] };
  }
  const periods = sortOldestFirst(rawArray).map((row) => {
    const revenue = num(row.revenue);
    const ebit = num(row.operatingIncome);
    const ebitda = num(row.ebitda);
    const incomeBeforeTax = num(row.incomeBeforeTax);
    const incomeTaxExpense = num(row.incomeTaxExpense);
    const dilutedShares = num(row.weightedAverageShsOutDil);
    const da = num(row.depreciationAndAmortization);

    let effectiveTaxRate = null;
    if (incomeBeforeTax !== null && incomeTaxExpense !== null && incomeBeforeTax !== 0) {
      const rate = incomeTaxExpense / incomeBeforeTax;
      effectiveTaxRate = rate >= 0 && rate <= 0.6 ? rate : null;
      if (effectiveTaxRate === null) {
        warnings.push(`${row.date}: effective tax rate ${(rate * 100).toFixed(1)}% out of expected [0,60]% range, discarded`);
      }
    } else {
      warnings.push(`${row.date}: cannot compute effective tax rate (missing incomeBeforeTax/incomeTaxExpense)`);
    }
    if (revenue === null) warnings.push(`${row.date}: revenue missing`);
    if (ebit === null) warnings.push(`${row.date}: operatingIncome (EBIT) missing`);
    if (dilutedShares === null) warnings.push(`${row.date}: weightedAverageShsOutDil missing`);

    return {
      fiscalYear: row.date ?? null,
      period: row.period ?? null,
      revenue,
      ebit,
      ebitda,
      depreciationAndAmortization: da,
      effectiveTaxRate,
      dilutedShares,
    };
  });
  return { periods, warnings };
}

export function normalizeBalanceSheets(rawArray) {
  const warnings = [];
  if (!Array.isArray(rawArray) || rawArray.length === 0) {
    return { periods: [], warnings: ['FMP balance sheet response was empty'] };
  }
  const periods = sortOldestFirst(rawArray).map((row) => {
    const cash = num(row.cashAndCashEquivalents);
    let debt = num(row.totalDebt);
    if (debt === null) {
      const shortTerm = num(row.shortTermDebt) ?? 0;
      const longTerm = num(row.longTermDebt) ?? 0;
      if (num(row.shortTermDebt) !== null || num(row.longTermDebt) !== null) {
        debt = shortTerm + longTerm;
        warnings.push(`${row.date}: totalDebt missing, summed shortTermDebt + longTermDebt instead`);
      }
    }
    if (cash === null) warnings.push(`${row.date}: cashAndCashEquivalents missing`);
    if (debt === null) warnings.push(`${row.date}: totalDebt (and shortTermDebt/longTermDebt) missing`);
    return { fiscalYear: row.date ?? null, cash, debt };
  });
  return { periods, warnings };
}

export function normalizeCashFlows(rawArray) {
  const warnings = [];
  if (!Array.isArray(rawArray) || rawArray.length === 0) {
    return { periods: [], warnings: ['FMP cash flow statement response was empty'] };
  }
  const periods = sortOldestFirst(rawArray).map((row) => {
    const da = num(row.depreciationAndAmortization);
    const capexRaw = num(row.capitalExpenditure);
    const capex = capexRaw === null ? null : Math.abs(capexRaw);
    // FMP's cash-flow-statement expresses changeInWorkingCapital as a signed
    // cash-flow-statement line item (negative = NWC increased, consuming cash).
    // Our engine's deltaNWC is "increase in NWC" as a positive outflow, so we
    // flip the sign. VERIFY against a real response during live MSFT testing —
    // flagged explicitly rather than assumed correct.
    const changeInWorkingCapitalRaw = num(row.changeInWorkingCapital);
    const nwcIncrease = changeInWorkingCapitalRaw === null ? null : -changeInWorkingCapitalRaw;

    if (da === null) warnings.push(`${row.date}: depreciationAndAmortization missing (cash flow statement)`);
    if (capex === null) warnings.push(`${row.date}: capitalExpenditure missing`);
    if (nwcIncrease === null) warnings.push(`${row.date}: changeInWorkingCapital missing`);

    return { fiscalYear: row.date ?? null, depreciationAndAmortization: da, capitalExpenditure: capex, nwcIncrease };
  });
  return { periods, warnings };
}

function cagr(first, last, numPeriods) {
  if (first === null || last === null || first <= 0 || numPeriods <= 0) return null;
  return Math.pow(last / first, 1 / numPeriods) - 1;
}

// FMP returns raw dollar amounts and raw share counts; the dashboard/engine
// convention (established in Phase 3, e.g. baseRevenue: 1000 meaning $1,000M)
// is millions. Ratios (margins, tax rate, % of revenue) are scale-invariant
// and computed from raw values before this conversion, so they're unaffected.
function toMillions(value) {
  return value === null ? null : value / 1e6;
}

// Combines the normalized statements into the exact shape the dashboard's
// editable `state` object uses, plus a `historical` array for the table and
// a `warnings` array surfacing every fallback/anomaly for review.
export function deriveEngineInputs({ profile, income, balance, cashflow }) {
  const warnings = [...profile.warnings, ...income.warnings, ...balance.warnings, ...cashflow.warnings];

  const n = income.periods.length;
  const latestIncome = income.periods[n - 1] ?? null;
  const latestBalance = balance.periods[balance.periods.length - 1] ?? null;
  const latestCashflow = cashflow.periods[cashflow.periods.length - 1] ?? null;

  if (!latestIncome || !latestBalance || !latestCashflow) {
    warnings.push('At least one statement type returned zero periods — cannot derive engine inputs');
    return { company: null, shared: null, base: null, historical: [], warnings };
  }

  const revenue0 = income.periods[0].revenue;
  const revenueN = latestIncome.revenue;
  const revenueGrowth = n > 1 ? cagr(revenue0, revenueN, n - 1) : null;
  if (revenueGrowth === null) warnings.push('Could not compute historical revenue CAGR (need 2+ periods with valid revenue)');

  const ebitMargin = latestIncome.revenue && latestIncome.ebit !== null ? latestIncome.ebit / latestIncome.revenue : null;
  const daPctRevenue = latestIncome.revenue && latestCashflow.depreciationAndAmortization !== null
    ? latestCashflow.depreciationAndAmortization / latestIncome.revenue : null;
  const capexPctRevenue = latestIncome.revenue && latestCashflow.capitalExpenditure !== null
    ? latestCashflow.capitalExpenditure / latestIncome.revenue : null;
  const nwcChangePctRevenue = latestIncome.revenue && latestCashflow.nwcIncrease !== null
    ? latestCashflow.nwcIncrease / latestIncome.revenue : null;

  const FALLBACK_TAX_RATE = 0.21;
  let taxRate = latestIncome.effectiveTaxRate;
  if (taxRate === null) {
    warnings.push(`No valid effective tax rate found, falling back to ${FALLBACK_TAX_RATE * 100}% (US statutory rate)`);
    taxRate = FALLBACK_TAX_RATE;
  }

  const historical = income.periods.map((p, i) => ({
    fiscalYear: p.fiscalYear,
    revenue: toMillions(p.revenue),
    ebit: toMillions(p.ebit),
    ebitMargin: p.revenue && p.ebit !== null ? p.ebit / p.revenue : null,
    ebitda: toMillions(p.ebitda),
    depreciationAndAmortization: toMillions(cashflow.periods[i]?.depreciationAndAmortization ?? p.depreciationAndAmortization ?? null),
    capitalExpenditure: toMillions(cashflow.periods[i]?.capitalExpenditure ?? null),
  }));

  return {
    company: profile.profile,
    shared: {
      baseRevenue: toMillions(revenueN),
      taxRate,
      daPctRevenue,
      capexPctRevenue,
      nwcChangePctRevenue,
      cash: toMillions(latestBalance.cash),
      debt: toMillions(latestBalance.debt),
      dilutedShares: toMillions(latestIncome.dilutedShares),
    },
    base: {
      revenueGrowth,
      ebitMargin,
    },
    historical,
    warnings,
  };
}
