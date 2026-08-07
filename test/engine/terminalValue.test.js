import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGordonGrowthTerminalValue,
  calculateExitMultipleTerminalValue,
} from '../../src/engine/terminalValue.js';

test('calculateGordonGrowthTerminalValue applies FCFn*(1+g)/(WACC-g)', () => {
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
