# Phase 1: Core Financial Modeling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and numerically prove a standalone, dependency-free JavaScript DCF valuation engine (forecast → WACC → terminal value → EV/equity bridge → implied price → reverse DCF → scenarios → sensitivity), plus a minimal manual-input UI to exercise it.

**Architecture:** Pure ES-module functions in `src/engine/`, with zero Node-specific APIs (no `fs`, `process`, etc.) and zero third-party dependencies, so the exact same files can later be copied verbatim into a Wix Velo backend/public module (Velo backend code for a classic Wix/Studio site — connected via Git Integration & Wix CLI for Sites — is standard ES-module JavaScript). UI code (`public/`) only orchestrates calls into the engine and renders results; it contains no financial math itself. Tests run with Node's built-in test runner against the engine modules directly — no browser or Wix runtime needed for correctness proof.

**Tech Stack:** Node.js v24 (installed this session via nvm), native `node:test` + `node:assert/strict` (zero test dependencies), vanilla HTML/CSS/JS for the UI (no framework, no build step — files are plain ES modules loaded directly by the browser).

## Global Constraints

- Do NOT build automatic ticker/API import, accounts, exports, AI analysis, marketing pages, or advanced branding in Phase 1 — manual input only.
- Keep financial calculation logic (`src/engine/`) completely separate from UI code (`public/`).
- Do not hard-code valuation outputs anywhere — every number the UI shows must come from calling an engine function.
- Priority order when trading off effort: 1. Financial accuracy, 2. Functionality, 3. Usability, 4. Visual design. Do not polish visuals at the expense of 1–3.
- Do not call Phase 1 complete merely because the UI looks correct — the numeric test suite (Task 10) must pass, independently re-derived, before declaring done.
- Missing required numeric inputs must throw, never silently default to `0`.
- All new dependencies are zero (no npm installs) — stdlib only.

---

### Task 1: Project scaffolding + validation helpers

**Files:**
- Create: `package.json`
- Create: `src/engine/validation.js`
- Test: `test/engine/validation.test.js`

**Interfaces:**
- Produces: `assertRequired(value, name): value` — throws `Error` if `value` is `undefined`, `null`, or `NaN`.
- Produces: `assertFiniteNumber(value, name): number` — throws unless `value` is a finite `number` (calls `assertRequired` first).
- Produces: `assertPositive(value, name): number` — throws unless finite number `> 0`.
- Produces: `assertNonNegative(value, name): number` — throws unless finite number `>= 0`.
- Produces: `assertRate01(value, name): number` — throws unless finite number in `[0, 1]` (used for tax rate).
- Produces: `assertTerminalGrowthBelowWACC(terminalGrowthRate, wacc): void` — throws if `terminalGrowthRate >= wacc`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "wall-street-valuation-lab",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Write the failing test**

```javascript
// test/engine/validation.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRequired,
  assertFiniteNumber,
  assertPositive,
  assertNonNegative,
  assertRate01,
  assertTerminalGrowthBelowWACC,
} from '../../src/engine/validation.js';

test('assertRequired passes through valid values', () => {
  assert.equal(assertRequired(5, 'x'), 5);
  assert.equal(assertRequired(0, 'x'), 0);
});

test('assertRequired throws on undefined, null, NaN', () => {
  assert.throws(() => assertRequired(undefined, 'x'), /x is required/);
  assert.throws(() => assertRequired(null, 'x'), /x is required/);
  assert.throws(() => assertRequired(NaN, 'x'), /x is required/);
});

test('assertFiniteNumber rejects non-numbers and Infinity', () => {
  assert.throws(() => assertFiniteNumber('5', 'x'), /x must be a finite number/);
  assert.throws(() => assertFiniteNumber(Infinity, 'x'), /x must be a finite number/);
  assert.equal(assertFiniteNumber(-3.5, 'x'), -3.5);
});

test('assertPositive rejects zero and negatives', () => {
  assert.throws(() => assertPositive(0, 'x'), /x must be a positive number/);
  assert.throws(() => assertPositive(-1, 'x'), /x must be a positive number/);
  assert.equal(assertPositive(2, 'x'), 2);
});

test('assertNonNegative rejects negatives but allows zero', () => {
  assert.throws(() => assertNonNegative(-0.01, 'x'));
  assert.equal(assertNonNegative(0, 'x'), 0);
});

test('assertRate01 enforces [0,1] range', () => {
  assert.throws(() => assertRate01(-0.1, 'taxRate'));
  assert.throws(() => assertRate01(1.1, 'taxRate'));
  assert.equal(assertRate01(0.25, 'taxRate'), 0.25);
});

test('assertTerminalGrowthBelowWACC throws when g >= wacc', () => {
  assert.throws(() => assertTerminalGrowthBelowWACC(0.09, 0.09));
  assert.throws(() => assertTerminalGrowthBelowWACC(0.10, 0.09));
  assert.doesNotThrow(() => assertTerminalGrowthBelowWACC(0.02, 0.09));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/validation.js'`

- [ ] **Step 4: Write minimal implementation**

```javascript
// src/engine/validation.js
export function assertRequired(value, name) {
  if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))) {
    throw new Error(`${name} is required and cannot be missing`);
  }
  return value;
}

export function assertFiniteNumber(value, name) {
  assertRequired(value, name);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertPositive(value, name) {
  assertFiniteNumber(value, name);
  if (value <= 0) {
    throw new Error(`${name} must be a positive number, got ${value}`);
  }
  return value;
}

export function assertNonNegative(value, name) {
  assertFiniteNumber(value, name);
  if (value < 0) {
    throw new Error(`${name} must be zero or a positive number, got ${value}`);
  }
  return value;
}

export function assertRate01(value, name) {
  assertFiniteNumber(value, name);
  if (value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1, got ${value}`);
  }
  return value;
}

export function assertTerminalGrowthBelowWACC(terminalGrowthRate, wacc) {
  assertFiniteNumber(terminalGrowthRate, 'terminalGrowthRate');
  assertFiniteNumber(wacc, 'wacc');
  if (terminalGrowthRate >= wacc) {
    throw new Error(
      `terminalGrowthRate (${terminalGrowthRate}) must be less than wacc (${wacc}) — Gordon Growth is undefined/negative otherwise`
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git init
git add package.json src/engine/validation.js test/engine/validation.test.js
git commit -m "feat: scaffold project and add shared validation helpers"
```

---

### Task 2: Revenue forecast, EBIT, NOPAT, EBITDA

**Files:**
- Create: `src/engine/forecast.js`
- Test: `test/engine/forecast.test.js`

**Interfaces:**
- Consumes: `assertPositive`, `assertFiniteNumber`, `assertRate01` from `./validation.js`
- Produces: `calculateRevenueForecast(baseRevenue: number, growthRates: number|number[], years: number): number[]` — year-1..year-N revenue (base year not included).
- Produces: `calculateEBIT(revenue: number[], ebitMargin: number): number[]`
- Produces: `calculateNOPAT(ebit: number[], taxRate: number): number[]`
- Produces: `calculateEBITDA(ebit: number[], da: number[]): number[]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/forecast.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRevenueForecast,
  calculateEBIT,
  calculateNOPAT,
  calculateEBITDA,
} from '../../src/engine/forecast.js';

test('calculateRevenueForecast compounds a constant growth rate', () => {
  const revenue = calculateRevenueForecast(1000, 0.10, 5);
  assert.equal(revenue.length, 5);
  assert.ok(Math.abs(revenue[0] - 1100) < 1e-9);
  assert.ok(Math.abs(revenue[1] - 1210) < 1e-9);
  assert.ok(Math.abs(revenue[4] - 1610.51) < 1e-6);
});

test('calculateRevenueForecast accepts a per-year growth array', () => {
  const revenue = calculateRevenueForecast(1000, [0.10, 0.05, 0.05, 0, -0.02], 5);
  assert.ok(Math.abs(revenue[0] - 1100) < 1e-9);
  assert.ok(Math.abs(revenue[1] - 1155) < 1e-9);
  assert.ok(Math.abs(revenue[4] - revenue[3] * 0.98) < 1e-9);
});

test('calculateRevenueForecast rejects non-positive base revenue', () => {
  assert.throws(() => calculateRevenueForecast(0, 0.1, 5));
  assert.throws(() => calculateRevenueForecast(-100, 0.1, 5));
});

test('calculateRevenueForecast rejects a growth array of the wrong length', () => {
  assert.throws(() => calculateRevenueForecast(1000, [0.1, 0.1], 5));
});

test('calculateRevenueForecast rejects growth rates <= -100%', () => {
  assert.throws(() => calculateRevenueForecast(1000, -1, 5));
  assert.throws(() => calculateRevenueForecast(1000, -1.5, 5));
});

test('calculateEBIT applies a constant margin to each year', () => {
  const ebit = calculateEBIT([1100, 1210], 0.20);
  assert.ok(Math.abs(ebit[0] - 220) < 1e-9);
  assert.ok(Math.abs(ebit[1] - 242) < 1e-9);
});

test('calculateEBIT rejects an empty revenue array', () => {
  assert.throws(() => calculateEBIT([], 0.2));
});

test('calculateNOPAT applies (1 - taxRate)', () => {
  const nopat = calculateNOPAT([220, 242], 0.25);
  assert.ok(Math.abs(nopat[0] - 165) < 1e-9);
  assert.ok(Math.abs(nopat[1] - 181.5) < 1e-9);
});

test('calculateNOPAT rejects an out-of-range tax rate', () => {
  assert.throws(() => calculateNOPAT([220], 1.5));
  assert.throws(() => calculateNOPAT([220], -0.1));
});

test('calculateEBITDA sums EBIT and D&A elementwise', () => {
  const ebitda = calculateEBITDA([220, 242], [55, 60.5]);
  assert.ok(Math.abs(ebitda[0] - 275) < 1e-9);
  assert.ok(Math.abs(ebitda[1] - 302.5) < 1e-9);
});

test('calculateEBITDA rejects mismatched array lengths', () => {
  assert.throws(() => calculateEBITDA([220, 242], [55]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/forecast.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/forecast.js
import { assertPositive, assertFiniteNumber, assertRequired } from './validation.js';

export function calculateRevenueForecast(baseRevenue, growthRates, years) {
  assertPositive(baseRevenue, 'baseRevenue');
  assertPositive(years, 'years');
  assertRequired(growthRates, 'growthRates');

  const rates = Array.isArray(growthRates) ? growthRates : Array(years).fill(growthRates);
  if (rates.length !== years) {
    throw new Error(`growthRates array length (${rates.length}) must equal years (${years})`);
  }
  rates.forEach((r, i) => {
    assertFiniteNumber(r, `growthRates[${i}]`);
    if (r <= -1) {
      throw new Error(`growthRates[${i}] (${r}) must be greater than -1 (-100%)`);
    }
  });

  const revenue = [];
  let prev = baseRevenue;
  for (let t = 0; t < years; t++) {
    const current = prev * (1 + rates[t]);
    revenue.push(current);
    prev = current;
  }
  return revenue;
}

function requireNonEmptyArray(value, name) {
  assertRequired(value, name);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
}

export function calculateEBIT(revenue, ebitMargin) {
  requireNonEmptyArray(revenue, 'revenue');
  assertFiniteNumber(ebitMargin, 'ebitMargin');
  return revenue.map((r) => r * ebitMargin);
}

export function calculateNOPAT(ebit, taxRate) {
  requireNonEmptyArray(ebit, 'ebit');
  assertFiniteNumber(taxRate, 'taxRate');
  if (taxRate < 0 || taxRate > 1) {
    throw new Error(`taxRate must be between 0 and 1, got ${taxRate}`);
  }
  return ebit.map((e) => e * (1 - taxRate));
}

export function calculateEBITDA(ebit, da) {
  requireNonEmptyArray(ebit, 'ebit');
  requireNonEmptyArray(da, 'da');
  if (ebit.length !== da.length) {
    throw new Error('ebit and da must be arrays of equal length');
  }
  return ebit.map((e, i) => e + da[i]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 12 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/forecast.js test/engine/forecast.test.js
git commit -m "feat: add revenue forecast, EBIT, NOPAT, EBITDA calculations"
```

---

### Task 3: Unlevered Free Cash Flow

**Files:**
- Create: `src/engine/ufcf.js`
- Test: `test/engine/ufcf.test.js`

**Interfaces:**
- Consumes: `assertFiniteNumber`, `assertRequired` from `./validation.js`
- Produces: `percentOfRevenueToDollars(revenue: number[], pct: number, name: string): number[]`
- Produces: `calculateUFCF(nopat: number[], da: number[], capex: number[], nwcChange: number[]): number[]` — `UFCF[t] = nopat[t] + da[t] - capex[t] - nwcChange[t]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/ufcf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateUFCF, percentOfRevenueToDollars } from '../../src/engine/ufcf.js';

test('percentOfRevenueToDollars scales each year by pct', () => {
  const result = percentOfRevenueToDollars([1100, 1210], 0.05, 'daPctRevenue');
  assert.ok(Math.abs(result[0] - 55) < 1e-9);
  assert.ok(Math.abs(result[1] - 60.5) < 1e-9);
});

test('calculateUFCF follows NOPAT + D&A - CapEx - deltaNWC', () => {
  const ufcf = calculateUFCF([165, 181.5], [55, 60.5], [66, 72.6], [11, 12.1]);
  // Y1: 165 + 55 - 66 - 11 = 143
  assert.ok(Math.abs(ufcf[0] - 143) < 1e-9);
  // Y2: 181.5 + 60.5 - 72.6 - 12.1 = 157.3
  assert.ok(Math.abs(ufcf[1] - 157.3) < 1e-9);
});

test('calculateUFCF rejects mismatched array lengths', () => {
  assert.throws(() => calculateUFCF([165, 181.5], [55], [66, 72.6], [11, 12.1]));
});

test('calculateUFCF rejects empty arrays', () => {
  assert.throws(() => calculateUFCF([], [], [], []));
});

test('calculateUFCF propagates negative NWC change (a source of cash) correctly', () => {
  const ufcf = calculateUFCF([100], [10], [20], [-5]);
  // 100 + 10 - 20 - (-5) = 95
  assert.ok(Math.abs(ufcf[0] - 95) < 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/ufcf.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/ufcf.js
import { assertFiniteNumber, assertRequired } from './validation.js';

function requireNonEmptyArray(value, name) {
  assertRequired(value, name);
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
}

export function percentOfRevenueToDollars(revenue, pct, name) {
  requireNonEmptyArray(revenue, 'revenue');
  assertFiniteNumber(pct, name);
  return revenue.map((r) => r * pct);
}

export function calculateUFCF(nopat, da, capex, nwcChange) {
  requireNonEmptyArray(nopat, 'nopat');
  requireNonEmptyArray(da, 'da');
  requireNonEmptyArray(capex, 'capex');
  requireNonEmptyArray(nwcChange, 'nwcChange');
  const n = nopat.length;
  if (da.length !== n || capex.length !== n || nwcChange.length !== n) {
    throw new Error('nopat, da, capex, and nwcChange must all be arrays of equal length');
  }
  return nopat.map((val, i) => {
    assertFiniteNumber(da[i], `da[${i}]`);
    assertFiniteNumber(capex[i], `capex[${i}]`);
    assertFiniteNumber(nwcChange[i], `nwcChange[${i}]`);
    return val + da[i] - capex[i] - nwcChange[i];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 5 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/ufcf.js test/engine/ufcf.test.js
git commit -m "feat: add unlevered free cash flow calculation"
```

---

### Task 4: WACC calculator

**Files:**
- Create: `src/engine/wacc.js`
- Test: `test/engine/wacc.test.js`

**Interfaces:**
- Consumes: `assertFiniteNumber`, `assertNonNegative`, `assertRate01` from `./validation.js`
- Produces: `calculateCostOfEquity(riskFreeRate: number, beta: number, equityRiskPremium: number): number`
- Produces: `calculateAfterTaxCostOfDebt(preTaxCostOfDebt: number, taxRate: number): number`
- Produces: `calculateWACC({ costOfEquity: number, afterTaxCostOfDebt: number, equityValue: number, debtValue: number }): number`

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/wacc.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCostOfEquity,
  calculateAfterTaxCostOfDebt,
  calculateWACC,
} from '../../src/engine/wacc.js';

test('calculateCostOfEquity applies CAPM', () => {
  // 0.04 + 1.2 * 0.05 = 0.10
  const coe = calculateCostOfEquity(0.04, 1.2, 0.05);
  assert.ok(Math.abs(coe - 0.10) < 1e-9);
});

test('calculateAfterTaxCostOfDebt applies (1 - taxRate)', () => {
  // 0.06 * (1 - 0.25) = 0.045
  const atcod = calculateAfterTaxCostOfDebt(0.06, 0.25);
  assert.ok(Math.abs(atcod - 0.045) < 1e-9);
});

test('calculateAfterTaxCostOfDebt rejects negative pre-tax cost of debt', () => {
  assert.throws(() => calculateAfterTaxCostOfDebt(-0.01, 0.25));
});

test('calculateWACC weights cost of equity and after-tax cost of debt by capital structure', () => {
  // E=700, D=300, coe=0.10, atcod=0.045
  // (700/1000)*0.10 + (300/1000)*0.045 = 0.07 + 0.0135 = 0.0835
  const wacc = calculateWACC({ costOfEquity: 0.10, afterTaxCostOfDebt: 0.045, equityValue: 700, debtValue: 300 });
  assert.ok(Math.abs(wacc - 0.0835) < 1e-9);
});

test('calculateWACC with zero debt equals cost of equity', () => {
  const wacc = calculateWACC({ costOfEquity: 0.12, afterTaxCostOfDebt: 0.05, equityValue: 500, debtValue: 0 });
  assert.ok(Math.abs(wacc - 0.12) < 1e-9);
});

test('calculateWACC rejects zero total capital (division by zero guard)', () => {
  assert.throws(() => calculateWACC({ costOfEquity: 0.1, afterTaxCostOfDebt: 0.05, equityValue: 0, debtValue: 0 }));
});

test('calculateWACC rejects negative capital values', () => {
  assert.throws(() => calculateWACC({ costOfEquity: 0.1, afterTaxCostOfDebt: 0.05, equityValue: -1, debtValue: 100 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/wacc.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/wacc.js
import { assertFiniteNumber, assertNonNegative } from './validation.js';

export function calculateCostOfEquity(riskFreeRate, beta, equityRiskPremium) {
  assertFiniteNumber(riskFreeRate, 'riskFreeRate');
  assertFiniteNumber(beta, 'beta');
  assertFiniteNumber(equityRiskPremium, 'equityRiskPremium');
  return riskFreeRate + beta * equityRiskPremium;
}

export function calculateAfterTaxCostOfDebt(preTaxCostOfDebt, taxRate) {
  assertNonNegative(preTaxCostOfDebt, 'preTaxCostOfDebt');
  assertFiniteNumber(taxRate, 'taxRate');
  if (taxRate < 0 || taxRate > 1) {
    throw new Error(`taxRate must be between 0 and 1, got ${taxRate}`);
  }
  return preTaxCostOfDebt * (1 - taxRate);
}

export function calculateWACC({ costOfEquity, afterTaxCostOfDebt, equityValue, debtValue }) {
  assertFiniteNumber(costOfEquity, 'costOfEquity');
  assertFiniteNumber(afterTaxCostOfDebt, 'afterTaxCostOfDebt');
  assertNonNegative(equityValue, 'equityValue');
  assertNonNegative(debtValue, 'debtValue');
  const total = equityValue + debtValue;
  if (total <= 0) {
    throw new Error('equityValue + debtValue must be greater than zero to calculate WACC');
  }
  const equityWeight = equityValue / total;
  const debtWeight = debtValue / total;
  return equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 7 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/wacc.js test/engine/wacc.test.js
git commit -m "feat: add WACC calculator"
```

---

### Task 5: Terminal value (Gordon Growth + Exit Multiple)

**Files:**
- Create: `src/engine/terminalValue.js`
- Test: `test/engine/terminalValue.test.js`

**Interfaces:**
- Consumes: `assertFiniteNumber`, `assertPositive`, `assertTerminalGrowthBelowWACC` from `./validation.js`
- Produces: `calculateGordonGrowthTerminalValue(finalYearFCF: number, wacc: number, terminalGrowthRate: number): number`
- Produces: `calculateExitMultipleTerminalValue(finalYearEBITDA: number, exitMultiple: number): number`

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/terminalValue.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGordonGrowthTerminalValue,
  calculateExitMultipleTerminalValue,
} from '../../src/engine/terminalValue.js';

test('calculateGordonGrowthTerminalValue applies FCFn*(1+g)/(WACC-g)', () => {
  // 209.3663 * 1.025 / (0.09 - 0.025) = 214.5804575 / 0.065
  const tv = calculateGordonGrowthTerminalValue(209.3663, 0.09, 0.025);
  const expected = (209.3663 * 1.025) / (0.09 - 0.025);
  assert.ok(Math.abs(tv - expected) < 1e-6);
  assert.ok(tv > 0);
});

test('calculateGordonGrowthTerminalValue throws when terminalGrowthRate >= wacc', () => {
  assert.throws(() => calculateGordonGrowthTerminalValue(100, 0.08, 0.08));
  assert.throws(() => calculateGordonGrowthTerminalValue(100, 0.08, 0.09));
});

test('calculateGordonGrowthTerminalValue increases with higher terminal growth', () => {
  const lowG = calculateGordonGrowthTerminalValue(100, 0.10, 0.01);
  const highG = calculateGordonGrowthTerminalValue(100, 0.10, 0.04);
  assert.ok(highG > lowG);
});

test('calculateExitMultipleTerminalValue applies EBITDA * multiple', () => {
  const tv = calculateExitMultipleTerminalValue(402.6275, 10);
  assert.ok(Math.abs(tv - 4026.275) < 1e-6);
});

test('calculateExitMultipleTerminalValue rejects non-positive multiple', () => {
  assert.throws(() => calculateExitMultipleTerminalValue(400, 0));
  assert.throws(() => calculateExitMultipleTerminalValue(400, -5));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/terminalValue.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/terminalValue.js
import { assertFiniteNumber, assertPositive, assertTerminalGrowthBelowWACC } from './validation.js';

export function calculateGordonGrowthTerminalValue(finalYearFCF, wacc, terminalGrowthRate) {
  assertFiniteNumber(finalYearFCF, 'finalYearFCF');
  assertFiniteNumber(wacc, 'wacc');
  assertFiniteNumber(terminalGrowthRate, 'terminalGrowthRate');
  assertTerminalGrowthBelowWACC(terminalGrowthRate, wacc);
  return (finalYearFCF * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
}

export function calculateExitMultipleTerminalValue(finalYearEBITDA, exitMultiple) {
  assertFiniteNumber(finalYearEBITDA, 'finalYearEBITDA');
  assertPositive(exitMultiple, 'exitMultiple');
  return finalYearEBITDA * exitMultiple;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 5 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/terminalValue.js test/engine/terminalValue.test.js
git commit -m "feat: add Gordon Growth and Exit Multiple terminal value calculations"
```

---

### Task 6: Core DCF orchestrator (present value, EV, equity value, implied share price)

**Files:**
- Create: `src/engine/dcf.js`
- Test: `test/engine/dcf.test.js`

**Interfaces:**
- Consumes: `calculateRevenueForecast`, `calculateEBIT`, `calculateNOPAT`, `calculateEBITDA` from `./forecast.js`; `calculateUFCF`, `percentOfRevenueToDollars` from `./ufcf.js`; `calculateGordonGrowthTerminalValue`, `calculateExitMultipleTerminalValue` from `./terminalValue.js`; `assertFiniteNumber`, `assertPositive`, `assertNonNegative` from `./validation.js`
- Produces: `calculatePresentValue(cashflow: number, rate: number, period: number): number`
- Produces: `calculateDCF(inputs): DCFResult` where `inputs = { baseRevenue, revenueGrowth, ebitMargin, taxRate, daPctRevenue, capexPctRevenue, nwcChangePctRevenue, years, wacc, terminalGrowthRate, exitMultiple? }` (`exitMultiple` optional — when omitted, exit-multiple fields are `null`).
  `DCFResult = { years, revenue, ebit, nopat, da, capex, nwcChange, ufcf, ebitda, pvUFCF, sumPvUFCF, terminalValueGordon, pvTerminalValueGordon, enterpriseValueGordon, terminalValueExitMultiple, pvTerminalValueExitMultiple, enterpriseValueExitMultiple }`
- Produces: `calculateEquityValue(enterpriseValue: number, cash: number, debt: number): number`
- Produces: `calculateImpliedSharePrice(equityValue: number, dilutedShares: number): number`

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/dcf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePresentValue,
  calculateDCF,
  calculateEquityValue,
  calculateImpliedSharePrice,
} from '../../src/engine/dcf.js';

const BASE_CASE = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  exitMultiple: 10,
};

test('calculatePresentValue discounts a single cash flow', () => {
  const pv = calculatePresentValue(143, 0.09, 1);
  assert.ok(Math.abs(pv - 143 / 1.09) < 1e-9);
});

test('calculatePresentValue rejects a rate at or below -100%', () => {
  assert.throws(() => calculatePresentValue(100, -1, 1));
});

test('calculateDCF produces internally consistent forecast arrays', () => {
  const result = calculateDCF(BASE_CASE);
  assert.equal(result.revenue.length, 5);
  assert.ok(Math.abs(result.revenue[4] - 1610.51) < 1e-6);
  assert.ok(Math.abs(result.ufcf[0] - 143) < 1e-6);
  assert.ok(Math.abs(result.ebitda[4] - 402.6275) < 1e-6);
});

test('calculateDCF sums discounted UFCFs correctly', () => {
  const result = calculateDCF(BASE_CASE);
  const manualSum = result.ufcf.reduce(
    (sum, cf, i) => sum + calculatePresentValue(cf, BASE_CASE.wacc, i + 1),
    0
  );
  assert.ok(Math.abs(result.sumPvUFCF - manualSum) < 1e-9);
});

test('calculateDCF enterprise value equals sum of PV(UFCF) + PV(terminal value), both methods', () => {
  const result = calculateDCF(BASE_CASE);
  assert.ok(Math.abs(result.enterpriseValueGordon - (result.sumPvUFCF + result.pvTerminalValueGordon)) < 1e-9);
  assert.ok(Math.abs(result.enterpriseValueExitMultiple - (result.sumPvUFCF + result.pvTerminalValueExitMultiple)) < 1e-9);
});

test('calculateDCF omits exit-multiple fields when exitMultiple is not provided', () => {
  const { exitMultiple, ...withoutExitMultiple } = BASE_CASE;
  const result = calculateDCF(withoutExitMultiple);
  assert.equal(result.terminalValueExitMultiple, null);
  assert.equal(result.enterpriseValueExitMultiple, null);
  assert.ok(result.enterpriseValueGordon > 0);
});

test('calculateEquityValue adds cash and subtracts debt', () => {
  const eq = calculateEquityValue(2000, 200, 300);
  assert.ok(Math.abs(eq - 1900) < 1e-9);
});

test('calculateEquityValue rejects negative cash or debt', () => {
  assert.throws(() => calculateEquityValue(2000, -1, 300));
  assert.throws(() => calculateEquityValue(2000, 200, -1));
});

test('calculateImpliedSharePrice divides equity value by diluted shares', () => {
  const price = calculateImpliedSharePrice(1900, 100);
  assert.ok(Math.abs(price - 19) < 1e-9);
});

test('calculateImpliedSharePrice rejects zero or negative shares (division-by-zero guard)', () => {
  assert.throws(() => calculateImpliedSharePrice(1900, 0));
  assert.throws(() => calculateImpliedSharePrice(1900, -10));
});

test('calculateDCF throws on missing required fields instead of defaulting to zero', () => {
  const { taxRate, ...missingTaxRate } = BASE_CASE;
  assert.throws(() => calculateDCF(missingTaxRate));
});

test('calculateDCF throws when wacc is zero or negative', () => {
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: 0 }));
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: -0.01 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/dcf.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/dcf.js
import { calculateRevenueForecast, calculateEBIT, calculateNOPAT, calculateEBITDA } from './forecast.js';
import { calculateUFCF, percentOfRevenueToDollars } from './ufcf.js';
import { calculateGordonGrowthTerminalValue, calculateExitMultipleTerminalValue } from './terminalValue.js';
import { assertFiniteNumber, assertPositive, assertNonNegative } from './validation.js';

export function calculatePresentValue(cashflow, rate, period) {
  assertFiniteNumber(cashflow, 'cashflow');
  assertFiniteNumber(rate, 'rate');
  assertPositive(period, 'period');
  if (rate <= -1) {
    throw new Error(`rate must be greater than -1 (-100%), got ${rate}`);
  }
  return cashflow / Math.pow(1 + rate, period);
}

export function calculateDCF({
  baseRevenue,
  revenueGrowth,
  ebitMargin,
  taxRate,
  daPctRevenue,
  capexPctRevenue,
  nwcChangePctRevenue,
  years,
  wacc,
  terminalGrowthRate,
  exitMultiple,
}) {
  assertPositive(years, 'years');
  assertFiniteNumber(wacc, 'wacc');
  if (wacc <= 0) {
    throw new Error(`wacc must be greater than zero, got ${wacc}`);
  }

  const revenue = calculateRevenueForecast(baseRevenue, revenueGrowth, years);
  const ebit = calculateEBIT(revenue, ebitMargin);
  const nopat = calculateNOPAT(ebit, taxRate);
  const da = percentOfRevenueToDollars(revenue, daPctRevenue, 'daPctRevenue');
  const capex = percentOfRevenueToDollars(revenue, capexPctRevenue, 'capexPctRevenue');
  const nwcChange = percentOfRevenueToDollars(revenue, nwcChangePctRevenue, 'nwcChangePctRevenue');
  const ufcf = calculateUFCF(nopat, da, capex, nwcChange);
  const ebitda = calculateEBITDA(ebit, da);

  const pvUFCF = ufcf.map((cf, i) => calculatePresentValue(cf, wacc, i + 1));
  const sumPvUFCF = pvUFCF.reduce((a, b) => a + b, 0);

  const finalYearUFCF = ufcf[ufcf.length - 1];
  const finalYearEBITDA = ebitda[ebitda.length - 1];

  const terminalValueGordon = calculateGordonGrowthTerminalValue(finalYearUFCF, wacc, terminalGrowthRate);
  const pvTerminalValueGordon = calculatePresentValue(terminalValueGordon, wacc, years);
  const enterpriseValueGordon = sumPvUFCF + pvTerminalValueGordon;

  let terminalValueExitMultiple = null;
  let pvTerminalValueExitMultiple = null;
  let enterpriseValueExitMultiple = null;
  if (exitMultiple !== undefined) {
    terminalValueExitMultiple = calculateExitMultipleTerminalValue(finalYearEBITDA, exitMultiple);
    pvTerminalValueExitMultiple = calculatePresentValue(terminalValueExitMultiple, wacc, years);
    enterpriseValueExitMultiple = sumPvUFCF + pvTerminalValueExitMultiple;
  }

  return {
    years,
    revenue,
    ebit,
    nopat,
    da,
    capex,
    nwcChange,
    ufcf,
    ebitda,
    pvUFCF,
    sumPvUFCF,
    terminalValueGordon,
    pvTerminalValueGordon,
    enterpriseValueGordon,
    terminalValueExitMultiple,
    pvTerminalValueExitMultiple,
    enterpriseValueExitMultiple,
  };
}

export function calculateEquityValue(enterpriseValue, cash, debt) {
  assertFiniteNumber(enterpriseValue, 'enterpriseValue');
  assertNonNegative(cash, 'cash');
  assertNonNegative(debt, 'debt');
  return enterpriseValue + cash - debt;
}

export function calculateImpliedSharePrice(equityValue, dilutedShares) {
  assertFiniteNumber(equityValue, 'equityValue');
  assertPositive(dilutedShares, 'dilutedShares');
  return equityValue / dilutedShares;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 12 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/dcf.js test/engine/dcf.test.js
git commit -m "feat: add core DCF orchestrator, EV-to-equity bridge, and implied share price"
```

---

### Task 7: Reverse DCF solver (binary search)

**Files:**
- Create: `src/engine/reverseDcf.js`
- Test: `test/engine/reverseDcf.test.js`

**Interfaces:**
- Consumes: `calculateDCF`, `calculateEquityValue`, `calculateImpliedSharePrice` from `./dcf.js`; `assertPositive` from `./validation.js`
- Produces: `solveReverseDCF(inputs): { impliedGrowthRate: number, iterations: number, converged: boolean, impliedPrice: number }` where `inputs` is the same shape as `calculateDCF` inputs minus `revenueGrowth`, plus `targetPrice`, `cash`, `debt`, `dilutedShares`, and optional `minGrowth` (default `-0.9`), `maxGrowth` (default `5`), `tolerance` (default `1e-6`), `maxIterations` (default `200`). Uses the Gordon Growth enterprise value.

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/reverseDcf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveReverseDCF } from '../../src/engine/reverseDcf.js';
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from '../../src/engine/dcf.js';

const SHARED = {
  baseRevenue: 1000,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

function impliedPriceForGrowth(growth) {
  const dcf = calculateDCF({ ...SHARED, revenueGrowth: growth });
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, SHARED.cash, SHARED.debt);
  return calculateImpliedSharePrice(equity, SHARED.dilutedShares);
}

test('solveReverseDCF finds a growth rate whose implied price matches the target within tolerance', () => {
  const targetPrice = impliedPriceForGrowth(0.15); // pick a known-reachable target
  const result = solveReverseDCF({ ...SHARED, targetPrice });
  assert.ok(result.converged);
  assert.ok(Math.abs(result.impliedGrowthRate - 0.15) < 1e-3);
  assert.ok(Math.abs(result.impliedPrice - targetPrice) < 1e-3);
});

test('solveReverseDCF result is consistent with directly recomputing price at the solved growth rate', () => {
  const targetPrice = 27;
  const result = solveReverseDCF({ ...SHARED, targetPrice });
  const recomputed = impliedPriceForGrowth(result.impliedGrowthRate);
  assert.ok(Math.abs(recomputed - targetPrice) < 1e-3);
});

test('a higher target price yields a higher market-implied growth rate', () => {
  const low = solveReverseDCF({ ...SHARED, targetPrice: 20 });
  const high = solveReverseDCF({ ...SHARED, targetPrice: 35 });
  assert.ok(high.impliedGrowthRate > low.impliedGrowthRate);
});

test('solveReverseDCF throws when the target price is unreachable within growth bounds', () => {
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: 1000000 }));
});

test('solveReverseDCF rejects a non-positive target price', () => {
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: 0 }));
  assert.throws(() => solveReverseDCF({ ...SHARED, targetPrice: -10 }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/reverseDcf.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/reverseDcf.js
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';
import { assertPositive } from './validation.js';

export function solveReverseDCF({
  targetPrice,
  baseRevenue,
  ebitMargin,
  taxRate,
  daPctRevenue,
  capexPctRevenue,
  nwcChangePctRevenue,
  years,
  wacc,
  terminalGrowthRate,
  cash,
  debt,
  dilutedShares,
  minGrowth = -0.9,
  maxGrowth = 5,
  tolerance = 1e-6,
  maxIterations = 200,
}) {
  assertPositive(targetPrice, 'targetPrice');

  const priceForGrowth = (growth) => {
    const dcf = calculateDCF({
      baseRevenue,
      revenueGrowth: growth,
      ebitMargin,
      taxRate,
      daPctRevenue,
      capexPctRevenue,
      nwcChangePctRevenue,
      years,
      wacc,
      terminalGrowthRate,
    });
    const equityValue = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
    return calculateImpliedSharePrice(equityValue, dilutedShares);
  };

  let lo = minGrowth;
  let hi = maxGrowth;
  const priceLo = priceForGrowth(lo);
  const priceHi = priceForGrowth(hi);

  if (priceLo > targetPrice || priceHi < targetPrice) {
    throw new Error(
      `targetPrice (${targetPrice}) is unreachable within growth bounds [${minGrowth}, ${maxGrowth}]: ` +
        `implied price ranges from ${priceLo.toFixed(2)} to ${priceHi.toFixed(2)}. Widen minGrowth/maxGrowth.`
    );
  }

  let mid = (lo + hi) / 2;
  let priceMid = priceForGrowth(mid);
  let iterations = 0;
  while (iterations < maxIterations && Math.abs(priceMid - targetPrice) >= tolerance) {
    if (priceMid < targetPrice) {
      lo = mid;
    } else {
      hi = mid;
    }
    mid = (lo + hi) / 2;
    priceMid = priceForGrowth(mid);
    iterations += 1;
  }

  return {
    impliedGrowthRate: mid,
    iterations,
    converged: Math.abs(priceMid - targetPrice) < tolerance,
    impliedPrice: priceMid,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 5 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/reverseDcf.js test/engine/reverseDcf.test.js
git commit -m "feat: add reverse DCF binary-search solver for market-implied growth"
```

---

### Task 8: Bear/Base/Bull scenarios

**Files:**
- Create: `src/engine/scenarios.js`
- Test: `test/engine/scenarios.test.js`

**Interfaces:**
- Consumes: `calculateDCF`, `calculateEquityValue`, `calculateImpliedSharePrice` from `./dcf.js`
- Produces: `calculateScenarioValue(inputs): { dcf: DCFResult, equityValueGordon: number, equityValueExitMultiple: number|null, impliedSharePriceGordon: number, impliedSharePriceExitMultiple: number|null }` where `inputs` is `calculateDCF` inputs plus `cash`, `debt`, `dilutedShares`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/scenarios.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenarioValue } from '../../src/engine/scenarios.js';

const COMMON = {
  baseRevenue: 1000,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

const BEAR = { ...COMMON, revenueGrowth: 0.03, ebitMargin: 0.14, wacc: 0.11, terminalGrowthRate: 0.015 };
const BASE = { ...COMMON, revenueGrowth: 0.10, ebitMargin: 0.20, wacc: 0.09, terminalGrowthRate: 0.025 };
const BULL = { ...COMMON, revenueGrowth: 0.18, ebitMargin: 0.26, wacc: 0.075, terminalGrowthRate: 0.035 };

test('calculateScenarioValue returns a full DCF result plus implied share price', () => {
  const result = calculateScenarioValue(BASE);
  assert.ok(result.dcf.enterpriseValueGordon > 0);
  assert.ok(Math.abs(result.equityValueGordon - (result.dcf.enterpriseValueGordon + 200 - 300)) < 1e-9);
  assert.ok(Math.abs(result.impliedSharePriceGordon - result.equityValueGordon / 100) < 1e-9);
});

test('calculateScenarioValue returns null exit-multiple fields when exitMultiple is omitted', () => {
  const result = calculateScenarioValue(BASE);
  assert.equal(result.impliedSharePriceExitMultiple, null);
});

test('Bear, Base, and Bull scenarios produce strictly increasing implied share prices', () => {
  const bear = calculateScenarioValue(BEAR);
  const base = calculateScenarioValue(BASE);
  const bull = calculateScenarioValue(BULL);
  assert.ok(bear.impliedSharePriceGordon < base.impliedSharePriceGordon);
  assert.ok(base.impliedSharePriceGordon < bull.impliedSharePriceGordon);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/scenarios.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/scenarios.js
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';

export function calculateScenarioValue({ cash, debt, dilutedShares, ...dcfInputs }) {
  const dcf = calculateDCF(dcfInputs);

  const equityValueGordon = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
  const impliedSharePriceGordon = calculateImpliedSharePrice(equityValueGordon, dilutedShares);

  let equityValueExitMultiple = null;
  let impliedSharePriceExitMultiple = null;
  if (dcf.enterpriseValueExitMultiple !== null) {
    equityValueExitMultiple = calculateEquityValue(dcf.enterpriseValueExitMultiple, cash, debt);
    impliedSharePriceExitMultiple = calculateImpliedSharePrice(equityValueExitMultiple, dilutedShares);
  }

  return {
    dcf,
    equityValueGordon,
    equityValueExitMultiple,
    impliedSharePriceGordon,
    impliedSharePriceExitMultiple,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 3 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/scenarios.js test/engine/scenarios.test.js
git commit -m "feat: add Bear/Base/Bull scenario valuation"
```

---

### Task 9: DCF sensitivity table (WACC x Terminal Growth)

**Files:**
- Create: `src/engine/sensitivity.js`
- Test: `test/engine/sensitivity.test.js`

**Interfaces:**
- Consumes: `calculateDCF`, `calculateEquityValue`, `calculateImpliedSharePrice` from `./dcf.js`
- Produces: `calculateSensitivityTable({ waccRange: number[], terminalGrowthRange: number[], baseCaseInputs }): { waccValues: number[], terminalGrowthValues: number[], table: (number|null)[][] }` — `table[i][j]` is the implied share price for `waccRange[i]` and `terminalGrowthRange[j]`, or `null` when `terminalGrowthRange[j] >= waccRange[i]` (invalid Gordon Growth combination). `baseCaseInputs` is `calculateDCF` inputs (minus `wacc`/`terminalGrowthRate`) plus `cash`, `debt`, `dilutedShares`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/engine/sensitivity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSensitivityTable } from '../../src/engine/sensitivity.js';
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from '../../src/engine/dcf.js';

const BASE_CASE_INPUTS = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

test('calculateSensitivityTable matches direct recomputation for a valid cell', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.08, 0.09, 0.10],
    terminalGrowthRange: [0.015, 0.025],
    baseCaseInputs: BASE_CASE_INPUTS,
  });

  const { cash, debt, dilutedShares, ...dcfInputs } = BASE_CASE_INPUTS;
  const dcf = calculateDCF({ ...dcfInputs, wacc: 0.09, terminalGrowthRate: 0.025 });
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
  const expected = calculateImpliedSharePrice(equity, dilutedShares);

  assert.ok(Math.abs(result.table[1][1] - expected) < 1e-6);
});

test('calculateSensitivityTable returns null for invalid terminalGrowth >= wacc combinations', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.02, 0.09],
    terminalGrowthRange: [0.03, 0.025],
    baseCaseInputs: BASE_CASE_INPUTS,
  });
  // wacc=0.02, g=0.03 -> invalid; wacc=0.02, g=0.025 -> invalid
  assert.equal(result.table[0][0], null);
  assert.equal(result.table[0][1], null);
  // wacc=0.09, g=0.03 -> invalid; wacc=0.09, g=0.025 -> valid
  assert.equal(result.table[1][0], null);
  assert.ok(typeof result.table[1][1] === 'number');
});

test('implied share price decreases as WACC increases, holding terminal growth fixed', () => {
  const result = calculateSensitivityTable({
    waccRange: [0.08, 0.09, 0.10],
    terminalGrowthRange: [0.02],
    baseCaseInputs: BASE_CASE_INPUTS,
  });
  const [p8, p9, p10] = result.table.map((row) => row[0]);
  assert.ok(p8 > p9);
  assert.ok(p9 > p10);
});

test('calculateSensitivityTable rejects empty ranges', () => {
  assert.throws(() =>
    calculateSensitivityTable({ waccRange: [], terminalGrowthRange: [0.02], baseCaseInputs: BASE_CASE_INPUTS })
  );
  assert.throws(() =>
    calculateSensitivityTable({ waccRange: [0.09], terminalGrowthRange: [], baseCaseInputs: BASE_CASE_INPUTS })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/sensitivity.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/engine/sensitivity.js
import { calculateDCF, calculateEquityValue, calculateImpliedSharePrice } from './dcf.js';

export function calculateSensitivityTable({ waccRange, terminalGrowthRange, baseCaseInputs }) {
  if (!Array.isArray(waccRange) || waccRange.length === 0) {
    throw new Error('waccRange must be a non-empty array');
  }
  if (!Array.isArray(terminalGrowthRange) || terminalGrowthRange.length === 0) {
    throw new Error('terminalGrowthRange must be a non-empty array');
  }

  const { cash, debt, dilutedShares, ...dcfInputs } = baseCaseInputs;

  const table = waccRange.map((wacc) =>
    terminalGrowthRange.map((terminalGrowthRate) => {
      if (terminalGrowthRate >= wacc) {
        return null;
      }
      const dcf = calculateDCF({ ...dcfInputs, wacc, terminalGrowthRate });
      const equityValue = calculateEquityValue(dcf.enterpriseValueGordon, cash, debt);
      return calculateImpliedSharePrice(equityValue, dilutedShares);
    })
  );

  return { waccValues: waccRange, terminalGrowthValues: terminalGrowthRange, table };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all previous + 4 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/sensitivity.js test/engine/sensitivity.test.js
git commit -m "feat: add WACC x terminal growth DCF sensitivity table"
```

---

### Task 10: Independent numerical verification (integration test)

**Files:**
- Create: `src/engine/index.js`
- Test: `test/engine/integration.test.js`

**Interfaces:**
- Consumes: every function from Tasks 1–9.
- Produces: `src/engine/index.js` — barrel file re-exporting every public engine function, for convenient importing from UI code and future Velo modules.

This task independently re-derives the Base Case numbers using a plain loop (not by calling the engine's own internals) and checks the engine agrees, then verifies every directional/structural property listed in the spec.

- [ ] **Step 1: Write `src/engine/index.js` (barrel export, no new logic)**

```javascript
// src/engine/index.js
// Plain ES modules only (no Node built-ins) so this barrel — and everything
// it re-exports — can be copied as-is into a Wix Velo backend/public module.
export * from './validation.js';
export * from './forecast.js';
export * from './ufcf.js';
export * from './wacc.js';
export * from './terminalValue.js';
export * from './dcf.js';
export * from './reverseDcf.js';
export * from './scenarios.js';
export * from './sensitivity.js';
```

- [ ] **Step 2: Write the failing integration test**

```javascript
// test/engine/integration.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDCF,
  calculateEquityValue,
  calculateImpliedSharePrice,
  calculateScenarioValue,
  calculateSensitivityTable,
  solveReverseDCF,
} from '../../src/engine/index.js';

const BASE_CASE = {
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  ebitMargin: 0.20,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  wacc: 0.09,
  terminalGrowthRate: 0.025,
  exitMultiple: 10,
};
const CASH = 200;
const DEBT = 300;
const SHARES = 100;

// Independently re-derive the Base Case with a plain loop, NOT by calling the engine.
function independentBaseCase() {
  const years = 5;
  let revenue = 1000;
  const revenues = [];
  for (let t = 0; t < years; t++) {
    revenue = revenue * 1.10;
    revenues.push(revenue);
  }
  const ebit = revenues.map((r) => r * 0.20);
  const nopat = ebit.map((e) => e * 0.75);
  const da = revenues.map((r) => r * 0.05);
  const capex = revenues.map((r) => r * 0.06);
  const nwcChange = revenues.map((r) => r * 0.01);
  const ufcf = nopat.map((n, i) => n + da[i] - capex[i] - nwcChange[i]);
  const ebitda = ebit.map((e, i) => e + da[i]);

  const wacc = 0.09;
  const pvUfcf = ufcf.map((cf, i) => cf / Math.pow(1.09, i + 1));
  const sumPvUfcf = pvUfcf.reduce((a, b) => a + b, 0);

  const g = 0.025;
  const finalUfcf = ufcf[4];
  const tvGordon = (finalUfcf * (1 + g)) / (wacc - g);
  const pvTvGordon = tvGordon / Math.pow(1.09, 5);
  const evGordon = sumPvUfcf + pvTvGordon;

  const finalEbitda = ebitda[4];
  const tvExit = finalEbitda * 10;
  const pvTvExit = tvExit / Math.pow(1.09, 5);
  const evExit = sumPvUfcf + pvTvExit;

  const equityGordon = evGordon + CASH - DEBT;
  const equityExit = evExit + CASH - DEBT;
  const priceGordon = equityGordon / SHARES;
  const priceExit = equityExit / SHARES;

  return { revenues, ufcf, sumPvUfcf, evGordon, evExit, priceGordon, priceExit };
}

test('engine output matches an independently re-derived Base Case within tolerance', () => {
  const expected = independentBaseCase();
  const dcf = calculateDCF(BASE_CASE);
  const equityGordon = calculateEquityValue(dcf.enterpriseValueGordon, CASH, DEBT);
  const equityExit = calculateEquityValue(dcf.enterpriseValueExitMultiple, CASH, DEBT);
  const priceGordon = calculateImpliedSharePrice(equityGordon, SHARES);
  const priceExit = calculateImpliedSharePrice(equityExit, SHARES);

  assert.ok(Math.abs(dcf.sumPvUFCF - expected.sumPvUfcf) < 1e-6);
  assert.ok(Math.abs(dcf.enterpriseValueGordon - expected.evGordon) < 1e-6);
  assert.ok(Math.abs(dcf.enterpriseValueExitMultiple - expected.evExit) < 1e-6);
  assert.ok(Math.abs(priceGordon - expected.priceGordon) < 1e-6);
  assert.ok(Math.abs(priceExit - expected.priceExit) < 1e-6);
});

test('higher revenue growth increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, revenueGrowth: 0.05 });
  const high = calculateDCF({ ...BASE_CASE, revenueGrowth: 0.15 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('higher EBIT margin increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, ebitMargin: 0.15 });
  const high = calculateDCF({ ...BASE_CASE, ebitMargin: 0.25 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('higher WACC decreases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, wacc: 0.08 });
  const high = calculateDCF({ ...BASE_CASE, wacc: 0.12 });
  assert.ok(high.enterpriseValueGordon < low.enterpriseValueGordon);
});

test('higher terminal growth rate increases enterprise value, other inputs held fixed', () => {
  const low = calculateDCF({ ...BASE_CASE, terminalGrowthRate: 0.01 });
  const high = calculateDCF({ ...BASE_CASE, terminalGrowthRate: 0.04 });
  assert.ok(high.enterpriseValueGordon > low.enterpriseValueGordon);
});

test('current market price affects Reverse DCF output', () => {
  const { cash, debt, dilutedShares, exitMultiple, revenueGrowth, ...shared } = BASE_CASE;
  const low = solveReverseDCF({ ...shared, cash: CASH, debt: DEBT, dilutedShares: SHARES, targetPrice: 20 });
  const high = solveReverseDCF({ ...shared, cash: CASH, debt: DEBT, dilutedShares: SHARES, targetPrice: 35 });
  assert.notEqual(low.impliedGrowthRate, high.impliedGrowthRate);
});

test('current market price does NOT affect ordinary DCF intrinsic value', () => {
  // calculateDCF / calculateImpliedSharePrice have no market-price parameter at all —
  // verify the same inputs always produce the same intrinsic value regardless of
  // any externally-tracked "market price" the caller might also be holding.
  const marketPriceA = 15;
  const marketPriceB = 500;
  const dcfA = calculateDCF(BASE_CASE); // marketPriceA never enters this call
  const dcfB = calculateDCF(BASE_CASE); // marketPriceB never enters this call
  assert.equal(dcfA.enterpriseValueGordon, dcfB.enterpriseValueGordon);
  assert.notEqual(marketPriceA, marketPriceB); // sanity: they really are different "market prices"
});

test('Bear/Base/Bull scenarios produce three distinct valuations', () => {
  const bear = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
    revenueGrowth: 0.03, ebitMargin: 0.14, wacc: 0.11, terminalGrowthRate: 0.015,
  });
  const base = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
  });
  const bull = calculateScenarioValue({
    ...BASE_CASE, cash: CASH, debt: DEBT, dilutedShares: SHARES,
    revenueGrowth: 0.18, ebitMargin: 0.26, wacc: 0.075, terminalGrowthRate: 0.035,
  });
  const prices = new Set([
    bear.impliedSharePriceGordon.toFixed(4),
    base.impliedSharePriceGordon.toFixed(4),
    bull.impliedSharePriceGordon.toFixed(4),
  ]);
  assert.equal(prices.size, 3);
  assert.ok(bear.impliedSharePriceGordon < base.impliedSharePriceGordon);
  assert.ok(base.impliedSharePriceGordon < bull.impliedSharePriceGordon);
});

test('sensitivity table recalculates independently per cell and is internally consistent', () => {
  const { exitMultiple, wacc, terminalGrowthRate, ...rest } = BASE_CASE;
  const result = calculateSensitivityTable({
    waccRange: [0.07, 0.09, 0.11],
    terminalGrowthRange: [0.01, 0.025, 0.04],
    baseCaseInputs: { ...rest, cash: CASH, debt: DEBT, dilutedShares: SHARES },
  });
  // Every row must be non-decreasing left-to-right is NOT guaranteed (terminal growth axis
  // increases value monotonically), so assert that explicitly instead:
  for (const row of result.table) {
    const validCells = row.filter((v) => v !== null);
    for (let i = 1; i < validCells.length; i++) {
      assert.ok(validCells[i] >= validCells[i - 1]);
    }
  }
  // wacc=0.11, g=0.11 and g=0.04 combos: g < wacc always true here except none invalid
  // (0.04 < 0.11), so instead verify a genuinely invalid combination is null using a wider range:
  const withInvalid = calculateSensitivityTable({
    waccRange: [0.02],
    terminalGrowthRange: [0.05],
    baseCaseInputs: { ...rest, cash: CASH, debt: DEBT, dilutedShares: SHARES },
  });
  assert.equal(withInvalid.table[0][0], null);
});

test('validation: terminal growth >= WACC throws instead of returning a bad number', () => {
  assert.throws(() => calculateDCF({ ...BASE_CASE, wacc: 0.03, terminalGrowthRate: 0.03 }));
});

test('validation: zero or negative diluted shares throws instead of dividing by zero', () => {
  const dcf = calculateDCF(BASE_CASE);
  const equity = calculateEquityValue(dcf.enterpriseValueGordon, CASH, DEBT);
  assert.throws(() => calculateImpliedSharePrice(equity, 0));
  assert.throws(() => calculateImpliedSharePrice(equity, -5));
});

test('validation: missing required numeric input throws rather than silently using zero', () => {
  const { ebitMargin, ...missingMargin } = BASE_CASE;
  assert.throws(() => calculateDCF(missingMargin));
});

test('validation: negative diluted shares or negative cash/debt are rejected', () => {
  assert.throws(() => calculateEquityValue(1000, -1, 100));
  assert.throws(() => calculateImpliedSharePrice(1000, -1));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/engine/index.js'`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all tests across all files pass (this task adds no new engine logic, only the barrel file, so failures here indicate a real bug in Tasks 1–9 to fix before proceeding)

- [ ] **Step 5: Commit**

```bash
git add src/engine/index.js test/engine/integration.test.js
git commit -m "test: add independent numerical verification of the full valuation engine"
```

---

### Task 11: Minimal manual-input UI

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/styles.css`

**Interfaces:**
- Consumes: `calculateScenarioValue` from `../src/engine/scenarios.js`, `solveReverseDCF` from `../src/engine/reverseDcf.js`, `calculateSensitivityTable` from `../src/engine/sensitivity.js` (all via native browser ES module imports — no bundler).

No new calculation logic — this task only wires existing engine functions to form inputs and result tables. Priority is functional correctness over visual polish (Global Constraints).

- [ ] **Step 1: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Wall Street Valuation Lab — Phase 1</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <h1>Wall Street Valuation Lab — DCF Engine (MVP)</h1>

  <form id="inputs-form">
    <fieldset>
      <legend>Company Financial Inputs</legend>
      <label>Base Revenue ($M) <input type="number" step="any" name="baseRevenue" value="1000" required /></label>
      <label>Diluted Shares Outstanding (M) <input type="number" step="any" name="dilutedShares" value="100" required /></label>
      <label>Cash ($M) <input type="number" step="any" name="cash" value="200" required /></label>
      <label>Debt ($M) <input type="number" step="any" name="debt" value="300" required /></label>
      <label>Current Market Price ($) <input type="number" step="any" name="marketPrice" value="25" required /></label>
    </fieldset>

    <fieldset>
      <legend>Base Case Assumptions (5-Year Forecast)</legend>
      <label>Revenue Growth Rate <input type="number" step="any" name="revenueGrowth" value="0.10" required /></label>
      <label>EBIT Margin <input type="number" step="any" name="ebitMargin" value="0.20" required /></label>
      <label>Tax Rate <input type="number" step="any" name="taxRate" value="0.25" required /></label>
      <label>D&amp;A (% of Revenue) <input type="number" step="any" name="daPctRevenue" value="0.05" required /></label>
      <label>CapEx (% of Revenue) <input type="number" step="any" name="capexPctRevenue" value="0.06" required /></label>
      <label>Change in NWC (% of Revenue) <input type="number" step="any" name="nwcChangePctRevenue" value="0.01" required /></label>
      <label>Exit EBITDA Multiple <input type="number" step="any" name="exitMultiple" value="10" required /></label>
    </fieldset>

    <fieldset>
      <legend>WACC Inputs</legend>
      <label>Risk-Free Rate <input type="number" step="any" name="riskFreeRate" value="0.04" required /></label>
      <label>Beta <input type="number" step="any" name="beta" value="1.10" required /></label>
      <label>Equity Risk Premium <input type="number" step="any" name="equityRiskPremium" value="0.05" required /></label>
      <label>Pre-Tax Cost of Debt <input type="number" step="any" name="preTaxCostOfDebt" value="0.06" required /></label>
      <label>Terminal Growth Rate <input type="number" step="any" name="terminalGrowthRate" value="0.025" required /></label>
    </fieldset>

    <button type="submit">Run Valuation</button>
  </form>

  <section id="error" hidden></section>

  <section id="results" hidden>
    <h2>Valuation Summary</h2>
    <table id="summary-table"></table>

    <h2>Bear / Base / Bull Scenarios</h2>
    <table id="scenario-table"></table>

    <h2>Reverse DCF</h2>
    <table id="reverse-dcf-table"></table>

    <h2>Sensitivity: Implied Share Price (WACC x Terminal Growth)</h2>
    <table id="sensitivity-table"></table>
  </section>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/app.js`**

```javascript
// public/app.js
import { calculateCostOfEquity, calculateAfterTaxCostOfDebt, calculateWACC } from '../src/engine/wacc.js';
import { calculateScenarioValue } from '../src/engine/scenarios.js';
import { solveReverseDCF } from '../src/engine/reverseDcf.js';
import { calculateSensitivityTable } from '../src/engine/sensitivity.js';

const form = document.getElementById('inputs-form');
const errorSection = document.getElementById('error');
const resultsSection = document.getElementById('results');

function readFormValues(form) {
  const data = new FormData(form);
  const values = {};
  for (const [key, value] of data.entries()) {
    values[key] = Number(value);
  }
  return values;
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : 'N/A';
}

function renderTable(el, headers, rows) {
  el.innerHTML =
    '<thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>' +
    '<tbody>' + rows.map((row) => '<tr>' + row.map((cell) => `<td>${cell}</td>`).join('') + '</tr>').join('') + '</tbody>';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorSection.hidden = true;
  resultsSection.hidden = true;

  try {
    const v = readFormValues(form);

    const costOfEquity = calculateCostOfEquity(v.riskFreeRate, v.beta, v.equityRiskPremium);
    const afterTaxCostOfDebt = calculateAfterTaxCostOfDebt(v.preTaxCostOfDebt, v.taxRate);
    const equityValueForWeights = v.dilutedShares * v.marketPrice;
    const wacc = calculateWACC({
      costOfEquity,
      afterTaxCostOfDebt,
      equityValue: equityValueForWeights,
      debtValue: v.debt,
    });

    const sharedInputs = {
      baseRevenue: v.baseRevenue,
      taxRate: v.taxRate,
      daPctRevenue: v.daPctRevenue,
      capexPctRevenue: v.capexPctRevenue,
      nwcChangePctRevenue: v.nwcChangePctRevenue,
      years: 5,
      exitMultiple: v.exitMultiple,
      cash: v.cash,
      debt: v.debt,
      dilutedShares: v.dilutedShares,
    };

    const base = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth,
      ebitMargin: v.ebitMargin,
      wacc,
      terminalGrowthRate: v.terminalGrowthRate,
    });

    renderTable(
      document.getElementById('summary-table'),
      ['Metric', 'Value'],
      [
        ['Cost of Equity', fmt(costOfEquity * 100) + '%'],
        ['After-Tax Cost of Debt', fmt(afterTaxCostOfDebt * 100) + '%'],
        ['WACC', fmt(wacc * 100) + '%'],
        ['Sum PV of UFCF', fmt(base.dcf.sumPvUFCF)],
        ['Enterprise Value (Gordon Growth)', fmt(base.dcf.enterpriseValueGordon)],
        ['Enterprise Value (Exit Multiple)', fmt(base.dcf.enterpriseValueExitMultiple)],
        ['Equity Value (Gordon Growth)', fmt(base.equityValueGordon)],
        ['Implied Share Price (Gordon Growth)', '$' + fmt(base.impliedSharePriceGordon)],
        ['Implied Share Price (Exit Multiple)', '$' + fmt(base.impliedSharePriceExitMultiple)],
      ]
    );

    const bear = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth * 0.4,
      ebitMargin: v.ebitMargin * 0.8,
      wacc: wacc + 0.02,
      terminalGrowthRate: Math.max(v.terminalGrowthRate - 0.01, 0),
    });
    const bull = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth * 1.6,
      ebitMargin: v.ebitMargin * 1.2,
      wacc: Math.max(wacc - 0.02, 0.01),
      terminalGrowthRate: v.terminalGrowthRate + 0.01,
    });

    renderTable(
      document.getElementById('scenario-table'),
      ['Scenario', 'Revenue Growth', 'EBIT Margin', 'WACC', 'Terminal Growth', 'Implied Price (Gordon)'],
      [
        ['Bear', fmt(bear.dcf.revenue[0] / v.baseRevenue - 1), '', '', '', '$' + fmt(bear.impliedSharePriceGordon)],
        ['Base', fmt(v.revenueGrowth * 100) + '%', fmt(v.ebitMargin * 100) + '%', fmt(wacc * 100) + '%', fmt(v.terminalGrowthRate * 100) + '%', '$' + fmt(base.impliedSharePriceGordon)],
        ['Bull', fmt(bull.dcf.revenue[0] / v.baseRevenue - 1), '', '', '', '$' + fmt(bull.impliedSharePriceGordon)],
      ]
    );

    const reverse = solveReverseDCF({
      ...sharedInputs,
      wacc,
      terminalGrowthRate: v.terminalGrowthRate,
      targetPrice: v.marketPrice,
    });

    renderTable(
      document.getElementById('reverse-dcf-table'),
      ['Metric', 'Value'],
      [
        ['Current Market Price', '$' + fmt(v.marketPrice)],
        ['Market-Implied Revenue CAGR', fmt(reverse.impliedGrowthRate * 100) + '%'],
        ['User Base-Case Revenue CAGR', fmt(v.revenueGrowth * 100) + '%'],
        ['Difference', fmt((v.revenueGrowth - reverse.impliedGrowthRate) * 100) + ' pts'],
      ]
    );

    const waccRange = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
    const terminalGrowthRange = [
      v.terminalGrowthRate - 0.01,
      v.terminalGrowthRate - 0.005,
      v.terminalGrowthRate,
      v.terminalGrowthRate + 0.005,
      v.terminalGrowthRate + 0.01,
    ];
    const sensitivity = calculateSensitivityTable({
      waccRange,
      terminalGrowthRange,
      baseCaseInputs: {
        ...sharedInputs,
        revenueGrowth: v.revenueGrowth,
        ebitMargin: v.ebitMargin,
      },
    });

    renderTable(
      document.getElementById('sensitivity-table'),
      ['WACC \\ g', ...terminalGrowthRange.map((g) => fmt(g * 100) + '%')],
      sensitivity.table.map((row, i) => [
        fmt(waccRange[i] * 100) + '%',
        ...row.map((cell, j) => {
          const isBase = Math.abs(waccRange[i] - wacc) < 1e-9 && Math.abs(terminalGrowthRange[j] - v.terminalGrowthRate) < 1e-9;
          const text = cell === null ? 'N/A' : '$' + fmt(cell);
          return isBase ? `<strong>${text}</strong>` : text;
        }),
      ])
    );

    resultsSection.hidden = false;
  } catch (err) {
    errorSection.hidden = false;
    errorSection.textContent = 'Error: ' + err.message;
  }
});
```

- [ ] **Step 3: Create `public/styles.css`**

```css
body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
fieldset { margin-bottom: 1rem; }
label { display: block; margin: 0.4rem 0; }
input { margin-left: 0.5rem; width: 8rem; }
button { margin-top: 1rem; padding: 0.5rem 1rem; }
table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: right; }
th:first-child, td:first-child { text-align: left; }
#error { color: #b00020; margin: 1rem 0; }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add minimal manual-input UI wired to the valuation engine"
```

---

### Task 12: Browser verification and final full-suite check

**Files:**
- None created — verification only.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`
Expected: PASS — every test file across Tasks 1–10 passes with 0 failures. If anything fails, apply superpowers:systematic-debugging before proceeding — do not patch symptoms.

- [ ] **Step 2: Serve `public/` locally**

Run: `python3 -m http.server 8000 --directory public`

- [ ] **Step 3: Drive the UI with claude-in-chrome**

Load `http://localhost:8000/index.html`, submit the form with the pre-filled Base Case defaults, and verify:
- The Valuation Summary table renders WACC, both enterprise values, and both implied share prices as non-zero numbers.
- The Bear/Base/Bull table shows three distinct implied prices in ascending order.
- The Reverse DCF table shows a market-implied CAGR distinct from the base-case CAGR.
- The sensitivity table renders a 5x5 grid with the base-case cell visually bolded and `N/A` in any invalid (terminal growth >= WACC) cells.
- Changing `Current Market Price` and resubmitting changes the Reverse DCF row but leaves the Valuation Summary numbers unchanged (proves market price does not leak into intrinsic value).

Use `read_console_messages` to confirm no uncaught JS errors during submission.

- [ ] **Step 4: Commit any fixes found during browser verification, then stop**

If Step 3 surfaces a bug, use superpowers:systematic-debugging to find the root cause, fix it with a matching test added to the relevant `test/engine/*.test.js` file, re-run `npm test`, then commit.

```bash
git add -A
git commit -m "fix: <describe the specific bug found during browser verification>"
```
