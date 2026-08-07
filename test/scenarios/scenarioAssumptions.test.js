import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScenarioAssumptions,
  checkScenarioAssumptionOrdering,
  checkScenarioValueOrdering,
} from '../../src/backend/scenarios/scenarioAssumptions.js';

test('buildScenarioAssumptions keeps Bull margin above a high Base margin (the reported MSFT bug)', () => {
  // MSFT's actual Phase 5 suggested Base: ~45.68% EBIT margin, ~13.74% growth.
  // The old hard-coded 14%/26% Bear/Bull margins both sat below this,
  // inverting Bull below Base. The relative construction must not do that.
  const base = { revenueGrowth: 0.1374, ebitMargin: 0.4568, terminalGrowthRate: 0.025 };
  const { bear, bull } = buildScenarioAssumptions(base);
  assert.ok(bull.ebitMargin > base.ebitMargin, 'Bull margin must exceed Base margin');
  assert.ok(bear.ebitMargin < base.ebitMargin, 'Bear margin must be below Base margin');
  assert.ok(bull.revenueGrowth > base.revenueGrowth && base.revenueGrowth > bear.revenueGrowth);
});

test('buildScenarioAssumptions produces a well-ordered set for a low-margin Base without inverting', () => {
  const base = { revenueGrowth: 0.04, ebitMargin: 0.03, terminalGrowthRate: 0.02 };
  const { bear, bull } = buildScenarioAssumptions(base);
  assert.ok(bear.ebitMargin >= 0.01, 'Bear margin should not go below the floor');
  assert.ok(bear.ebitMargin < base.ebitMargin);
  assert.ok(bull.ebitMargin > base.ebitMargin);
});

test('buildScenarioAssumptions handles a declining (negative-growth) Base correctly', () => {
  const base = { revenueGrowth: -0.05, ebitMargin: 0.15, terminalGrowthRate: 0.01 };
  const { bear, bull } = buildScenarioAssumptions(base);
  assert.ok(bull.revenueGrowth > base.revenueGrowth && base.revenueGrowth > bear.revenueGrowth);
});

test('buildScenarioAssumptions sets WACC delta and terminal growth relative to Base, not absolute constants', () => {
  const base = { revenueGrowth: 0.10, ebitMargin: 0.20, terminalGrowthRate: 0.06 }; // unusual, high terminal growth
  const { bear, bull } = buildScenarioAssumptions(base);
  assert.ok(bear.waccDelta > 0 && bull.waccDelta < 0);
  assert.ok(bull.terminalGrowthRate > base.terminalGrowthRate);
  assert.ok(bear.terminalGrowthRate < base.terminalGrowthRate);
});

test('checkScenarioAssumptionOrdering passes for a correctly constructed scenario set', () => {
  const base = { revenueGrowth: 0.1374, ebitMargin: 0.4568, terminalGrowthRate: 0.025 };
  const { bear, bull } = buildScenarioAssumptions(base);
  const result = checkScenarioAssumptionOrdering(bear, base, bull);
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test('checkScenarioAssumptionOrdering flags the exact reported stale-defaults bug', () => {
  // Reproduces the reported bug directly: old hard-coded 14%/26% margins
  // against MSFT's real ~45.68% Base margin.
  const base = { revenueGrowth: 0.1374, ebitMargin: 0.4568, terminalGrowthRate: 0.025 };
  const staleBear = { revenueGrowth: 0.03, ebitMargin: 0.14, waccDelta: 0.02, terminalGrowthRate: 0.015 };
  const staleBull = { revenueGrowth: 0.18, ebitMargin: 0.26, waccDelta: -0.02, terminalGrowthRate: 0.035 };
  const result = checkScenarioAssumptionOrdering(staleBear, base, staleBull);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('EBIT margin')));
});

test('checkScenarioValueOrdering passes for a normal Bear < Base < Bull result', () => {
  const result = checkScenarioValueOrdering(80, 216, 310);
  assert.equal(result.ok, true);
});

test('checkScenarioValueOrdering flags an inverted Bull-below-Base result without altering the values', () => {
  const result = checkScenarioValueOrdering(-32.07, 216.58, 116.89);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('Bull')));
});

test('checkScenarioValueOrdering handles a negative Bear price as a valid (if extreme) number, not an error', () => {
  // A negative implied price is a legitimate modeled outcome under harsh
  // enough assumptions — it should not itself trip the ordering check as
  // long as Bear < Base < Bull still holds.
  const result = checkScenarioValueOrdering(-10, 50, 120);
  assert.equal(result.ok, true);
});
