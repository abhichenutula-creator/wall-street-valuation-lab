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
