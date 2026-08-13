import { strict as assert } from 'node:assert';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  OBSERVATION_LOG_PREFIX,
  createS3ObservationLogReader,
  type S3ObservationCommandSender,
} from '../../src/scorecard/s3-observation-reader';

const OBSERVATION_KEY = `${OBSERVATION_LOG_PREFIX}dt=2026-08-12/d1qf.jsonl.gz`;

type S3Input = Readonly<{ Prefix?: string; Key?: string }>;

class ObservationLogS3 implements S3ObservationCommandSender {
  readonly inputs: S3Input[] = [];

  constructor(private readonly objects: Readonly<Record<string, Uint8Array>>) {}

  // The fake stops at the AWS port boundary. The reader still exercises real
  // gzip bytes and strict JSONL parsing, which are its adapter responsibilities.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: any): Promise<any> {
    this.inputs.push(command.input as S3Input);
    if ('Prefix' in command.input) {
      return { Contents: Object.keys(this.objects).map((Key) => ({ Key })), IsTruncated: false };
    }
    const key = String(command.input.Key);
    const bytes = this.objects[key];
    if (bytes === undefined) throw new Error(`missing test object ${key}`);
    return { Body: { transformToByteArray: async () => bytes } };
  }
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    report_id: '01JOBSERVATION',
    spot_id: 'playa-venao',
    device_id: 'device-1',
    observed_at: '2026-08-12T18:00:00Z',
    credential_issued_at: '2026-07-01T00:00:00Z',
    received_at: '2026-08-12T18:02:00Z',
    size_band: 'waist_chest',
    quality: 'good',
    predicted: { score_q: 70 },
    ...overrides,
  };
}

describe('S3 scorecard observation reader', () => {
  it('reads real immutable gzip JSONL rows through the S3 list/get boundary and ignores the valid no-snapshot record', async () => {
    const body = `${JSON.stringify(row())}\n${JSON.stringify(row({ report_id: '01JNOFORECAST', predicted: null }))}\n`;
    const client = new ObservationLogS3({ [OBSERVATION_KEY]: gzipSync(body) });

    const reports = await createS3ObservationLogReader(client, 'surfs-up-panama-site')();

    assert.deepEqual(reports, [
      {
        spot_id: 'playa-venao',
        device_id: 'device-1',
        observed_at: '2026-08-12T18:00:00Z',
        credential_issued_at: '2026-07-01T00:00:00Z',
        received_at: '2026-08-12T18:02:00Z',
        size_band: 'waist_chest',
        quality: 'good',
        predicted: { score_q: 70 },
      },
    ]);
    expect(client.inputs[0]?.Prefix).toBe(OBSERVATION_LOG_PREFIX);
    expect(client.inputs[1]?.Key).toBe(OBSERVATION_KEY);
  });

  it('refuses a malformed immutable source instead of returning an empty counter input', async () => {
    const client = new ObservationLogS3({ [OBSERVATION_KEY]: gzipSync('{not json}\n') });

    await expect(createS3ObservationLogReader(client, 'surfs-up-panama-site')()).rejects.toThrow(
      /scorecard observation read refused: .*\(line 1 is not JSON\).*instead of replacing a real counter with zero/i,
    );
  });
});
