// Slice-02 drives only the production-owned local-CI composition entry. The
// contained fixture is an explicit test input, never reported as production
// infrastructure and never allowed to borrow a path from the working tree.

import { After, Before, Given, Then, When, type DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { runLocalCi } from '../../../../scripts/ci-local.mjs';
import { assertStateDelta, type UniverseSnapshot } from './support/state-delta';

type GuardrailWorld = object;
type ObservedResult = Readonly<{
  exitCode: number;
  output: string;
  inspectedRoot: string;
  invocationMode: InvocationMode;
  declarationOnlySideEffectsBefore?: UniverseSnapshot | undefined;
  declarationOnlySideEffectsAfter?: UniverseSnapshot | undefined;
  declarationExecutionTripwire?: string | undefined;
  declarationCommandTripwire?: string | undefined;
}>;
type ChangedFile = Readonly<{ path: string; original: string }>;
type RenamedFile = Readonly<{ path: string; parkedPath: string }>;
type LocalCiDeclarationRequest = NonNullable<Parameters<typeof runLocalCi>[0]> & Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  declarationInput?: Readonly<{ root: string; mode: 'declaration-only' }> | undefined;
}>;
type FixtureCopy = {
  readonly root: string;
  readonly cleanupRoot: string;
  readonly changed: ChangedFile[];
  readonly renamed: RenamedFile[];
};
type InvocationMode = 'declaration-only' | 'public-contained-root' | 'public-root';

class CapturingLocalCiOutput {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  error(line: string): void {
    this.lines.push(line);
  }

  text(): string {
    return this.lines.join('\n');
  }
}

const results = new WeakMap<GuardrailWorld, ObservedResult>();
const inventoryResults = new WeakMap<GuardrailWorld, ObservedResult>();
const coupledResults = new WeakMap<GuardrailWorld, ReadonlyMap<string, ObservedResult>>();
const copies = new WeakMap<GuardrailWorld, FixtureCopy[]>();
const worktreeSnapshots = new WeakMap<GuardrailWorld, UniverseSnapshot>();

const FIXTURE_SOURCE = fileURLToPath(
  new URL('../fixtures/controlled-infrastructure-declarations', import.meta.url),
);
const SITE_DECLARATION = 'infra/lib/site-stack.ts';
const DECLARATION_SOURCE = 'infra/lib/guardrail-declarations.ts';
const LIFECYCLE_ANCHOR = 'export const lifecycleRules = [';
const UNRELATED_LIFECYCLE_RULES = [
  'raw-archive-expiration',
  'photo-expiration',
  'incomplete-multipart-abort',
] as const;
const CONTROLLED_UNIVERSE = [
  'production-port: runLocalCi declaration evaluator',
  'contained-fixture:infra/lib/site-stack.ts',
  'contained-fixture:infra/lib/guardrail-declarations.ts',
  'contained-fixture:all copied files',
  'isolated-environment:explicit minimal allowlist with fresh HOME and config paths',
  'isolated-environment:IMDS disabled without credentials',
  'production-output:local-CI exit code',
  'production-output:local-CI lines',
  'source-fixture:unchanged',
  'repo-root:infra and .ci-local-logs unchanged after every declaration-only outcome',
  'declaration-source:parsed but never executed',
  'declaration-boundary:no child command attempts',
] as const;

const SAFEGUARD_WITNESSES = {
  'Lambda reserved concurrency': ['Lambda capacity', 'lambda-reserved-concurrency', '2', '3'],
  'missing Lambda reserved concurrency': ['Lambda capacity', 'lambda-reserved-concurrency', '2', 'missing'],
  'fetch timeout': ['Lambda timeouts', 'timeout-fetch', '60 seconds', '61 seconds'],
  'missing fetch timeout': ['Lambda timeouts', 'timeout-fetch', '60 seconds', 'missing'],
  'build timeout': ['Lambda timeouts', 'timeout-build', '120 seconds', '121 seconds'],
  'report timeout': ['Lambda timeouts', 'timeout-report', '5 seconds', '6 seconds'],
  'mint timeout': ['Lambda timeouts', 'timeout-mint', '5 seconds', '6 seconds'],
  'push timeout': ['Lambda timeouts', 'timeout-push', '5 seconds', '6 seconds'],
  'photo-presign timeout': ['Lambda timeouts', 'timeout-photo-presign', '5 seconds', '6 seconds'],
  'resize timeout': ['Lambda timeouts', 'timeout-resize', '60 seconds', '61 seconds'],
  'dispatcher timeout': ['Lambda timeouts', 'timeout-dispatcher', '10 seconds', '11 seconds'],
  'notify/export timeout': ['Lambda timeouts', 'timeout-notify-export', '120 seconds', '121 seconds'],
  'breaker timeout': ['Lambda timeouts', 'timeout-breaker', '10 seconds', '11 seconds'],
  'log retention': ['Log retention', 'log-retention', '14 days', '7 days'],
  'missing log retention': ['Log retention', 'log-retention', '14 days', 'missing'],
  'raw archive expiration': ['Non-prediction lifecycle', 'raw-expiration', '30 days', '31 days'],
  'missing raw archive expiration': ['Non-prediction lifecycle', 'raw-expiration', '30 days', 'missing'],
  'photo expiration': ['Non-prediction lifecycle', 'photo-expiration', '90 days', '91 days'],
  'incomplete multipart abort': ['Non-prediction lifecycle', 'multipart-abort', '7 days', '8 days'],
} as const;

const WORKTREE_WITNESSES = [
  'tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-declarations/README.md',
  'tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-declarations/infra/lib/guardrail-declarations.ts',
  'tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-declarations/infra/lib/site-stack.ts',
] as const;
const REAL_INFRA_LIFECYCLE_RULES = [
  'raw-archive-expiration',
  'photo-expiration',
  'incomplete-multipart-abort',
] as const;
const REAL_INFRA_LAMBDA_GUARDRAIL_VALUES = [
  'Lambda reserved concurrency: 2',
  'fetch timeout: 60 seconds',
  'build timeout: 120 seconds',
  'report timeout: 5 seconds',
  'mint timeout: 5 seconds',
  'push timeout: 5 seconds',
  'photo-presign timeout: 5 seconds',
  'resize timeout: 60 seconds',
  'dispatcher timeout: 10 seconds',
  'notify/export timeout: 120 seconds',
  'breaker timeout: 10 seconds',
] as const;
const AWS_CONFIGURATION_AND_CREDENTIAL_OVERRIDES = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_PROFILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_ROLE_ARN',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT',
] as const;
const IMDS_DISABLE_CONTROL = 'AWS_EC2_METADATA_DISABLED';
const DECLARATION_ENVIRONMENT_ALLOWLIST = [
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'TMPDIR',
  IMDS_DISABLE_CONTROL,
  'SURFS_UP_DECLARATION_EXECUTION_TRIPWIRE',
  'SURFS_UP_DECLARATION_COMMAND_TRIPWIRE',
] as const;
const DECLARATION_COMMAND_TRAPS = ['npm', 'npx', 'cdk', 'aws', 'curl', 'wget'] as const;
const UNIQUE_ROOT_PROVENANCE_VALUE = 'missing-from-contained-public-root';

function snapshotWorktree(): UniverseSnapshot {
  return new Map(WORKTREE_WITNESSES.map((relativePath) => {
    const path = resolve(process.cwd(), relativePath);
    assert.ok(existsSync(path) && lstatSync(path).isFile(), `working-tree witness is not a regular file: ${relativePath}`);
    return [relativePath, readFileSync(path, 'utf8')] as const;
  }));
}

function assertSourceFixtureUnchanged(before: UniverseSnapshot): void {
  assertStateDelta({
    before,
    after: snapshotWorktree(),
    universe: 'controlled source-fixture witnesses',
    expected: 'identical',
    context: 'WHAT: a declaration-only proof changed its source fixture. WHY: tests may mutate only a copied declaration universe. HOW: read and mutate declarationInput.root, then restore and remove that copy.',
  });
}

function assertWorktreeUnchanged(before: UniverseSnapshot): void {
  assertSourceFixtureUnchanged(before);
}

function snapshotTree(path: string, label: string, snapshot: UniverseSnapshot): void {
  if (!existsSync(path)) {
    snapshot.set(label, '<absent>');
    return;
  }
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    snapshot.set(label, '<directory>');
    for (const entry of readdirSync(path).sort()) {
      snapshotTree(resolve(path, entry), `${label}/${entry}`, snapshot);
    }
    return;
  }
  if (stat.isFile()) {
    snapshot.set(label, `<file:${readFileSync(path).toString('base64')}>`);
    return;
  }
  if (stat.isSymbolicLink()) {
    snapshot.set(label, `<symlink:${readlinkSync(path)}>`);
    return;
  }
  snapshot.set(label, `<unsupported:${stat.mode}>`);
}

function snapshotDeclarationOnlySideEffects(): UniverseSnapshot {
  const snapshot: UniverseSnapshot = new Map();
  snapshotTree(resolve(process.cwd(), 'infra'), 'repo-root:infra', snapshot);
  snapshotTree(resolve(process.cwd(), '.ci-local-logs'), 'repo-root:.ci-local-logs', snapshot);
  return snapshot;
}

function assertNoDeclarationOnlySideEffects(result: ObservedResult): void {
  assert.ok(
    result.declarationOnlySideEffectsBefore,
    'WHAT: no declaration-only side-effect snapshot was captured. WHY: every contained outcome must not write to the repository root. HOW: invoke runLocalCi with declarationInput before checking the result.',
  );
  assert.ok(
    result.declarationOnlySideEffectsAfter,
    'WHAT: no post-invocation declaration-only side-effect snapshot was captured. WHY: checking later can hide a write that a later mutation removed. HOW: snapshot the repository root immediately after each runLocalCi result.',
  );
  assertStateDelta({
    before: result.declarationOnlySideEffectsBefore,
    after: result.declarationOnlySideEffectsAfter,
    universe: 'repo-root infrastructure declarations and local-CI logs',
    expected: 'identical',
    context: 'WHAT: declaration-only inspection changed the repository root or .ci-local-logs. WHY: contained successes and failures must never borrow from or write to the real infrastructure tree. HOW: evaluate only declarationInput.root and keep declaration-only results in captured output.',
  });
}

function fixturePath(copy: FixtureCopy, relativePath: string): string {
  const path = resolve(copy.root, relativePath);
  const inside = relative(copy.root, path);
  assert.ok(
    inside !== '' && !inside.startsWith('../') && inside !== '..' && !isAbsolute(inside),
    `WHAT: fixture path escaped its contained copy: ${relativePath}. WHY: a regression proof must never borrow from or mutate the working tree. HOW: use a relative regular file inside the controlled fixture.`,
  );
  return path;
}

function regularFixtureFile(copy: FixtureCopy, relativePath: string): string {
  const path = fixturePath(copy, relativePath);
  assert.ok(existsSync(path), `WHAT: controlled fixture lacks ${relativePath}. HOW: retain the fixture declaration source named by this mutation witness.`);
  assert.ok(lstatSync(path).isFile(), `WHAT: controlled fixture path is not a regular file: ${relativePath}. HOW: copies may not use a symlink or working-tree path.`);
  return path;
}

function assertNoSourceSymlinks(path: string, sourceLabel: string): void {
  const stat = lstatSync(path);
  assert.ok(!stat.isSymbolicLink(), `WHAT: ${sourceLabel} contains a symlink at ${path}. WHY: a contained declaration proof must not resolve outside its copied universe. HOW: replace the symlink with a regular source file before running the guardrail check.`);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      assertNoSourceSymlinks(resolve(path, entry), sourceLabel);
    }
    return;
  }
  assert.ok(stat.isFile(), `WHAT: ${sourceLabel} contains a non-regular entry at ${path}. HOW: provide only regular declaration files.`);
}

function copyFixture(world: GuardrailWorld): FixtureCopy {
  assert.ok(existsSync(FIXTURE_SOURCE), `WHAT: controlled declaration fixture is absent. HOW: restore ${FIXTURE_SOURCE} before running Slice-02 acceptance tests.`);
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-guardrail-fixture-'));
  try {
    assertNoSourceSymlinks(FIXTURE_SOURCE, 'controlled declaration fixture');
    const root = join(cleanupRoot, 'declarations');
    cpSync(FIXTURE_SOURCE, root, { recursive: true, dereference: false });
    assertNoSourceSymlinks(root, 'copied controlled declaration fixture');
    const copy = { root, cleanupRoot, changed: [], renamed: [] };
    const worldCopies = copies.get(world) ?? [];
    worldCopies.push(copy);
    copies.set(world, worldCopies);
    return copy;
  } catch (error) {
    rmSync(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
}

function replaceExactly(source: string, expected: string, replacement: string, context: string): string {
  const occurrences = source.split(expected).length - 1;
  assert.equal(occurrences, 1, `WHAT: controlled fixture mutation is ambiguous in ${context}. WHY: one witness must change one declaration. HOW: retain exactly one ${JSON.stringify(expected)} declaration anchor.`);
  return source.replace(expected, replacement);
}

function mutate(copy: FixtureCopy, relativePath: string, expected: string, replacement: string): void {
  const path = regularFixtureFile(copy, relativePath);
  const original = readFileSync(path, 'utf8');
  const changed = replaceExactly(original, expected, replacement, relativePath);
  writeFileSync(path, changed, 'utf8');
  assert.equal(readFileSync(path, 'utf8'), changed, `fixture mutation did not persist: ${relativePath}`);
  copy.changed.push({ path, original });
}

function isolatedCredentialEnvironment(): Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  cleanupRoot: string;
  declarationExecutionTripwire: string;
  declarationCommandTripwire: string;
}> {
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-credential-free-home-'));
  const home = join(cleanupRoot, 'home');
  const config = join(cleanupRoot, 'config');
  const cache = join(cleanupRoot, 'cache');
  const data = join(cleanupRoot, 'data');
  const commandBin = join(cleanupRoot, 'command-traps');
  const declarationExecutionTripwire = join(cleanupRoot, 'declaration-executed');
  const declarationCommandTripwire = join(cleanupRoot, 'child-command-attempted');
  for (const directory of [home, config, cache, data, commandBin]) mkdirSync(directory);
  for (const command of DECLARATION_COMMAND_TRAPS) {
    const trap = join(commandBin, command);
    writeFileSync(
      trap,
      `#!/bin/sh\nprintf '%s\\n' '${command}' >> "$SURFS_UP_DECLARATION_COMMAND_TRIPWIRE"\nexit 97\n`,
      'utf8',
    );
    chmodSync(trap, 0o700);
  }
  const environment: Record<string, string> = {
    PATH: commandBin,
    LANG: 'C',
    LC_ALL: 'C',
    LC_CTYPE: 'C',
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    XDG_DATA_HOME: data,
    TMPDIR: cleanupRoot,
    [IMDS_DISABLE_CONTROL]: 'true',
    SURFS_UP_DECLARATION_EXECUTION_TRIPWIRE: declarationExecutionTripwire,
    SURFS_UP_DECLARATION_COMMAND_TRIPWIRE: declarationCommandTripwire,
  };
  assert.deepEqual(
    Object.keys(environment).sort(),
    [...DECLARATION_ENVIRONMENT_ALLOWLIST].sort(),
    'WHAT: declaration-only inspection received an environment outside the minimal allowlist. WHY: a credential-free result must not inherit host state. HOW: pass only the declared environment variables to runLocalCi.',
  );
  assert.ok(
    Object.keys(environment).every((name) => !name.startsWith('AWS_') || name === IMDS_DISABLE_CONTROL),
    'WHAT: the isolated declaration-inspection environment retains an AWS credential override. WHY: a printed credential-free claim must not inherit host configuration. HOW: remove every AWS_* variable other than the IMDS disable control before passing the environment to runLocalCi.',
  );
  assert.ok(
    AWS_CONFIGURATION_AND_CREDENTIAL_OVERRIDES.every((name) => !(name in environment)),
    'WHAT: an AWS credential or configuration override reached declaration-only inspection. WHY: host credentials could make an offline claim dishonest. HOW: pass an environment with no AWS credential/configuration overrides.',
  );
  assert.deepEqual(
    [home, config, cache, data].map((directory) => readdirSync(directory)),
    [[], [], [], []],
    'WHAT: the declaration-only profile directories are not empty. WHY: an offline check must not inherit a profile or credential cache. HOW: provide fresh empty HOME and XDG directories.',
  );
  assert.equal(environment[IMDS_DISABLE_CONTROL], 'true', 'WHAT: declaration-only inspection leaves instance metadata enabled. WHY: offline evaluation must not reach a host metadata credential source. HOW: pass AWS_EC2_METADATA_DISABLED=true.');
  return {
    environment: Object.freeze(environment),
    cleanupRoot,
    declarationExecutionTripwire,
    declarationCommandTripwire,
  };
}

function tripwireValue(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

async function invokeProductionLocalCi(
  copy: FixtureCopy | undefined,
  argv: readonly string[],
  invocationMode: InvocationMode = copy ? 'declaration-only' : 'public-root',
): Promise<ObservedResult> {
  assert.ok(
    invocationMode !== 'public-contained-root' || copy,
    'WHAT: a contained public-root invocation has no contained checkout. HOW: create a copied declaration fixture before invoking the production local-CI entry.',
  );
  const output = new CapturingLocalCiOutput();
  const isolated = isolatedCredentialEnvironment();
  const declarationOnly = invocationMode === 'declaration-only';
  const inspectedRoot = invocationMode === 'public-contained-root'
    ? copy!.root
    : process.cwd();
  const declarationOnlySideEffectsBefore = declarationOnly ? snapshotDeclarationOnlySideEffects() : undefined;
  try {
    const request: LocalCiDeclarationRequest = {
      argv: [...argv],
      repoRoot: inspectedRoot,
      output,
      environment: isolated.environment,
      declarationInput: declarationOnly ? { root: copy!.root, mode: 'declaration-only' } : undefined,
    };
    const result = await runLocalCi(request);
    return {
      exitCode: result,
      output: output.text(),
      inspectedRoot,
      invocationMode,
      declarationOnlySideEffectsBefore,
      declarationOnlySideEffectsAfter: declarationOnly ? snapshotDeclarationOnlySideEffects() : undefined,
      declarationExecutionTripwire: tripwireValue(isolated.declarationExecutionTripwire),
      declarationCommandTripwire: tripwireValue(isolated.declarationCommandTripwire),
    };
  } catch (error) {
    output.write(`runtime failure: ${error instanceof Error ? error.message : String(error)}`);
    return {
      exitCode: 2,
      output: output.text(),
      inspectedRoot,
      invocationMode,
      declarationOnlySideEffectsBefore,
      declarationOnlySideEffectsAfter: declarationOnly ? snapshotDeclarationOnlySideEffects() : undefined,
      declarationExecutionTripwire: tripwireValue(isolated.declarationExecutionTripwire),
      declarationCommandTripwire: tripwireValue(isolated.declarationCommandTripwire),
    };
  } finally {
    rmSync(isolated.cleanupRoot, { recursive: true, force: true });
    assert.ok(!existsSync(isolated.cleanupRoot), `credential-free environment cleanup failed: ${isolated.cleanupRoot}`);
  }
}

function observe(world: GuardrailWorld, result: ObservedResult): void {
  results.set(world, result);
}

function observed(world: GuardrailWorld): ObservedResult {
  const result = results.get(world);
  assert.ok(result, 'WHAT: no production local-CI result was captured. HOW: invoke the production-owned composition entry before observing it.');
  return result;
}

function observedInventory(world: GuardrailWorld): ObservedResult {
  const result = inventoryResults.get(world);
  assert.ok(result, 'WHAT: no public local-CI inventory was captured. HOW: inspect the production entry before starting the documented infrastructure job.');
  return result;
}

function assertIncludes(output: string, expected: string, why: string): void {
  assert.ok(
    output.toLowerCase().includes(expected.toLowerCase()),
    `WHAT: the produced local-CI output omits ${JSON.stringify(expected)}. WHY: ${why}. HOW: emit the inspected rule, reason, and remediation from the production guardrail entry.\n${output}`,
  );
}

function lifecycleRuleId(witness: string): string {
  return `acceptance-${witness.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')}`;
}

function lifecycleDeclaration(witness: string, prefix: string): string {
  const id = lifecycleRuleId(witness);
  const prefixField = prefix === 'no prefix' ? '' : `prefix: '${prefix}', `;
  const action = witness.includes('expiration')
    ? 'expirationAfterDays: 1'
    : witness.includes('89-day')
      ? 'transition: GlacierInstantRetrieval after 89 days'
      : witness.includes('91-day')
        ? 'transition: GlacierInstantRetrieval after 91 days'
        : witness.includes('Flexible')
          ? 'transition: GlacierFlexibleRetrieval after 90 days'
          : 'transition: GlacierInstantRetrieval after 90 days';
  return `{ id: '${id}', ${prefixField}${action} }`;
}

function addLifecycleWitness(copy: FixtureCopy, witness: string, prefix: string): void {
  mutate(copy, DECLARATION_SOURCE, LIFECYCLE_ANCHOR, `export const lifecycleRules = [${lifecycleDeclaration(witness, prefix)},`);
}

function addAllowedLifecycleWitness(copy: FixtureCopy): void {
  addLifecycleWitness(copy, 'exact 90-day Glacier Instant Retrieval', 'predictions/');
}

function safeguardWitness(group: string, witness: string, required: string, regressed: string): void {
  assert.ok(witness in SAFEGUARD_WITNESSES, `unknown Slice-02 safeguard witness: ${witness}`);
  const declared = SAFEGUARD_WITNESSES[witness as keyof typeof SAFEGUARD_WITNESSES];
  assert.equal(group, declared[0], `unexpected safeguard group for ${witness}`);
  assert.equal(required, declared[2], `unexpected reviewed value for ${witness}`);
  assert.equal(regressed, declared[3], `unexpected regression value for ${witness}`);
}

function applySafeguardWitness(copy: FixtureCopy, witness: string): void {
  const [, key, required, regressed] = SAFEGUARD_WITNESSES[witness as keyof typeof SAFEGUARD_WITNESSES];
  if (regressed === 'missing') {
    mutate(copy, DECLARATION_SOURCE, `  '${key}': '${required}',\n`, '');
    return;
  }
  mutate(copy, DECLARATION_SOURCE, `'${key}': '${required}'`, `'${key}': '${regressed}'`);
}

function makeGuardrailDeclarationUnreadable(copy: FixtureCopy): void {
  mutate(
    copy,
    DECLARATION_SOURCE,
    'export const guardrailDeclarations = {',
    'export const guardrailDeclarations = <<unreadable declaration>>',
  );
}

function requiredTableValue(row: Readonly<Record<string, string | undefined>>, column: string): string {
  const value = row[column];
  assert.ok(
    typeof value === 'string' && value.length > 0,
    `WHAT: coupled acceptance data omits ${JSON.stringify(column)}. HOW: give every checked mutation a named witness and concrete value.`,
  );
  return value;
}

Given('the site owner protects yesterday\'s prediction archive and spending limits', function () {});

Before(function (this: GuardrailWorld) {
  assert.ok(CONTROLLED_UNIVERSE.length > 0, 'controlled universe must be declared');
  worktreeSnapshots.set(this, snapshotWorktree());
});

When('the site owner reads the local CI job inventory and starts the documented infrastructure job', async function (this: GuardrailWorld) {
  inventoryResults.set(this, await invokeProductionLocalCi(undefined, ['--list']));
  observe(this, await invokeProductionLocalCi(undefined, ['--job=infra']));
});

When('the site owner inspects a clean contained declaration fixture', async function (this: GuardrailWorld) {
  const copy = copyFixture(this);
  observe(this, await invokeProductionLocalCi(copy, ['--job=infra']));
});

When('the site owner introduces the exact 90-day Glacier Instant Retrieval transition in a contained declaration fixture', async function (this: GuardrailWorld) {
  const copy = copyFixture(this);
  addAllowedLifecycleWitness(copy);
  observe(this, await invokeProductionLocalCi(copy, ['--job=infra']));
});

When('the site owner starts the documented infrastructure job from a contained checkout with a unique missing concurrency declaration', async function (this: GuardrailWorld) {
  const copy = copyFixture(this);
  mutate(
    copy,
    DECLARATION_SOURCE,
    "'lambda-reserved-concurrency': '2'",
    `'lambda-reserved-concurrency': '${UNIQUE_ROOT_PROVENANCE_VALUE}'`,
  );
  observe(this, await invokeProductionLocalCi(copy, ['--job=infra'], 'public-contained-root'));
});

When('the site owner checks each contained lifecycle variation', async function (this: GuardrailWorld, table: DataTable) {
  const found = new Map<string, ObservedResult>();
  for (const row of table.hashes()) {
    const witness = requiredTableValue(row, 'witness');
    const sourceValue = requiredTableValue(row, 'source value');
    const copy = copyFixture(this);
    addLifecycleWitness(copy, witness, sourceValue);
    found.set(witness, await invokeProductionLocalCi(copy, ['--job=infra']));
  }
  coupledResults.set(this, found);
});

When('the site owner checks each contained safeguard regression', async function (this: GuardrailWorld, table: DataTable) {
  const found = new Map<string, ObservedResult>();
  for (const row of table.hashes()) {
    const group = requiredTableValue(row, 'safeguard group');
    const witness = requiredTableValue(row, 'witness');
    const requiredValue = requiredTableValue(row, 'required value');
    const regressedValue = requiredTableValue(row, 'regressed value');
    safeguardWitness(group, witness, requiredValue, regressedValue);
    const copy = copyFixture(this);
    applySafeguardWitness(copy, witness);
    found.set(witness, await invokeProductionLocalCi(copy, ['--job=infra']));
  }
  coupledResults.set(this, found);
});

When('the site owner inspects a contained declaration fixture without its site declaration', async function (this: GuardrailWorld) {
  const copy = copyFixture(this);
  const path = regularFixtureFile(copy, SITE_DECLARATION);
  const parked = `${path}.unavailable`;
  renameSync(path, parked);
  copy.renamed.push({ path, parkedPath: parked });
  observe(this, await invokeProductionLocalCi(copy, ['--job=infra']));
});

When('the site owner inspects a contained declaration fixture with an unreadable guardrail declaration', async function (this: GuardrailWorld) {
  const copy = copyFixture(this);
  makeGuardrailDeclarationUnreadable(copy);
  observe(this, await invokeProductionLocalCi(copy, ['--job=infra']));
});

Then('the documented infrastructure job is part of the default local gate', function (this: GuardrailWorld) {
  const inventory = observedInventory(this);
  assert.equal(inventory.exitCode, 0, `WHAT: local CI inventory exited ${inventory.exitCode}. HOW: keep the production composition entry runnable.\n${inventory.output}`);
  assertIncludes(inventory.output, '● infra', 'a guard that needs a remembered flag can be bypassed at merge');
});

Then('the documented infrastructure job reports its production guardrail test and credential-free synth', function (this: GuardrailWorld) {
  const result = observed(this);
  assertIncludes(result.output, 'infra/test/guardrails.test.ts: passed', 'the default infra job must execute and report its production guardrail-test phase');
  assertIncludes(result.output, 'credential-free synth: passed', 'the default infra job must execute and report its credential-free synth phase');
  assertIncludes(result.output, 'credentials: absent', 'the default infrastructure job must prove both phases received no cloud credentials');
  assertIncludes(result.output, 'offline', 'the credential-free statement must honestly identify the offline declaration/synth boundary');
  assert.equal(result.exitCode, 0, `WHAT: documented infrastructure job exited ${result.exitCode}. WHY: its guardrail-test and credential-free synth are the public deploy protection. HOW: run and report both production phases before returning success.\n${result.output}`);
});

Then('the documented infrastructure job identifies the real infrastructure root, lifecycle rules, and Lambda guardrail values it inspected', function (this: GuardrailWorld) {
  const output = observed(this).output;
  assertIncludes(output, resolve(process.cwd(), 'infra'), 'the default job must identify the actual repository infrastructure root, not a contained fixture');
  assertIncludes(output, '3 lifecycle rules inspected', 'the lifecycle result must name its real inspected population');
  for (const ruleId of REAL_INFRA_LIFECYCLE_RULES) {
    assertIncludes(output, ruleId, 'the default job must name every real lifecycle rule it inspected');
  }
  assertIncludes(output, '11 Lambda guardrail values inspected', 'the result must state the complete Lambda capacity-and-timeout population');
  for (const value of REAL_INFRA_LAMBDA_GUARDRAIL_VALUES) {
    assertIncludes(output, value, 'the default job must name every concrete Lambda guardrail value it inspected');
  }
});

Then('the public infrastructure job rejects that contained checkout before it reports protected production phases', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.equal(result.invocationMode, 'public-contained-root', 'WHAT: the provenance probe did not drive the public contained-root surface. HOW: invoke runLocalCi with the copied checkout as repoRoot, not as a declaration-only input.');
  assert.notEqual(result.exitCode, 0, `WHAT: a changed contained checkout was accepted. HOW: reject it before reporting a protected production phase.\n${result.output}`);
  assert.ok(!result.output.includes('infra/test/guardrails.test.ts: passed'), `WHAT: a rejected contained checkout reported a protected guardrail-test phase. HOW: stop the public job before production phases.\n${result.output}`);
  assert.ok(!result.output.includes('credential-free synth: passed'), `WHAT: a rejected contained checkout reported a protected synth phase. HOW: stop the public job before production phases.\n${result.output}`);
});

Then('the public infrastructure job names the contained infrastructure root and its unique missing concurrency value', function (this: GuardrailWorld) {
  const result = observed(this);
  assertIncludes(result.output, resolve(result.inspectedRoot, 'infra'), 'a contained public-root failure must name the root it actually inspected');
  assertIncludes(result.output, UNIQUE_ROOT_PROVENANCE_VALUE, 'the rejection must name the unique missing concurrency value from the contained checkout');
});

Then('the protection check finishes successfully without cloud credentials', function (this: GuardrailWorld) {
  const result = observed(this);
  assertIncludes(result.output, 'credentials: absent', 'public local CI must not inspect an AWS account');
  assertIncludes(result.output, 'declaration-only', 'the result must distinguish declarations from a live cloud read');
  assertIncludes(result.output, 'offline declaration inspection', 'the credential-free result must say it did not reach a cloud account');
  assert.equal(result.exitCode, 0, `WHAT: declaration-only inspection exited ${result.exitCode}. WHY: a clean declaration universe must be inspectable without cloud credentials. HOW: implement the production declaration evaluator after the RED scaffold.\n${result.output}`);
});

Then('the produced result identifies the controlled fixture, its unrelated lifecycle rules, and zero prediction-reaching lifecycle rules', function (this: GuardrailWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'controlled-infrastructure-declarations', 'the result must identify the copied fixture path, never a deployed source');
  assertIncludes(output, '3 lifecycle rules inspected', 'zero prediction-reaching rules must follow an observable traversal of the known unrelated population');
  for (const ruleId of UNRELATED_LIFECYCLE_RULES) {
    assertIncludes(output, ruleId, 'the result must name each inspected unrelated lifecycle rule');
  }
  assertIncludes(output, '0 prediction-reaching lifecycle rules', 'zero must be a measured population from the production guard');
});

Then('the produced result names the prediction archive {string} and its no-overlap protection', function (this: GuardrailWorld, prefix: string) {
  const output = observed(this).output;
  assertIncludes(output, prefix, 'the exact irreplaceable archive must be named');
  assertIncludes(output, 'overlap', 'parent, child, exact, and bucket-wide prefixes must be protected');
});

Then('the produced result carries no bare success message', function (this: GuardrailWorld) {
  assert.ok(!/^(?:ok|pass|success)$/i.test(observed(this).output.trim()), 'WHAT: local CI returned a bare success. HOW: emit inspected declarations and values.');
});

Then('the contained declaration source remains unexecuted', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.equal(result.invocationMode, 'declaration-only', 'WHAT: the parse-not-execute tripwire did not use declaration-only mode. HOW: pass the copied root as declarationInput.');
  assert.equal(
    result.declarationExecutionTripwire,
    undefined,
    `WHAT: declaration source code executed during inspection: ${result.declarationExecutionTripwire ?? '<unknown>'}. WHY: a declaration-only check must parse data, never import source. HOW: read the declaration text without executing it.`,
  );
});

Then('the declaration-only result records zero child commands, package imports, deployment actions, and network operations', function (this: GuardrailWorld) {
  const result = observed(this);
  assert.equal(
    result.declarationCommandTripwire,
    undefined,
    `WHAT: declaration-only inspection attempted a child command: ${result.declarationCommandTripwire ?? '<unknown>'}. WHY: parsing declarations must not start package, deployment, or network work. HOW: keep the declaration evaluator in-process and data-only.`,
  );
  assertIncludes(result.output, 'child commands: 0', 'the declaration-only boundary must report that it started no child commands');
  assertIncludes(result.output, 'package imports: 0', 'the declaration-only boundary must report that it imported no package source');
  assertIncludes(result.output, 'deployment actions: 0', 'the declaration-only boundary must report that it performed no deployment action');
  assertIncludes(result.output, 'network operations: 0', 'the declaration-only boundary must report that it performed no network operation');
});

Then('the produced result names the sole allowed prediction transition at {string} after {int} days', function (this: GuardrailWorld, prefix: string, days: number) {
  const output = observed(this).output;
  assertIncludes(output, lifecycleRuleId('exact 90-day Glacier Instant Retrieval'), 'the allowlist must name its individual rule');
  assertIncludes(output, prefix, 'the allowed prefix is byte-exact');
  assertIncludes(output, 'Glacier Instant Retrieval', 'no other storage class is allowlisted');
  assertIncludes(output, String(days), 'the allowance is exactly 90 days');
  assertIncludes(output, 'sole allowed', 'the exception cannot grant broad lifecycle permission');
});

Then('each lifecycle variation is rejected with its own offending rule, reason, and removal guidance', function (this: GuardrailWorld) {
  const found = coupledResults.get(this);
  assert.ok(found, 'no lifecycle outcomes were captured');
  for (const [witness, result] of found) {
    assert.notEqual(result.exitCode, 0, `WHAT: ${witness} was accepted. HOW: reject every overlap or near miss.\n${result.output}`);
    assertIncludes(result.output, lifecycleRuleId(witness), 'the offending lifecycle rule must be named');
    assertIncludes(result.output, 'reason', 'the report must explain the overlap or invalid exception');
    assertIncludes(result.output, 'remove', 'the report must tell the owner how to restore safety');
  }
});

Then('declaration-only failures leave no repository-root logs or worktree changes', function (this: GuardrailWorld) {
  const coupled = coupledResults.get(this);
  if (coupled) {
    for (const result of coupled.values()) assertNoDeclarationOnlySideEffects(result);
    return;
  }
  assertNoDeclarationOnlySideEffects(observed(this));
});

Then('declaration-only failures leave the source fixture, repository infrastructure, and local CI logs unchanged', function (this: GuardrailWorld) {
  const before = worktreeSnapshots.get(this);
  assert.ok(before, 'WHAT: no source-fixture snapshot exists. HOW: capture the controlled source fixture before each scenario.');
  assertSourceFixtureUnchanged(before);
  const coupled = coupledResults.get(this);
  if (coupled) {
    for (const result of coupled.values()) assertNoDeclarationOnlySideEffects(result);
    return;
  }
  assertNoDeclarationOnlySideEffects(observed(this));
});

Then('each safeguard regression is rejected with its own safeguard, value, and restoration guidance', function (this: GuardrailWorld) {
  const found = coupledResults.get(this);
  assert.ok(found, 'no safeguard outcomes were captured');
  for (const [witness, result] of found) {
    const declared = SAFEGUARD_WITNESSES[witness as keyof typeof SAFEGUARD_WITNESSES];
    const required = declared[2];
    const regressed = declared[3];
    assert.notEqual(result.exitCode, 0, `WHAT: ${witness} regression was accepted. HOW: reject each concrete changed value.\n${result.output}`);
    assertIncludes(result.output, witness, 'the failed cost safeguard must be named');
    assertIncludes(result.output, regressed, 'the observed regressed value must be named');
    assertIncludes(result.output, required, 'the required restoration value must be named');
    assertIncludes(result.output, 'restore', 'the report must give correction guidance');
  }
});

Then('the produced result limits Anthropic and CloudFront statements to external audits', function (this: GuardrailWorld) {
  const output = observed(this).output;
  assertIncludes(output, 'Anthropic', 'the terminal result must identify the external Anthropic obligation');
  assertIncludes(output, 'CloudFront', 'the terminal result must identify the external CloudFront obligation');
  assertIncludes(output, 'external audit', 'CI can report committed external obligations but cannot inspect a live console');
  assertIncludes(output, 'not a live-console assertion', 'the result must not overclaim external compliance');
});

Then('the protection check does not succeed', function (this: GuardrailWorld) {
  assert.notEqual(observed(this).exitCode, 0, `WHAT: unavailable declaration was accepted. HOW: fail closed when an input cannot be inspected.\n${observed(this).output}`);
});

Then('the produced result names the unavailable site declaration, why it matters, and how to restore it', function (this: GuardrailWorld) {
  const output = observed(this).output;
  assertIncludes(output, SITE_DECLARATION, 'the unavailable declaration must be named');
  assertIncludes(output, 'cannot inspect', 'absence is not proof of safety');
  assertIncludes(output, 'restore', 'the report must state how to continue inspection');
});

Then('the produced result names the unreadable guardrail declaration, why it cannot be inspected, and how to restore it', function (this: GuardrailWorld) {
  const output = observed(this).output;
  assertIncludes(output, DECLARATION_SOURCE, 'the malformed declaration source must be named');
  assertIncludes(output, 'cannot inspect', 'malformed declarations must be distinguishable from a clean zero-rule result');
  assertIncludes(output, 'restore', 'the report must tell the owner how to restore a readable declaration');
});

function restoreAndRemove(copy: FixtureCopy): void {
  let restorationError: unknown;
  try {
    for (const changed of [...copy.changed].reverse()) {
      assert.ok(lstatSync(changed.path).isFile(), `mutated fixture path stopped being regular: ${changed.path}`);
      writeFileSync(changed.path, changed.original, 'utf8');
      assert.equal(readFileSync(changed.path, 'utf8'), changed.original, `fixture declaration was not restored: ${changed.path}`);
    }
    for (const renamed of [...copy.renamed].reverse()) {
      assert.ok(lstatSync(renamed.parkedPath).isFile(), `parked fixture file stopped being regular: ${renamed.parkedPath}`);
      renameSync(renamed.parkedPath, renamed.path);
      assert.ok(lstatSync(renamed.path).isFile(), `restored fixture file is not regular: ${renamed.path}`);
    }
  } catch (error) {
    restorationError = error;
  } finally {
    rmSync(copy.cleanupRoot, { recursive: true, force: true });
    assert.ok(!existsSync(copy.cleanupRoot), `fixture cleanup failed: ${copy.cleanupRoot}`);
  }
  if (restorationError) throw restorationError;
}

After(function (this: GuardrailWorld) {
  let cleanupError: unknown;
  try {
    for (const copy of copies.get(this) ?? []) {
      try {
        restoreAndRemove(copy);
      } catch (error) {
        cleanupError ??= error;
      }
    }
  } finally {
    const before = worktreeSnapshots.get(this);
    assert.ok(before, 'missing working-tree controlled-universe snapshot');
    assertWorktreeUnchanged(before);
  }
  if (cleanupError) throw cleanupError;
});
