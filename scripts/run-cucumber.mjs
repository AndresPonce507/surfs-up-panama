// Cucumber exits 0 when a tag expression matches no scenarios. That makes a
// typo in a slice/UI tag look like a green acceptance run, so make the runner
// itself reject an empty selection before a feature can claim evidence from it.
//
// The child is spawned asynchronously with its output streamed through AND
// captured. The earlier spawnSync version buffered everything in memory, so a
// run that never exited (2026-08-12: step failures stranded vite preview and
// Chromium children, whose live handles kept cucumber's event loop referenced
// after the summary) showed zero output for its entire 60+ minute hang and was
// undiagnosable. Streaming keeps the zero-scenario guard AND shows exactly
// which scenario a wedged run is on.

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const cucumber = join(process.cwd(), 'node_modules', '.bin', 'cucumber-js');
const child = spawn(cucumber, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let captured = '';
child.stdout.on('data', (chunk) => {
  captured += chunk;
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  captured += chunk;
  process.stderr.write(chunk);
});

child.on('error', (error) => {
  console.error(`Could not start cucumber: ${error.message}`);
  process.exitCode = 1;
});

child.on('close', (status) => {
  if (status === 0 && /(^|\n)0 scenarios\s*$/m.test(`${captured}\n`)) {
    console.error('Acceptance selection matched zero scenarios. Correct the feature, slice, step, or UI tag before recording a pass.');
    process.exitCode = 2;
  } else {
    process.exitCode = status ?? 1;
  }
});
