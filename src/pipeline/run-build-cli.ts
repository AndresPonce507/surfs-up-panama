// The missing production caller for runBuildOnce (src/pipeline/build.ts).
// Before this file, runBuildOnce had no caller outside tests: nothing ever
// wired real adapters to it, so nothing could regenerate the reading surface.
//
// Composition root only: real filesystem adapters, the real 20-spot launch
// policy (loadLaunchSpotSeeds' default, unless a test overrides it), and an
// explicit build instant for determinism. Emits the region-bundle/1 JSON at
// `<work-dir>/pub/v1/regions/<region>/bundle.json`, which is exactly the
// shape `npm run publish:surface -- --input <path>` already expects (its
// publishedUpdate() reads either a bare PublishedSurfaceUpdate or a
// RegionBundle's `.publish_surface`).
//
// --at is required, not defaulted to the wall clock: runBuildOnce reads
// deps.clock.now() to pick the civil date and the dawn/hourly build_kind
// (hour === '11' is dawn, build.ts), and mergePublishedSurface only retains
// a dawn receipt when build_kind is 'dawn'. A pinned instant is what makes a
// rerun byte-reproducible and testable; the real wall clock is not.
//
// Usage:
//   npm run pipeline:build -- --at 2026-08-09T11:22:00Z
//   npm run pipeline:build -- --at <ISO-8601> [--predictions <dir>] [--work-dir <dir>] [--region <id>]

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { PublishedCallHistoryFailure, runBuildOnce } from './build';
import { FilesystemStore } from './adapters/filesystem-store';
import type { BuildStore, PublishedCallHistoryProbe, PublishedCallHistoryScope } from './ports';
import type { SpotSeed } from '../scoring/engine';

const DEFAULT_PREDICTIONS_ROOT = 'data/predictions-capture';
const DEFAULT_WORK_DIR = '.pipeline-out';
const DEFAULT_REGION = 'pa-pacific';

export function composeBuildStore(predictionsRoot: string, workDir: string): BuildStore {
  const archive = new FilesystemStore(predictionsRoot);
  const outputs = new FilesystemStore(workDir);
  return {
    getPrediction: (key) => archive.getPrediction(key),
    listPredictions: (prefix) => archive.listPredictions(prefix),
    getCorrection: (key) => archive.getCorrection(key),
    listPublishedCallKeys: (scope) => archive.listPublishedCallKeys(scope),
    getPublishedCall: (key) => archive.getPublishedCall(key),
    probePublishedCallHistory: (scope) => archive.probePublishedCallHistory(scope),
    putCallIfAbsent: (key, body) => archive.putCallIfAbsent(key, body),
    putBundle: (key, body) => outputs.putBundle(key, body),
    putManifest: (key, body) => outputs.putManifest(key, body),
  };
}

export type HealthStartupRefused = {
  readonly type: 'health.startup.refused';
  readonly component: 'published_call_history';
  readonly scope: PublishedCallHistoryScope;
  readonly reason: 'unavailable' | 'malformed';
};

export class ProductionBuildRefused extends Error {
  constructor(readonly event: HealthStartupRefused) {
    super(event.type);
  }
}

export type ProductionBuildOverrides = {
  readonly spots?: readonly SpotSeed[];
};

export async function runProductionBuild(
  argv: readonly string[],
  overrides: ProductionBuildOverrides = {},
): Promise<{ readonly bundlePath: string }> {
  const at = option(argv, '--at');
  if (at === null || Number.isNaN(Date.parse(at))) {
    throw new Error(
      'pipeline:build refused: WHAT missing or invalid --at <ISO-8601>; WHY the build instant picks the civil date and the dawn/hourly build kind, and a pinned instant is what makes a rerun byte-reproducible and testable, unlike the wall clock; HOW run npm run pipeline:build -- --at 2026-08-09T11:22:00Z.',
    );
  }
  const region_id = option(argv, '--region') ?? DEFAULT_REGION;
  const predictionsRoot = resolve(option(argv, '--predictions') ?? DEFAULT_PREDICTIONS_ROOT);
  const workDir = resolve(option(argv, '--work-dir') ?? DEFAULT_WORK_DIR);
  const store = composeBuildStore(predictionsRoot, workDir);
  const clock = { now: () => new Date(at) };
  const scope: PublishedCallHistoryScope = { region_id, prefix: 'log/calls/v1/' };
  const probe = await store.probePublishedCallHistory(scope);
  if (!probe.ok) throw new ProductionBuildRefused(refusedHistory(scope, probe));

  let outcome;
  try {
    outcome = await runBuildOnce({
      store,
      clock,
      region_id,
      ...(overrides.spots !== undefined ? { spots: [...overrides.spots] } : {}),
    });
  } catch (error) {
    if (error instanceof PublishedCallHistoryFailure) throw new ProductionBuildRefused({
      type: 'health.startup.refused', component: 'published_call_history', scope, reason: error.reason,
    });
    throw error;
  }
  if (!outcome.published) {
    throw new Error(
      `pipeline:build refused: WHAT the build did not publish (${outcome.reason}); WHY runBuildOnce requires at least one usable wave member per spot, across both civil days; HOW capture real predictions first with npm run pipeline:capture, or point --predictions at a directory that already has them (checked: ${predictionsRoot}).`,
    );
  }
  return { bundlePath: resolve(workDir, `pub/v1/regions/${region_id}/bundle.json`) };
}

function refusedHistory(scope: PublishedCallHistoryScope, probe: Exclude<PublishedCallHistoryProbe, { ok: true }>): HealthStartupRefused {
  return { type: 'health.startup.refused', component: 'published_call_history', scope, reason: probe.reason };
}

function option(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

const invokedAsCli = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  try {
    const { bundlePath } = await runProductionBuild(process.argv.slice(2));
    console.log(`pipeline:build: published ${bundlePath}`);
  } catch (error) {
    if (error instanceof ProductionBuildRefused) console.error(JSON.stringify(error.event));
    else console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
