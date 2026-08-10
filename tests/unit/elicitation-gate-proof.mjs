// Prove check-elicitation-commitments.mjs actually catches each failure mode.
// A gate nobody has watched fail is a gate nobody should trust.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/private/tmp/claude-501/-Users-andres/e8fb9c56-acde-4e38-811a-a798dbbb5c7a/scratchpad/elicfix';
const GATE = '/Users/andres/psb-gate/scripts/check-elicitation-commitments.mjs';

rmSync(ROOT, { recursive: true, force: true });
for (const dir of ['docs/feature/f-fixture', 'scripts', 'tests/acceptance']) {
  mkdirSync(join(ROOT, dir), { recursive: true });
}
copyFileSync(GATE, join(ROOT, 'scripts/check-elicitation-commitments.mjs'));
writeFileSync(join(ROOT, 'scripts/ci-local-core.mjs'),
  'const JOBS=[{steps:[["x","node",["scripts/real-gate.mjs"]]]}];\n');
writeFileSync(join(ROOT, 'scripts/real-gate.mjs'), '// wired into the job list above\n');
writeFileSync(join(ROOT, 'scripts/orphan-gate.mjs'), '// exists, but no job runs it\n');
writeFileSync(join(ROOT, 'tests/acceptance/a.feature'),
  '@feature-fixture\nFeature: f\n\n  @slice-01 @binds\n  Scenario: one\n    Given a\n\n@above-feature-only\n');

const HEADER = '# f\n\nA new feature.\n\n## Wave: DISCUSS / [REF] Elicitation\n\n'
  + '| # | Group | Set | Answer | Enforced by | Kind |\n|---|---|---|---|---|---|\n';

function run(label, row, expectFail) {
  writeFileSync(join(ROOT, 'docs/feature/f-fixture/feature-delta.md'), HEADER + row + '\n');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [join(ROOT, 'scripts/check-elicitation-commitments.mjs'), ROOT], { encoding: 'utf8' });
  } catch (error) {
    code = error.status;
    out = String(error.stdout ?? '');
  }
  // Every fixture is one row against a floor of 36, so the floor always trips.
  // What we are proving is that the WIRING problem is reported too, on top.
  const wiring = /commitment 1 |gate "[^"]+" exists but|binds no Scenario/.exec(out);
  const caught = wiring !== null;
  const ok = expectFail ? caught : !caught;
  const detail = caught ? out.split('\n').filter((l) => /commitment 1 |exists but|binds no/.test(l))[0].trim() : 'no wiring complaint';
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label.padEnd(32)} exit=${code}  ${detail.slice(0, 96)}`);
  return ok;
}

console.log('proving each failure mode is actually caught:\n');
const results = [
  run('wired gate is accepted', '| 1 | A | 1 | ok | scripts/real-gate.mjs | gate |', false),
  run('gate script does not exist', '| 1 | A | 1 | ok | scripts/ghost-gate.mjs | gate |', true),
  run('gate exists but never runs', '| 1 | A | 1 | ok | scripts/orphan-gate.mjs | gate |', true),
  run('tag binding a Scenario is ok', '| 1 | A | 1 | ok | @binds | scenario |', false),
  run('tag above Feature: binds none', '| 1 | A | 1 | ok | @above-feature-only | scenario |', true),
  run('unenforceable with a reason ok', '| 1 | A | 1 | ok | n/a | unenforceable: a fact about people |', false),
  run('unenforceable with no reason', '| 1 | A | 1 | ok | n/a | unenforceable |', true),
  run('unknown kind is refused', '| 1 | A | 1 | ok | somehow | vibes |', true),
];
const failed = results.filter((r) => !r).length;
console.log(`\n${failed === 0 ? 'ALL 8 CASES BEHAVE CORRECTLY' : failed + ' CASE(S) WRONG'}`);
process.exit(failed === 0 ? 0 : 1);
