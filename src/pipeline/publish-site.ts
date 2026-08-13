// The bounded Publisher's driving port (ADR weather-to-site-bridge, decision
// steps 1-5): what Build's synchronous invoke resolves to
// (src/pipeline/lambda/publish-handler.ts, step 01-02, calls this). Walks the
// build_id identity check, the real surface merge, the Panama civil-day rule
// against an injected clock, the real render, and the checked-in PUT-only
// publication walk -- through injected ports only. Nothing here reads the
// ambient clock or touches the filesystem directly
// (contract:declared-inputs-not-ambient-reads, src/pipeline/ports.ts).
//
// Reuse is load-bearing (feature-delta.md): `mergePublishedSurface`,
// `assertStrictTwoDayUpdate` and `assertCurrentCivilDay` come from
// src/publish/static-surface.ts; `publishBuild` (directory-alias
// double-write, content types, no-cache, the origin-receipt guard) comes
// from the checked-in scripts/preview/publish-preview.mjs; the production
// target comes from scripts/release/publication-target.mjs. None of them are
// reimplemented here.
//
// Every dishonest input -- wrong civil day, wrong origin receipt, wrong
// build_id, a broken upload mid-batch -- resolves `{ published: false,
// reason }` rather than throwing, so Build can derive `publish.refused`
// (log-events.ts) from the outcome alone.

import { publishBuild } from '../../scripts/preview/publish-preview.mjs';
import { PUBLICATION_TARGETS } from '../../scripts/release/publication-target.mjs';
import {
  assertCurrentCivilDay,
  assertStrictTwoDayUpdate,
  mergePublishedSurface,
  type StaticSurface,
} from '../publish/static-surface';

/** The durable archive of record (ADR decision 2): dawn receipts survive cold starts here. */
export const PUBLISHED_SURFACE_STATE_KEY = 'site/published-surface.json';

/** The bridge publishes production only; the target is fixed by decision, never injected. */
const PUBLICATION_TARGET = PUBLICATION_TARGETS.production;

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

type RegionBundleEnvelope = Readonly<{ build_id: string; publish_surface: unknown }>;

export async function runPublishOnce(deps: PublishDeps): Promise<PublishOutcome> {
  try {
    const bundle = await readBundle(deps.store, deps.invocation.bundle_key);
    assertRequestedBuild(deps.invocation, bundle.build_id);

    const previous = await readDurableArchive(deps.store);
    const merged = mergePublishedSurface(previous, assertStrictTwoDayUpdate(bundle.publish_surface));
    assertCurrentCivilDay(merged, deps.clock.now());

    const distDir = await deps.renderer(JSON.stringify(merged));
    const { canonical, directoryAliases } = await publishBuild(
      { target: PUBLICATION_TARGET, distDir, origin: PUBLICATION_TARGET.origin },
      deps.commandRunner,
    );

    // The archive of record is written only once every put has actually
    // landed: a cycle that refuses on the origin receipt or dies mid-batch
    // must leave it byte-identical, not just leave the public pages stale.
    await deps.store.put(PUBLISHED_SURFACE_STATE_KEY, JSON.stringify(merged));

    return {
      published: true,
      build_id: bundle.build_id,
      uploaded_objects: canonical,
      directory_aliases: directoryAliases,
    };
  } catch (error) {
    return { published: false, reason: message(error) };
  }
}

async function readBundle(store: PublishStorePort, bundleKey: string): Promise<RegionBundleEnvelope> {
  const raw = await store.get(bundleKey);
  const value = raw === null ? null : (JSON.parse(raw) as unknown);
  if (!isRecord(value) || typeof value.build_id !== 'string') {
    throw new Error(
      `WHAT no well-formed region bundle is get-able at ${bundleKey}; WHY the publisher can only verify and merge a bundle carrying its own build_id;`,
    );
  }
  return { build_id: value.build_id, publish_surface: value.publish_surface };
}

function assertRequestedBuild(invocation: PublishInvocation, bundleBuildId: string): void {
  if (bundleBuildId !== invocation.build_id) {
    throw new Error(
      `WHAT the bundle at ${invocation.bundle_key} carries build ${bundleBuildId}, not the requested ${invocation.build_id}; `
        + `WHY the publisher never publishes a bundle it was not asked to publish;`,
    );
  }
}

async function readDurableArchive(store: PublishStorePort): Promise<StaticSurface | null> {
  const raw = await store.get(PUBLISHED_SURFACE_STATE_KEY);
  return raw === null ? null : (JSON.parse(raw) as StaticSurface);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
