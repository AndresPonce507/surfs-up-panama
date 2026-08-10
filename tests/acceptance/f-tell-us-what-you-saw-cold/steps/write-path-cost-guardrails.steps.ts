// Slice-02 drives only the production local-CI composition. Controlled
// mutations live in a guarded temporary copy, never in this checkout.

import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';

type GuardrailWorld = object;
type GateResult = Readonly<{ exitCode: number; output: string }>;
type ControlledCopy = Readonly<{ root: string; cleanupRoot: string; declarationPath: string; original: string }>;

const DECLARATION_PATH = 'infra/lib/guardrail-declarations.ts';
const CONTROLLED_BLOCK = `

export const writePathGuardrailDeclarations = {
  'report-url-auth': 'NONE',
  'mint-url-auth': 'NONE',
  'push-url-auth': 'NONE',
  'photo-presign-url-auth': 'NONE',
  'report-url-origin': 'https://preview.surfsuppanama.example',
  'mint-url-origin': 'https://preview.surfsuppanama.example',
  'push-url-origin': 'https://preview.surfsuppanama.example',
  'photo-presign-url-origin': 'https://preview.surfsuppanama.example',
  'report-limit': '2',
  'mint-limit': '1',
  'push-limit': '1',
  'photo-presign-limit': '1',
  'table-billing-mode': 'PROVISIONED',
  'table-read-capacity': '25',
  'table-write-capacity': '25',
  'report-breaker-alarm': 'declared',
  'mint-breaker-alarm': 'declared',
  'push-breaker-alarm': 'declared',
  'photo-presign-breaker-alarm': 'declared',
  'report-device-limit': '20',
  'presign-device-limit': '10',
  'subscription-device-limit': '20',
  'quota-identity': 'device-only',
  'sizing-source': 'system-architecture.md section 6.1',
} as const;
`;

class CapturingOutput {
  readonly lines: string[] = [];
  write(line: string): void { this.lines.push(line); }
  error(line: string): void { this.lines.push(line); }
  text(): string { return this.lines.join('\n'); }
}

const results = new WeakMap<GuardrailWorld, GateResult>();
const controlledCopies = new WeakMap<GuardrailWorld, ControlledCopy>();
const sourceSnapshots = new WeakMap<GuardrailWorld, ReadonlyMap<string, string>>();

function assertNoSymlinks(path: string): void {
  const stat = lstatSync(path);
  assert.ok(!stat.isSymbolicLink(), `WHAT: controlled fixture source contains a symlink at ${path}. HOW: use regular files only.`);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) assertNoSymlinks(resolve(path, entry));
    return;
  }
  assert.ok(stat.isFile(), `WHAT: controlled fixture source contains a non-regular entry at ${path}.`);
}

function containedPath(root: string, path: string): string {
  const resolved = resolve(root, path);
  const inside = relative(root, resolved);
  assert.ok(inside !== '' && !inside.startsWith('../') && inside !== '..' && !isAbsolute(inside), `WHAT: controlled fixture path escaped its root: ${path}.`);
  const stat = lstatSync(resolved);
  assert.ok(stat.isFile(), `WHAT: controlled fixture path is not a regular file: ${path}.`);
  return resolved;
}

function snapshotRegularTree(root: string): ReadonlyMap<string, string> {
  const snapshot = new Map<string, string>();
  const visit = (path: string): void => {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `WHAT: controlled fixture source contains a symlink at ${path}. HOW: use regular files only.`);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(resolve(path, entry));
      return;
    }
    assert.ok(stat.isFile(), `WHAT: controlled fixture source contains a non-regular entry at ${path}.`);
    snapshot.set(relative(root, path), readFileSync(path, 'utf8'));
  };
  visit(root);
  return snapshot;
}

function assertSourceUnchanged(world: GuardrailWorld): void {
  const before = sourceSnapshots.get(world);
  if (before === undefined) return;
  assert.deepEqual(
    [...snapshotRegularTree(resolve(process.cwd(), 'infra'))],
    [...before],
    'WHAT: a controlled bite changed the checkout infrastructure. HOW: mutate only the temporary copy.',
  );
}

After({ tags: '@feature-f-tell-us-what-you-saw-cold' }, function (this: GuardrailWorld) {
  try {
    assertSourceUnchanged(this);
  } finally {
    const copy = controlledCopies.get(this);
    if (copy) rmSync(copy.cleanupRoot, { recursive: true, force: true });
  }
});

async function runInfrastructureGate(repoRoot: string): Promise<GateResult> {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot, output });
  return { exitCode, output: output.text() };
}

function observed(world: GuardrailWorld): GateResult {
  const result = results.get(world);
  assert.ok(result, 'WHAT: no local-CI result was captured. HOW: run the documented infrastructure job first.');
  return result;
}

function includes(output: string, expected: string, why: string): void {
  assert.ok(output.toLowerCase().includes(expected.toLowerCase()), `WHAT: local-CI output omits ${JSON.stringify(expected)}. WHY: ${why}.\n${output}`);
}

function copyControlledRoot(world: GuardrailWorld): ControlledCopy {
  const sourceRoot = process.cwd();
  assertNoSymlinks(resolve(sourceRoot, 'infra'));
  sourceSnapshots.set(world, snapshotRegularTree(resolve(sourceRoot, 'infra')));
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-report-guardrail-'));
  const root = join(cleanupRoot, 'checkout');
  try {
    cpSync(sourceRoot, root, {
      recursive: true,
      dereference: false,
      filter: (source) => !['.git', 'node_modules', '.nwave', '.ci-local-logs', 'dist'].includes(relative(sourceRoot, source).split('/')[0] ?? ''),
    });
    const packageModules = resolve(sourceRoot, 'node_modules');
    assert.ok(existsSync(packageModules), 'WHAT: local dependencies are absent. HOW: run npm ci before the acceptance gate.');
    symlinkSync(packageModules, resolve(root, 'node_modules'), 'dir');
    assert.equal(realpathSync(resolve(root, 'node_modules')), realpathSync(packageModules), 'WHAT: controlled runtime dependency link escaped the checked-out dependency tree.');
    const declarationPath = containedPath(root, DECLARATION_PATH);
    const original = readFileSync(declarationPath, 'utf8');
    if (!original.includes('export const writePathGuardrailDeclarations = {')) {
      writeFileSync(declarationPath, `${original}${CONTROLLED_BLOCK}`, 'utf8');
    }
    const copy: ControlledCopy = { root, cleanupRoot, declarationPath, original: readFileSync(declarationPath, 'utf8') };
    controlledCopies.set(world, copy);
    return copy;
  } catch (error) {
    rmSync(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
}

function replaceDeclaration(copy: ControlledCopy, key: string, expectedValue: string, nextValue: string): void {
  const expected = `  '${key}': '${expectedValue}',\n`;
  const source = readFileSync(copy.declarationPath, 'utf8');
  const count = source.split(expected).length - 1;
  assert.equal(count, 1, `WHAT: controlled mutation for ${key} is ambiguous or unavailable. HOW: preserve one declaration witness.`);
  const replacement = nextValue === 'missing' ? '' : `  '${key}': '${nextValue}',\n`;
  writeFileSync(copy.declarationPath, source.replace(expected, replacement), 'utf8');
}

function restoreDeclaration(copy: ControlledCopy): void {
  writeFileSync(copy.declarationPath, copy.original, 'utf8');
}

Given('the site owner is protecting the write-path budget before deployment', function () {});

When('the site owner starts the documented infrastructure job against this checkout', { timeout: 90_000 }, async function (this: GuardrailWorld) {
  results.set(this, await runInfrastructureGate(process.cwd()));
});

When('the site owner starts the infrastructure job with its declaration file unavailable', { timeout: 30_000 }, async function (this: GuardrailWorld) {
  const copy = copyControlledRoot(this);
  rmSync(copy.declarationPath, { force: true });
  results.set(this, await runInfrastructureGate(copy.root));
});

When('the site owner changes controlled write declaration {string} from {string} to {string}', { timeout: 90_000 }, async function (this: GuardrailWorld, key: string, declared: string, changed: string) {
  const copy = copyControlledRoot(this);
  replaceDeclaration(copy, key, declared, changed);
  results.set(this, await runInfrastructureGate(copy.root));
});

Then('the report write infrastructure job finishes successfully', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.equal(result.exitCode, 0, `WHAT: the infrastructure job exited ${result.exitCode}.\n${result.output}`);
});

Then('the report write infrastructure job does not succeed', function (this: GuardrailWorld) {
  assert.notEqual(observed(this).exitCode, 0, `WHAT: an unavailable declaration was accepted.\n${observed(this).output}`);
});

Then('the result names the four write addresses, their one allowed site origin and their public posture', function (this: GuardrailWorld) {
  for (const expected of ['report', 'mint', 'push', 'photo-presign', 'exact site origin', 'AuthType: NONE']) includes(observed(this).output, expected, 'a deployer must see every write address is bound to the site');
});

Then('the result names the report limit of 2 and the mint, push and photo limits of 1', function (this: GuardrailWorld) {
  for (const expected of ['report 2', 'mint 1', 'push 1', 'photo-presign 1']) includes(observed(this).output, expected, 'reserved concurrency is the first hard ceiling on an anonymous write flood');
});

Then('the result names the table\'s fixed 25 reads and 25 writes', function (this: GuardrailWorld) {
  for (const expected of ['PROVISIONED', '25 WCU', '25 RCU']) includes(observed(this).output, expected, 'the table must fail closed at the fixed free-tier capacity');
});

Then('the result names all four write breakers and the device-only daily limits', function (this: GuardrailWorld) {
  for (const expected of ['four write breaker alarms', '20 reports', '10 presigns', '20 subscription writes', 'device', 'no per-IP']) includes(observed(this).output, expected, 'the output must distinguish device limits from an unaffordable per-IP policy');
});

Then('the result says it checked local declarations without AWS credentials and does not claim a console audit', function (this: GuardrailWorld) {
  includes(observed(this).output, 'credentials: absent', 'a local gate cannot claim to have inspected the AWS console');
  assert.ok(!observed(this).output.toLowerCase().includes('console audit passed'), `WHAT: the local gate claimed a console audit.\n${observed(this).output}`);
});

Then('the result cites the corrected cost sizing, not the falsified write-path arithmetic', function (this: GuardrailWorld) {
  includes(observed(this).output, 'system-architecture.md section 6.1', 'the corrected sizing source is the only accepted source');
  assert.ok(!observed(this).output.includes('07-write-path.md section 12'), `WHAT: the gate cited the falsified sizing section.\n${observed(this).output}`);
});

Then('the result says it could not inspect the declaration file and how to restore it', function (this: GuardrailWorld) {
  for (const expected of ['cannot inspect', 'guardrail-declarations.ts', 'restore']) includes(observed(this).output, expected, 'an unreadable guard must not pass silently');
});

Then('the report write preflight rejects {string} with observed {string}, required {string}, why {string} and repair {string}', function (this: GuardrailWorld, label: string, changed: string, declared: string, why: string, repair: string) {
  const result = observed(this);
  assert.notEqual(result.exitCode, 0, `WHAT: ${label} regression was accepted.\n${result.output}`);
  for (const expected of [label, `observed ${changed}`, `required ${declared}`, why, repair]) includes(result.output, expected, 'every bite must identify the drift, cost consequence and exact repair');
});

Then('restoring controlled write declaration {string} to {string} makes the report write preflight green', { timeout: 90_000 }, async function (this: GuardrailWorld, key: string, declared: string) {
  const copy = controlledCopies.get(this);
  assert.ok(copy, 'WHAT: no controlled copy exists to restore.');
  restoreDeclaration(copy);
  const restored = await runInfrastructureGate(copy.root);
  assert.equal(restored.exitCode, 0, `WHAT: restoring ${key} to ${declared} did not return the same controlled copy to green.\n${restored.output}`);
  includes(restored.output, 'write-path preflight: passed', 'the repaired copy must prove the write-path preflight ran');
  assertSourceUnchanged(this);
});
