#!/usr/bin/env node
// The operator-facing alarm-probe command. Tests use --input, so no AWS call
// and no credential is required to prove the driving port and exit-code
// contract.

import { readFileSync } from 'node:fs';

import { evaluateAlarmProbe, watchedDeadMansSwitches } from './alarm-probe-core.mjs';

function recordedOnly() {
  throw new Error("alarm probe: this command reports on a recorded capture of the account, never on a live read. A live read proves what the alarms are doing right now; it cannot prove that an ALARM was ever raised and then closed. Pass --input <capture file>.");
}

export function runAlarmProbe({ argv = process.argv.slice(2), output = console, watchList = watchedDeadMansSwitches } = {}) {
  const inputFlag = argv.indexOf('--input');
  if (inputFlag >= 0 && argv[inputFlag + 1] === undefined) throw new Error('alarm probe: --input needs a recorded capture file');
  const capture = inputFlag >= 0 ? JSON.parse(readFileSync(argv[inputFlag + 1], 'utf8')) : recordedOnly();
  const result = evaluateAlarmProbe({ capture, watchList });
  for (const line of result.lines) output.log(line);
  return result.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = runAlarmProbe(); }
  catch (error) { console.error(`alarm probe: cannot read the recorded capture: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
