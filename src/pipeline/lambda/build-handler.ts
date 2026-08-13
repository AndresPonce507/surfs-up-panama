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

import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';

import { runBuildOnce } from '../build';
import { S3Store } from '../adapters/s3-store';
import { createS3ObservationLogReader } from '../../scorecard/s3-observation-reader';
import { emptyObservationLogReader, type ObservationLogReader } from '../../scorecard/observation-source';
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
  readonly observationLog?: ObservationLogReader;
  readonly clock?: Clock;
  /** Tests only: bypass the bundled launch-policy files entirely. */
  readonly spots?: readonly SpotSeed[];
  readonly probePublicManifest?: (build_id: string) => Promise<void>;
  /** The only way into the Publisher: a port passed in, never a module this
   * handler reaches for. Called after deriveBuildLogLines' lines are printed,
   * exactly once, only when the build published. A successful 200 answer is
   * then followed by the public-manifest probe, because fresh pages cannot
   * exist before Publisher has emitted them. A rejection is caught and written down as an
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
  const observationLog = overrides.observationLog
    ?? (overrides.store === undefined ? defaultObservationLog() : emptyObservationLogReader);

  const outcome = await runBuildOnce({
    store,
    clock,
    region_id: REGION_ID,
    observationLog,
    ...(overrides.spots !== undefined
      ? { spots: [...overrides.spots] }
      : { launchData: bundledLaunchSeedPaths }),
  });

  for (const line of deriveBuildLogLines(outcome)) {
    console.log(JSON.stringify(line));
  }

  if (outcome.published) {
    const publisherAnswer = await handOverToPublisher(outcome.build_id, overrides.invokePublisher);
    if (publisherReportedFreshPages(publisherAnswer)) {
      await (overrides.probePublicManifest ?? probePublicManifest)(outcome.build_id);
    }
  }

  return outcome;
}

/** The bundle key this build cycle really wrote, composed from the same
 * REGION_ID this file already passes to runBuildOnce -- never a second
 * hand-typed literal. Matches src/pipeline/build.ts:212 exactly. */
function publishedBundleKey(): string {
  return `pub/v1/regions/${REGION_ID}/bundle.json`;
}

async function handOverToPublisher(build_id: string, invokePublisher: BuildOverrides['invokePublisher']): Promise<unknown> {
  if (invokePublisher === undefined) return undefined;
  try {
    return await invokePublisher({ build_id, bundle_key: publishedBundleKey() });
  } catch (error) {
    console.log(JSON.stringify({
      event: PUBLISH_HANDOFF_FAILED_EVENT,
      build_id,
      reason: error instanceof Error ? error.message : String(error),
    }));
    return undefined;
  }
}

/** Only Publisher's own successful 200 answer earns an immediate public
 * verification. A 204 refusal deliberately leaves the old, honest pages in
 * place, so probing them for the fresh build would turn a stated refusal into
 * a misleading Build failure. */
function publisherReportedFreshPages(answer: unknown): boolean {
  return typeof answer === 'object'
    && answer !== null
    && 'statusCode' in answer
    && (answer as { statusCode?: unknown }).statusCode === 200;
}

// Composition-root-only wiring. Not covered directly by a unit test, same as
// fetch-handler.ts's defaultStore: the real S3 path is proven live once
// build.success starts appearing in CloudWatch after Andres deploys.
function defaultStore(): BuildStore {
  return new S3Store(new S3Client({}), requiredEnv('BUCKET_NAME'));
}

/** The live build reads immutable observations through this adapter only. */
function defaultObservationLog(): ObservationLogReader {
  return createS3ObservationLogReader(new S3Client({}), requiredEnv('BUCKET_NAME'));
}

/** The Publisher's SDK client, retries capped at ONE attempt -- load-bearing,
 * not a style choice. The CFN template's MaximumRetryAttempts: 0 governs
 * ASYNC invokes only and is inert on this synchronous RequestResponse path.
 * Left at the SDK v3 default of 3 attempts, a wedged 300 s render behind
 * reserved concurrency 1 would serialize to ~900 s, blow Build's 420 s
 * budget, and triple-bill the same failed publication. The next hourly cycle
 * is the retry policy (publication is idempotent PUT-only). */
export function publisherInvokeClient(): LambdaClient {
  return new LambdaClient({ maxAttempts: 1 });
}

type PublisherInvokeClient = Readonly<{
  send: (command: InvokeCommand) => Promise<InvokeCommandOutput>;
}>;

/** The Publisher's real caller, following defaultStore's composition pattern:
 * composed by the deployed handler, injected as overrides.invokePublisher by
 * tests. Synchronous RequestResponse -- Build's 420 s limit exists precisely
 * to cover this wait -- addressed by the PUBLISH_FUNCTION_NAME the ingest
 * stack wires beside BUCKET_NAME. A FunctionError answer (the Publisher
 * crashed without speaking for itself through publish.refused) is surfaced
 * as a rejection so handOverToPublisher writes down the failed handover. */
export function defaultInvokePublisher(
  client: PublisherInvokeClient = publisherInvokeClient(),
): NonNullable<BuildOverrides['invokePublisher']> {
  const functionName = requiredEnv('PUBLISH_FUNCTION_NAME');
  return async (invocation) => {
    const response = await client.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(JSON.stringify(invocation)),
    }));
    if (response.FunctionError !== undefined && response.FunctionError !== '') {
      const detail = response.Payload === undefined ? '' : ` ${new TextDecoder().decode(response.Payload)}`;
      throw new Error(`publisher invocation answered FunctionError ${response.FunctionError}:${detail}`);
    }
    if (response.Payload !== undefined) {
      try {
        return JSON.parse(new TextDecoder().decode(response.Payload)) as { statusCode?: unknown };
      } catch {
        // The Lambda protocol accepted the request but did not provide the
        // Publisher's typed answer. Build keeps its own success and skips the
        // fresh-page probe rather than pretending an unknown response proves
        // publication.
      }
    }
    return response;
  };
}

/** Everything the deployed handler wires that tests inject instead. Exported
 * so the composition itself is provable offline (review blocker HIGH-1: the
 * handler once called runBuild() bare and the Publisher was never invoked). */
export function productionBuildOverrides(): BuildOverrides {
  return { invokePublisher: defaultInvokePublisher() };
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
  const outcome = await runBuild(productionBuildOverrides());
  return { statusCode: outcome.published ? 200 : 204 };
};
