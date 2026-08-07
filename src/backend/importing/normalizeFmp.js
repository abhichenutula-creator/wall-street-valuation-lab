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

function average(values) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function median(values) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

function recentAverage(values, windowSize) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return average(valid.slice(-windowSize));
}

// Flags when the most recent value is a sharp deviation from the trailing
// window before it (e.g. a one-off capex surge), so a suggested starting
// assumption never silently smuggles a spike in as "the new normal" without
// the reason being visible. Purely a relative-deviation check — no
// company-specific numbers — so it applies the same way to any ticker.
function detectLatestYearDeviation(values, windowSize, thresholdRatio) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const priorWindow = valid.slice(0, -1).slice(-windowSize);
  const priorAvg = average(priorWindow);
  if (priorAvg === null || priorAvg <= 0) return null;
  const ratio = latest / priorAvg;
  if (ratio >= thresholdRatio || ratio <= 1 / thresholdRatio) {
    return { latest, priorAvg, deviationPct: ratio - 1 };
  }
  return null;
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

const RECENT_WINDOW = 3;
const DEVIATION_THRESHOLD_RATIO = 1.4; // flag a >40% relative jump/drop vs. the trailing window
const FALLBACK_TAX_RATE = 0.21;

// Phase 5 forecast-initialization methodology: a DCF's *starting* assumption
// should not blindly extrapolate whatever the latest reported year happened
// to be (a single elevated/depressed year, a one-off tax item, etc.) as the
// permanent run rate. Each of these builders picks the aggregation that best
// fits how that metric actually behaves historically across companies in
// general — never a company-specific number — and always reports *why*, so
// the suggestion is transparent and fully overridable.

// EBIT margin / D&A / CapEx: operating ratios that drift gradually with the
// business, but can carry a single unusual year (e.g. a capex supercycle).
// A recent-window average captures the current regime without treating one
// year as gospel, and a deviation check flags when that latest year is an
// outlier so it isn't silently perpetuated across the whole forecast.
function suggestRecentAverage(fiscalYears, values, label) {
  const validCount = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const value = recentAverage(values, RECENT_WINDOW);
  if (value === null) {
    return { value: null, methodology: `${RECENT_WINDOW}-year average`, sourceYears: [], warning: `${label}: no valid historical data to compute a suggested value` };
  }
  const usedCount = Math.min(RECENT_WINDOW, validCount);
  const deviation = detectLatestYearDeviation(values, RECENT_WINDOW, DEVIATION_THRESHOLD_RATIO);
  let warning = null;
  if (deviation) {
    const direction = deviation.deviationPct > 0 ? 'above' : 'below';
    warning = `${label}: latest year (${(deviation.latest * 100).toFixed(1)}%) is ${Math.abs(deviation.deviationPct * 100).toFixed(0)}% ${direction} the trailing average (${(deviation.priorAvg * 100).toFixed(1)}%) — using a ${usedCount}-year blended average instead of perpetuating the latest year alone`;
  }
  return { value, methodology: `${usedCount}-year average`, sourceYears: fiscalYears.slice(-usedCount), warning };
}

// Change in NWC: historically noisy and rarely trending in either direction,
// so a longer window (the full available history) is more representative
// than a short recent average, which would still be dominated by noise.
function suggestFullAverage(fiscalYears, values, label) {
  const validCount = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const value = average(values);
  if (value === null) {
    return { value: null, methodology: 'full-history average', sourceYears: [], warning: `${label}: no valid historical data to compute a suggested value` };
  }
  return { value, methodology: `${validCount}-year average`, sourceYears: fiscalYears.slice(-validCount), warning: null };
}

// Tax rate: prone to one-off, single-year distortions (credits, settlements,
// discrete items) that a mean would be skewed by. The median is robust to
// exactly one such outlier without needing to identify or exclude any
// specific year.
function suggestMedian(fiscalYears, values, label, fallbackValue) {
  const validCount = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const value = median(values);
  if (value === null) {
    return {
      value: fallbackValue,
      methodology: `fallback (${(fallbackValue * 100).toFixed(0)}%, no valid historical data)`,
      sourceYears: [],
      warning: `${label}: no valid historical data, falling back to ${(fallbackValue * 100).toFixed(0)}%`,
    };
  }
  return { value, methodology: `median across ${validCount} years`, sourceYears: fiscalYears.slice(-validCount), warning: null };
}

// Combines the normalized statements into the exact shape the dashboard's
// editable `state` object uses, plus a `historical` array for the table, a
// `suggestions` object explaining how each starting assumption was derived
// (for UI labeling), and a `warnings` array surfacing every fallback/anomaly.
export function deriveEngineInputs({ profile, income, balance, cashflow }) {
  const warnings = [...profile.warnings, ...income.warnings, ...balance.warnings, ...cashflow.warnings];

  const n = income.periods.length;
  const latestIncome = income.periods[n - 1] ?? null;
  const latestBalance = balance.periods[balance.periods.length - 1] ?? null;
  const latestCashflow = cashflow.periods[cashflow.periods.length - 1] ?? null;

  if (!latestIncome || !latestBalance || !latestCashflow) {
    warnings.push('At least one statement type returned zero periods — cannot derive engine inputs');
    return { company: null, shared: null, base: null, historical: [], suggestions: null, warnings };
  }

  // Per-period ratio series, aligned to income.periods by index — cashflow
  // periods come from the same ticker/date range through the same
  // oldest-first sort, so the index alignment already relied on below (in
  // `historical`) holds here too.
  const fiscalYears = income.periods.map((p) => p.fiscalYear);
  const ebitMargins = income.periods.map((p) => (p.revenue && p.ebit !== null ? p.ebit / p.revenue : null));
  const daPcts = income.periods.map((p, i) => {
    const cf = cashflow.periods[i];
    return p.revenue && cf && cf.depreciationAndAmortization !== null ? cf.depreciationAndAmortization / p.revenue : null;
  });
  const capexPcts = income.periods.map((p, i) => {
    const cf = cashflow.periods[i];
    return p.revenue && cf && cf.capitalExpenditure !== null ? cf.capitalExpenditure / p.revenue : null;
  });
  const nwcPcts = income.periods.map((p, i) => {
    const cf = cashflow.periods[i];
    return p.revenue && cf && cf.nwcIncrease !== null ? cf.nwcIncrease / p.revenue : null;
  });
  const taxRates = income.periods.map((p) => p.effectiveTaxRate);

  // Revenue growth: CAGR across the full available historical window. This
  // is already a normalized (non-latest-year-only) measure, so its
  // methodology is unchanged — kept here for a consistent `suggestions` shape.
  const revenue0 = income.periods[0].revenue;
  const revenueN = latestIncome.revenue;
  const revenueGrowthValue = n > 1 ? cagr(revenue0, revenueN, n - 1) : null;
  const revenueGrowthSuggestion = {
    value: revenueGrowthValue,
    methodology: revenueGrowthValue === null ? 'unavailable' : `CAGR across ${n} years of history`,
    sourceYears: revenueGrowthValue === null ? [] : fiscalYears,
    warning: revenueGrowthValue === null ? 'Revenue growth: fewer than 2 valid historical periods with revenue, cannot compute a CAGR-based suggestion' : null,
  };

  const ebitMarginSuggestion = suggestRecentAverage(fiscalYears, ebitMargins, 'EBIT margin');
  const daPctSuggestion = suggestRecentAverage(fiscalYears, daPcts, 'D&A / Revenue');
  const capexPctSuggestion = suggestRecentAverage(fiscalYears, capexPcts, 'CapEx / Revenue');
  const nwcPctSuggestion = suggestFullAverage(fiscalYears, nwcPcts, 'Change in NWC / Revenue');
  const taxRateSuggestion = suggestMedian(fiscalYears, taxRates, 'Tax rate', FALLBACK_TAX_RATE);

  [revenueGrowthSuggestion, ebitMarginSuggestion, daPctSuggestion, capexPctSuggestion, nwcPctSuggestion, taxRateSuggestion]
    .forEach((s) => { if (s.warning) warnings.push(s.warning); });

  const historical = income.periods.map((p, i) => {
    const cf = cashflow.periods[i];
    return {
      fiscalYear: p.fiscalYear,
      revenue: toMillions(p.revenue),
      ebit: toMillions(p.ebit),
      ebitMargin: ebitMargins[i],
      ebitda: toMillions(p.ebitda),
      depreciationAndAmortization: toMillions(cf?.depreciationAndAmortization ?? p.depreciationAndAmortization ?? null),
      capitalExpenditure: toMillions(cf?.capitalExpenditure ?? null),
      daPctRevenue: daPcts[i],
      capexPctRevenue: capexPcts[i],
      nwcChangePctRevenue: nwcPcts[i],
      effectiveTaxRate: taxRates[i],
    };
  });

  return {
    company: profile.profile,
    shared: {
      baseRevenue: toMillions(revenueN),
      taxRate: taxRateSuggestion.value,
      daPctRevenue: daPctSuggestion.value,
      capexPctRevenue: capexPctSuggestion.value,
      nwcChangePctRevenue: nwcPctSuggestion.value,
      cash: toMillions(latestBalance.cash),
      debt: toMillions(latestBalance.debt),
      dilutedShares: toMillions(latestIncome.dilutedShares),
    },
    base: {
      revenueGrowth: revenueGrowthSuggestion.value,
      ebitMargin: ebitMarginSuggestion.value,
    },
    suggestions: {
      revenueGrowth: revenueGrowthSuggestion,
      ebitMargin: ebitMarginSuggestion,
      daPctRevenue: daPctSuggestion,
      capexPctRevenue: capexPctSuggestion,
      nwcChangePctRevenue: nwcPctSuggestion,
      taxRate: taxRateSuggestion,
    },
    historical,
    warnings,
  };
}
