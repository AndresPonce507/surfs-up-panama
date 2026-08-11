import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { BuildStore, IngestStore, RawArchiveRecord } from '../ports';

export type S3CommandSender = Pick<S3Client, 'send'>;

const PUB_MANIFEST_KEY = 'pub/v1/manifest.json';
const PUB_PREFIX = 'pub/';

function toBucketKey(key: string): string {
  if (key === PUB_MANIFEST_KEY) return 'manifest.json';
  return key.startsWith(PUB_PREFIX) ? key.slice(PUB_PREFIX.length) : key;
}

/** Real storage adapter. Conditional prediction/call writes preserve the
 * insert-only contract; no operation grants or performs delete. */
export class S3Store implements IngestStore, BuildStore {
  constructor(private readonly client: S3CommandSender, private readonly bucket: string) {}

  async putRaw(record: RawArchiveRecord): Promise<void> { await this.put(record.key, encodeText(record.key, record.verbatim)); }
  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> { return this.putIfAbsent(key, encodeText(key, body)); }
  async getPrediction(key: string): Promise<string | null> { return this.get(key, true); }
  async listPredictions(prefix: string): Promise<string[]> { return this.list(prefix); }
  async getCorrection(key: string): Promise<string | null> { return this.get(key, false); }
  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> { return this.putIfAbsent(key, encodeText(key, body)); }
  async putBundle(key: string, body: string): Promise<void> { await this.put(key, body); }
  async putManifest(key: string, body: string): Promise<void> { await this.put(key, body); }

  private async put(key: string, body: string | Uint8Array): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: toBucketKey(key), Body: body }));
  }

  private async putIfAbsent(key: string, body: string | Uint8Array): Promise<'created' | 'already-exists'> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: toBucketKey(key), Body: body, IfNoneMatch: '*' }));
      return 'created';
    } catch (error) {
      if (status(error) === 412 || name(error) === 'PreconditionFailed') return 'already-exists';
      throw error;
    }
  }

  private async get(key: string, gzip: boolean): Promise<string | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: toBucketKey(key) }));
      if (!gzip) return (await response.Body?.transformToString('utf8')) ?? '';
      const bytes = await response.Body?.transformToByteArray();
      return bytes === undefined ? '' : (key.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : Buffer.from(bytes).toString('utf8'));
    } catch (error) {
      if (name(error) === 'NoSuchKey' || status(error) === 404) return null;
      throw error;
    }
  }

  private async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const response = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: toBucketKey(prefix), ContinuationToken: token }));
      for (const object of response.Contents ?? []) if (object.Key !== undefined) keys.push(object.Key);
      token = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (token !== undefined);
    return keys.sort();
  }
}

function encodeText(key: string, body: string): Uint8Array { return key.endsWith('.gz') ? gzipSync(Buffer.from(body, 'utf8')) : Buffer.from(body, 'utf8'); }
function name(error: unknown): string | undefined { return typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : undefined; }
function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
  const metadata = (error as { $metadata: { httpStatusCode?: unknown } }).$metadata;
  return typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
}
