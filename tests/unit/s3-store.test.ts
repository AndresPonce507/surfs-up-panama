// Adapter test for the S3-backed IngestStore/BuildStore. The house rule for
// adapters is real infrastructure, no mocks (nw-hexagonal-testing) -- but
// this task is explicitly build-and-prove-without-deploy (no AWS credentials,
// no S3-compatible container running locally). The one honest substitute is
// an injected fake at the narrowest real port this adapter actually calls:
// `S3Client['send']`, fed real `@aws-sdk/client-s3` Command objects and
// asserted on their real `.input`. This is not a mock of the adapter or of
// application behaviour, it is a stand-in for the one thing that cannot run
// offline (the network call), the same spirit as FilesystemStore's real disk.

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { S3Store } from '../../src/pipeline/adapters/s3-store';

type SentCommand = { readonly commandName: string; readonly input: Record<string, unknown> };

function fakeClient(handlers: {
  onPut?: (input: Record<string, unknown>) => unknown;
  onGet?: (input: Record<string, unknown>) => unknown;
  onList?: (input: Record<string, unknown>) => unknown;
}): { readonly send: (command: unknown) => Promise<unknown>; readonly sent: SentCommand[] } {
  const sent: SentCommand[] = [];
  return {
    sent,
    send: async (command: unknown) => {
      const typed = command as { constructor: { name: string }; input: Record<string, unknown> };
      sent.push({ commandName: typed.constructor.name, input: typed.input });
      if (typed instanceof PutObjectCommand) return (handlers.onPut ?? (() => ({})))(typed.input);
      if (typed instanceof GetObjectCommand) return (handlers.onGet ?? (() => ({})))(typed.input);
      if (typed instanceof ListObjectsV2Command) return (handlers.onList ?? (() => ({ Contents: [] })))(typed.input);
      throw new Error(`fakeClient: unexpected command ${typed.constructor.name}`);
    },
  };
}

function preconditionFailed(): never {
  const error = new Error('At least one of the pre-conditions you specified did not hold') as Error & { $metadata: { httpStatusCode: number } };
  error.name = 'PreconditionFailed';
  error.$metadata = { httpStatusCode: 412 };
  throw error;
}

function noSuchKey(): never {
  const error = new Error('The specified key does not exist.') as Error & { name: string };
  error.name = 'NoSuchKey';
  throw error;
}

describe('S3Store (IngestStore + BuildStore over S3)', () => {
  it('proves S3 conditional creation returns created then already-exists before ingest begins', async () => {
    const seen = new Set<string>();
    const client = fakeClient({ onPut: (input) => {
      const key = String(input.Key);
      if (seen.has(key)) return preconditionFailed();
      seen.add(key);
      return {};
    } });
    await new S3Store(client, 'bucket').probeConditionalPut();
    expect(client.sent).toHaveLength(2);
    expect(client.sent.every((command) => command.input.IfNoneMatch === '*')).toBe(true);
  });

  it('writes raw payloads as real gzip bytes under the key as given', async () => {
    const client = fakeClient({});
    const store = new S3Store(client, 'surfs-up-panama-site-602167897909');

    await store.putRawIfAbsent({ key: 'raw/open-meteo-marine/dt=2026-08-10/06/spot=playa-venao/run=2026-08-10T06-17-00.000Z/execution=evt-1.json.gz', verbatim: '{"ok":true}' });

    expect(client.sent[0]?.commandName).toBe('PutObjectCommand');
    expect(client.sent[0]?.input.Bucket).toBe('surfs-up-panama-site-602167897909');
    expect(client.sent[0]?.input.Key).toBe('raw/open-meteo-marine/dt=2026-08-10/06/spot=playa-venao/run=2026-08-10T06-17-00.000Z/execution=evt-1.json.gz');
    expect(client.sent[0]?.input.IfNoneMatch).toBe('*');
    expect(gunzipSync(client.sent[0]?.input.Body as Uint8Array).toString('utf8')).toBe('{"ok":true}');
  });

  it('writes a prediction with S3 conditional PUT (IfNoneMatch: *) and reports it created', async () => {
    const client = fakeClient({});
    const store = new S3Store(client, 'bucket');

    const outcome = await store.putPredictionIfAbsent('predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/all.jsonl.gz', 'row');

    expect(outcome).toBe('created');
    expect(client.sent[0]?.input.IfNoneMatch).toBe('*');
    expect(gunzipSync(client.sent[0]?.input.Body as Uint8Array).toString('utf8')).toBe('row');
  });

  it('treats a 412 PreconditionFailed conditional-write rejection as a duplicate acknowledgement, never an overwrite', async () => {
    const client = fakeClient({ onPut: preconditionFailed });
    const store = new S3Store(client, 'bucket');

    const outcome = await store.putPredictionIfAbsent('predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/all.jsonl.gz', 'row');

    expect(outcome).toBe('already-exists');
  });

  it('never swallows a real S3 failure as a duplicate ack: a 500 propagates so the run fails loudly', async () => {
    const client = fakeClient({
      onPut: () => {
        const error = new Error('Internal Server Error') as Error & { $metadata: { httpStatusCode: number } };
        error.$metadata = { httpStatusCode: 500 };
        throw error;
      },
    });
    const store = new S3Store(client, 'bucket');

    await expect(store.putPredictionIfAbsent('predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/all.jsonl.gz', 'row'))
      .rejects.toThrow('Internal Server Error');
  });

  it('reads a gzipped prediction back as text', async () => {
    const client = fakeClient({ onGet: () => ({ Body: { transformToByteArray: async () => gzipSync('row-one\nrow-two') } }) });
    const store = new S3Store(client, 'bucket');

    const body = await store.getPrediction('predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/all.jsonl.gz');

    expect(body).toBe('row-one\nrow-two');
  });

  it('reads a missing key as null instead of throwing, mirroring FilesystemStore', async () => {
    const client = fakeClient({ onGet: noSuchKey });
    const store = new S3Store(client, 'bucket');

    expect(await store.getPrediction('predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/absent.jsonl.gz')).toBeNull();
    expect(await store.getCorrection('current/playa-venao.json')).toBeNull();
  });

  it('lists every key under a prefix across a paginated ListObjectsV2 response', async () => {
    let call = 0;
    const client = fakeClient({
      onList: () => {
        call += 1;
        return call === 1
          ? { Contents: [{ Key: 'predictions/v1/dt=2026-08-10/b.jsonl.gz' }], IsTruncated: true, NextContinuationToken: 'page-2' }
          : { Contents: [{ Key: 'predictions/v1/dt=2026-08-10/a.jsonl.gz' }], IsTruncated: false };
      },
    });
    const store = new S3Store(client, 'bucket');

    const keys = await store.listPredictions('predictions/v1/dt=2026-08-10/');

    expect(keys).toEqual(['predictions/v1/dt=2026-08-10/a.jsonl.gz', 'predictions/v1/dt=2026-08-10/b.jsonl.gz']);
    expect(client.sent[1]?.input.ContinuationToken).toBe('page-2');
  });

  it('maps the pipeline\'s local pub/ output root onto the real granted bucket prefixes for the bundle and manifest', async () => {
    const client = fakeClient({});
    const store = new S3Store(client, 'bucket');

    await store.putBundle('pub/v1/regions/pa-pacific/bundle.json', '{"build_id":"b_1"}');
    await store.putManifest('pub/v1/manifest.json', '{"build_id":"b_1"}');

    expect(client.sent.map((command) => command.input.Key)).toEqual([
      'v1/regions/pa-pacific/bundle.json',
      'manifest.json',
    ]);
  });

  it('leaves the calls-log key untouched: it already sits under the granted log/* prefix', async () => {
    const client = fakeClient({});
    const store = new S3Store(client, 'bucket');

    await store.putCallIfAbsent('log/calls/v1/dt=2026-08-10/build=11Z/pa-pacific.jsonl.gz', 'row');

    expect(client.sent[0]?.input.Key).toBe('log/calls/v1/dt=2026-08-10/build=11Z/pa-pacific.jsonl.gz');
  });
});
