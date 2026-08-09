#!/usr/bin/env node
// ci-local — run the CI pipeline on this machine. No GitHub Actions spend.
//
// Portable template from ~/.claude/templates/local-ci/ (extracted from the
// TradelyHQ local gate, 2026-08). ADAPT the JOBS list to this repo's stack —
// everything else (scheduler, logs, skip-loudly semantics) is stack-agnostic.
//
// USAGE
//   node scripts/ci-local.mjs                # the PR gate (default jobs)
//   node scripts/ci-local.mjs --all          # everything, including non-default jobs
//   node scripts/ci-local.mjs --job=test     # one job (repeatable)
//   node scripts/ci-local.mjs --list         # show jobs + missing tools
//   node scripts/ci-local.mjs --fast         # fast loop (jobs' fast steps where defined)
//
// Exit code is non-zero if any selected job fails, so it can gate a merge.

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const wanted = argv.filter((a) => a.startsWith('--job=')).map((a) => a.slice(6));
const FAST = has('--fast');

// Binary presence check without a shell (semgrep flags shell:true spawns).
function have(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8', shell: false }).status === 0;
}

// ── ADAPT THIS ──────────────────────────────────────────────────────
// One entry per CI job. Rules that keep the gate honest:
//   - `needs`: binaries that must exist. A missing one SKIPS the job LOUDLY
//     rather than passing silently — a guard that quietly no-ops is worse
//     than one that fails.
//   - `default: true` = part of the PR gate. false = only via --all / --job=.
//   - `fast`: optional cheaper steps for the pre-push fast loop (e.g.
//     affected-only tests). Omit it and --fast runs the full steps.
//   - `heavy: true` = CPU-saturating job (big test suites, semgrep). Heavy
//     jobs run in a second wave AFTER the light ones — running them next to
//     timing-sensitive tests causes flaky assertion failures under contention.
//   - If multiple jobs read a build artifact (dist/), serialize their package
//     scripts in separate waves so none scans a half-written bundle.
// Adapted for surfs-up-panama 2026-08-08. TypeScript throughout: Astro for the
// site, CDK for infrastructure. There is no linter configured yet, so the
// `lint` job the template ships is replaced by `typecheck` — a job that runs a
// command the repo does not have would SKIP loudly forever and teach everyone
// to ignore it.
//
// --passWithNoTests on vitest and the `|| true`-free cucumber guard are
// deliberate: this repo is pre-DISTILL, so there are genuinely zero tests and
// zero .feature files today. The jobs must go green on an empty suite and
// start biting the moment DISTILL writes the first one, without anyone
// remembering to re-enable them.
//
// NOT WIRED YET, add when the thing it checks exists:
//   - `budget`: the 100 KB / per-route byte gate from application-architecture.md
//     §5. Needs a build to measure. Add as PRELUDE + a job once `astro build`
//     produces output.
const PRELUDE = null;
const JOBS = [
  {
    name: 'test',
    default: true,
    steps: [
      ['unit + in-process', 'npx', ['vitest', 'run', '--passWithNoTests']],
    ],
  },
  {
    name: 'typecheck',
    default: true,
    steps: [
      ['tsc --noEmit', 'npm', ['run', 'typecheck']],
    ],
  },
  {
    name: 'secrets',
    default: true,
    needs: ['gitleaks'],
    steps: [
      ['gitleaks detect', 'gitleaks', ['detect', '--source', '.', '--redact', '--exit-code', '1', '--no-banner']],
    ],
  },
  {
    name: 'deps',
    default: true,
    needs: ['osv-scanner'],
    steps: [
      ['osv-scanner', 'osv-scanner', ['scan', 'source', '--lockfile=./package-lock.json']],
    ],
  },
  {
    name: 'sast',
    default: true,
    heavy: true,
    needs: ['semgrep'],
    steps: [
      ['semgrep scan', 'semgrep', ['scan', '--config', 'p/default', '--severity', 'ERROR', '--error', '--metrics=off', '--quiet']],
    ],
  },
  {
    name: 'at',
    default: true,
    needs: ['npm'],
    steps: [
      ['cucumber acceptance', 'npm', ['run', 'test:at']],
    ],
  },
  {
    name: 'ui',
    default: true,
    needs: ['npm'],
    steps: [
      ['ui quality mandates', 'npm', ['run', 'test:ui']],
    ],
  },
  {
    name: 'e2e',
    default: true,
    heavy: true,
    needs: ['npm'],
    steps: [
      ['browser acceptance', 'npm', ['run', 'test:e2e']],
    ],
  },
];
// ── END ADAPT ───────────────────────────────────────────────────────

if (has('--list')) {
  console.log('\nJobs (● = in the default PR gate):\n');
  for (const j of JOBS) {
    const miss = (j.needs || []).filter((b) => !have(b));
    console.log(`  ${j.default ? '●' : '○'} ${j.name.padEnd(18)}${miss.length ? ` [MISSING: ${miss.join(', ')}]` : ''}`);
  }
  console.log('');
  process.exit(0);
}

const selected = wanted.length
  ? JOBS.filter((j) => wanted.includes(j.name))
  : JOBS.filter((j) => (has('--all') ? true : j.default));

if (!selected.length) {
  console.error('No matching job. Try --list.');
  process.exit(2);
}

const cores = Number(spawnSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).stdout)
  || Number(spawnSync('nproc', [], { encoding: 'utf8' }).stdout) || 8;
const CONCURRENCY = Number(argv.find((a) => a.startsWith('--jobs='))?.split('=')[1])
  || Math.max(2, Math.min(4, Math.floor(cores / 3)));

// Heavy jobs run in their own wave after the light ones — a correctness
// constraint, not tuning. See the JOBS comment.
const waves = [
  selected.filter((j) => !j.heavy),
  selected.filter((j) => j.heavy),
].filter((w) => w.length);

const results = [];
const t0 = Date.now();

// Steps run as awaited child processes — NEVER spawnSync. spawnSync blocks the
// event loop, which makes the scheduler look concurrent while actually running
// everything sequentially, and nothing in the output reveals it.
const TAIL_BYTES = 4 * 1024 * 1024;

// The console tail is a preview, NOT the evidence. Test runners print failing
// assertions far above their summary, so the last 25 lines routinely carry the
// counts and none of the failures. The log file is the record.
function writeFailureLog(job, label, r) {
  try {
    const dir = resolve(repoRoot, '.ci-local-logs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${job}.log`), `# ${job} → ${label}\n# exit ${r.status}\n\n${r.out}`);
  } catch {
    // A log we cannot write must never mask the failure it was describing.
  }
}

function runStep(cmd, args, cwd) {
  return new Promise((resolve_) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let buf = '';
    const collect = (d) => {
      buf += d;
      if (buf.length > TAIL_BYTES) buf = buf.slice(-TAIL_BYTES);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => resolve_({ status: 127, out: `failed to spawn ${cmd}: ${e.message}` }));
    child.on('close', (code) => resolve_({ status: code, out: buf }));
  });
}

console.log(`\nRunning ${selected.length} job(s) in ${waves.length} wave(s), ${CONCURRENCY} at a time (${cores} cores)\n`);

if (PRELUDE) {
  const [label, cmd, args] = PRELUDE;
  const started = Date.now();
  process.stdout.write(`  · ${label} (shared, runs before the fan-out) … `);
  const r = await runStep(cmd, args, repoRoot);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.log(`\x1b[31mFAIL\x1b[0m (${secs}s)`);
    writeFailureLog('prelude', label, r);
    console.log(r.out.trim().split('\n').slice(-25).map((l) => `      ${l}`).join('\n'));
    console.log(`\n  \x1b[33m→ full output: .ci-local-logs/prelude.log\x1b[0m\n`);
    process.exit(1);
  }
  console.log(`\x1b[32mok\x1b[0m (${secs}s)\n`);
}

function runJob(job) {
  return new Promise((done) => {
    const missing = (job.needs || []).filter((b) => !have(b));
    if (missing.length) {
      results.push({ job: job.name, status: 'SKIPPED', note: `missing ${missing.join(', ')}` });
      console.log(`\x1b[33m○ ${job.name} — SKIPPED (missing: ${missing.join(', ')})\x1b[0m`);
      return done();
    }
    const cwd = job.cwd ? resolve(repoRoot, job.cwd) : repoRoot;
    if (job.cwd && !existsSync(cwd)) {
      results.push({ job: job.name, status: 'SKIPPED', note: `no ${job.cwd}` });
      console.log(`\x1b[33m○ ${job.name} — SKIPPED (no ${job.cwd})\x1b[0m`);
      return done();
    }

    const jobStart = Date.now();
    const lines = [];
    let failed = null;
    const steps = FAST && job.fast ? job.fast : job.steps;

    (async () => {
      try {
        for (const [label, cmd, args] of steps) {
          const started = Date.now();
          const r = await runStep(cmd, args, cwd);
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          if (r.status === 0) {
            lines.push(`   · ${label} … \x1b[32mok\x1b[0m (${secs}s)`);
          } else {
            lines.push(`   · ${label} … \x1b[31mFAIL\x1b[0m (${secs}s)`);
            writeFailureLog(job.name, label, r);
            lines.push(...r.out.trim().split('\n').slice(-25).map((l) => `       ${l}`));
            lines.push(`   \x1b[33m→ full output: .ci-local-logs/${job.name}.log\x1b[0m`);
            failed = label;
            break;
          }
        }
      } catch (e) {
        failed = `runner error: ${e.message}`;
        lines.push(`   · \x1b[31m${failed}\x1b[0m`);
      }
      const total = ((Date.now() - jobStart) / 1000).toFixed(0);
      console.log(`\x1b[${failed ? 31 : 32}m${failed ? '✗' : '✓'} ${job.name}\x1b[0m (${total}s)`);
      for (const l of lines) console.log(l);
      results.push({ job: job.name, status: failed ? 'FAIL' : 'PASS', note: failed || '' });
      done();
    })();
  });
}

for (const wave of waves) {
  const queue = [...wave];
  const running = new Set();
  while (queue.length || running.size) {
    while (queue.length && running.size < CONCURRENCY) {
      const job = queue.shift();
      const p = runJob(job).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size) await Promise.race(running);
  }
}

console.log('\n' + '─'.repeat(62));
for (const r of results) {
  const c = r.status === 'PASS' ? 32 : r.status === 'FAIL' ? 31 : 33;
  const where = r.status === 'FAIL' ? `   → .ci-local-logs/${r.job}.log` : '';
  console.log(`  \x1b[${c}m${r.status.padEnd(8)}\x1b[0m ${r.job}${r.note ? `  — ${r.note}` : ''}${where}`);
}
const failedCount = results.filter((r) => r.status === 'FAIL').length;
const skipped = results.filter((r) => r.status === 'SKIPPED').length;
console.log('─'.repeat(62));
console.log(`  ${results.length - failedCount - skipped} passed / ${failedCount} failed / ${skipped} skipped   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (skipped) console.log(`  \x1b[33mSkipped jobs did NOT run — do not read them as green.\x1b[0m`);
console.log('');

process.exit(failedCount ? 1 : 0);
