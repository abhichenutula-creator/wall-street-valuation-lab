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
