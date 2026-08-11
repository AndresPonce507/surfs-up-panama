import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { createCredentialProvider, type Fetcher } from '../../src/report/mint';
import { finalizeSavedReport, sendSavedReport } from '../../src/report/submit';

describe('the browser report transport', () => {
  it('mints once and reuses the anonymous credential for later saved labels', async () => {
    const requests: RequestInit[] = [];
    const fetcher: Fetcher = async (_path, request) => {
      requests.push(request);
      return new Response(JSON.stringify({ credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' }), { status: 200 });
    };
    const credential = createCredentialProvider(fetcher, 'd_0123456789abcdef0123456789abcdef');

    assert.equal(await credential.get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(await credential.get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, 'POST');
    assert.equal(requests[0]?.cache, 'no-store');
  });

  it('keeps the same anonymous credential after a page reload until browser storage is lost', async () => {
    const requests: RequestInit[] = [];
    let saved: { deviceId: string; credential: string } | undefined;
    type InMemoryIdentity = {
      read(): Promise<{ deviceId: string; credential: string } | undefined>;
      write(value: { deviceId: string; credential: string }): Promise<void>;
    };
    const identity: InMemoryIdentity = {
      read: async () => saved,
      write: async (value: { deviceId: string; credential: string }) => { saved = value; },
    };
    const fetcher: Fetcher = async (_path, request) => {
      requests.push(request);
      return new Response(JSON.stringify({ credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' }), { status: 200 });
    };
    const provider = createCredentialProvider as unknown as (
      fetcher: Fetcher,
      deviceId: string | undefined,
      identity: InMemoryIdentity,
    ) => { get(): Promise<string> };

    assert.equal(await provider(fetcher, 'd_0123456789abcdef0123456789abcdef', identity).get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.equal(await provider(fetcher, undefined, identity).get(), 'v1.d_0123456789abcdef0123456789abcdef.1.signature');
    assert.deepEqual(saved, { deviceId: 'd_0123456789abcdef0123456789abcdef', credential: 'v1.d_0123456789abcdef0123456789abcdef.1.signature' });
    assert.equal(requests.length, 1, 'a reload must reuse its stored device instead of minting a fresh one');
  });

  it('posts every saved byte unchanged with the credential and no-store transport policy', async () => {
    fc.assert(fc.asyncProperty(fc.json(), async (saved) => {
      const bytes = JSON.stringify(saved);
      let request: RequestInit | undefined;
      const fetcher: Fetcher = async (_path, candidate) => {
        request = candidate;
        return new Response(JSON.stringify({ report_id: 'report-1', outcome: 'no_snapshot', predicted: null }), { status: 200 });
      };

      const result = await sendSavedReport(bytes, 'credential-1', fetcher);

      assert.deepEqual(result, { kind: 'received', receipt: { report_id: 'report-1', outcome: 'no_snapshot', predicted: null } });
      assert.equal(request?.body, bytes);
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
      await sendSavedReport('{"report_id":"report-1"}', 'credential-1', fetcher),
      { kind: 'refused', message: 'La playa indicada no es conocida.' },
    );
  });

  it('removes a durable report only after its valid matching receipt', async () => {
    const removed: string[] = [];
    const discard = { discard: async (reportId: string) => { removed.push(reportId); } };
    const matching = { kind: 'received' as const, receipt: { report_id: 'report-1', outcome: 'no_snapshot' as const, predicted: null } };

    assert.deepEqual(await finalizeSavedReport('report-1', matching, discard), matching);
    assert.deepEqual(removed, ['report-1']);
    for (const outcome of [
      { kind: 'refused' as const, message: 'No pudimos enviar el reporte ahora.' },
      { kind: 'received' as const, receipt: { report_id: 'another-report', outcome: 'no_snapshot' as const, predicted: null } },
      await sendSavedReport(
        '{"report_id":"report-1"}',
        'credential-1',
        async () => new Response(JSON.stringify({ outcome: 'no_snapshot', predicted: null }), { status: 200 }),
      ),
    ]) {
      const before = [...removed];
      assert.deepEqual(await finalizeSavedReport('report-1', outcome, discard), outcome);
      assert.deepEqual(removed, before, 'a refusal or wrong receipt must preserve the exact queued label for retry');
    }
    await assert.rejects(
      sendSavedReport('{"report_id":"report-1"}', 'credential-1', async () => Promise.reject(new Error('offline'))),
      /offline/,
    );
    assert.deepEqual(removed, ['report-1'], 'a network refusal must leave the exact queued label available for retry');
  });
});
