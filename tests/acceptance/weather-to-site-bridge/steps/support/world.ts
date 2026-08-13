// The slice-01 driving surface for weather-to-site-bridge. Production entry
// points only:
//
//   1. `runPublishOnce(deps)` from src/pipeline/publish-site.ts — the publish
//      port the ADR's bounded Publisher exposes. It does not exist yet; the
//      steps pin it by dynamic import so a missing module fails as a stated
//      absence inside a Then, never as a broken import (same convention as
//      f-works-with-no-signal's world).
//   2. `derivePublishLogLines(outcome)` from src/pipeline/lambda/log-events.ts
//      — the pure honesty gate in the deriveBuildLogLines pattern. The module
//      exists; the export does not yet, so it is pinned the same way.
//   3. `runPublish(event, overrides)` from src/pipeline/lambda/publish-handler.ts
//      — the Lambda composition root, overrides-injectable like
//      build-handler.ts's runBuild(overrides).
//
// WHAT RUNS REAL through the port (the point of this suite): the surface
// merge (`mergePublishedSurface`), the strict two-day contract, the Panama
// civil-day rule against the INJECTED clock, and the checked-in publication
// walk (`publishBuild`: directory-alias double-write, content types,
// no-cache, `assertPublicationArtifactOrigin`) over the fake renderer's REAL
// temp directory. WHAT IS FAKE: the object store (records every get/put), the
// renderer (writes a fixture dist/ including the origin receipt; the real
// adapter later runs `npm run build`, proven by the ARM64 container smoke),
// and the command runner (records every argv it is asked to run and can be
// told to fail on the Nth put). The clock is an injected fixed instant: per
// src/pipeline/ports.ts, nothing in the core may read the ambient clock.
//
// THE PINNED DEPS SHAPE (the crafter implements to exactly this seam):
//   runPublishOnce({ invocation: { build_id, bundle_key },
//                    store: { get(key), put(key, body) },
//                    renderer: (mergedSurfaceJson) => Promise<distDir>,
//                    commandRunner: (command, args) => Promise<unknown>,
//                    clock: { now() } }): Promise<PublishOutcome>
//   PublishOutcome = { published: true, build_id, uploaded_objects,
//                      directory_aliases }
//                  | { published: false, reason }
// The publication target is FIXED to production inside the port (the bridge
// is production-only by recorded decision); the steps prove it by asserting
// every upload lands in the production site bucket. Refusals RESOLVE with a
// named reason — they never throw — because Build must be able to derive
// publish.refused from the outcome.
//
// Steps ACT through these ports and OBSERVE only port-exposed things: the
// outcome, the recorded store operations, the recorded upload argv, and the
// bytes get-able at the durable archive key. Action steps capture failures;
// Then steps turn them into assertion failures with the captured context
// attached (active-RED with the reason in the message).

import { After, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertStrictTwoDayUpdate,
  mergePublishedSurface,
  type PublishedSurfaceUpdate,
  type StaticSurface,
  type SurfaceCall,
} from '../../../../../src/publish/static-surface';
import {
  assertStateDelta,
  containing,
  setTo,
  type StateSnapshot,
} from '../../../../common/state_delta';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The durable archive of record (ADR decision 2): dawn receipts survive cold starts here. */
export const STATE_KEY = 'site/published-surface.json';
/** Where Build writes the bundle the Publisher is invoked for. */
export const BUNDLE_KEY = 'pub/v1/regions/pa-pacific/bundle.json';

/** Pinned by decision, never injected: the bridge publishes production only. */
export const PRODUCTION_ORIGIN = 'https://d1dtqpd8bf3oze.cloudfront.net';
export const PRODUCTION_BUCKET = 'surfs-up-panama-site-602167897909';
export const PREVIEW_ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';
/** The receipt the build bakes into dist/ (scripts/release/publication-target.mjs, commit 0fa6d66). */
export const ORIGIN_RECEIPT_FILE = '.public-site-origin.json';

export const PUBLISH_SUCCESS_EVENT = 'publish.success';
export const PUBLISH_REFUSED_EVENT = 'publish.refused';

// ---------- the pinned civil-day fixture ----------
// Every instant is injected; no scenario ever reads the wall clock, so these
// dates are deliberately NOT "today": a suite that only passed on the day it
// was written would be the exact dishonesty the midnight rule exists to catch.

export const TODAY = '2026-03-10';
export const YESTERDAY = '2026-03-09';
/** 10:00 in Panama (UTC-5) on TODAY. */
export const HOURLY_INSTANT = '2026-03-10T15:00:00Z';
/** 06:22 in Panama on TODAY — a dawn cycle. */
export const DAWN_INSTANT = '2026-03-10T11:22:00Z';
/** 11:00 in Panama on TODAY — the day's later hourly cycle. */
export const LATER_HOURLY_INSTANT = '2026-03-10T16:00:00Z';

export const FRESH_BUILD_ID = 'b_2026-03-10T15Z';
export const DAWN_BUILD_ID = 'b_2026-03-10T11Z';
export const LATER_HOURLY_BUILD_ID = 'b_2026-03-10T16Z';
export const STALE_BUILD_ID = 'b_2026-03-09T15Z';
export const MISMATCHED_INVOCATION_BUILD_ID = 'b_2026-03-10T14Z';

// ---------- the pinned port types ----------

export type PublishInvocation = Readonly<{ build_id: string; bundle_key: string }>;

export type PublishStorePort = Readonly<{
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
}>;

export type PublishCommandRunner = (command: string, args: string[]) => Promise<unknown>;

/** Given the merged surface JSON, produces a real directory shaped like dist/. */
export type PublishRenderer = (mergedSurfaceJson: string) => Promise<string>;

export type PublishClock = Readonly<{ now(): Date }>;

export type PublishDeps = Readonly<{
  invocation: PublishInvocation;
  store: PublishStorePort;
  renderer: PublishRenderer;
  commandRunner: PublishCommandRunner;
  clock: PublishClock;
}>;

export type PublishOutcome =
  | Readonly<{ published: true; build_id: string; uploaded_objects: number; directory_aliases: number }>
  | Readonly<{ published: false; reason: string }>;

// ---------- fixtures: a minimal strictly-valid bundle ----------
// Shape mirrors src/pipeline/build.ts's RegionBundle (`.publish_surface`,
// `build_id`). The publish_surface half is proven valid at fixture-build time
// by the REAL assertStrictTwoDayUpdate, so no scenario can ever fail for a
// malformed fixture instead of missing behaviour.

function rankedCall(spotId: string, score: number, sentence: string): SurfaceCall {
  return { spot_id: spotId, score_q: score, call_es: sentence };
}

export function surfaceUpdateFor(options: Readonly<{
  surfDate: string;
  buildKind: 'dawn' | 'hourly';
  publishedAt: string;
}>): PublishedSurfaceUpdate {
  const today = [
    rankedCall('playa-venao', 74, 'Cintura a pecho, viento limpio, mejor de 07:00 a 10:00.'),
    rankedCall('punta-chame', 55, 'Rodilla a cintura, viento picado, mejor de 08:00 a 09:00.'),
  ];
  const tomorrow = [
    rankedCall('punta-chame', 63, 'Cintura a pecho, viento picado, mejor de 09:00 a 11:00.'),
    rankedCall('playa-venao', 48, 'Rodilla a cintura, viento picado, sin ventana estimada.'),
  ];
  return assertStrictTwoDayUpdate({
    schema: 'published-surface-update/v1',
    surf_date: options.surfDate,
    published_at: options.publishedAt,
    build_kind: options.buildKind,
    calls: today,
    days: [
      { date: options.surfDate, spots: today },
      { date: nextCivilDate(options.surfDate), spots: tomorrow },
    ],
  });
}

export function regionBundleFor(options: Readonly<{
  buildId: string;
  surfDate: string;
  buildKind: 'dawn' | 'hourly';
  publishedAt: string;
}>): Record<string, unknown> {
  const surface = surfaceUpdateFor(options);
  return {
    schema: 'region-bundle/1',
    region_id: 'pa-pacific',
    build_id: options.buildId,
    published_at: options.publishedAt,
    days: surface.days.map((day) => ({
      date: day.date,
      spots: day.spots.map((call) => ({
        spot_id: call.spot_id,
        score_q: call.score_q,
        conf_level: 'medium',
        call: { es: call.call_es },
        size_band: 'waist_chest',
        size_range_m: [0.7, 1.1],
        wind_state: 'choppy',
        best_window: { start: '07:00', end: '10:00' },
        weakest_link: null,
      })),
    })),
    spot_detail: {
      'playa-venao': { name: 'Playa Venao' },
      'punta-chame': { name: 'Punta Chame' },
    },
    publish_surface: surface,
  };
}

function nextCivilDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// ---------- the fake store: records every operation ----------

export type StoreOperation = Readonly<{ kind: 'get' | 'put'; key: string }>;

export type RecordingStore = Readonly<{
  port: PublishStorePort;
  operations(): readonly StoreOperation[];
  /** Plants an object without recording an operation: the Given's move. */
  seed(key: string, body: string): void;
  objectAt(key: string): string | null;
  putsTo(key: string): number;
}>;

export function recordingStore(): RecordingStore {
  const objects = new Map<string, string>();
  const operations: StoreOperation[] = [];
  return {
    port: {
      get: async (key: string): Promise<string | null> => {
        operations.push({ kind: 'get', key });
        return objects.get(key) ?? null;
      },
      put: async (key: string, body: string): Promise<void> => {
        operations.push({ kind: 'put', key });
        objects.set(key, body);
      },
    },
    operations: () => [...operations],
    seed: (key, body) => {
      objects.set(key, body);
    },
    objectAt: (key) => objects.get(key) ?? null,
    putsTo: (key) => operations.filter((op) => op.kind === 'put' && op.key === key).length,
  };
}

// ---------- the fake command runner: records every argv, can break mid-batch ----------

export type RunnerCall = Readonly<{ command: string; args: readonly string[] }>;

export type RecordingRunner = Readonly<{
  port: PublishCommandRunner;
  calls(): readonly RunnerCall[];
  /** Breaks the pipe on the Nth put-object it is asked to run (1-based). */
  failOnPutNumber(n: number): void;
}>;

export const BROKEN_PIPE_MESSAGE = 'acceptance harness: the pipe to the bucket broke on this upload';

export function recordingRunner(): RecordingRunner {
  const calls: RunnerCall[] = [];
  let failAt: number | null = null;
  let puts = 0;
  return {
    port: async (command: string, args: string[]): Promise<unknown> => {
      calls.push({ command, args: [...args] });
      if (args[0] === 's3api' && args[1] === 'put-object') {
        puts += 1;
        if (failAt !== null && puts === failAt) {
          throw new Error(BROKEN_PIPE_MESSAGE);
        }
      }
      return {};
    },
    calls: () => [...calls],
    failOnPutNumber: (n) => {
      failAt = n;
    },
  };
}

/** One recorded upload, parsed out of the argv the runner was asked to run. */
export type UploadRecord = Readonly<{
  bucket: string | null;
  key: string | null;
  cacheControl: string | null;
  contentType: string | null;
}>;

function valueAfter(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
}

export function isPutObject(call: RunnerCall): boolean {
  return call.command === 'aws' && call.args[0] === 's3api' && call.args[1] === 'put-object';
}

export function uploadRecords(runner: RecordingRunner): readonly UploadRecord[] {
  return runner.calls().filter(isPutObject).map((call) => ({
    bucket: valueAfter(call.args, '--bucket'),
    key: valueAfter(call.args, '--key'),
    cacheControl: valueAfter(call.args, '--cache-control'),
    contentType: valueAfter(call.args, '--content-type'),
  }));
}

// ---------- the fake renderer: a REAL dist-shaped directory, fixture content ----------
// The real adapter later runs `npm run build` inside the container image; the
// risky real render is the ARM64 smoke's job (charter negative observation).
// What must run real HERE is everything downstream of the directory: the
// walk, the alias double-write, the content types, the receipt guard.

export const FIXTURE_PAGES: ReadonlyArray<Readonly<{ path: string; body: string }>> = [
  { path: 'index.html', body: '<!doctype html><html lang="es"><head><title>El llamado de hoy</title></head><body><p>Cintura a pecho, viento limpio.</p></body></html>' },
  { path: 'spots/playa-venao.html', body: '<!doctype html><html lang="es"><head><title>Playa Venao</title></head><body><p>Cintura a pecho.</p></body></html>' },
  { path: 'spots/punta-chame.html', body: '<!doctype html><html lang="es"><head><title>Punta Chame</title></head><body><p>Rodilla a cintura.</p></body></html>' },
  { path: 'assets/site.css', body: 'body{font-family:system-ui}' },
];

/** Every key of the fixture dist/, receipt included: publication uploads them all. */
export const EXPECTED_CANONICAL_KEYS: readonly string[] = [
  ORIGIN_RECEIPT_FILE,
  'assets/site.css',
  'index.html',
  'spots/playa-venao.html',
  'spots/punta-chame.html',
];

/** The literal directory keys each page ALSO lands at (index.html is the root object). */
export const EXPECTED_ALIAS_KEYS: readonly string[] = [
  'spots/playa-venao/',
  'spots/punta-chame/',
];

export function expectedUploadKeys(): string[] {
  return [...EXPECTED_CANONICAL_KEYS, ...EXPECTED_ALIAS_KEYS].sort();
}

export type RecordingRenderer = Readonly<{
  port: PublishRenderer;
  /** Every merged-surface JSON the renderer was handed, in call order. */
  receivedSurfaces(): readonly string[];
}>;

export function recordingRenderer(scenario: PublishScenario): RecordingRenderer {
  const received: string[] = [];
  return {
    port: async (mergedSurfaceJson: string): Promise<string> => {
      received.push(mergedSurfaceJson);
      const dist = await mkdtemp(join(tmpdir(), 'psb-publisher-dist-'));
      scenario.distDirs.push(dist);
      for (const page of FIXTURE_PAGES) {
        await mkdir(dirname(join(dist, page.path)), { recursive: true });
        await writeFile(join(dist, page.path), page.body);
      }
      await writeFile(
        join(dist, ORIGIN_RECEIPT_FILE),
        `${JSON.stringify({ schema: 1, origin: scenario.rendererOrigin }, null, 2)}\n`,
      );
      return dist;
    },
    receivedSurfaces: () => [...received],
  };
}

// ---------- scenario state ----------

export type PublishScenario = {
  clockInstant: string;
  bundle: Record<string, unknown> | null;
  bundleBuildId: string | null;
  /** null: invoke for the bundle's own build_id (the honest default). */
  invocationBuildId: string | null;
  rendererOrigin: string;
  store: RecordingStore;
  runner: RecordingRunner;
  renderer: RecordingRenderer;
  distDirs: string[];
  outcome: PublishOutcome | null;
  portFailure: unknown;
  absences: string[];
  before: StateSnapshot | null;
  // the front-door (Lambda composition root) half
  handlerEnvironment: Record<string, string>;
  handlerEvents: PublishInvocation[];
  handlerReceived: unknown[];
  handlerAnswers: unknown[];
  handlerRefusal: unknown;
};

const scenarios = new WeakMap<object, PublishScenario>();

export function scenarioState(world: object): PublishScenario {
  const state = scenarios.get(world);
  assert.ok(state, 'test bug: no scenario state; the feature-tag Before hook did not run');
  return state;
}

Before({ tags: '@feature-weather-to-site-bridge' }, function (this: object) {
  const scenario = {
    clockInstant: HOURLY_INSTANT,
    bundle: null,
    bundleBuildId: null,
    invocationBuildId: null,
    rendererOrigin: PRODUCTION_ORIGIN,
    store: recordingStore(),
    runner: recordingRunner(),
    distDirs: [],
    outcome: null,
    portFailure: null,
    absences: [],
    before: null,
    handlerEnvironment: {},
    handlerEvents: [],
    handlerReceived: [],
    handlerAnswers: [],
    handlerRefusal: null,
  } as unknown as PublishScenario;
  scenario.renderer = recordingRenderer(scenario);
  scenarios.set(this, scenario);
});

After({ tags: '@feature-weather-to-site-bridge' }, async function (this: object) {
  const state = scenarios.get(this);
  if (state === undefined) return;
  for (const dir of state.distDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- staging moves shared by the scenarios (Pillar-2 composition) ----------

export function stageBundle(
  scenario: PublishScenario,
  options: Readonly<{ buildId: string; surfDate: string; buildKind: 'dawn' | 'hourly'; publishedAt: string; clockInstant: string }>,
): void {
  scenario.clockInstant = options.clockInstant;
  scenario.bundleBuildId = options.buildId;
  scenario.bundle = regionBundleFor(options);
  scenario.store.seed(BUNDLE_KEY, JSON.stringify(scenario.bundle));
}

/** The opening move of most scenarios: Build just wrote today's hourly bundle. */
export function stageFreshBundleForToday(scenario: PublishScenario): void {
  stageBundle(scenario, {
    buildId: FRESH_BUILD_ID,
    surfDate: TODAY,
    buildKind: 'hourly',
    publishedAt: '2026-03-10T15:00:00.000Z',
    clockInstant: HOURLY_INSTANT,
  });
}

// ---------- the observable universe (Mandate 8: port-exposed names only) ----------

export const PUBLISH_UNIVERSE = ['archive.bytes', 'uploads.keys'] as const;

export function captureUniverse(scenario: PublishScenario): StateSnapshot {
  return {
    'archive.bytes': scenario.store.objectAt(STATE_KEY),
    'uploads.keys': uploadRecords(scenario.runner).map((upload) => upload.key).sort(),
  };
}

// ---------- driving the publish port ----------

function message(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error);
}

export function statedAbsence(scenario: PublishScenario): string {
  if (scenario.absences.length === 0) return '';
  return ` Stated absence: ${scenario.absences.join(' | ')}.`;
}

export async function runPublishCycle(scenario: PublishScenario): Promise<void> {
  scenario.before = captureUniverse(scenario);
  scenario.outcome = null;
  scenario.portFailure = null;
  assert.ok(
    scenario.bundle !== null && scenario.bundleBuildId !== null,
    'test bug: no bundle was staged before running the publish cycle',
  );

  let module: Record<string, unknown>;
  try {
    module = (await import(
      pathToFileURL(resolve(REPOSITORY_ROOT, 'src/pipeline/publish-site.ts')).href
    )) as Record<string, unknown>;
  } catch (error) {
    scenario.absences.push(`src/pipeline/publish-site.ts does not exist yet (${message(error)})`);
    return;
  }
  const runPublishOnce = module['runPublishOnce'];
  if (typeof runPublishOnce !== 'function') {
    scenario.absences.push('src/pipeline/publish-site.ts exists but exports no runPublishOnce function');
    return;
  }

  const deps: PublishDeps = {
    invocation: {
      build_id: scenario.invocationBuildId ?? scenario.bundleBuildId,
      bundle_key: BUNDLE_KEY,
    },
    store: scenario.store.port,
    renderer: scenario.renderer.port,
    commandRunner: scenario.runner.port,
    clock: { now: () => new Date(scenario.clockInstant) },
  };
  try {
    scenario.outcome = (await (runPublishOnce as (d: PublishDeps) => Promise<PublishOutcome>)(deps));
  } catch (error) {
    scenario.portFailure = error;
  }
}

// ---------- reading the outcome honestly ----------

export function successOf(scenario: PublishScenario, expectation: string): Extract<PublishOutcome, { published: true }> {
  if (scenario.portFailure !== null && scenario.portFailure !== undefined) {
    assert.fail(
      `WHAT: the publish cycle exploded instead of answering (${message(scenario.portFailure)}). `
        + `WHY: ${expectation}. `
        + `HOW: return a PublishOutcome from runPublishOnce; only a test-harness bug may throw here.${statedAbsence(scenario)}`,
    );
  }
  assert.ok(
    scenario.outcome !== null,
    `WHAT: the publish cycle produced no outcome at all. `
      + `WHY: ${expectation}. `
      + `HOW: implement runPublishOnce in src/pipeline/publish-site.ts (ADR weather-to-site-bridge, decision steps 1-5) and answer with a PublishOutcome.${statedAbsence(scenario)}`,
  );
  const outcome = scenario.outcome as PublishOutcome;
  assert.ok(
    outcome.published === true,
    `WHAT: the cycle refused where it had to publish: ${JSON.stringify(outcome)}. `
      + `WHY: ${expectation}. `
      + `HOW: walk merge, civil-day verify, render and PUT-only upload to completion for an honest bundle.${statedAbsence(scenario)}`,
  );
  return outcome as Extract<PublishOutcome, { published: true }>;
}

export function refusalOf(scenario: PublishScenario, expectation: string): Readonly<{ reason: string }> {
  if (scenario.portFailure !== null && scenario.portFailure !== undefined) {
    assert.fail(
      `WHAT: the publish cycle exploded instead of refusing (${message(scenario.portFailure)}). `
        + `WHY: ${expectation} — a dishonest input answers { published: false, reason }, never a thrown error, because publish.refused is derived from the outcome. `
        + `HOW: catch the guard's error inside runPublishOnce and return it as the named refusal reason.${statedAbsence(scenario)}`,
    );
  }
  assert.ok(
    scenario.outcome !== null,
    `WHAT: the publish cycle produced no outcome at all. `
      + `WHY: ${expectation}. `
      + `HOW: implement runPublishOnce in src/pipeline/publish-site.ts and answer every input, honest or not, with a PublishOutcome.${statedAbsence(scenario)}`,
  );
  const outcome = scenario.outcome as PublishOutcome;
  assert.ok(
    outcome.published === false,
    `WHAT: the cycle claims it published where it had to refuse: ${JSON.stringify(outcome)}. `
      + `WHY: ${expectation}. `
      + `HOW: refuse before doing the dishonest work; the previous surface must keep serving.${statedAbsence(scenario)}`,
  );
  const reason = (outcome as { reason?: unknown }).reason;
  assert.ok(
    typeof reason === 'string' && reason.length > 0,
    `WHAT: the refusal carries no named reason. `
      + `WHY: every refusal logs publish.refused with its reason (ADR honesty rule; feature DoD row 5). `
      + `HOW: put the guard's own message on the refusal outcome.${statedAbsence(scenario)}`,
  );
  return { reason: reason as string };
}

// ---------- the pure log derivation (log-events.ts pattern) ----------

export async function derivePublishLines(
  scenario: PublishScenario,
): Promise<readonly Record<string, unknown>[] | null> {
  let module: Record<string, unknown>;
  try {
    module = (await import(
      pathToFileURL(resolve(REPOSITORY_ROOT, 'src/pipeline/lambda/log-events.ts')).href
    )) as Record<string, unknown>;
  } catch (error) {
    scenario.absences.push(`src/pipeline/lambda/log-events.ts failed to load (${message(error)})`);
    return null;
  }
  const derive = module['derivePublishLogLines'];
  if (typeof derive !== 'function') {
    scenario.absences.push('src/pipeline/lambda/log-events.ts exports no derivePublishLogLines yet');
    return null;
  }
  return (derive as (outcome: unknown) => readonly Record<string, unknown>[])(scenario.outcome);
}

// ---------- state-delta guards over the declared universe ----------

export function assertCycleTouchedNothing(scenario: PublishScenario, why: string): void {
  assert.ok(scenario.before !== null, 'test bug: no before snapshot; the publish cycle never ran');
  try {
    assertStateDelta(scenario.before, captureUniverse(scenario), [...PUBLISH_UNIVERSE], {});
  } catch (error) {
    assert.fail(
      `WHAT: a refused cycle still mutated the observable surface (${message(error)}). `
        + `WHY: ${why}. `
        + `HOW: refuse before writing the durable archive and before a single upload; the previous pages keep serving.${statedAbsence(scenario)}`,
    );
  }
}

export function assertHappyCycleDelta(scenario: PublishScenario): void {
  assert.ok(scenario.before !== null, 'test bug: no before snapshot; the publish cycle never ran');
  try {
    assertStateDelta(scenario.before, captureUniverse(scenario), [...PUBLISH_UNIVERSE], {
      'archive.bytes': containing('"static-surface/v1"'),
      'uploads.keys': setTo(expectedUploadKeys()),
    });
  } catch (error) {
    assert.fail(
      `WHAT: the successful cycle's observable surface is not the declared delta (${message(error)}). `
        + `WHY: one honest cycle writes the merged archive once and uploads exactly the rendered pages plus their directory aliases, nothing more, nothing less. `
        + `HOW: write the merged surface at ${STATE_KEY} and reuse the checked-in publishBuild walk.${statedAbsence(scenario)}`,
    );
  }
}

// re-exported so steps compute expected archives through the REAL seam, never a copy
export { mergePublishedSurface };
export type { StaticSurface, PublishedSurfaceUpdate };
