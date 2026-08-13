// Lambda composition root for the hourly Build run (Build schedule ->
// this handler, infra/lib/ingest-stack.ts). Wires the real, already-proven
// pipeline (src/pipeline/build.ts) to the real S3 adapter. No scoring logic
// lives here -- this file only wires storage and logs.
//
// Honesty contract this file owns: `build.success` is never logged unless
// runBuildOnce actually published (04-ingest-pipeline.md section 6: a build
// with zero usable members across every spot refuses to publish and the
// previous bundle keeps serving). deriveBuildLogLines
// (src/pipeline/lambda/log-events.ts) is the pure gate; this file's only job
// is to call it and print what it returns.

import { S3Client } from '@aws-sdk/client-s3';

import { runBuildOnce } from '../build';
import { S3Store } from '../adapters/s3-store';
import type { BuildOutcome, BuildStore, Clock } from '../ports';
import type { SpotSeed } from '../../scoring/engine';
import { deriveBuildLogLines, PUBLISH_HANDOFF_FAILED_EVENT } from './log-events';
import { bundledLaunchSeedPaths } from './bundled-launch-seed-paths';

/** The Pacific launch policy is the only published region today
 * (run-build-cli.ts's DEFAULT_REGION; the normal publication path this
 * Lambda serves). */
const REGION_ID = 'pa-pacific';

export type BuildOverrides = {
  readonly store?: BuildStore;
  readonly clock?: Clock;
  /** Tests only: bypass the bundled launch-policy files entirely. */
  readonly spots?: readonly SpotSeed[];
  readonly probePublicManifest?: (build_id: string) => Promise<void>;
  /** The only way into the Publisher: a port passed in, never a module this
   * handler reaches for. Called after the public-manifest probe and after
   * deriveBuildLogLines' lines are printed, exactly once, only when the
   * build published. A rejection is caught and written down as an
   * informational health.* line; it is never rethrown, never retried
   * in-cycle, and never changes what runBuild answers -- build.success
   * describes Build's own work, which really happened, so a publisher that
   * hangs must not be able to erase it. */
  readonly invokePublisher?: (invocation: { build_id: string; bundle_key: string }) => Promise<unknown>;
};

/** The driving port this Lambda exposes to tests, mirroring
 * fetch-handler.ts's runFetch and this repo's existing
 * run-build-cli.ts:runProductionBuild composition-root pattern. */
export async function runBuild(overrides: BuildOverrides = {}): Promise<BuildOutcome> {
  const clock = overrides.clock ?? { now: () => new Date() };
  const store = overrides.store ?? defaultStore();

  const outcome = await runBuildOnce({
    store,
    clock,
    region_id: REGION_ID,
    ...(overrides.spots !== undefined
      ? { spots: [...overrides.spots] }
      : { launchData: bundledLaunchSeedPaths }),
  });

  if (outcome.published) await (overrides.probePublicManifest ?? probePublicManifest)(outcome.build_id);

  for (const line of deriveBuildLogLines(outcome)) {
    console.log(JSON.stringify(line));
  }

  if (outcome.published) await handOverToPublisher(outcome.build_id, overrides.invokePublisher);

  return outcome;
}

/** The bundle key this build cycle really wrote, composed from the same
 * REGION_ID this file already passes to runBuildOnce -- never a second
 * hand-typed literal. Matches src/pipeline/build.ts:212 exactly. */
function publishedBundleKey(): string {
  return `pub/v1/regions/${REGION_ID}/bundle.json`;
}

async function handOverToPublisher(build_id: string, invokePublisher: BuildOverrides['invokePublisher']): Promise<void> {
  if (invokePublisher === undefined) return;
  try {
    await invokePublisher({ build_id, bundle_key: publishedBundleKey() });
  } catch (error) {
    console.log(JSON.stringify({
      event: PUBLISH_HANDOFF_FAILED_EVENT,
      build_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}

// Composition-root-only wiring. Not covered directly by a unit test, same as
// fetch-handler.ts's defaultStore: the real S3 path is proven live once
// build.success starts appearing in CloudWatch after Andres deploys.
function defaultStore(): BuildStore {
  return new S3Store(new S3Client({}), requiredEnv('BUCKET_NAME'));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`build-handler refused: WHAT env var ${name} is missing; WHY the Lambda composition root needs it wired by CDK; HOW set it on the Build function's environment in infra/lib/ingest-stack.ts.`);
  }
  return value;
}

async function probePublicManifest(build_id: string): Promise<void> {
  const origin = requiredEnv('PUBLIC_SITE_ORIGIN').replace(/\/$/, '');
  const response = await fetch(`${origin}/manifest.json?build_id=${encodeURIComponent(build_id)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`health.publish.mismatch: public manifest returned HTTP ${response.status}.`);
  const manifest = await response.json() as { build_id?: unknown };
  if (manifest.build_id !== build_id) throw new Error(`health.publish.mismatch: public manifest build ${String(manifest.build_id)} did not match ${build_id}.`);
}

export const handler = async (): Promise<{ readonly statusCode: number }> => {
  const outcome = await runBuild();
  return { statusCode: outcome.published ? 200 : 204 };
};
