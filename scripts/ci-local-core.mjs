import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRELUDE = null;
const TAIL_BYTES = 4 * 1024 * 1024;

const JOBS = [
  {
    name: 'test',
    default: true,
    steps: [['unit + in-process', 'npx', ['vitest', 'run', '--passWithNoTests']]],
  },
  {
    name: 'typecheck',
    default: true,
    steps: [['tsc --noEmit', 'npm', ['run', 'typecheck']]],
  },
  {
    name: 'secrets',
    default: true,
    needs: ['gitleaks'],
    steps: [['gitleaks detect', 'gitleaks', ['detect', '--source', '.', '--redact', '--exit-code', '1', '--no-banner']]],
  },
  {
    name: 'deps',
    default: true,
    needs: ['osv-scanner'],
    steps: [['osv-scanner', 'osv-scanner', ['scan', 'source', '--config=./osv-scanner.toml', '--lockfile=./package-lock.json']]],
  },
  {
    name: 'sast',
    default: true,
    heavy: true,
    needs: ['semgrep'],
    steps: [['semgrep scan', 'semgrep', ['scan', '--config', 'p/default', '--severity', 'ERROR', '--error', '--metrics=off', '--quiet']]],
  },
  {
    name: 'at',
    default: true,
    needs: ['npm'],
    steps: [['cucumber acceptance', 'npm', ['run', 'test:at']]],
  },
  {
    name: 'ui',
    default: true,
    needs: ['npm'],
    steps: [['ui quality mandates', 'npm', ['run', 'test:ui']]],
  },
  {
    // Two concurrent `astro build` runs collide on the shared
    // .astro/.prerender/.vite scratch directory, whatever --outDir each was
    // given. This job builds, so it runs in its own wave, alone, after every
    // other job. The page-weight gate runs inside `astro build`, so this job is
    // the whole promise: build the real site, measure every route, refuse over
    // a ceiling.
    name: 'budget',
    default: true,
    serial: true,
    needs: ['npm'],
    steps: [['build + page weight', 'npm', ['run', 'build', '--', '--outDir', '.ci-local-logs/budget-dist']]],
  },
  {
    name: 'e2e',
    default: true,
    heavy: true,
    needs: ['npm'],
    steps: [['browser acceptance', 'npm', ['run', 'test:e2e']]],
  },
  {
    name: 'infra',
    default: true,
  },
];

const defaultOutput = {
  write(line) {
    process.stdout.write(`${line}\n`);
  },
  error(line) {
    process.stderr.write(`${line}\n`);
  },
};

function have(binary) {
  return spawnSync('which', [binary], { encoding: 'utf8', shell: false }).status === 0;
}

function coreCount() {
  return Number(spawnSync('sysctl', ['-n', 'hw.ncpu'], { encoding: 'utf8' }).stdout)
    || Number(spawnSync('nproc', [], { encoding: 'utf8' }).stdout)
    || 8;
}

export function runCommand(command, args, cwd, env) {
  const childEnv = childEnvironment(env);
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '';
    const collect = (data) => {
      output += data;
      if (output.length > TAIL_BYTES) output = output.slice(-TAIL_BYTES);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => done({ status: 127, out: `failed to spawn ${command}: ${error.message}` }));
    child.on('close', (status) => done({ status, out: output }));
  });
}

function childEnvironment(environment, legacyEnvironment) {
  // Always hand a fresh object to a child runner. This preserves process.env
  // for the caller while allowing callers to choose an isolated HOME.
  return { ...(environment ?? legacyEnvironment ?? process.env) };
}

function writeFailureLog(repoRoot, job, label, result) {
  try {
    const directory = resolve(repoRoot, '.ci-local-logs');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, `${job}.log`), `# ${job} -> ${label}\n# exit ${result.status}\n\n${result.out}`);
    return true;
  } catch {
    // The original command failure remains the outcome if its log cannot be written.
    return false;
  }
}

function outputError(output, line) {
  if (typeof output.error === 'function') {
    output.error(line);
    return;
  }
  output.write(line);
}

function credentialFreeEnvironment(environment, isolatedRoot) {
  const source = environment ?? process.env;
  const isolated = {
    HOME: resolve(isolatedRoot, 'home'),
    XDG_CONFIG_HOME: resolve(isolatedRoot, 'xdg-config'),
    XDG_CACHE_HOME: resolve(isolatedRoot, 'xdg-cache'),
    XDG_DATA_HOME: resolve(isolatedRoot, 'xdg-data'),
    TMPDIR: resolve(isolatedRoot, 'tmp'),
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  for (const name of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE']) {
    if (source[name] !== undefined) isolated[name] = source[name];
  }
  for (const path of [
    isolated.HOME,
    isolated.XDG_CONFIG_HOME,
    isolated.XDG_CACHE_HOME,
    isolated.XDG_DATA_HOME,
    isolated.TMPDIR,
  ]) {
    mkdirSync(path, { recursive: true });
  }
  return isolated;
}

function missingProductionPath(path) {
  return { status: 127, out: `required production executable is unavailable: ${path}` };
}

function infrastructureDefinition(root) {
  const infraRoot = resolve(root, 'infra');
  try {
    return { infraRoot, available: statSync(infraRoot).isDirectory() };
  } catch {
    return { infraRoot, available: false };
  }
}

function unavailableInfrastructureDefinition({ root, output, path = infrastructureDefinition(root).infraRoot }) {
  const line = `cannot inspect ${path}: the infrastructure definition is missing; retention and local cost guardrail checks cannot run; restore the infra/ definition from version control`;
  outputError(output, line);
  return { exitCode: 1, lines: [line] };
}

async function evaluateCommittedInfrastructureDeclarations({ root, environment, output }) {
  const definition = infrastructureDefinition(root);
  if (!definition.available) {
    return unavailableInfrastructureDefinition({ root, output, path: definition.infraRoot });
  }

  let evaluateInfrastructureDeclarations;
  try {
    ({ evaluateInfrastructureDeclarations } = await import('../infra/guardrail-evaluator.mjs'));
  } catch {
    return unavailableInfrastructureDefinition({
      root,
      output,
      path: resolve(definition.infraRoot, 'guardrail-evaluator.mjs'),
    });
  }

  if (typeof evaluateInfrastructureDeclarations !== 'function') {
    return unavailableInfrastructureDefinition({
      root,
      output,
      path: resolve(definition.infraRoot, 'guardrail-evaluator.mjs'),
    });
  }

  return evaluateInfrastructureDeclarations({ root, environment, output });
}

async function runInfrastructureJob({ repoRoot, output, commandRunner, environment }) {
  const definition = infrastructureDefinition(repoRoot);
  if (!definition.available) {
    const declarationResult = unavailableInfrastructureDefinition({
      root: repoRoot,
      output,
      path: definition.infraRoot,
    });
    return { status: declarationResult.exitCode, failure: 'infrastructure definition' };
  }

  const stateRoot = mkdtempSync(join(tmpdir(), 'surfs-up-infra-ci-'));
  const phaseEnvironment = credentialFreeEnvironment(environment, stateRoot);
  try {
    const declarationResult = await evaluateCommittedInfrastructureDeclarations({
      root: repoRoot,
      environment: phaseEnvironment,
      output,
    });
    if (declarationResult.exitCode !== 0) return { status: declarationResult.exitCode, failure: 'declaration evaluation' };

    const vitest = resolve(repoRoot, 'node_modules/vitest/vitest.mjs');
    const guardrailTest = resolve(repoRoot, 'infra/test/guardrails.test.ts');
    if (!existsSync(vitest) || !existsSync(guardrailTest)) {
      const result = missingProductionPath(!existsSync(vitest) ? vitest : guardrailTest);
      outputError(output, result.out);
      return { status: result.status, failure: 'infra/test/guardrails.test.ts' };
    }
    const testResult = await commandRunner(process.execPath, [vitest, 'run', guardrailTest], repoRoot, phaseEnvironment);
    if (testResult.status !== 0) {
      outputError(output, `infra/test/guardrails.test.ts: failed\n${testResult.out.trim()}`);
      return { status: testResult.status ?? 1, failure: 'infra/test/guardrails.test.ts' };
    }
    output.write('infra/test/guardrails.test.ts: passed');

    const cdk = resolve(repoRoot, 'node_modules/aws-cdk/bin/cdk');
    const tsxLoader = resolve(repoRoot, 'node_modules/tsx/dist/loader.mjs');
    const app = resolve(repoRoot, 'infra/bin/app.ts');
    if (!existsSync(cdk) || !existsSync(tsxLoader) || !existsSync(app)) {
      const missing = [cdk, tsxLoader, app].find((path) => !existsSync(path));
      const result = missingProductionPath(missing);
      outputError(output, result.out);
      return { status: result.status, failure: 'credential-free synth' };
    }
    const appCommand = `${process.execPath} --import ${tsxLoader} ${app}`;
    const synthOutput = resolve(stateRoot, 'cdk.out');
    const synthResult = await commandRunner(
      process.execPath,
      [cdk, 'synth', '--app', appCommand, '--output', synthOutput, '--no-lookups', '--no-notices', '--quiet'],
      repoRoot,
      phaseEnvironment,
    );
    if (synthResult.status !== 0) {
      outputError(output, `credential-free synth: failed\n${synthResult.out.trim()}`);
      return { status: synthResult.status ?? 1, failure: 'credential-free synth' };
    }
    output.write('credential-free synth: passed');
    output.write('credentials: absent; offline credential-free synth with CDK lookups disabled');
    return { status: 0, failure: null };
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
}

/**
 * Runs the local CI composition in the current process and returns its numeric
 * exit result. CLI callers use the default process-backed output port. Tests
 * can provide a capturing output port and a command runner without spawning
 * another local-CI process.
 */
export async function runLocalCi({
  argv = [],
  repoRoot = defaultRepoRoot,
  output = defaultOutput,
  commandRunner = runCommand,
  environment,
  declarationInput,
  env,
} = {}) {
  const childEnv = childEnvironment(environment, env);
  if (declarationInput?.mode === 'declaration-only') {
    const result = await evaluateCommittedInfrastructureDeclarations({
      root: declarationInput.root,
      environment: childEnv,
      output,
    });
    return result.exitCode;
  }
  const has = (flag) => argv.includes(flag);
  const wanted = argv.filter((argument) => argument.startsWith('--job=')).map((argument) => argument.slice(6));
  const fast = has('--fast');

  if (has('--list')) {
    output.write('');
    output.write('Jobs (● = in the default PR gate):');
    output.write('');
    for (const job of JOBS) {
      const missing = (job.needs || []).filter((binary) => !have(binary));
      output.write(`  ${job.default ? '●' : '○'} ${job.name.padEnd(18)}${missing.length ? ` [MISSING: ${missing.join(', ')}]` : ''}`);
    }
    output.write('');
    return 0;
  }

  const selected = wanted.length
    ? JOBS.filter((job) => wanted.includes(job.name))
    : JOBS.filter((job) => (has('--all') ? true : job.default));

  if (!selected.length) {
    outputError(output, 'No matching job. Try --list.');
    return 2;
  }

  const cores = coreCount();
  const concurrency = Number(argv.find((argument) => argument.startsWith('--jobs='))?.split('=')[1])
    || Math.max(2, Math.min(4, Math.floor(cores / 3)));
  // Waves run one after another. A job marked `serial` gets the last wave to
  // itself: it needs exclusive use of a resource the other jobs also touch.
  const waves = [
    selected.filter((job) => !job.heavy && !job.serial),
    selected.filter((job) => job.heavy && !job.serial),
    ...selected.filter((job) => job.serial).map((job) => [job]),
  ].filter((wave) => wave.length);
  const results = [];
  const startedAt = Date.now();

  output.write(`\nRunning ${selected.length} job(s) in ${waves.length} wave(s), ${concurrency} at a time (${cores} cores)\n`);

  if (PRELUDE) {
    const [label, command, commandArgs] = PRELUDE;
    const started = Date.now();
    output.write(`  · ${label} (shared, runs before the fan-out) … `);
    const result = await commandRunner(command, commandArgs, repoRoot, childEnv);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.status !== 0) {
      output.write(`\x1b[31mFAIL\x1b[0m (${seconds}s)`);
      const failureLogWritten = writeFailureLog(repoRoot, 'prelude', label, result);
      for (const line of result.out.trim().split('\n').slice(-25)) output.write(`      ${line}`);
      if (failureLogWritten) output.write('\n  \x1b[33m-> full output: .ci-local-logs/prelude.log\x1b[0m\n');
      return 1;
    }
    output.write(`\x1b[32mok\x1b[0m (${seconds}s)\n`);
  }

  async function runJob(job) {
    if (job.name === 'infra') {
      const started = Date.now();
      const result = await runInfrastructureJob({
        repoRoot,
        output,
        commandRunner,
        environment: childEnv,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      output.write(`\x1b[${result.failure ? 31 : 32}m${result.failure ? '✗' : '✓'} infra\x1b[0m (${seconds}s)`);
      results.push({ job: job.name, status: result.failure ? 'FAIL' : 'PASS', note: result.failure || '', failureLogWritten: false });
      return;
    }
    const missing = (job.needs || []).filter((binary) => !have(binary));
    if (missing.length) {
      results.push({ job: job.name, status: 'SKIPPED', note: `missing ${missing.join(', ')}` });
      output.write(`\x1b[33m○ ${job.name} - SKIPPED (missing: ${missing.join(', ')})\x1b[0m`);
      return;
    }
    const cwd = job.cwd ? resolve(repoRoot, job.cwd) : repoRoot;
    if (job.cwd && !existsSync(cwd)) {
      results.push({ job: job.name, status: 'SKIPPED', note: `no ${job.cwd}` });
      output.write(`\x1b[33m○ ${job.name} - SKIPPED (no ${job.cwd})\x1b[0m`);
      return;
    }

    const jobStartedAt = Date.now();
    const lines = [];
    let failure = null;
    let failureLogWritten = false;
    const steps = fast && job.fast ? job.fast : job.steps;
    try {
      for (const [label, command, commandArgs] of steps) {
        const started = Date.now();
        const result = await commandRunner(command, commandArgs, cwd, childEnv);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        if (result.status === 0) {
          lines.push(`   · ${label} … \x1b[32mok\x1b[0m (${seconds}s)`);
          continue;
        }
        lines.push(`   · ${label} … \x1b[31mFAIL\x1b[0m (${seconds}s)`);
        failureLogWritten = writeFailureLog(repoRoot, job.name, label, result);
        lines.push(...result.out.trim().split('\n').slice(-25).map((line) => `       ${line}`));
        if (failureLogWritten) lines.push(`   \x1b[33m-> full output: .ci-local-logs/${job.name}.log\x1b[0m`);
        failure = label;
        break;
      }
    } catch (error) {
      failure = `runner error: ${error instanceof Error ? error.message : String(error)}`;
      lines.push(`   · \x1b[31m${failure}\x1b[0m`);
    }
    const seconds = ((Date.now() - jobStartedAt) / 1000).toFixed(0);
    output.write(`\x1b[${failure ? 31 : 32}m${failure ? '✗' : '✓'} ${job.name}\x1b[0m (${seconds}s)`);
    for (const line of lines) output.write(line);
    results.push({ job: job.name, status: failure ? 'FAIL' : 'PASS', note: failure || '', failureLogWritten });
  }

  for (const wave of waves) {
    const queue = [...wave];
    const running = new Set();
    while (queue.length || running.size) {
      while (queue.length && running.size < concurrency) {
        const job = queue.shift();
        const pending = runJob(job).finally(() => running.delete(pending));
        running.add(pending);
      }
      if (running.size) await Promise.race(running);
    }
  }

  output.write(`\n${'─'.repeat(62)}`);
  for (const result of results) {
    const color = result.status === 'PASS' ? 32 : result.status === 'FAIL' ? 31 : 33;
    const logPath = result.failureLogWritten ? `   -> .ci-local-logs/${result.job}.log` : '';
    output.write(`  \x1b[${color}m${result.status.padEnd(8)}\x1b[0m ${result.job}${result.note ? `  - ${result.note}` : ''}${logPath}`);
  }
  const failures = results.filter((result) => result.status === 'FAIL').length;
  const skipped = results.filter((result) => result.status === 'SKIPPED').length;
  output.write('─'.repeat(62));
  output.write(`  ${results.length - failures - skipped} passed / ${failures} failed / ${skipped} skipped   ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  if (skipped) output.write('  \x1b[33mSkipped jobs did NOT run - do not read them as green.\x1b[0m');
  output.write('');

  return failures ? 1 : 0;
}
