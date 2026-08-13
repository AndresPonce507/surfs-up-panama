// WHY-NEW-FILE: src/scoring/s3-published-call-history.ts
//   CLOSEST-EXISTING: src/scoring/published-call-history.ts
//   EXTENSION-COST: published-call-history.ts is the pure source-port reader;
//     adding AWS commands there would force its domain tests through S3.
//   PARALLEL-RATIONALE: this module is the only AWS and gzip boundary for the
//     dormant history source, while the reader stays storage-agnostic.

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';

import type { PublishedCallHistoryScope, PublishedCallHistorySource } from './published-call-history';

export type S3CommandSender = Pick<S3Client, 'send'>;

export function s3PublishedCallHistorySource(
  client: S3CommandSender,
  bucket: string,
): PublishedCallHistorySource {
  return {
    list: async (scope) => listRegionKeys(client, bucket, scope),
    read: async (key) => readGzipText(client, bucket, key),
  };
}

async function listRegionKeys(
  client: S3CommandSender,
  bucket: string,
  scope: PublishedCallHistoryScope,
): Promise<readonly string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: scope.prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of response.Contents ?? []) {
      if (object.Key !== undefined && isRegionKey(object.Key, scope.region_id)) keys.push(object.Key);
    }
    continuationToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
  } while (continuationToken !== undefined);
  return keys.sort();
}

async function readGzipText(client: S3CommandSender, bucket: string, key: string): Promise<string> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (bytes === undefined) throw new Error('published call history response had no body');
  return gunzipSync(bytes).toString('utf8');
}

function isRegionKey(key: string, regionId: string): boolean {
  return new RegExp(`^log/calls/v1/dt=\\d{4}-\\d{2}-\\d{2}/build=11Z/${escapeRegExp(regionId)}\\.jsonl\\.gz$`).test(key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
