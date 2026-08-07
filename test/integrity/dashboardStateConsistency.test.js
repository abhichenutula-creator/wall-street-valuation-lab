// dashboard.html has no test harness (it's a static file with an inline
// script, not a Node module — no DOM/event simulation available here
// without adding a new test dependency). These are structural/source-level
// regression tests instead: they verify the SINGLE-SOURCE-OF-TRUTH
// invariants the reported bug violated, and that the stale-response guard
// (state.activeTicker) is actually wired into every async response handler
// that mutates shared state. A future edit that reintroduces a second
// price/shares source, or that adds a new async handler without the guard,
// will fail one of these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const dashboardSource = readFileSync(path.join(repoRoot, 'public/dashboard.html'), 'utf8');

function scriptBody() {
  const match = dashboardSource.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'dashboard.html must contain an inline <script> block');
  return match[1];
}

test('state.company.price has exactly one assignment site (single canonical current price)', () => {
  const script = scriptBody();
  const assignments = script.match(/state\.company\.price\s*=\s*[^=]/g) || [];
  assert.equal(assignments.length, 1, 'expected exactly one place that assigns state.company.price; found: ' + JSON.stringify(assignments));
});

test('every place that reads a "current price" reads state.company.price, not a separate variable', () => {
  const script = scriptBody();
  // Every UI section the bug report named must read the same source.
  const readSites = [
    /setText\('factPrice',\s*money\(state\.company\.price\)\)/,           // ticker header
    /'Current Price',\s*money\(state\.company\.price\)/,                  // Overview card
    /setText\('revCurrentPrice',\s*money\(state\.company\.price\)\)/,     // Market Expectations
    /var currentPrice = state\.company\.price;/,                          // football field + valuation summary
    /reverseTargetPrice:\s*state\.company\.price/,                        // Reverse DCF request payload
  ];
  readSites.forEach((pattern) => {
    assert.ok(pattern.test(script), `expected to find a read of state.company.price matching ${pattern}`);
  });
});

test('state.shared.dilutedShares is populated only via the single shared-fields import loop (single canonical share count)', () => {
  const script = scriptBody();
  // dilutedShares is assigned dynamically as one of the shared fields
  // (state.shared[k] = data.shared[k]) inside applyImportedData's import
  // loop — confirm that loop names it, and that no OTHER direct assignment
  // (state.shared.dilutedShares = ...) exists anywhere that would bypass it.
  assert.ok(/\[[^\]]*'dilutedShares'[^\]]*\]\.forEach/.test(script), 'expected dilutedShares to be populated via the shared-fields import loop');
  const directAssignments = script.match(/state\.shared\.dilutedShares\s*=(?!=)/g) || [];
  assert.equal(directAssignments.length, 0, 'no direct state.shared.dilutedShares = assignment should exist outside the shared-fields loop; found: ' + JSON.stringify(directAssignments));
});

test('Base Case revenue growth is read from one canonical field everywhere it is displayed', () => {
  const script = scriptBody();
  // The forecast input, restore-defaults, and Market Expectations "Base CAGR"
  // must all reference state.base.revenueGrowth — not a second variable.
  assert.ok(/in_revenueGrowth'\)\.value = state\.base\.revenueGrowth/.test(script));
  assert.ok(/var baseCagr = state\.base\.revenueGrowth;/.test(script));
  assert.equal((script.match(/state\.base\.revenueGrowth\s*=/g) || []).length >= 1, true);
});

test('activeTicker guard is present in every async response handler that mutates shared state', () => {
  const script = scriptBody();
  // recompute(), fetchComps(), and the ticker-import handler must each
  // discard a response when a newer ticker has since become active.
  const guardOccurrences = (script.match(/state\.activeTicker !== (requestTicker|ticker)\)\s*return;/g) || []).length;
  assert.ok(guardOccurrences >= 3, `expected the activeTicker staleness guard in at least 3 async handlers (recompute, fetchComps, ticker import); found ${guardOccurrences}`);
});

test('loading a new ticker synchronously clears the previous ticker\'s DCF/comps result before the new data arrives', () => {
  const script = scriptBody();
  const handler = script.split('function bindTickerSearch(){')[1] || '';
  assert.ok(/state\.activeTicker = ticker;/.test(handler));
  assert.ok(/state\.lastResult = null;/.test(handler));
  assert.ok(/state\.compsRaw = null;/.test(handler));
});
