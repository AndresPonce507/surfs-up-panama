// Real S3 adapter for IngestStore + BuildStore, the production counterpart
// to FilesystemStore (adapters/filesystem-store.ts): same port contracts,
// same conditional-write semantics, real S3 as the substrate instead of the
// local disk. This is the storage seam the ports were built for
// (src/pipeline/ports.ts: "Storage capabilities are deliberately split").
//
// Conditional-write semantics ride on S3's real `IfNoneMatch: '*'` PUT
// header (system-architecture.md section 5, 04-ingest-pipeline.md section
// 7): the first writer of a key wins; a duplicate write gets HTTP 412
// PreconditionFailed, treated here as a verified duplicate acknowledgement,
// never an overwrite.
//
// Key mapping: the pipeline's local FilesystemStore convention roots build
// output under `pub/` (composeBuildStore in run-build-cli.ts, so the local
// working directory never collides with the committed predictions capture).
// The deployed bucket's IAM grants (infra/lib/ingest-stack.ts) never mention
// `pub/*` -- Build may write `v1/*`, `site/*`, `assets/*`, `log/*` and the
// LITERAL key `manifest.json` (bucket root, not `v1/manifest.json`). The two
// keys build.ts hardcodes map onto two different granted prefixes, so this
// is an explicit table, not a single prefix strip: `pub/v1/regions/...`
// loses only its `pub/` root (lands under the `v1/*` grant), while
// `pub/v1/manifest.json` loses its whole `pub/v1/` root (lands on the exact
// `manifest.json` grant). build.ts itself never needs to know it is talking
// to S3.

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import type { BuildStore, IngestStore } from '../ports';

/** The narrow slice of the real S3 client this adapter calls, so a test can
 * inject a fake `send` without ever touching AWS credentials or the network
 * (nw-hexagonal-testing: mock only at the port boundary). */
export type S3CommandSender = Pick<S3Client, 'send'>;

const PUB_MANIFEST_KEY = 'pub/v1/manifest.json';
const PUB_PREFIX = 'pub/';

function toBucketKey(key: string): string {
  if (key === PUB_MANIFEST_KEY) return 'manifest.json';
  return key.startsWith(PUB_PREFIX) ? key.slice(PUB_PREFIX.length) : key;
}

export class S3Store implements IngestStore, BuildStore {
  constructor(
    private readonly client: S3CommandSender,
    private readonly bucket: string,
  ) {}

  async putRaw(key: string, body: string): Promise<void> {
    await this.put(key, body);
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.get(key);
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return this.list(prefix);
  }

  async getCorrection(key: string): Promise<string | null> {
    return this.get(key);
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async putBundle(key: string, body: string): Promise<void> {
    await this.put(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    await this.put(key, body);
  }

  private async put(key: string, body: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: toBucketKey(key), Body: body }));
  }

  private async putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: toBucketKey(key),
        Body: body,
        IfNoneMatch: '*',
      }));
      return 'created';
    } catch (error) {
      if (isPreconditionFailed(error)) return 'already-exists';
      throw error;
    }
  }

  private async get(key: string): Promise<string | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: toBucketKey(key) }));
      return (await response.Body?.transformToString('utf8')) ?? '';
    } catch (error) {
      if (isMissingKey(error)) return null;
      throw error;
    }
  }

  private async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: toBucketKey(prefix),
        ContinuationToken: continuationToken,
      }));
      for (const object of response.Contents ?? []) {
        if (object.Key !== undefined) keys.push(object.Key);
      }
      continuationToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return keys.sort();
  }
}

function isPreconditionFailed(error: unknown): boolean {
  return errorStatusCode(error) === 412 || errorName(error) === 'PreconditionFailed';
}

function isMissingKey(error: unknown): boolean {
  return errorName(error) === 'NoSuchKey' || errorStatusCode(error) === 404;
}

function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : undefined;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
  const metadata = (error as { $metadata: unknown }).$metadata;
  if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) return undefined;
  const statusCode = (metadata as { httpStatusCode: unknown }).httpStatusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}
