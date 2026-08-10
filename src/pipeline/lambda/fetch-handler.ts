// Lambda composition root for the hourly Fetch run (EventBridge Scheduler
// `surfs-up-panama-hourly` at :17 -> this handler, infra/lib/ingest-stack.ts).
// Wires the real, already-proven pipeline (src/pipeline/ingest.ts) to real
// adapters: Open-Meteo over the network for wave/wind/tide, S3 for the raw
// archive and the prediction log. No forecasting logic lives here -- this
// file only wires and logs.
//
// Honesty contract this file owns: `ingest.success` is never logged unless
// the run genuinely produced or confirmed at least one durable prediction
// row (src/pipeline/lambda/log-events.ts's deriveIngestLogLines is the pure
// gate; this file's only job is to call it and print what it returns).

import { S3Client } from '@aws-sdk/client-s3';

import { runIngestOnce } from '../ingest';
import { S3Store } from '../adapters/s3-store';
import { OpenMeteoForecastSource } from '../adapters/open-meteo-source';
import { loadLaunchSpotCoordinates } from '../adapters/spot-coordinates';
import type { Clock, ForecastSource, IngestOutcome, IngestStore } from '../ports';
import type { SpotSeed } from '../../scoring/engine';
import { deriveIngestLogLines } from './log-events';
import { bundledLaunchSeedPaths } from './bundled-launch-seed-paths';

export type FetchOverrides = {
  readonly source?: ForecastSource;
  readonly store?: IngestStore;
  readonly clock?: Clock;
  /** Tests only: bypass the bundled launch-policy files entirely. */
  readonly spots?: readonly SpotSeed[];
};

/** The driving port this Lambda exposes to tests: real pipeline code, real
 * log honesty gate, adapters injected so no test needs network or AWS
 * credentials (mirrors capture-cli.ts's runCapture / run-build-cli.ts's
 * runProductionBuild composition-root pattern already used in this repo). */
export async function runFetch(overrides: FetchOverrides = {}): Promise<IngestOutcome> {
  const clock = overrides.clock ?? { now: () => new Date() };
  const store = overrides.store ?? defaultStore();
  const source = overrides.source ?? defaultSource(clock);

  const outcome = await runIngestOnce({
    source,
    store,
    clock,
    ...(overrides.spots !== undefined
      ? { spots: [...overrides.spots] }
      : { launchData: bundledLaunchSeedPaths }),
  });

  for (const line of deriveIngestLogLines(outcome)) {
    console.log(JSON.stringify(line));
  }
  return outcome;
}

// Composition-root-only wiring below. Not covered directly by a unit test,
// same as capture-cli.ts's own `defaultSource`: the real network/AWS path is
// proven live once ingest.success and provider.error start appearing in
// CloudWatch after Andres deploys, not by an offline test.
function defaultStore(): IngestStore {
  return new S3Store(new S3Client({}), requiredEnv('BUCKET_NAME'));
}

function defaultSource(clock: Clock): ForecastSource {
  const coordinates = loadLaunchSpotCoordinates(bundledLaunchSeedPaths.sourceSeedPath, bundledLaunchSeedPaths.policyPath);
  const bySpotId = new Map(coordinates.map((coordinate) => [coordinate.spot_id, coordinate]));
  return new OpenMeteoForecastSource(bySpotId, clock);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`fetch-handler refused: WHAT env var ${name} is missing; WHY the Lambda composition root needs it wired by CDK; HOW set it on the Fetch function's environment in infra/lib/ingest-stack.ts.`);
  }
  return value;
}

export const handler = async (): Promise<{ readonly statusCode: number }> => {
  const outcome = await runFetch();
  return { statusCode: outcome.completed ? 200 : 500 };
};
