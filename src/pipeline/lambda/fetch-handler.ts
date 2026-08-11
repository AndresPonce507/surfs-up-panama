import { S3Client } from '@aws-sdk/client-s3';

import { OpenMeteoForecastSource } from '../adapters/open-meteo-source';
import { S3Store } from '../adapters/s3-store';
import { loadLaunchSpotCoordinates } from '../adapters/spot-coordinates';
import { runIngestOnce } from '../ingest';
import type { Clock, ForecastSource, IngestOutcome, IngestStore } from '../ports';
import type { SpotSeed } from '../../scoring/engine';
import { bundledLaunchSeedPaths } from './bundled-launch-seed-paths';
import { deriveIngestLogLines } from './log-events';

export type FetchOverrides = { readonly source?: ForecastSource; readonly store?: IngestStore; readonly clock?: Clock; readonly spots?: readonly SpotSeed[] };

export async function runFetch(overrides: FetchOverrides = {}): Promise<IngestOutcome> {
  const clock = overrides.clock ?? { now: () => new Date() };
  const store = overrides.store ?? new S3Store(new S3Client({}), requiredEnv('BUCKET_NAME'));
  const source = overrides.source ?? (() => {
    const coordinates = loadLaunchSpotCoordinates(bundledLaunchSeedPaths.sourceSeedPath, bundledLaunchSeedPaths.policyPath);
    return new OpenMeteoForecastSource(new Map(coordinates.map((item) => [item.spot_id, item])), clock);
  })();
  const outcome = await runIngestOnce({ source, store, clock, ...(overrides.spots === undefined ? { launchData: bundledLaunchSeedPaths } : { spots: [...overrides.spots] }) });
  for (const line of deriveIngestLogLines(outcome)) console.log(JSON.stringify(line));
  return outcome;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`fetch-handler refused: missing ${name}; set it on the Fetch function in infra/lib/ingest-stack.ts.`);
  return value;
}

export const handler = async (): Promise<{ readonly statusCode: number }> => ({ statusCode: (await runFetch()).completed ? 200 : 500 });
