import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { createCredentialProvider, type Fetcher } from '../../src/report/mint';
import { finalizeSavedReport, sendSavedReport, sendWithCredentialRecovery } from '../../src/report/submit';

const MINT_URL = 'https://mint-id.lambda-url.us-east-1.on.aws/';
const REPORT_URL = 'https://report-id.lambda-url.us-east-1.on.aws/';

describe('the browser report transport', () => {
  it('mints once and reuses the anonymous credential for later saved labels', async () => {
    const paths: string[] = [];
    const requests: RequestInit[] = [];
    const fetcher: Fetcher = async (path, request) => {
      paths.push(path);
      requests.push(request);
      return new Response(JSON.stringify({ credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' }), { status: 200 });
    };
    const credential = createCredentialProvider(fetcher, 'd_0123456789abcdef0123456789abcdef', undefined, MINT_URL);

    assert.equal(await credential.get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(await credential.get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(requests.length, 1);
    assert.deepEqual(paths, [MINT_URL]);
    assert.equal(requests[0]?.method, 'POST');
    assert.equal(requests[0]?.cache, 'no-store');
  });

  it('refuses absent endpoint configuration without inventing a relative write path', async () => {
    const paths: string[] = [];
    const credential = createCredentialProvider(async (path) => {
      paths.push(path);
      return new Response(JSON.stringify({ credential: 'should-not-be-used' }), { status: 200 });
    }, 'd_0123456789abcdef0123456789abcdef');

    await assert.rejects(credential.get(), /endpoint/i);
    assert.deepEqual(paths, [], 'an unconfigured static site must keep the label local instead of POSTing a broken /api path');
  });

  it('keeps the same anonymous credential after a page reload until browser storage is lost', async () => {
    const requests: RequestInit[] = [];
    let saved: { deviceId: string; credential: string } | undefined;
    type InMemoryIdentity = {
      read(): Promise<{ deviceId: string; credential: string } | undefined>;
      write(value: { deviceId: string; credential: string }): Promise<void>;
      clear(): Promise<void>;
    };
    const identity: InMemoryIdentity = {
      read: async () => saved,
      write: async (value: { deviceId: string; credential: string }) => { saved = value; },
      clear: async () => { saved = undefined; },
    };
    const fetcher: Fetcher = async (_path, request) => {
      requests.push(request);
      return new Response(JSON.stringify({ credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' }), { status: 200 });
    };
    const provider = createCredentialProvider as unknown as (
      fetcher: Fetcher,
      deviceId: string | undefined,
      identity: InMemoryIdentity,
      mintEndpoint: string,
    ) => { get(): Promise<string>; invalidate(): Promise<void> };

    assert.equal(await provider(fetcher, 'd_0123456789abcdef0123456789abcdef', identity, MINT_URL).get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(await provider(fetcher, undefined, identity, MINT_URL).get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.deepEqual(saved, { deviceId: 'd_0123456789abcdef0123456789abcdef', credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' });
    assert.equal(requests.length, 1, 'a reload must reuse its stored device instead of minting a fresh one');
  });

  it('posts every saved byte unchanged with the credential and no-store transport policy', async () => {
    fc.assert(fc.asyncProperty(fc.json(), async (saved) => {
      const bytes = JSON.stringify(saved);
      let path: string | undefined;
      let request: RequestInit | undefined;
      const fetcher: Fetcher = async (candidatePath, candidate) => {
        path = candidatePath;
        request = candidate;
        return new Response(JSON.stringify({ report_id: 'report-1', outcome: 'no_snapshot', predicted: null }), { status: 200 });
      };

      const result = await sendSavedReport(bytes, 'credential-1', fetcher, REPORT_URL);

      assert.deepEqual(result, { kind: 'received', receipt: { report_id: 'report-1', outcome: 'no_snapshot', predicted: null } });
      assert.equal(request?.body, bytes);
      assert.equal(path, REPORT_URL);
      assert.equal(request?.method, 'POST');
      assert.equal(request?.cache, 'no-store');
      assert.equal(new Headers(request?.headers).get('x-surf-credential'), 'credential-1');
    }));
  });

  it('returns only the server plain-Spanish refusal, never raw response text', async () => {
    const fetcher: Fetcher = async () => new Response(JSON.stringify({
      error: { what: 'La playa indicada no es conocida.', why: 'technical detail' },
    }), { status: 400 });

    assert.deepEqual(
      await sendSavedReport('{"report_id":"report-1"}', 'credential-1', fetcher, REPORT_URL),
      // An unknown beach keeps its label waiting: slice-05 settles only the
      // one refusal the same bytes can never survive (src/report/refusal.ts).
      { kind: 'refused', message: 'La playa indicada no es conocida.', persistence: 'may_arrive_later', credentialInvalid: false },
    );
  });

  it('remints once after a rejected stored credential and replays the exact saved bytes', async () => {
    const issued: string[] = ['stale', 'fresh'];
    const attempted: { path: string; body: BodyInit | null | undefined; credential: string | null }[] = [];
    let invalidations = 0;
    const credential = {
      get: async () => issued[invalidations]!,
      invalidate: async () => { invalidations += 1; },
    };
    const fetcher: Fetcher = async (path, request) => {
      const header = new Headers(request.headers).get('x-surf-credential');
      attempted.push({ path, body: request.body, credential: header });
      if (header === 'stale') return new Response(JSON.stringify({ error: { what: 'Permiso vencido.' } }), { status: 401 });
      return new Response(JSON.stringify({ report_id: 'report-1', outcome: 'no_snapshot', predicted: null }), { status: 200 });
    };
    const savedBytes = '{"report_id":"report-1","spot_id":"playa-venao"}';

    assert.deepEqual(
      await sendWithCredentialRecovery(savedBytes, credential, fetcher, REPORT_URL),
      { kind: 'received', receipt: { report_id: 'report-1', outcome: 'no_snapshot', predicted: null } },
    );
    assert.equal(invalidations, 1, 'one rejected credential earns exactly one invisible recovery');
    assert.deepEqual(
      attempted.map(({ path, body, credential: header }) => ({ path, body, credential: header })),
      [
        { path: REPORT_URL, body: savedBytes, credential: 'stale' },
        { path: REPORT_URL, body: savedBytes, credential: 'fresh' },
      ],
      'recovery must replay exactly the durable bytes, never compose a replacement label',
    );
  });

  it('removes a durable report only after its valid matching receipt', async () => {
    const removed: string[] = [];
    const discard = { discard: async (reportId: string) => { removed.push(reportId); } };
    const matching = { kind: 'received' as const, receipt: { report_id: 'report-1', outcome: 'no_snapshot' as const, predicted: null } };

    assert.deepEqual(await finalizeSavedReport('report-1', matching, discard), matching);
    assert.deepEqual(removed, ['report-1']);
    for (const outcome of [
      { kind: 'refused' as const, message: 'No pudimos enviar el reporte ahora.', persistence: 'may_arrive_later' as const, credentialInvalid: false },
      { kind: 'received' as const, receipt: { report_id: 'another-report', outcome: 'no_snapshot' as const, predicted: null } },
      await sendSavedReport(
        '{"report_id":"report-1"}',
        'credential-1',
        async () => new Response(JSON.stringify({ outcome: 'no_snapshot', predicted: null }), { status: 200 }),
        REPORT_URL,
      ),
    ]) {
      const before = [...removed];
      assert.deepEqual(await finalizeSavedReport('report-1', outcome, discard), outcome);
      assert.deepEqual(removed, before, 'a refusal or wrong receipt must preserve the exact queued label for retry');
    }
    await assert.rejects(
      sendSavedReport('{"report_id":"report-1"}', 'credential-1', async () => Promise.reject(new Error('offline')), REPORT_URL),
      /offline/,
    );
    assert.deepEqual(removed, ['report-1'], 'a network refusal must leave the exact queued label available for retry');
  });
});
