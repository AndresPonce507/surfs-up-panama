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
import { AstroStaticRouteRenderer, FetchPublicManifestProbe, S3StaticSitePublisher } from '../adapters/static-site-publisher';
import type { BuildOutcome, BuildStore, Clock } from '../ports';
import type { SpotSeed } from '../../scoring/engine';
import { deriveBuildLogLines, PUBLISH_MISMATCH_EVENT } from './log-events';
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
};

/** The driving port this Lambda exposes to tests, mirroring
 * fetch-handler.ts's runFetch and this repo's existing
 * run-build-cli.ts:runProductionBuild composition-root pattern. */
export async function runBuild(overrides: BuildOverrides = {}): Promise<BuildOutcome> {
  const clock = overrides.clock ?? { now: () => new Date() };
  const store = overrides.store ?? defaultStore();

  let outcome: BuildOutcome;
  try {
    outcome = await runBuildOnce({
      store,
      clock,
      region_id: REGION_ID,
      ...(overrides.spots !== undefined
        ? { spots: [...overrides.spots] }
        : { launchData: bundledLaunchSeedPaths }),
    });
  } catch (error) {
    if (message(error).startsWith(PUBLISH_MISMATCH_EVENT)) {
      console.log(JSON.stringify({ event: PUBLISH_MISMATCH_EVENT, detail: message(error) }));
    }
    throw error;
  }

  for (const line of deriveBuildLogLines(outcome)) {
    console.log(JSON.stringify(line));
  }
  return outcome;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Composition-root-only wiring. Not covered directly by a unit test, same as
// fetch-handler.ts's defaultStore: the real S3 path is proven live once
// build.success starts appearing in CloudWatch after Andres deploys.
function defaultStore(): BuildStore {
  const client = new S3Client({});
  const bucket = requiredEnv('BUCKET_NAME');
  const store = new S3Store(client, bucket);
  const publisher = new S3StaticSitePublisher(client, bucket, new AstroStaticRouteRenderer(), new FetchPublicManifestProbe());
  return {
    getPrediction: (key) => store.getPrediction(key),
    listPredictions: (prefix) => store.listPredictions(prefix),
    getCorrection: (key) => store.getCorrection(key),
    putCallIfAbsent: (key, body) => store.putCallIfAbsent(key, body),
    putBundle: (key, body) => store.putBundle(key, body),
    publishStaticSite: (plan) => publisher.publish(plan),
    putManifest: (key, body) => store.putManifest(key, body),
    probePublicPublication: (build_id) => publisher.probe(build_id),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`build-handler refused: WHAT env var ${name} is missing; WHY the Lambda composition root needs it wired by CDK; HOW set it on the Build function's environment in infra/lib/ingest-stack.ts.`);
  }
  return value;
}

export const handler = async (): Promise<{ readonly statusCode: number }> => {
  const outcome = await runBuild();
  return { statusCode: outcome.published ? 200 : 204 };
};
