// S3 adapter for the learning ports. This is deliberately separate from the
// core: the core sees only list/get/put functions and cannot import AWS.

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';

import type { LearningRuntimeStore } from './learning-lambda-adapter';

export type S3LearningCommandSender = Pick<S3Client, 'send'>;

export class S3LearningStore implements LearningRuntimeStore {
  constructor(
    private readonly client: S3LearningCommandSender,
    private readonly bucket: string,
  ) {}

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const object of response.Contents ?? []) {
        if (object.Key !== undefined) keys.push(object.Key);
      }
      continuationToken = response.IsTruncated === true
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken !== undefined);
    return keys.sort();
  }

  async get(key: string): Promise<string | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      const bytes = await response.Body?.transformToByteArray();
      if (bytes === undefined) return '';
      return key.endsWith('.gz')
        ? gunzipSync(bytes).toString('utf8')
        : Buffer.from(bytes).toString('utf8');
    } catch (error) {
      if (isMissingKey(error)) return null;
      throw error;
    }
  }

  async put(key: string, body: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
    }));
  }
}

function isMissingKey(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const named = 'name' in error ? String(error.name) : undefined;
  const status = '$metadata' in error
    && typeof error.$metadata === 'object'
    && error.$metadata !== null
    && 'httpStatusCode' in error.$metadata
    ? error.$metadata.httpStatusCode
    : undefined;
  return named === 'NoSuchKey' || status === 404;
}
