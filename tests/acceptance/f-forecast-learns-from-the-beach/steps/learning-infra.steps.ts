// Step methods for the learning jobs' infrastructure declarations
// (slice-06). Mirrors the f-bill-stays-zero-and-stays-up pattern exactly:
// every scenario drives the production-owned local-CI composition entry
// (`runLocalCi`), real-repo scenarios read the working tree read-only, and
// contained scenarios mutate only a copied fixture universe. Nothing here
// touches AWS: the deploy itself is walled (feature-delta Pre-requisite 4)
// and every fence below is proven credential-free.

import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import { After, Given, Then, When } from '@cucumber/cucumber';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';

type InfraWorld = object;
type ObservedResult = Readonly<{ exitCode: number; output: string }>;
type FixtureCopy = { readonly root: string; readonly cleanupRoot: string };

const FIXTURE_SOURCE = fileURLToPath(new URL('../fixtures/controlled-learning-infra', import.meta.url));
const DECLARATION_SOURCE = 'infra/lib/guardrail-declarations.ts';
const FIXTURE_SOURCE_WITNESSES = [
  'tests/acceptance/f-forecast-learns-from-the-beach/fixtures/controlled-learning-infra/README.md',
  'tests/acceptance/f-forecast-learns-from-the-beach/fixtures/controlled-learning-infra/infra/lib/site-stack.ts',
  'tests/acceptance/f-forecast-learns-from-the-beach/fixtures/controlled-learning-infra/infra/lib/guardrail-declarations.ts',
] as const;

class CapturingOutput {
  readonly lines: string[] = [];
  write(line: string): void { this.lines.push(line); }
  error(line: string): void { this.lines.push(line); }
  text(): string { return this.lines.join('\n'); }
}

const results = new WeakMap<InfraWorld, ObservedResult>();
const copies = new WeakMap<InfraWorld, FixtureCopy[]>();
const fixtureSnapshots = new WeakMap<InfraWorld, Map<string, string>>();

function snapshotFixtureSource(): Map<string, string> {
  return new Map(FIXTURE_SOURCE_WITNESSES.map((relativePath) => {
    const path = resolve(process.cwd(), relativePath);
    assert.ok(existsSync(path) && lstatSync(path).isFile(), `fixture-source witness is not a regular file: ${relativePath}`);
    return [relativePath, readFileSync(path, 'utf8')] as const;
  }));
}

function assertNoSourceSymlinks(path: string): void {
  const stat = lstatSync(path);
  assert.ok(!stat.isSymbolicLink(), `fixture contains a symlink at ${path}; replace it with a regular file`);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) assertNoSourceSymlinks(resolve(path, entry));
    return;
  }
  assert.ok(stat.isFile(), `fixture contains a non-regular entry at ${path}`);
}

function copyFixture(world: InfraWorld): FixtureCopy {
  assert.ok(existsSync(FIXTURE_SOURCE), `the controlled learning-infra fixture is absent; restore ${FIXTURE_SOURCE}`);
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-learning-infra-'));
  try {
    assertNoSourceSymlinks(FIXTURE_SOURCE);
    const root = join(cleanupRoot, 'declarations');
    cpSync(FIXTURE_SOURCE, root, { recursive: true, dereference: false });
    const copy: FixtureCopy = { root, cleanupRoot };
    const worldCopies = copies.get(world) ?? [];
    worldCopies.push(copy);
    copies.set(world, worldCopies);
    return copy;
  } catch (error) {
    rmSync(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
}

function mutate(copy: FixtureCopy, expected: string, replacement: string): void {
  const path = resolve(copy.root, DECLARATION_SOURCE);
  assert.ok(existsSync(path), `the controlled fixture lacks ${DECLARATION_SOURCE}`);
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(expected).length - 1;
  assert.equal(occurrences, 1, `fixture mutation is ambiguous: exactly one ${JSON.stringify(expected)} anchor must exist`);
  writeFileSync(path, source.replace(expected, replacement), 'utf8');
}

async function invokeContainedRoot(copy: FixtureCopy): Promise<ObservedResult> {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot: copy.root, output });
  return { exitCode, output: output.text() };
}

function observe(world: InfraWorld, result: ObservedResult): void { results.set(world, result); }
function observed(world: InfraWorld): ObservedResult {
  const result = results.get(world);
  assert.ok(result, 'no production local-CI result was captured; invoke the production entry before observing it');
  return result;
}

function assertIncludes(output: string, expected: string, why: string): void {
  assert.ok(
    output.toLowerCase().includes(expected.toLowerCase()),
    `the produced local-CI output omits ${JSON.stringify(expected)}. ${why}.\n${output}`,
  );
}

Given('the site owner protects the numbers the learning jobs may touch', function () {});

When('the site owner examines the repository\'s infrastructure declarations for the learning jobs', { timeout: 120_000 }, async function (this: InfraWorld) {
  const output = new CapturingOutput();
  const exitCode = await runLocalCi({ argv: ['--job=infra'], repoRoot: process.cwd(), output });
  observe(this, { exitCode, output: output.text() });
});

When('the site owner inspects a contained learning-infra fixture whose nightly write fence reaches the prediction archive', async function (this: InfraWorld) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const copy = copyFixture(this);
  mutate(
    copy,
    "'learning-nightly-write-scope': 'learned/corrections/v1/current/,learned/corrections/v1/history/'",
    "'learning-nightly-write-scope': 'learned/corrections/v1/current/,learned/corrections/v1/history/,predictions/'",
  );
  observe(this, await invokeContainedRoot(copy));
});

When('the site owner inspects a contained learning-infra fixture with no nightly schedule declared', async function (this: InfraWorld) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const copy = copyFixture(this);
  mutate(copy, "  'learning-nightly-schedule': 'daily-after-observation-export',\n", '');
  observe(this, await invokeContainedRoot(copy));
});

When('the site owner inspects a contained learning-infra fixture whose monthly job could rewrite corrections', async function (this: InfraWorld) {
  fixtureSnapshots.set(this, snapshotFixtureSource());
  const copy = copyFixture(this);
  mutate(
    copy,
    "'learning-monthly-write-scope': 'learned/metrics/v1/'",
    "'learning-monthly-write-scope': 'learned/metrics/v1/,learned/corrections/v1/current/'",
  );
  observe(this, await invokeContainedRoot(copy));
});

Then('the learning-infra examination finishes successfully', function (this: InfraWorld) {
  const result = observed(this);
  assert.equal(result.exitCode, 0, `the default infrastructure job exited ${result.exitCode}.\n${result.output}`);
});

Then('the produced result names the nightly fit\'s two write shelves and the denied complement', function (this: InfraWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'learned/corrections/v1/current/', 'the green result must name the first shelf the nightly fit may write');
  assertIncludes(output, 'learned/corrections/v1/history/', 'and the second, the dated audit copy');
  assertIncludes(output, 'predictions/', 'and the complement it is denied, starting with the irreplaceable archive');
});

Then('the produced result names the monthly evaluation\'s one metrics shelf', function (this: InfraWorld) {
  assertIncludes(observed(this).output, 'learned/metrics/v1/', 'the monthly evaluation writes its metrics shelf and nothing else');
});

Then('the produced result names both schedules and the credential-free proof', function (this: InfraWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'nightly', 'the nightly clock must be declared, not assumed');
  assertIncludes(output, 'monthly', 'the monthly clock must be declared, not assumed');
  assertIncludes(output, 'credential-free synth: passed', 'every fence here is proven without an AWS credential, because the deploy itself is walled');
});

Then('the learning-infra check does not succeed', function (this: InfraWorld) {
  assert.notEqual(observed(this).exitCode, 0, `a learning-infra regression was accepted.\n${observed(this).output}`);
});

Then('the rejection names the forbidden shelf and why the archive is untouchable', function (this: InfraWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'learning-nightly-write-scope', 'the rejection must name the exact learning declaration that widened, not a generic failure');
  assertIncludes(output, 'predictions/', 'and the shelf the widened fence reached, the irreplaceable archive');
});

Then('the rejection says the nightly schedule is missing entirely', function (this: InfraWorld) {
  assertIncludes(observed(this).output, 'nightly schedule', 'absence of the clock must be distinguishable from a wrong clock');
});

Then('the rejection names the monthly job\'s one legal shelf', function (this: InfraWorld) {
  assertIncludes(observed(this).output, 'learned/metrics/v1/', 'the rejection must restate the one shelf the monthly evaluation may write');
});

Then('the source fixture and the repository infrastructure are left unchanged', function (this: InfraWorld) {
  const before = fixtureSnapshots.get(this);
  assert.ok(before, 'no fixture-source snapshot exists; capture it before mutating a copy');
  const after = snapshotFixtureSource();
  for (const [path, body] of before) {
    assert.equal(after.get(path), body, `the committed source fixture changed: ${path}; scenarios may mutate only a copied declaration universe`);
  }
});

After(function (this: InfraWorld) {
  for (const copy of copies.get(this) ?? []) {
    rmSync(copy.cleanupRoot, { recursive: true, force: true });
  }
});
