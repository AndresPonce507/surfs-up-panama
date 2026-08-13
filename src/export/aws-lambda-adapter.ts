// Imperative shell for the scheduled nightly observation export.
//
// WHY-NEW-FILE: src/export/aws-lambda-adapter.ts
//   CLOSEST-EXISTING: src/report/aws-lambda-adapter.ts
//   EXTENSION-COST: that file is the shell for the two write Function URLs. It
//     composes an SSM secret, a spot index and a WRITE capability, and it is
//     read-only authority for this lane. Sharing it would mean one module whose
//     composition holds both the report handler's write store and this job's
//     read-only reader, and the deployed roles differ in exactly that.
//   PARALLEL-RATIONALE: different deployment unit and an incompatible
//     dependency set -- this is a separate Lambda with its own role, its own
//     bundle, no SSM parameter and no HTTP event at all. Its handler signature
//     is a schedule tick, not a Function URL request.
//
// Composition is lazy and memoized rather than started at module load, which
// is the one place this deliberately differs from the report shell. That shell
// composes at load because a cold 128 MB Function URL could not fit four SDK
// imports inside a 5 s timeout. This job runs once a night on 512 MB with 120 s
// and nobody waiting, so the simpler shape wins -- and a composition that
// fails is forgotten rather than cached, so the next tick gets a clean try
// instead of a container that has poisoned itself for its whole lifetime.

import { loadLaunchSpotCoordinates } from '../pipeline/adapters/spot-coordinates';
import { S3Store } from '../pipeline/adapters/s3-store';
import { createAwsStoredItemReader, type DynamoScanCommandSet } from './aws-item-reader';
import { runExport } from './run-export';
import type { DynamoDocumentClient } from '../report/aws-write-store';
import type { ExportDeps, ExportOutcome } from './ports';

/**
 * Every launch-seed row declares `America/Panama`, and the abuse signals are
 * bucketed by that zone's civil day (07-write-path.md section 7.4). Stated here
 * rather than read, so the core stays a pure function of what it was handed;
 * src/pipeline/build.ts falls back to the same literal.
 */
const SEED_TIMEZONE = 'America/Panama';

type Constructor = new (input?: Record<string, unknown>) => unknown;
type SdkModule = Record<string, Constructor | { from(client: unknown): DynamoDocumentClient }>;

let composition: Promise<ExportDeps> | null = null;

/** One scheduled tick: close the day that just ended. */
export async function handler(): Promise<ExportOutcome> {
  return runExport(await composed());
}

/**
 * The one place in this lane with side effects, and the one place that adapts.
 *
 * A composition that fails is forgotten rather than kept: a container that had
 * cached a rejected promise would refuse every remaining tick of its life for a
 * reason that had already been fixed.
 */
async function composed(): Promise<ExportDeps> {
  composition ??= createComposition();
  try {
    return await composition;
  } catch (error) {
    composition = null;
    throw error;
  }
}

/**
 * Everything one night is handed, assembled from the environment.
 *
 * Exported so the assembly itself can be exercised without AWS: the SDK
 * clients resolve region and credentials when a command is SENT, not when they
 * are built, so composing is a pure enough act to test. The one part that
 * genuinely reads the world is the launch seed, and a composition that came
 * back without the beaches would kill the night at the first report it could
 * not tile -- on a schedule whose write-once keys make night one unrepairable.
 */
export async function createComposition(): Promise<ExportDeps> {
  const tableName = requiredEnvironment('WRITE_STORE_TABLE');
  const bucket = requiredEnvironment('SITE_BUCKET');
  const [dynamo, document, s3] = await Promise.all([
    loadSdk('@aws-sdk/client-dynamodb'),
    loadSdk('@aws-sdk/lib-dynamodb'),
    loadSdk('@aws-sdk/client-s3'),
  ]);
  const DynamoDBClient = constructor(dynamo, 'DynamoDBClient');
  const DynamoDBDocumentClient = document['DynamoDBDocumentClient'] as { from(client: unknown): DynamoDocumentClient };
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const commands: DynamoScanCommandSet = { ScanCommand: constructor(document, 'ScanCommand') };
  const S3Client = constructor(s3, 'S3Client');
  const store = new S3Store(new S3Client({}) as ConstructorParameters<typeof S3Store>[0], bucket);

  // The two write capabilities are handed over separately and each is exactly
  // one method wide, so a run can reach neither the rest of the storage
  // adapter nor the other prefix's business. It mirrors the deployed role,
  // which grants s3:PutObject on those two prefixes and nothing else.
  return {
    store: createAwsStoredItemReader(documentClient, commands, tableName),
    log: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
    signals: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
    clock: { now: () => new Date() },
    // The seed files ride in the bundle: esbuild does not follow a runtime
    // readFileSync, so the CDK asset copies them (step 01-03's packaging hook).
    spots: loadLaunchSpotCoordinates(),
    timezone: SEED_TIMEZONE,
  };
}

async function loadSdk(name: string): Promise<SdkModule> {
  return import(name) as Promise<SdkModule>;
}

function constructor(module: SdkModule, name: string): Constructor {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new Error(
      `observation export refused: WHAT the ${name} SDK constructor is unavailable; `
      + 'WHY the night cannot be read from or written to without it; '
      + 'HOW check the Lambda bundle actually carries the AWS SDK modules this handler imports.',
    );
  }
  return value as Constructor;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `observation export refused: WHAT ${name} is unset; `
      + 'WHY a scheduled export that ran without it would write nothing and look exactly like a night with no reports; '
      + `HOW set ${name} on the export function in infra/lib/write-stack.ts and redeploy.`,
    );
  }
  return value;
}
