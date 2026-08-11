#!/usr/bin/env node
// The operator-facing month-close command. Tests use --input, so no AWS call
// or credential is required to prove the driving port and exit-code contract.

import { readFileSync } from 'node:fs';

import { evaluateMonthClose } from './month-close-core.mjs';

function liveReads() {
  throw new Error('month close: live Cost Explorer reads are disabled because Cost Explorer charges per request; the accepted architecture has only account-wide Budgets, so it cannot yet prove Project=surfs-up-panama spend on a shared account. Use --input recorded evidence until a zero-cost project-scoped monitor is designed.');
}

export function runMonthClose({ argv = process.argv.slice(2), output = console } = {}) {
  const inputFlag = argv.indexOf('--input');
  if (inputFlag >= 0 && argv[inputFlag + 1] === undefined) throw new Error('month close: --input needs a recorded reads file');
  const reads = inputFlag >= 0 ? JSON.parse(readFileSync(argv[inputFlag + 1], 'utf8')) : liveReads();
  const result = evaluateMonthClose({ reads });
  for (const line of result.lines) output.log(line);
  return result.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = runMonthClose(); }
  catch (error) { console.error(`month close: cannot read the account: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
