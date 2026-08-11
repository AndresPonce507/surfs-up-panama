// Cucumber exits 0 when a tag expression matches no scenarios. That makes a
// typo in a slice/UI tag look like a green acceptance run, so make the runner
// itself reject an empty selection before a feature can claim evidence from it.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cucumber = join(process.cwd(), 'node_modules', '.bin', 'cucumber-js');
const result = spawnSync(cucumber, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`Could not start cucumber: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.status === 0 && /(^|\n)0 scenarios\s*$/m.test(`${result.stdout}\n${result.stderr}`)) {
  console.error('Acceptance selection matched zero scenarios. Correct the feature, slice, step, or UI tag before recording a pass.');
  process.exitCode = 2;
} else {
  process.exitCode = result.status ?? 1;
}
