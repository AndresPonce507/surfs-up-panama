// F-BILL slices 01-03 drive only the production-owned local-CI composition
// entry (`runLocalCi`). The contained fixture is an explicit test input,
// never reported as production infrastructure. Real-repo scenarios read the
// working tree read-only through the same production entry; they never
// mutate it.

import { After, Given, Then, When, type DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';

type BillWorld = object;
type ObservedResult = Readonly<{ exitCode: number; output: string }>;
type ChangedFile = Readonly<{ path: string; original: string }>;
type FixtureCopy = { readonly root: string; readonly cleanupRoot: string; readonly changed: ChangedFile[] };

const FIXTURE_SOURCE = fileURLToPath(new URL('../fixtures/controlled-bill-declarations', import.meta.url));
const DECLARATION_SOURCE = 'infra/lib/guardrail-declarations.ts';
const FIXTURE_SOURCE_WITNESSES = [
  'tests/acceptance/f-bill-stays-zero-and-stays-up/fixtures/controlled-bill-declarations/README.md',
  'tests/acceptance/f-bill-stays-zero-and-stays-up/fixtures/controlled-bill-declarations/infra/lib/site-stack.ts',
  'tests/acceptance/f-bill-stays-zero-and-stays-up/fixtures/controlled-bill-declarations/infra/lib/guardrail-declarations.ts',
] as const;

class CapturingOutput {
  readonly lines: string[] = [];
  write(line: string): void { this.lines.push(line); }
  error(line: string): void { this.lines.push(line); }
  text(): string { return this.lines.join('\n'); }
}

const results = new WeakMap<BillWorld, ObservedResult>();
const coupledResults = new WeakMap<BillWorld, ReadonlyMap<string, ObservedResult>>();
const copies = new WeakMap<BillWorld, FixtureCopy[]>();
const fixtureSnapshots = new WeakMap<BillWorld, Map<string, string>>();

const DENY_SCOPE_BLOCK = `export const budgetDenyScopeTargets = [
  'write-report-function-url',
  'write-mint-function-url',
  'write-push-function-url',
  'write-photo-presign-function-url',
] as const;`;

function denyScopeBlockWith(targets: readonly string[]): string {
  const items = targets.map((target) => `  '${target}',`).join('\n');
  return `export const budgetDenyScopeTargets = [\n${items}\n] as const;`;
}

const DEAD_MANS_SWITCH_WITNESSES: Readonly<Record<string, readonly [key: string, requiredDisplay: string, requiredValue: string, label: string]>> = {
  'watched metric': ['dead-mans-switch-metric', 'IngestSuccess', 'IngestSuccess', 'watched metric'],
  'missing-data handling': ['dead-mans-switch-treat-missing-data', 'BREACHING', 'BREACHING', 'missing-data handling'],
  'evaluation periods': ['dead-mans-switch-evaluation-periods', '2', '2', 'evaluation periods'],
  'ALARM action': ['dead-mans-switch-alarm-action', 'present', 'sns-alarm-topic', 'ALARM action'],
  'OK action': ['dead-mans-switch-ok-action', 'present', 'sns-ok-topic', 'OK action'],
};

function snapshotFixtureSource(): Map<string, string> {
  return new Map(FIXTURE_SOURCE_WITNESSES.map((relativePath) => {
    const path = resolve(process.cwd(), relativePath);
    assert.ok(existsSync(path) && lstatSync(path).isFile(), `fixture-source witness is not a regular file: ${relativePath}`);
    return [relativePath, readFileSync(path, 'utf8')] as const;
  }));
}

function assertFixtureSourceUnchanged(before: Map<string, string>): void {
  const after = snapshotFixtureSource();
  for (const [path, body] of before) {
    assert.equal(after.get(path), body, `WHAT: the committed source fixture changed: ${path}. WHY: scenarios may mutate only a copied declaration universe. HOW: mutate declarationInput.root, never the source fixture.`);
  }
}

function assertNoSourceSymlinks(path: string): void {
  const stat = lstatSync(path);
  assert.ok(!stat.isSymbolicLink(), `WHAT: fixture contains a symlink at ${path}. HOW: replace it with a regular file before running the guardrail check.`);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) assertNoSourceSymlinks(resolve(path, entry));
    return;
  }
  assert.ok(stat.isFile(), `WHAT: fixture contains a non-regular entry at ${path}.`);
}

function copyFixture(world: BillWorld): FixtureCopy {
  assert.ok(existsSync(FIXTURE_SOURCE), `WHAT: controlled bill-declaration fixture is absent. HOW: restore ${FIXTURE_SOURCE}.`);
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-bill-fixture-'));
  try {
    assertNoSourceSymlinks(FIXTURE_SOURCE);
    const root = join(cleanupRoot, 'declarations');
    cpSync(FIXTURE_SOURCE, root, { recursive: true, dereference: false });
    assertNoSourceSymlinks(root);
    const copy: FixtureCopy = { root, cleanupRoot, changed: [] };
    const worldCopies = copies.get(world) ?? [];
    worldCopies.push(copy);
    copies.set(world, worldCopies);
    return copy;
  } catch (error) {
    rmSync(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
}

function fixturePath(copy: FixtureCopy, relativePath: string): string {
  const path = resolve(copy.root, relativePath);
  const inside = relative(copy.root, path);
  assert.ok(inside !== '' && !inside.startsWith('../') && inside !== '..' && !isAbsolute(inside), `WHAT: fixture path escaped its contained copy: ${relativePath}.`);
  return path;
}

function replaceExactly(source: string, expected: string, replacement: string, context: string): string {
  const occurrences = source.split(expected).length - 1;
  assert.equal(occurrences, 1, `WHAT: fixture mutation is ambiguous in ${context}. WHY: one witness must change one declaration. HOW: retain exactly one ${JSON.stringify(expected)} anchor.`);
  return source.replace(expected, replacement);
}

function mutate(copy: FixtureCopy, relativePath: string, expected: string, replacement: string): void {
  const path = fixturePath(copy, relativePath);
  assert.ok(existsSync(path), `WHAT: controlled fixture lacks ${relativePath}.`);
  const original = readFileSync(path, 'utf8');
  const changed = replaceExactly(original, expected, replacement, relativePath);
  writeFileSync(path, changed, 'utf8');
  copy.changed.push({ path, original });
}

// Runs the full production `infra` job composition against a contained
// fixture copy as its repository root. The new F-BILL evaluation phase
// (`evaluateBillGuardrails`) runs before the vitest/synth phases, so a
// bare fixture copy (no node_modules, no CDK app) is sufficient: an F-BILL
// regression is rejected before either phase is ever reached.
async function invokeContainedRoot(copy: FixtureCopy): Promise<ObservedResult> {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot: copy.root, output });
  return { exitCode, output: output.text() };
}

async function invokeRealRepoInfraJob(): Promise<ObservedResult> {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot: process.cwd(), output });
  return { exitCode, output: output.text() };
}

function observe(world: BillWorld, result: ObservedResult): void { results.set(world, result); }
function observed(world: BillWorld): ObservedResult {
  const result = results.get(world);
  assert.ok(result, 'WHAT: no production local-CI result was captured. HOW: invoke the production entry before observing it.');
  return result;
}

function assertIncludes(output: string, expected: string, why: string): void {
  assert.ok(output.toLowerCase().includes(expected.toLowerCase()), `WHAT: the produced local-CI output omits ${JSON.stringify(expected)}. WHY: ${why}.\n${output}`);
}

function requiredTableValue(row: Readonly<Record<string, string | undefined>>, column: string): string {
  const value = row[column];
  assert.ok(typeof value === 'string' && value.length > 0, `WHAT: coupled acceptance data omits ${JSON.stringify(column)}.`);
  return value;
}

Given('the site owner protects the prediction archive and the site\'s spending limits', function () {});

When('the site owner starts the documented infrastructure job against the real repository', { timeout: 60_000 }, async function (this: BillWorld) {
  observe(this, await invokeRealRepoInfraJob());
});

When('the site owner inspects a contained bill-declaration fixture with archive bucket versioning suspended', async function (this: BillWorld) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const copy = copyFixture(this);
  mutate(copy, DECLARATION_SOURCE, "'archive-bucket-versioning': 'Enabled'", "'archive-bucket-versioning': 'Suspended'");
  observe(this, await invokeContainedRoot(copy));
});

Then('the infrastructure job finishes successfully', function (this: BillWorld) {
  const result = observed(this);
  assert.equal(result.exitCode, 0, `WHAT: the default infrastructure job exited ${result.exitCode}. HOW: fix the guardrail declaration or the evaluator.\n${result.output}`);
});

Then('the produced result names the archive bucket versioning as enabled and why it matters', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'archive bucket versioning', 'the green result must name what it protected, not a bare success');
  assertIncludes(output, 'Enabled', 'the green result must name the required versioning status');
  assertIncludes(output, 'no other recovery path', 'the green result must say why versioning matters');
});

Then('the produced result reports its production guardrail test and credential-free synth', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'infra/test/guardrails.test.ts: passed', 'the default infra job must execute and report its production guardrail-test phase');
  assertIncludes(output, 'credential-free synth: passed', 'the default infra job must execute and report its credential-free synth phase');
});

Then('the bill-declaration check does not succeed', function (this: BillWorld) {
  assert.notEqual(observed(this).exitCode, 0, `WHAT: a bill-declaration regression was accepted. HOW: reject it.\n${observed(this).output}`);
});

Then('declaration-only failures leave the source fixture and the repository infrastructure unchanged', function (this: BillWorld) {
  const before = fixtureSnapshots.get(this);
  assert.ok(before, 'WHAT: no fixture-source snapshot exists. HOW: capture it before mutating a copy.');
  assertFixtureSourceUnchanged(before);
});

Then('the produced result names the archive bucket versioning, the observed and required values, and why it matters', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'archive bucket versioning', 'the rejection must name the broken safeguard');
  assertIncludes(output, 'Suspended', 'the rejection must name the observed value');
  assertIncludes(output, 'Enabled', 'the rejection must name the required value');
  assertIncludes(output, 'no other recovery path', 'the rejection must say why it matters');
});

When('the site owner checks each contained dead-man\'s-switch property regression', async function (this: BillWorld, table: DataTable) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const found = new Map<string, ObservedResult>();
  for (const row of table.hashes()) {
    const witness = requiredTableValue(row, 'witness');
    const requiredDisplay = requiredTableValue(row, 'required value');
    const regressedDisplay = requiredTableValue(row, 'regressed value');
    const declared = DEAD_MANS_SWITCH_WITNESSES[witness];
    assert.ok(declared, `unknown dead-man's-switch witness: ${witness}`);
    assert.equal(requiredDisplay, declared[1], `unexpected required display for ${witness}`);
    const copy = copyFixture(this);
    if (regressedDisplay === 'missing') {
      mutate(copy, DECLARATION_SOURCE, `  '${declared[0]}': '${declared[2]}',\n`, '');
    } else {
      mutate(copy, DECLARATION_SOURCE, `'${declared[0]}': '${declared[2]}'`, `'${declared[0]}': '${regressedDisplay}'`);
    }
    found.set(witness, await invokeContainedRoot(copy));
  }
  coupledResults.set(this, found);
});

When('the site owner inspects a contained bill-declaration fixture with no dead-man\'s switch declared', async function (this: BillWorld) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const copy = copyFixture(this);
  mutate(copy, DECLARATION_SOURCE, "export const deadMansSwitchDeclaration = {", "export const removedDeadMansSwitchDeclaration = {");
  observe(this, await invokeContainedRoot(copy));
});

Then('the produced result names the dead-man\'s switch metric, its BREACHING handling, its evaluation periods, its actions, and the honest detection floor', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'IngestSuccess', 'the switch must watch the emitted metric, never the Lambda directly');
  assertIncludes(output, 'BREACHING', 'the green result must name the missing-data handling');
  assertIncludes(output, '2 consecutive 1 h period', 'the green result must name the evaluation periods');
  assertIncludes(output, 'ALARM and OK actions present', 'the green result must name both actions');
  assertIncludes(output, '2 to 3 hour', 'the green result must state the honest detection floor');
  assert.ok(!output.toLowerCase().includes('within the hour'), 'WHAT: the result promised "within the hour". WHY: the settled design refuses that number.');
});

Then('each dead-man\'s-switch regression is rejected naming its own property, observed value, and required value', function (this: BillWorld) {
  const found = coupledResults.get(this);
  assert.ok(found, "no dead-man's-switch outcomes were captured");
  for (const [witness, result] of found) {
    const declared = DEAD_MANS_SWITCH_WITNESSES[witness];
    assert.ok(declared, `unknown dead-man's-switch witness: ${witness}`);
    assert.notEqual(result.exitCode, 0, `WHAT: ${witness} regression was accepted.\n${result.output}`);
    assertIncludes(result.output, declared[3], `the rejection must name ${witness}, not a generic "alarm invalid"`);
  }
});

Then('the produced result says the dead-man\'s switch declaration is missing entirely', function (this: BillWorld) {
  assertIncludes(observed(this).output, 'missing entirely', 'absence of the whole declaration must be distinguishable from a single broken property');
});

Then('the produced result names the five money lines and that the $20 line is created by this project, never imported', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, '$1', 'must name the $1 alert');
  assertIncludes(output, '$5', 'must name the $5 alert');
  assertIncludes(output, '$15', 'must name the $15 alert');
  assertIncludes(output, '$18', 'must name the $18 action-enabled budget');
  assertIncludes(output, '$20', 'must name the $20 last line');
  assertIncludes(output, 'created by this project', 'the $20 line must be created, never claimed as imported');
  assertIncludes(output, 'never imported', 'must explicitly deny the false import claim');
});

Then('the produced result names the deny scope as exactly the four write Function URLs, the ingest role deliberately excluded, and that those URLs do not exist yet', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'write-report-function-url', 'must name the report URL');
  assertIncludes(output, 'write-mint-function-url', 'must name the mint URL');
  assertIncludes(output, 'write-push-function-url', 'must name the push URL');
  assertIncludes(output, 'write-photo-presign-function-url', 'must name the photo-presign URL');
  assertIncludes(output, 'ingest role', 'must name that the ingest role is deliberately excluded');
  assertIncludes(output, 'do not exist yet', 'must say this is a declaration guard, not live denial');
});

Then('the produced result names the project cost-allocation tag', function (this: BillWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'Project=surfs-up-panama', 'must name the exact tag key=value pair, not just either word in isolation');
});

When('the site owner checks each contained money-line or deny-scope regression', async function (this: BillWorld, table: DataTable) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const found = new Map<string, ObservedResult>();
  for (const row of table.hashes()) {
    const witness = requiredTableValue(row, 'witness');
    const observedValue = requiredTableValue(row, 'observed value');
    const copy = copyFixture(this);
    if (witness === '$18 threshold drift') {
      mutate(copy, DECLARATION_SOURCE, "'budget-action-18': '18'", `'budget-action-18': '${observedValue}'`);
    } else if (witness === '$20 last line claims import') {
      mutate(copy, DECLARATION_SOURCE, "'budget-last-line-source': 'created-by-project'", `'budget-last-line-source': '${observedValue}'`);
    } else {
      const targets = observedValue.split(',').map((target) => target.trim());
      mutate(copy, DECLARATION_SOURCE, DENY_SCOPE_BLOCK, denyScopeBlockWith(targets));
    }
    found.set(witness, await invokeContainedRoot(copy));
  }
  coupledResults.set(this, found);
});

Then('each money-line or deny-scope regression is rejected naming its own witness and observed value', function (this: BillWorld) {
  const found = coupledResults.get(this);
  assert.ok(found, 'no money-line/deny-scope outcomes were captured');
  for (const [witness, result] of found) {
    assert.notEqual(result.exitCode, 0, `WHAT: ${witness} regression was accepted.\n${result.output}`);
  }
  const thresholdResult = found.get('$18 threshold drift');
  assert.ok(thresholdResult, 'no $18 threshold-drift outcome captured');
  assertIncludes(thresholdResult.output, '$18 action-enabled budget', 'must name the broken money line');
  assertIncludes(thresholdResult.output, '25', 'must name the observed drifted value');
  const widenedResult = found.get('deny scope widened');
  assert.ok(widenedResult, 'no widened-deny-scope outcome captured');
  assertIncludes(widenedResult.output, 'write-extra-function-url', 'must name the extra resource reached');
  const importClaimResult = found.get('$20 last line claims import');
  assert.ok(importClaimResult, 'no $20-import-claim outcome captured');
  assertIncludes(importClaimResult.output, 'imported-from-account', 'must name the observed false-import claim');
  assertIncludes(importClaimResult.output, 'created, never imported', 'must say the $20 line must be created by this project, never imported');
});

Then('the ingest-role regression names the prediction archive as the reason', function (this: BillWorld) {
  const found = coupledResults.get(this);
  const result = found?.get('deny scope names the ingest role');
  assert.ok(result, 'no ingest-role outcome captured');
  assertIncludes(result.output, 'ingest-lambda-execution-role', 'must name the offending target');
  assertIncludes(result.output, 'predictions/', 'must name the archive as the reason a billing flood must never stop it');
});

function restoreAndRemove(copy: FixtureCopy): void {
  for (const changed of [...copy.changed].reverse()) {
    writeFileSync(changed.path, changed.original, 'utf8');
  }
  rmSync(copy.cleanupRoot, { recursive: true, force: true });
}

After(function (this: BillWorld) {
  for (const copy of copies.get(this) ?? []) restoreAndRemove(copy);
});
