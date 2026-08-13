// What the DEPLOYED storage adapter actually puts on the wire when the nightly
// export appends to the observation log.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// The acceptance scenario proves real gzip bytes through the filesystem twin,
// on a real disk. This file proves the same two claims on the S3 adapter that
// production runs, because they are two separate `encodeText` copies and only
// one of them is the one the learning lane will ever read from. The S3 client
// is faked at the SDK boundary and nowhere further in: the assertions are on
// the exact PutObjectCommand input the adapter builds.
//
// Three things are asserted that a round-trip could not tell you:
//   - the BYTES under a `.gz` key start 0x1f 0x8b and gunzip to what was
//     written. `S3Store.getGzip` gunzips unconditionally on the suffix, so
//     plain text under that name throws on the only production read path that
//     exists -- and a read-back through the filesystem twin would NOT catch it,
//     because that twin tolerates plain text for the legacy capture.
//   - the key is handed through unchanged. `toBucketKey` strips a leading
//     `pub/`; the export's keys start `log/` and `ops/`, so they must arrive
//     exactly as written or the object lands outside the prefix the export's
//     IAM grant covers.
//   - the put is conditional. The log is immutable; a put without
//     `IfNoneMatch: '*'` would silently overwrite a sealed night.

import assert from 'node:assert/strict';

import { gunzipSync } from 'node:zlib';
import { describe, it } from 'vitest';

import { S3Store, type S3CommandSender } from '../../src/pipeline/adapters/s3-store';

const OBSERVATION_KEY = 'log/observations/v1/dt=2026-08-12/d1qf.jsonl.gz';
const SIGNALS_KEY = 'ops/abuse-signals/v1/dt=2026-08-12.json';

type PutInput = {
  readonly Bucket?: string;
  readonly Key?: string;
  readonly Body?: Uint8Array | string;
  readonly IfNoneMatch?: string;
};

/** The SDK boundary and nothing deeper: it records what it was asked to send. */
class RecordingS3 implements S3CommandSender {
  readonly puts: PutInput[] = [];

  constructor(private readonly refuseWith: unknown = null) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: any): Promise<any> {
    this.puts.push(command.input as PutInput);
    if (this.refuseWith !== null) throw this.refuseWith;
    return {};
  }
}

function bytesOf(input: PutInput): Buffer {
  assert.ok(input.Body !== undefined, 'the adapter sent no body at all');
  return Buffer.from(input.Body as Uint8Array);
}

describe('the deployed storage adapter appending to the observation log', () => {
  // covers: R9a R3
  it('sends real gzip under the .gz key, plain text under the .json key, and both under the exact key it was given', async () => {
    const client = new RecordingS3();
    const store = new S3Store(client, 'surfs-up-panama-site');
    const rows = '{"report_id":"01JROW"}\n{"report_id":"01JROW2"}\n';
    const signals = '{\n  "dt": "2026-08-12"\n}\n';

    assert.equal(await store.appendLogIfAbsent(OBSERVATION_KEY, rows), 'created');
    assert.equal(await store.appendLogIfAbsent(SIGNALS_KEY, signals), 'created');

    const [observations, ops] = client.puts;
    assert.ok(observations !== undefined && ops !== undefined, 'the adapter sent two objects');

    assert.equal(
      observations.Key,
      OBSERVATION_KEY,
      'the export writes under log/, which is not under pub/, so toBucketKey must hand the key through untouched or the object lands outside the prefix its IAM grant names.',
    );
    assert.deepEqual(
      [bytesOf(observations)[0], bytesOf(observations)[1]],
      [0x1f, 0x8b],
      'a .gz key carries real gzip on the production path. S3Store.getGzip gunzips unconditionally on the suffix, so plain text under that name throws on the only production read path that exists.',
    );
    assert.equal(
      gunzipSync(bytesOf(observations)).toString('utf8'),
      rows,
      'unzipping what was sent gives back exactly the JSON lines the run wrote, byte for byte',
    );
    assert.equal(observations.IfNoneMatch, '*', 'the log is immutable: every put is conditional on the key being absent');

    assert.equal(ops.Key, SIGNALS_KEY, 'the signals file writes under ops/, handed through unchanged');
    assert.notEqual(bytesOf(ops)[0], 0x1f, 'a file named .json is plain JSON: an operator opens it during an incident');
    assert.equal(bytesOf(ops).toString('utf8'), signals, 'the signals bytes are the text, unencoded');
    assert.equal(ops.IfNoneMatch, '*', 'the signals file is written once for the night too');
  });

  // covers: R4
  it('reads S3 refusing a taken key as the night already being sealed, never as a failure', async () => {
    const alreadyThere = Object.assign(new Error('At least one of the pre-conditions you specified did not hold'), {
      name: 'PreconditionFailed',
      $metadata: { httpStatusCode: 412 },
    });
    const store = new S3Store(new RecordingS3(alreadyThere), 'surfs-up-panama-site');

    assert.equal(
      await store.appendLogIfAbsent(OBSERVATION_KEY, '{"report_id":"01JROW"}\n'),
      'already-exists',
      'a re-run of the same night finds its keys present and says so. Treating the 412 as an error would fail a night that is already correctly stored, and treating it as a success to retry over would clobber it.',
    );
  });
});
