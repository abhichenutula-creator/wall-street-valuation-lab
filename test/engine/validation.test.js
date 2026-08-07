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
