// Pure, generic (no company-specific numbers) scenario-assumption
// construction. Bear/Bull are built RELATIVE to whatever the current Base
// Case is — Phase 5's normalized suggestion, or the user's own edited
// Base — never from fixed absolute percentages.
//
// The bug this fixes: a flat 14% Bear / 26% Bull EBIT margin band was
// tuned to the original generic sample company's 20% Base margin. Once
// Phase 5 made Base margin company-specific, any company whose real Base
// margin fell outside [14%, 26%] silently broke the scenario ordering —
// e.g. a 45%+ Base margin company ends up with a Bull case *below* Base,
// since 26% < 45%. Building Bear/Bull as a proportional spread around
// Base's own values (not a hard-coded absolute band) fixes this for any
// company without special-casing any one of them.
//
// This module only derives *input* assumptions for the scenarios — it does
// not touch the DCF formulas themselves (src/engine/*.js), which compute
// whatever inputs they're given exactly as before.

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const GROWTH_SPREAD_RATIO = 0.5;   // Bear/Bull revenue-growth swing, as a fraction of Base growth
const GROWTH_SPREAD_MIN = 0.02;
const GROWTH_SPREAD_MAX = 0.08;

const MARGIN_SPREAD_RATIO = 0.15;  // Bear/Bull EBIT-margin swing, as a fraction of Base margin
const MARGIN_SPREAD_MIN = 0.02;
const MARGIN_SPREAD_MAX = 0.08;
const MARGIN_FLOOR = 0.01;
const MARGIN_CEILING = 0.95;

const WACC_DELTA = 0.02;             // flat +/- WACC offset — WACC itself is already company-specific (CAPM)
const TERMINAL_GROWTH_SPREAD = 0.01; // flat offset from whatever Base's terminal growth currently is

export function buildScenarioAssumptions(base) {
  const g = base.revenueGrowth;
  const m = base.ebitMargin;
  const t = base.terminalGrowthRate;

  const growthSpread = clamp(Math.abs(g) * GROWTH_SPREAD_RATIO, GROWTH_SPREAD_MIN, GROWTH_SPREAD_MAX);
  const marginSpread = clamp(Math.abs(m) * MARGIN_SPREAD_RATIO, MARGIN_SPREAD_MIN, MARGIN_SPREAD_MAX);

  const bear = {
    revenueGrowth: g - growthSpread,
    ebitMargin: clamp(m - marginSpread, MARGIN_FLOOR, MARGIN_CEILING),
    waccDelta: WACC_DELTA,
    terminalGrowthRate: Math.max(t - TERMINAL_GROWTH_SPREAD, 0),
  };
  const bull = {
    revenueGrowth: g + growthSpread,
    ebitMargin: clamp(m + marginSpread, MARGIN_FLOOR, MARGIN_CEILING),
    waccDelta: -WACC_DELTA,
    terminalGrowthRate: t + TERMINAL_GROWTH_SPREAD,
  };
  return { bear, bull };
}

// Structural (input-level) check: confirms the *constructed assumptions*
// move in the standard Bear < Base < Bull direction. This does not by
// itself guarantee the resulting implied share prices will be monotonic
// (that depends on the DCF math too) — see checkScenarioValueOrdering for
// the output-level check.
export function checkScenarioAssumptionOrdering(bear, base, bull) {
  const issues = [];
  if (!(bull.revenueGrowth > base.revenueGrowth && base.revenueGrowth > bear.revenueGrowth)) {
    issues.push('Revenue growth is not strictly Bear < Base < Bull');
  }
  if (!(bull.ebitMargin >= base.ebitMargin && base.ebitMargin >= bear.ebitMargin)) {
    issues.push('EBIT margin is not Bear <= Base <= Bull');
  }
  if (!(bull.terminalGrowthRate > base.terminalGrowthRate && base.terminalGrowthRate > bear.terminalGrowthRate)) {
    issues.push('Terminal growth is not strictly Bear < Base < Bull');
  }
  if (!(bull.waccDelta < 0 && bear.waccDelta > 0)) {
    issues.push('WACC delta signs are not Bull < Base < Bear');
  }
  return { ok: issues.length === 0, issues };
}

// Output-level check: the real invariant a user cares about — do the
// ACTUAL implied share prices come out Bear < Base < Bull. Never reorders
// or modifies the values; only reports whether they're internally
// consistent, so a genuinely inverted result is flagged, not hidden.
export function checkScenarioValueOrdering(bearPrice, basePrice, bullPrice) {
  if (typeof bearPrice !== 'number' || typeof basePrice !== 'number' || typeof bullPrice !== 'number') {
    return { ok: null, issues: ['One or more scenario prices is not a number'] };
  }
  const issues = [];
  if (!(bullPrice > basePrice)) issues.push('Bull implied price is not above Base');
  if (!(basePrice > bearPrice)) issues.push('Base implied price is not above Bear');
  return { ok: issues.length === 0, issues };
}
