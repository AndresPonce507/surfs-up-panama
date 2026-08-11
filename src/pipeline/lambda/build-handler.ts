import { S3Client } from '@aws-sdk/client-s3';

import { S3Store } from '../adapters/s3-store';
import { runBuildOnce } from '../build';
import type { BuildOutcome, BuildStore, Clock } from '../ports';
import type { SpotSeed } from '../../scoring/engine';
import { bundledLaunchSeedPaths } from './bundled-launch-seed-paths';
import { deriveBuildLogLines } from './log-events';

const REGION_ID = 'pa-pacific';
export type BuildOverrides = { readonly store?: BuildStore; readonly clock?: Clock; readonly spots?: readonly SpotSeed[] };

export async function runBuild(overrides: BuildOverrides = {}): Promise<BuildOutcome> {
  const clock = overrides.clock ?? { now: () => new Date() };
  const store = overrides.store ?? new S3Store(new S3Client({}), requiredEnv('BUCKET_NAME'));
  const outcome = await runBuildOnce({ store, clock, region_id: REGION_ID, ...(overrides.spots === undefined ? { launchData: bundledLaunchSeedPaths } : { spots: [...overrides.spots] }) });
  for (const line of deriveBuildLogLines(outcome)) console.log(JSON.stringify(line));
  return outcome;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`build-handler refused: missing ${name}; set it on the Build function in infra/lib/ingest-stack.ts.`);
  return value;
}

export const handler = async (): Promise<{ readonly statusCode: number }> => ({ statusCode: (await runBuild()).published ? 200 : 204 });
