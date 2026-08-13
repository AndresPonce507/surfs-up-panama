// WHY-NEW-FILE: src/scorecard/s3-observation-reader.ts
//   CLOSEST-EXISTING: src/pipeline/adapters/s3-store.ts
//   EXTENSION-COST: extending S3Store would broaden the Build storage port
//     with scorecard parsing and make the generic adapter own domain DTOs.
//   PARALLEL-RATIONALE: this is the scorecard's read-only ACL from immutable
//     observation-log bytes to its SurfReport port, with no write capability.

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { gunzipSync } from 'node:zlib';

import type { SurfReport } from './pairing';
import type { ObservationLogReader } from './observation-source';

export const OBSERVATION_LOG_PREFIX = 'log/observations/v1/';

/** The narrow AWS boundary the adapter needs. */
export type S3ObservationCommandSender = Pick<S3Client, 'send'>;

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isoInstant = (value: unknown): value is string =>
  nonEmptyText(value) && Number.isFinite(new Date(value).valueOf());

const malformed = (key: string, detail: string): Error =>
  new Error(
    `scorecard observation read refused: ${key} is malformed (${detail}). ` +
      'The build stops instead of replacing a real counter with zero.',
  );

const listedButMissing = (key: string): Error =>
  new Error(
    `scorecard observation read refused: ${key} was listed but could not be read. ` +
      'The build stops instead of replacing a real counter with zero.',
  );

function reportFromRow(key: string, lineNumber: number, row: unknown): SurfReport | null {
  if (!isRecord(row)) throw malformed(key, `line ${lineNumber} is not a JSON object`);
  const requiredText = [
    'spot_id',
    'device_id',
    'size_band',
    'quality',
  ] as const;
  for (const field of requiredText) {
    if (!nonEmptyText(row[field])) throw malformed(key, `line ${lineNumber} has no non-empty ${field}`);
  }
  for (const field of ['observed_at', 'credential_issued_at', 'received_at'] as const) {
    if (!isoInstant(row[field])) throw malformed(key, `line ${lineNumber} has no valid ISO ${field}`);
  }
  const predicted = row.predicted;
  if (predicted === null) return null;
  if (!isRecord(predicted) || !finiteNumber(predicted.score_q)) {
    throw malformed(key, `line ${lineNumber} has no finite predicted.score_q or explicit null`);
  }
  return {
    spot_id: row.spot_id as string,
    device_id: row.device_id as string,
    observed_at: row.observed_at as string,
    size_band: row.size_band as string,
    quality: row.quality as string,
    credential_issued_at: row.credential_issued_at as string,
    received_at: row.received_at as string,
    predicted: { score_q: predicted.score_q },
  };
}

function reportsFromObject(key: string, bytes: Uint8Array): readonly SurfReport[] {
  let body: string;
  try {
    body = gunzipSync(bytes).toString('utf8');
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw malformed(key, `gzip cannot be decoded: ${detail}`);
  }

  return body.split('\n').flatMap((line, index) => {
    if (line.trim() === '') return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw malformed(key, `line ${index + 1} is not JSON`);
    }
    const report = reportFromRow(key, index + 1, parsed);
    return report === null ? [] : [report];
  });
}

async function listAllKeys(client: S3ObservationCommandSender, bucket: string): Promise<readonly string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: OBSERVATION_LOG_PREFIX,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      if (object.Key === undefined) throw malformed(OBSERVATION_LOG_PREFIX, 'S3 listed an object without a key');
      keys.push(object.Key);
    }
    continuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (continuationToken !== undefined);
  return keys.sort();
}

async function readObject(client: S3ObservationCommandSender, bucket: string, key: string): Promise<readonly SurfReport[]> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (bytes === undefined) throw listedButMissing(key);
  return reportsFromObject(key, bytes);
}

/**
 * Production read adapter. It lists and gets only immutable observation
 * objects. Empty list is the honest day-one answer; every unavailable or
 * malformed object rejects so the previous published page remains standing.
 */
export const createS3ObservationLogReader = (
  client: S3ObservationCommandSender,
  bucket: string,
): ObservationLogReader => async () => {
  const keys = await listAllKeys(client, bucket);
  const reports = await Promise.all(keys.map((key) => readObject(client, bucket, key)));
  return reports.flat();
};
