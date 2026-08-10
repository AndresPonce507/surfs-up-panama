// Slice-08 drives only the production-owned page-weight gate and the
// production local-CI composition. Every contained proof runs against a copied
// build output in a temporary directory; the fixture under tests/ is read-only
// during a run and the repository's own dist/ is never touched by a contained
// invocation.
//
// The ceilings asserted here are transcribed from
// docs/product/architecture/application-architecture.md section 4 (route map,
// "Doc budget (gz)") and section 5 (the two-second arithmetic and the 100 KB
// first-visit cap, decision 27). They are the specification the gate is
// measured against, not a second implementation of it.

import { After, Before, Given, Then, When, type DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, join, relative, resolve } from 'node:path';

import astroConfiguration from '../../../../astro.config.mjs';
import { evaluatePageWeight } from '../../../../scripts/check-page-weight.mjs';
import { runLocalCi } from '../../../../scripts/ci-local.mjs';
import { assertStateDelta, type UniverseSnapshot } from './support/state-delta';

type PageWeightWorld = object;

type ObservedGate = Readonly<{
  exitCode: number;
  output: string;
  distRoot: string;
  named: readonly string[];
}>;

type ObservedCommand = Readonly<{ exitCode: number; output: string }>;

/**
 * The build hook exactly as the production Astro configuration carries it. The
 * proof drives that object, so it fails if the wiring is removed from the
 * configuration, not only if the gate itself regresses. `output` is the
 * injected port; a real build leaves it unset and writes to the streams.
 */
type BuildDoneHook = (options: {
  dir: URL;
  output?: { write(line: string): void; error?(line: string): void };
}) => Promise<void>;

type ContainedCopy = { readonly root: string; readonly cleanupRoot: string };

const gateResults = new WeakMap<PageWeightWorld, ObservedGate>();
const coupledGateResults = new WeakMap<PageWeightWorld, ReadonlyMap<string, ObservedGate>>();
const inventoryResults = new WeakMap<PageWeightWorld, ObservedCommand>();
const buildHooks = new WeakMap<PageWeightWorld, BuildDoneHook>();
const copies = new WeakMap<PageWeightWorld, ContainedCopy[]>();
const fixtureSnapshots = new WeakMap<PageWeightWorld, UniverseSnapshot>();
const buildOutputSnapshots = new WeakMap<PageWeightWorld, UniverseSnapshot>();

const FIXTURE_SOURCE = fileURLToPath(new URL('../fixtures/controlled-built-routes', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const REPOSITORY_BUILD_OUTPUT = resolve(REPOSITORY_ROOT, 'dist');

/** Route map, application-architecture.md section 4. KB means 1024 bytes. */
const DECLARED_DOCUMENT_CEILINGS = [
  { route: '/', built: '/', document: 'index.html', label: '14 KB', bytes: 14 * 1024 },
  { route: '/manana', built: '/manana', document: 'manana.html', label: '14 KB', bytes: 14 * 1024 },
  { route: '/spots/{slug}', built: '/spots/playa-venao', document: 'spots/playa-venao.html', label: '14 KB', bytes: 14 * 1024 },
  { route: '/spots/{slug}/ayer', built: '/spots/playa-venao/ayer', document: 'spots/playa-venao/ayer.html', label: '14 KB', bytes: 14 * 1024 },
  { route: '/spots/{slug}/reportar', built: '/spots/playa-venao/reportar', document: 'spots/playa-venao/reportar.html', label: '6 KB', bytes: 6 * 1024 },
  { route: '/spots/{slug}/reportado', built: '/spots/playa-venao/reportado', document: 'spots/playa-venao/reportado.html', label: '4 KB', bytes: 4 * 1024 },
] as const;

/** Decision 27 and application-architecture.md section 5: per route, first visit, everything on the wire. */
const FIRST_VISIT_CEILING_LABEL = '100 KB';
const FIRST_VISIT_CEILING_BYTES = 100 * 1024;

/** Declared in section 4 but built by later features, so this feature measures neither. */
const DECLARED_BUT_UNBUILT_ROUTES = ['/acerca'] as const;

const CONTRIBUTORS_ANCHOR = '<!--contributors-->';
const HEAD_ANCHOR = '<head>';
const FIXTURE_ICON = '/favicon.svg';
const THIRD_PARTY_ICON = 'https://cdn.example.com/favicon.svg';
const UNDECLARED_DOCUMENT = 'spots/playa-venao/pronostico.html';
const BLOCKING_STYLESHEET = '/blocking.css';
const HEAVY_FIRST_VISIT_ASSET = '/island.js';
const HEAVY_ASSET_ROUTE = '/spots/{slug}/reportar';
const HEAVY_ASSET_DOCUMENT = 'spots/playa-venao/reportar.html';
const BLOCKED_READING_ROUTE = '/';
const BLOCKED_READING_DOCUMENT = 'index.html';

const UNMEASURABLE_WITNESSES = [
  'absent build output',
  'undeclared emitted document',
  'unreachable first-visit asset',
  'third-party first-visit asset',
] as const;

class CapturingOutput {
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

function snapshotSourceFixture(): UniverseSnapshot {
  const snapshot: UniverseSnapshot = new Map();
  snapshotTree(FIXTURE_SOURCE, 'source-fixture:controlled-built-routes', snapshot);
  return snapshot;
}

function snapshotRepositoryBuildOutput(): UniverseSnapshot {
  const snapshot: UniverseSnapshot = new Map();
  snapshotTree(REPOSITORY_BUILD_OUTPUT, 'repo-root:dist', snapshot);
  return snapshot;
}

function assertNoSourceSymlinks(path: string, label: string): void {
  const stat = lstatSync(path);
  assert.ok(
    !stat.isSymbolicLink(),
    `WHAT: ${label} contains a symlink at ${path}. WHY: a contained page-weight proof must not resolve outside its copied build output. HOW: replace the symlink with a regular file.`,
  );
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) assertNoSourceSymlinks(resolve(path, entry), label);
    return;
  }
  assert.ok(stat.isFile(), `WHAT: ${label} contains a non-regular entry at ${path}. HOW: provide only regular files.`);
}

function trackCopy(world: PageWeightWorld, copy: ContainedCopy): ContainedCopy {
  const tracked = copies.get(world) ?? [];
  tracked.push(copy);
  copies.set(world, tracked);
  return copy;
}

function copyBuildOutput(world: PageWeightWorld): ContainedCopy {
  assert.ok(
    existsSync(FIXTURE_SOURCE),
    `WHAT: the controlled built-route fixture is absent. HOW: restore ${FIXTURE_SOURCE} before running the slice-08 acceptance tests.`,
  );
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-page-weight-'));
  try {
    assertNoSourceSymlinks(FIXTURE_SOURCE, 'controlled built-route fixture');
    const root = join(cleanupRoot, 'dist');
    cpSync(FIXTURE_SOURCE, root, { recursive: true, dereference: false });
    unlinkSync(resolve(root, 'README.md'));
    assertNoSourceSymlinks(root, 'copied controlled build output');
    return trackCopy(world, { root, cleanupRoot });
  } catch (error) {
    rmSync(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
}

function emptyBuildOutput(world: PageWeightWorld): ContainedCopy {
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'surfs-up-page-weight-empty-'));
  const root = join(cleanupRoot, 'dist');
  mkdirSync(root, { recursive: true });
  return trackCopy(world, { root, cleanupRoot });
}

function containedPath(copy: ContainedCopy, relativePath: string): string {
  const path = resolve(copy.root, relativePath);
  const inside = relative(copy.root, path);
  assert.ok(
    inside !== '' && !inside.startsWith('../') && inside !== '..' && !isAbsolute(inside),
    `WHAT: a contained path escaped its copied build output: ${relativePath}. WHY: a proof must never mutate the working tree. HOW: use a relative regular file inside the copy.`,
  );
  assert.ok(existsSync(path), `WHAT: the copied build output lacks ${relativePath}. HOW: retain that document in the controlled fixture.`);
  assert.ok(lstatSync(path).isFile(), `WHAT: ${relativePath} is not a regular file in the copied build output.`);
  return path;
}

function replaceExactly(source: string, expected: string, replacement: string, context: string): string {
  const occurrences = source.split(expected).length - 1;
  assert.equal(
    occurrences,
    1,
    `WHAT: a contained mutation is ambiguous in ${context}. WHY: one witness must change one place. HOW: retain exactly one ${JSON.stringify(expected)} anchor.`,
  );
  return source.replace(expected, replacement);
}

function mutateDocument(copy: ContainedCopy, relativePath: string, expected: string, replacement: string): void {
  const path = containedPath(copy, relativePath);
  const changed = replaceExactly(readFileSync(path, 'utf8'), expected, replacement, relativePath);
  writeFileSync(path, changed, 'utf8');
}

/**
 * Deterministic high-entropy filler. Repetitive text compresses to almost
 * nothing, so a proof that a ceiling is crossed needs bytes that survive gzip.
 */
function incompressibleText(byteLength: number, seed: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = (seed * 2654435761) >>> 0;
  const characters: string[] = [];
  while (characters.length < byteLength) {
    state = (state * 1664525 + 1013904223) >>> 0;
    characters.push(alphabet.charAt(state % alphabet.length));
  }
  return characters.join('');
}

function pushDocumentPastCeiling(copy: ContainedCopy, relativePath: string, ceilingBytes: number, seed: number): void {
  mutateDocument(
    copy,
    relativePath,
    CONTRIBUTORS_ANCHOR,
    `<p>${incompressibleText(ceilingBytes * 3 + 2048, seed)}</p>`,
  );
}

async function invokeGate(distRoot: string, named: readonly string[] = []): Promise<ObservedGate> {
  const output = new CapturingOutput();
  try {
    const result = await evaluatePageWeight({ distRoot, output });
    return { exitCode: result.exitCode, output: output.text(), distRoot, named };
  } catch (error) {
    output.write(`runtime failure: ${error instanceof Error ? error.message : String(error)}`);
    return { exitCode: 2, output: output.text(), distRoot, named };
  }
}

function observeGate(world: PageWeightWorld, result: ObservedGate): void {
  gateResults.set(world, result);
}

function observedGate(world: PageWeightWorld): ObservedGate {
  const result = gateResults.get(world);
  assert.ok(result, 'WHAT: no page-weight result was captured. HOW: invoke the production gate before observing it.');
  return result;
}

/** Pulls the page-weight hook out of the production build configuration itself. */
function buildDoneHookOf(configuration: typeof astroConfiguration): BuildDoneHook {
  const integrations = configuration.integrations ?? [];
  assert.ok(
    Array.isArray(integrations),
    'WHAT: the site build configuration declares no list of integrations. HOW: keep the page-weight gate wired into the build.',
  );
  const wired = integrations.find(
    (integration): integration is { name: string; hooks: Record<string, unknown> } =>
      typeof integration === 'object'
      && integration !== null
      && 'name' in integration
      && (integration as { name: unknown }).name === 'page-weight-budget',
  );
  assert.ok(
    wired,
    'WHAT: the site build configuration carries no page-weight gate. WHY: a gate the build does not run cannot stop a build that breaks the two-second promise. HOW: wire it into astro.config.mjs.',
  );
  const hook = wired.hooks['astro:build:done'];
  assert.equal(
    typeof hook,
    'function',
    'WHAT: the page-weight gate is wired into the build without a build-done hook. HOW: measure the emitted output when the build finishes.',
  );
  return hook as BuildDoneHook;
}

function observedBuildHook(world: PageWeightWorld): BuildDoneHook {
  const hook = buildHooks.get(world);
  assert.ok(hook, 'WHAT: no build hook was captured. HOW: read the site build configuration before observing it.');
  return hook;
}

function observedCoupledGates(world: PageWeightWorld): ReadonlyMap<string, ObservedGate> {
  const results = coupledGateResults.get(world);
  assert.ok(results, 'WHAT: no coupled page-weight results were captured. HOW: drive every table row before observing them.');
  return results;
}

function assertIncludes(output: string, expected: string, why: string): void {
  assert.ok(
    output.includes(expected),
    `WHAT: the page-weight output omits ${JSON.stringify(expected)}. WHY: ${why}. HOW: emit the measured route, its bytes, its ceiling and the repair from the production gate.\n${output}`,
  );
}

/**
 * Reads back what the gate itself printed for one concrete built route, so the
 * proof never recomputes the gate's own arithmetic and never reads one route's
 * measurement as another's.
 */
function lineFor(output: string, prefix: string, why: string): string {
  const line = output.split('\n').find((candidate) => candidate.trimStart().startsWith(prefix));
  assert.ok(
    line,
    `WHAT: the page-weight output carries no line starting ${JSON.stringify(prefix)}. WHY: ${why}. HOW: print it from the production gate.\n${output}`,
  );
  return line;
}

function bytesIn(line: string, marker: string, output: string): number {
  const match = new RegExp(`${marker}\\s+([\\d,]+)\\s*B\\s*gz`).exec(line);
  assert.ok(
    match?.[1],
    `WHAT: ${JSON.stringify(line)} carries no "${marker} <n> B gz" measurement. WHY: a result that names no measured byte count cannot be told apart from one that never measured. HOW: print the measured gzipped bytes.\n${output}`,
  );
  return Number(match[1]!.replaceAll(',', ''));
}

function measurementFor(output: string, builtRoute: string): { line: string; documentBytes: number; firstVisitBytes: number } {
  const line = lineFor(output, `route ${builtRoute} (`, `every measured route must report its own bytes, and ${builtRoute} reported none`);
  return {
    line,
    documentBytes: bytesIn(line, 'document', output),
    firstVisitBytes: bytesIn(line, 'first visit', output),
  };
}

function refusalFor(output: string, builtRoute: string): string {
  return lineFor(output, `REFUSED route ${builtRoute} (`, `a refusal must name the concrete route it refused, and ${builtRoute} was not named`);
}

function assertNamesThreeContributors(output: string, why: string): void {
  const contributors = [...output.matchAll(/largest contributors:([^\n]+)/g)];
  assert.ok(
    contributors.some((match) => (match[1]!.match(/;/g)?.length ?? 0) >= 2),
    `WHAT: no refusal named three contributors. WHY: ${why}. HOW: list the three biggest parts of the route beside the measurement.\n${output}`,
  );
}

function requiredTableValue(row: Readonly<Record<string, string | undefined>>, column: string): string {
  const value = row[column];
  assert.ok(
    typeof value === 'string' && value.length > 0,
    `WHAT: coupled acceptance data omits ${JSON.stringify(column)}. HOW: give every checked route a named witness and a concrete ceiling.`,
  );
  return value;
}

function assertRefusalIsNotAPass(result: ObservedGate, witness: string): void {
  assert.notEqual(
    result.exitCode,
    0,
    `WHAT: ${witness} was accepted. WHY: a build that breaks the two-second promise must fail the gate. HOW: refuse it and name the route, the measured bytes and the ceiling.\n${result.output}`,
  );
  assert.ok(
    !/\bcomes in under every ceiling\b/i.test(result.output),
    `WHAT: ${witness} printed the passing summary. WHY: "measured and passes" and "refused" must never read the same. HOW: keep the passing summary on the success path only.\n${result.output}`,
  );
  assert.ok(
    !/^(?:ok|pass|passed|success)$/i.test(result.output.trim()),
    `WHAT: ${witness} produced a bare result. HOW: name what failed, why it matters and how to repair it.`,
  );
}

Given('the site owner protects the beach-3G page weight of every built route', function () {});

Before(function (this: PageWeightWorld) {
  fixtureSnapshots.set(this, snapshotSourceFixture());
  buildOutputSnapshots.set(this, snapshotRepositoryBuildOutput());
});

When('the site owner reads the local CI job inventory and the site build configuration', async function (this: PageWeightWorld) {
  const inventory = new CapturingOutput();
  const inventoryExit = await runLocalCi({ argv: ['--list'], output: inventory });
  inventoryResults.set(this, { exitCode: inventoryExit, output: inventory.text() });
  buildHooks.set(this, buildDoneHookOf(astroConfiguration));
});

When('the site owner measures a clean contained build output', async function (this: PageWeightWorld) {
  observeGate(this, await invokeGate(copyBuildOutput(this).root));
});

When('the site owner pushes each contained route document past its ceiling', async function (this: PageWeightWorld, table: DataTable) {
  const observed = new Map<string, ObservedGate>();
  let seed = 1;
  for (const row of table.hashes()) {
    const route = requiredTableValue(row, 'route');
    const document = requiredTableValue(row, 'document');
    const ceiling = requiredTableValue(row, 'ceiling');
    const declared = DECLARED_DOCUMENT_CEILINGS.find((entry) => entry.route === route);
    assert.ok(declared, `WHAT: the acceptance table names an undeclared route: ${route}. HOW: check it against application-architecture.md section 4.`);
    assert.equal(declared.document, document, `WHAT: the acceptance table names the wrong document for ${route}.`);
    assert.equal(`${declared.label} gz`, ceiling, `WHAT: the acceptance table names a ceiling the architecture does not declare for ${route}.`);
    const copy = copyBuildOutput(this);
    pushDocumentPastCeiling(copy, document, declared.bytes, seed);
    seed += 1;
    observed.set(route, await invokeGate(copy.root, [route, declared.label]));
  }
  coupledGateResults.set(this, observed);
});

When('the site owner adds a first-visit asset that pushes a contained route past the 100 KB cap', async function (this: PageWeightWorld) {
  const copy = copyBuildOutput(this);
  writeFileSync(
    resolve(copy.root, HEAVY_FIRST_VISIT_ASSET.replace(/^\//, '')),
    incompressibleText(FIRST_VISIT_CEILING_BYTES * 2, 7),
    'utf8',
  );
  mutateDocument(
    copy,
    HEAVY_ASSET_DOCUMENT,
    CONTRIBUTORS_ANCHOR,
    `<script src="${HEAVY_FIRST_VISIT_ASSET}" defer></script>`,
  );
  observeGate(this, await invokeGate(copy.root, [HEAVY_ASSET_ROUTE, HEAVY_FIRST_VISIT_ASSET]));
});

When('the site owner offers each unmeasurable build output', async function (this: PageWeightWorld, table: DataTable) {
  const observed = new Map<string, ObservedGate>();
  for (const row of table.hashes()) {
    const witness = requiredTableValue(row, 'witness');
    requiredTableValue(row, 'what the gate cannot measure');
    assert.ok(
      (UNMEASURABLE_WITNESSES as readonly string[]).includes(witness),
      `WHAT: unknown unmeasurable witness: ${witness}. HOW: drive only the declared unmeasurable inputs.`,
    );
    if (witness === 'absent build output') {
      const empty = emptyBuildOutput(this);
      observed.set(witness, await invokeGate(empty.root, [empty.root]));
      continue;
    }
    const copy = copyBuildOutput(this);
    if (witness === 'undeclared emitted document') {
      writeFileSync(
        resolve(copy.root, UNDECLARED_DOCUMENT),
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Pronostico</title></head><body><main>Pronostico</main></body></html>',
        'utf8',
      );
      observed.set(witness, await invokeGate(copy.root, [UNDECLARED_DOCUMENT]));
      continue;
    }
    if (witness === 'unreachable first-visit asset') {
      unlinkSync(resolve(copy.root, FIXTURE_ICON.replace(/^\//, '')));
      observed.set(witness, await invokeGate(copy.root, [FIXTURE_ICON]));
      continue;
    }
    mutateDocument(copy, BLOCKED_READING_DOCUMENT, `href="${FIXTURE_ICON}"`, `href="${THIRD_PARTY_ICON}"`);
    observed.set(witness, await invokeGate(copy.root, [THIRD_PARTY_ICON]));
  }
  coupledGateResults.set(this, observed);
});

When('the site owner makes a contained reading route wait for a subresource before first paint', async function (this: PageWeightWorld) {
  const copy = copyBuildOutput(this);
  writeFileSync(resolve(copy.root, BLOCKING_STYLESHEET.replace(/^\//, '')), 'body{color:#14181d}', 'utf8');
  mutateDocument(copy, BLOCKED_READING_DOCUMENT, HEAD_ANCHOR, `${HEAD_ANCHOR}<link rel="stylesheet" href="${BLOCKING_STYLESHEET}">`);
  observeGate(this, await invokeGate(copy.root, [BLOCKED_READING_ROUTE, BLOCKING_STYLESHEET]));
});

Then('the page-weight gate is part of the default local gate', function (this: PageWeightWorld) {
  const inventory = inventoryResults.get(this);
  assert.ok(inventory, 'WHAT: no local CI inventory was captured. HOW: read the production job inventory before observing it.');
  assert.equal(inventory.exitCode, 0, `WHAT: the local CI inventory exited ${inventory.exitCode}.\n${inventory.output}`);
  assertIncludes(inventory.output, '● budget', 'a page-weight guard that needs a remembered flag can be bypassed at merge');
});

Then('the site build measures the output it emits', async function (this: PageWeightWorld) {
  const hook = observedBuildHook(this);
  const captured = new CapturingOutput();
  const clean = copyBuildOutput(this);
  await hook({ dir: pathToFileURL(`${clean.root}/`), output: captured });
  const output = captured.text();
  assertIncludes(output, clean.root, 'the build must measure the directory it just emitted, not some other build output');
  for (const declared of DECLARED_DOCUMENT_CEILINGS) {
    const measurement = measurementFor(output, declared.built);
    assert.ok(
      measurement.documentBytes > 0,
      `WHAT: the build reported a zero-byte ${declared.built}. WHY: a green that names no real bytes cannot be told apart from a build that never measured. HOW: measure every emitted document.\n${output}`,
    );
  }
});

Then('a build whose output stays inside every ceiling finishes', async function (this: PageWeightWorld) {
  const hook = observedBuildHook(this);
  const clean = copyBuildOutput(this);
  await hook({ dir: pathToFileURL(`${clean.root}/`), output: new CapturingOutput() });
});

Then('a build whose output breaks a ceiling cannot finish', async function (this: PageWeightWorld) {
  const hook = observedBuildHook(this);
  const captured = new CapturingOutput();
  const oversize = copyBuildOutput(this);
  const home = DECLARED_DOCUMENT_CEILINGS[0];
  pushDocumentPastCeiling(oversize, home.document, home.bytes, 99);
  await assert.rejects(
    hook({ dir: pathToFileURL(`${oversize.root}/`), output: captured }),
    /page-weight gate refused this build/,
    `WHAT: a build emitting a home page over its ${home.label} ceiling finished successfully. WHY: the whole promise is that a build breaking it fails. HOW: fail the build from the gate.\n${captured.text()}`,
  );
  const refusal = refusalFor(captured.text(), home.built);
  assert.ok(
    bytesIn(refusal, 'document', captured.text()) > home.bytes,
    `WHAT: the build refusal did not quote the oversize measurement it refused on.\n${refusal}`,
  );
});

Then('the page-weight measurement finishes successfully', function (this: PageWeightWorld) {
  const result = observedGate(this);
  assert.equal(result.exitCode, 0, `WHAT: a clean contained build output was refused (exit ${result.exitCode}). WHY: every fixture route is well inside its ceiling. HOW: measure it and report the measurement.\n${result.output}`);
  assertIncludes(
    result.output,
    result.distRoot,
    'a reader has to know which build output was weighed: a measurement of the wrong directory reads exactly like a measurement of the right one',
  );
});

Then('every contained route is named with its measured document bytes and its ceiling', function (this: PageWeightWorld) {
  const output = observedGate(this).output;
  for (const declared of DECLARED_DOCUMENT_CEILINGS) {
    assertIncludes(output, declared.route, 'a passing result must name every declared route shape it measured against');
    const measurement = measurementFor(output, declared.built);
    assert.ok(
      measurement.documentBytes > 0 && measurement.documentBytes <= declared.bytes,
      `WHAT: ${declared.built} reported ${measurement.documentBytes} B gz against its ${declared.bytes} B gz ceiling. WHY: the clean fixture is well inside every ceiling. HOW: measure the emitted document.\n${output}`,
    );
    assert.ok(
      measurement.line.includes(declared.label),
      `WHAT: the measurement of ${declared.built} does not name its ${declared.label} ceiling. HOW: print the ceiling beside the measurement.\n${measurement.line}`,
    );
  }
  const documentMeasurements = [...output.matchAll(/document\s+([\d,]+)\s*B\s*gz/g)];
  assert.equal(
    documentMeasurements.length,
    DECLARED_DOCUMENT_CEILINGS.length,
    `WHAT: the measurement named ${documentMeasurements.length} document sizes for ${DECLARED_DOCUMENT_CEILINGS.length} built routes. WHY: a green with a partial list hides an unmeasured route. HOW: print one measurement per emitted document.\n${output}`,
  );
});

Then('every contained route is named with its measured first-visit bytes and the 100 KB ceiling', function (this: PageWeightWorld) {
  const output = observedGate(this).output;
  assertIncludes(output, FIRST_VISIT_CEILING_LABEL, 'the per-route first-visit cap must be named beside its measurement');
  for (const declared of DECLARED_DOCUMENT_CEILINGS) {
    const measurement = measurementFor(output, declared.built);
    assert.ok(
      measurement.firstVisitBytes >= measurement.documentBytes,
      `WHAT: ${declared.built} reported a first-visit total below its own document. WHY: the first visit is everything on the wire, the document included. HOW: add the document to its referenced first-visit assets.\n${measurement.line}`,
    );
    assert.ok(
      measurement.firstVisitBytes <= FIRST_VISIT_CEILING_BYTES,
      `WHAT: ${declared.built} measured ${measurement.firstVisitBytes} B gz on first visit against the ${FIRST_VISIT_CEILING_BYTES} B gz cap.\n${output}`,
    );
    assert.ok(
      measurement.line.includes(FIRST_VISIT_CEILING_LABEL),
      `WHAT: the measurement of ${declared.built} does not name the 100 KB first-visit cap.\n${measurement.line}`,
    );
  }
});

Then('the measurement names the declared routes this feature does not build', function (this: PageWeightWorld) {
  const output = observedGate(this).output;
  for (const route of DECLARED_BUT_UNBUILT_ROUTES) {
    assertIncludes(output, route, 'a reader must see the boundary of what was measured, not guess at it');
  }
  assertIncludes(output, 'not measured', 'the unbuilt declared routes must be reported as unmeasured, never folded into the passing count');
});

Then('the measurement carries no bare success message', function (this: PageWeightWorld) {
  const output = observedGate(this).output;
  assert.ok(
    !/^(?:ok|pass|passed|success)$/i.test(output.trim()),
    'WHAT: the page-weight gate returned a bare success. WHY: a green that names no route, no bytes and no ceiling cannot be told apart from a gate that never measured. HOW: print the measurement.',
  );
});

Then('each oversize route is refused naming the route, the measured bytes, the ceiling and its largest contributors', function (this: PageWeightWorld) {
  for (const [route, result] of observedCoupledGates(this)) {
    assertRefusalIsNotAPass(result, `an oversize ${route} document`);
    const declared = DECLARED_DOCUMENT_CEILINGS.find((entry) => entry.route === route);
    assert.ok(declared, `unknown oversize route: ${route}`);
    const refusal = refusalFor(result.output, declared.built);
    const measured = bytesIn(refusal, 'document', result.output);
    assert.ok(
      measured > declared.bytes,
      `WHAT: ${route} was refused while reporting ${measured} B gz, at or under its ${declared.bytes} B gz ceiling. WHY: the reported measurement must be the one the refusal is based on. HOW: report the bytes actually measured.\n${result.output}`,
    );
    assert.ok(
      refusal.includes(declared.label),
      `WHAT: the refusal of ${route} does not name the ceiling it broke. WHY: application-architecture.md section 5 requires the route, the measured bytes and the ceiling. HOW: print the ceiling in the refusal.\n${refusal}`,
    );
    assert.equal(
      measurementFor(result.output, declared.built).documentBytes,
      measured,
      `WHAT: the refusal of ${route} quotes different bytes from its own measurement.\n${result.output}`,
    );
    assertNamesThreeContributors(result.output, 'application-architecture.md section 5 requires the largest three contributors, so the owner knows what to cut');
    assertIncludes(result.output, 'restore', 'a refusal must tell the owner how to get back under the ceiling');
  }
});

Then('the first-visit refusal names the route, the measured first-visit bytes, the 100 KB ceiling and its largest contributors', function (this: PageWeightWorld) {
  const result = observedGate(this);
  assertRefusalIsNotAPass(result, 'a route over the first-visit cap');
  const declared = DECLARED_DOCUMENT_CEILINGS.find((entry) => entry.route === HEAVY_ASSET_ROUTE);
  assert.ok(declared, `unknown heavy-asset route: ${HEAVY_ASSET_ROUTE}`);
  const refusal = refusalFor(result.output, declared.built);
  const measured = bytesIn(refusal, 'first visit', result.output);
  assert.ok(
    measured > FIRST_VISIT_CEILING_BYTES,
    `WHAT: the first-visit refusal reported ${measured} B gz, at or under the ${FIRST_VISIT_CEILING_BYTES} B gz cap.\n${result.output}`,
  );
  assert.ok(
    refusal.includes(FIRST_VISIT_CEILING_LABEL),
    `WHAT: the first-visit refusal does not name the 100 KB cap.\n${refusal}`,
  );
  assertIncludes(result.output, HEAVY_FIRST_VISIT_ASSET, 'a first-visit refusal must name the asset that spent the budget');
  assertNamesThreeContributors(result.output, 'the owner must see which parts of the route spent the first-visit budget');
  assertIncludes(result.output, 'restore', 'a first-visit refusal must tell the owner how to get back under the cap');
});

Then('each unmeasurable output is refused naming what could not be measured, why it matters and how to restore it', function (this: PageWeightWorld) {
  for (const [witness, result] of observedCoupledGates(this)) {
    assertRefusalIsNotAPass(result, witness);
    assertIncludes(result.output, 'cannot measure', 'an unmeasured route must never read like a measured one');
    assertIncludes(result.output, 'restore', 'a refusal must tell the owner how to make the output measurable again');
    for (const named of result.named) {
      assertIncludes(result.output, named, `the refusal for ${witness} must name exactly what it could not measure`);
    }
  }
});

Then('the first-paint refusal names the route, the blocking subresource, why it breaks the two-second promise and how to restore it', function (this: PageWeightWorld) {
  const result = observedGate(this);
  assertRefusalIsNotAPass(result, 'a reading route that blocks first paint');
  const refusal = refusalFor(result.output, BLOCKED_READING_ROUTE);
  assert.ok(
    refusal.includes(BLOCKING_STYLESHEET),
    `WHAT: the first-paint refusal does not name the subresource the page waits on.\n${refusal}`,
  );
  assertIncludes(result.output, 'render-blocking', 'a first-paint refusal must say what it found');
  assertIncludes(result.output, 'two seconds', 'a first-paint refusal must say which promise it protects');
  assertIncludes(result.output, 'restore', 'a first-paint refusal must tell the owner how to repair it');
});

Then('no refusal reports a measured-and-passing result', function (this: PageWeightWorld) {
  const coupled = coupledGateResults.get(this);
  if (coupled) {
    for (const [witness, result] of coupled) assertRefusalIsNotAPass(result, witness);
    return;
  }
  assertRefusalIsNotAPass(observedGate(this), 'the refused build output');
});

Then('contained refusals leave the source fixture and the repository build output unchanged', function (this: PageWeightWorld) {
  const fixtureBefore = fixtureSnapshots.get(this);
  const buildOutputBefore = buildOutputSnapshots.get(this);
  assert.ok(fixtureBefore, 'WHAT: no source-fixture snapshot exists. HOW: snapshot the controlled fixture before each scenario.');
  assert.ok(buildOutputBefore, 'WHAT: no repository build-output snapshot exists. HOW: snapshot dist/ before each scenario.');
  assertStateDelta({
    before: fixtureBefore,
    after: snapshotSourceFixture(),
    universe: 'controlled built-route source fixture',
    expected: 'identical',
    context: 'WHAT: a contained page-weight proof changed its source fixture. WHY: proofs may mutate only a copied build output. HOW: mutate the temporary copy, never tests/.../fixtures.',
  });
  assertStateDelta({
    before: buildOutputBefore,
    after: snapshotRepositoryBuildOutput(),
    universe: 'repository build output',
    expected: 'identical',
    context: 'WHAT: a contained page-weight proof changed the repository build output. WHY: measuring a contained copy must never write to dist/. HOW: read only the distRoot handed to the gate.',
  });
});

After(function (this: PageWeightWorld) {
  let cleanupError: unknown;
  for (const copy of copies.get(this) ?? []) {
    try {
      rmSync(copy.cleanupRoot, { recursive: true, force: true });
      assert.ok(!existsSync(copy.cleanupRoot), `contained build-output cleanup failed: ${copy.cleanupRoot}`);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  const before = fixtureSnapshots.get(this);
  assert.ok(before, 'missing controlled built-route fixture snapshot');
  assertStateDelta({
    before,
    after: snapshotSourceFixture(),
    universe: 'controlled built-route source fixture',
    expected: 'identical',
    context: 'WHAT: a slice-08 scenario left the controlled fixture changed. WHY: the fixture is a read-only test input. HOW: mutate only the temporary copy.',
  });
  if (cleanupError) throw cleanupError;
});
