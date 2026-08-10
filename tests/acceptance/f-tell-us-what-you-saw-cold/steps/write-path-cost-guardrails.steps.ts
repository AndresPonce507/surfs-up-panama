// Slice-02 drives the same production-owned local-CI entry point a deployer
// uses. The negative case runs against a temporary, copied infrastructure
// tree so the checkout is never changed by an acceptance test.

import { After, Given, Then, When, type DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';

type GuardrailWorld = object;
type GateResult = Readonly<{ exitCode: number; output: string }>;

class CapturingOutput {
  readonly lines: string[] = [];
  write(line: string): void { this.lines.push(line); }
  error(line: string): void { this.lines.push(line); }
  text(): string { return this.lines.join('\n'); }
}

const results = new WeakMap<GuardrailWorld, GateResult>();
const coupledResults = new WeakMap<GuardrailWorld, ReadonlyMap<string, GateResult>>();
const cleanupRoots = new WeakMap<GuardrailWorld, string[]>();
const FIXTURE_SOURCE = resolve(
  process.cwd(),
  'tests/acceptance/f-tell-us-what-you-saw-cold/fixtures/controlled-write-path-guardrails',
);
const DECLARATION_PATH = 'infra/lib/guardrail-declarations.ts';

After({ tags: '@feature-f-tell-us-what-you-saw-cold' }, function (this: GuardrailWorld) {
  for (const root of cleanupRoots.get(this) ?? []) rmSync(root, { recursive: true, force: true });
});

async function runInfrastructureGate(repoRoot: string): Promise<GateResult> {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot, output });
  return { exitCode, output: output.text() };
}

function rememberCleanup(world: GuardrailWorld, path: string): void {
  const roots = cleanupRoots.get(world) ?? [];
  roots.push(path);
  cleanupRoots.set(world, roots);
}

function copyControlledFixture(world: GuardrailWorld): string {
  assert.ok(existsSync(FIXTURE_SOURCE), `WHAT: controlled write-path fixture is missing. HOW: restore ${FIXTURE_SOURCE}.`);
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-report-guardrail-fixture-'));
  rememberCleanup(world, cleanupRoot);
  const copiedRoot = join(cleanupRoot, 'checkout');
  cpSync(FIXTURE_SOURCE, copiedRoot, { recursive: true, dereference: false });
  return copiedRoot;
}

function replaceExactly(root: string, expected: string, replacement: string): void {
  const path = resolve(root, DECLARATION_PATH);
  const source = readFileSync(path, 'utf8');
  const count = source.split(expected).length - 1;
  assert.equal(count, 1, `WHAT: the controlled write-path mutation is ambiguous for ${JSON.stringify(expected)}. HOW: retain one declaration witness.`);
  writeFileSync(path, source.replace(expected, replacement), 'utf8');
}

function observed(world: GuardrailWorld): GateResult {
  const result = results.get(world);
  assert.ok(result, 'WHAT: no local-CI result was captured. HOW: run the documented infrastructure job first.');
  return result;
}

function includes(output: string, expected: string, why: string): void {
  assert.ok(
    output.toLowerCase().includes(expected.toLowerCase()),
    `WHAT: local-CI output omits ${JSON.stringify(expected)}. WHY: ${why}.\n${output}`,
  );
}

Given('the site owner is protecting the write-path budget before deployment', function () {});

When('the site owner starts the documented infrastructure job against this checkout', { timeout: 90_000 }, async function (this: GuardrailWorld) {
  results.set(this, await runInfrastructureGate(process.cwd()));
});

When('the site owner starts the infrastructure job with its declaration file unavailable', { timeout: 30_000 }, async function (this: GuardrailWorld) {
  const sourceInfra = resolve(process.cwd(), 'infra');
  assert.ok(existsSync(sourceInfra), 'WHAT: the production infra directory is missing. HOW: restore infra/ before exercising the gate.');
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-report-guardrail-'));
  rememberCleanup(this, cleanupRoot);
  const copiedRoot = join(cleanupRoot, 'checkout');
  cpSync(sourceInfra, join(copiedRoot, 'infra'), { recursive: true, dereference: false });
  rmSync(resolve(copiedRoot, 'infra/lib/guardrail-declarations.ts'), { force: true });
  results.set(this, await runInfrastructureGate(copiedRoot));
});

Then('the report write infrastructure job finishes successfully', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.equal(result.exitCode, 0, `WHAT: the infrastructure job exited ${result.exitCode}.\n${result.output}`);
});

Then('the report write infrastructure job does not succeed', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.notEqual(result.exitCode, 0, `WHAT: an unavailable declaration was accepted.\n${result.output}`);
});

Then('the result names the four write addresses, their one allowed site origin and their public posture', function (this: GuardrailWorld) {
  const output = observed(this).output;
  for (const expected of ['report', 'mint', 'push', 'photo-presign', 'exact site origin', 'AuthType: NONE']) {
    includes(output, expected, 'a deployer must be able to see that every write address is bound to the site, rather than receive a mute green result');
  }
});

Then('the result names the report limit of 2 and the mint, push and photo limits of 1', function (this: GuardrailWorld) {
  const output = observed(this).output;
  for (const expected of ['report 2', 'mint 1', 'push 1', 'photo-presign 1']) {
    includes(output, expected, 'reserved concurrency is the first hard ceiling on an anonymous write flood');
  }
});

Then('the result names the table\'s fixed 25 reads and 25 writes', function (this: GuardrailWorld) {
  const output = observed(this).output;
  for (const expected of ['PROVISIONED', '25 WCU', '25 RCU']) {
    includes(output, expected, 'the table must fail closed at the fixed free-tier capacity');
  }
});

Then('the result names all four write breakers and the device-only daily limits', function (this: GuardrailWorld) {
  const output = observed(this).output;
  for (const expected of ['four write breaker alarms', '20 reports', '10 presigns', '20 subscription writes', 'device', 'no per-IP']) {
    includes(output, expected, 'the output must distinguish the intended per-device limits from an unaffordable per-IP policy');
  }
});

Then('the result says it checked local declarations without AWS credentials and does not claim a console audit', function (this: GuardrailWorld) {
  const output = observed(this).output;
  includes(output, 'credentials: absent', 'a local gate cannot honestly claim to have inspected the AWS console');
  assert.ok(!output.toLowerCase().includes('console audit passed'), `WHAT: the local gate claimed a console audit.\n${output}`);
});

Then('the result cites the corrected cost sizing, not the falsified write-path arithmetic', function (this: GuardrailWorld) {
  const output = observed(this).output;
  includes(output, 'system-architecture.md section 6.1', 'the corrected sizing source is the only accepted source for this slice');
  assert.ok(!output.includes('07-write-path.md section 12'), `WHAT: the gate cited the falsified sizing section.\n${output}`);
});

Then('the result says it could not inspect the declaration file and how to restore it', function (this: GuardrailWorld) {
  const output = observed(this).output;
  includes(output, 'cannot inspect', 'an unreadable guard must not pass silently');
  includes(output, 'guardrail-declarations.ts', 'the operator needs the missing declaration location');
  includes(output, 'restore', 'the rejection must tell the operator how to recover');
});

When('the site owner checks each controlled write safeguard regression', { timeout: 60_000 }, async function (this: GuardrailWorld, table: DataTable) {
  const found = new Map<string, GateResult>();
  for (const row of table.hashes()) {
    const safeguard = row['safeguard'];
    const declared = row['declared value'];
    const changed = row['changed value'];
    assert.ok(safeguard && declared && changed, 'WHAT: a controlled write safeguard row is incomplete.');
    const root = copyControlledFixture(this);
    const expected = `'${safeguard.replaceAll(' ', '-')}': '${declared}'`;
    const replacement = changed === 'missing' ? '' : `'${safeguard.replaceAll(' ', '-')}': '${changed}'`;
    replaceExactly(root, expected, replacement);
    found.set(safeguard, await runInfrastructureGate(root));
  }
  coupledResults.set(this, found);
});

Then('each write safeguard regression is rejected naming what changed, the required value, why it matters and how to restore it', function (this: GuardrailWorld) {
  const found = coupledResults.get(this);
  assert.ok(found, 'WHAT: no controlled write safeguard results were captured.');
  for (const [safeguard, result] of found) {
    assert.notEqual(result.exitCode, 0, `WHAT: ${safeguard} regression was accepted.\n${result.output}`);
    includes(result.output, safeguard, 'the guard must name the protection that drifted');
    includes(result.output, 'required', 'the operator must see the required value');
    includes(result.output, 'restore', 'the operator must receive a restoration action');
  }
});
