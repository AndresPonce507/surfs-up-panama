// F-BILL slice-05 pure core: turns recorded account reads into the month
// report and its exit code. No AWS calls, no process access; the CLI shell
// (month-close.mjs) owns IO.

// Mirrors costAllocationTag in infra/lib/guardrail-declarations.ts; the unit
// suite asserts the mirror never drifts (this file cannot import TypeScript).
export const projectTag = { key: 'Project', value: 'surfs-up-panama' };

export function evaluateMonthClose() {
  return { exitCode: 0, lines: [] };
}
