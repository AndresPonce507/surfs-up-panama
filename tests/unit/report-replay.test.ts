import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { replayQueuedReports } from '../../src/report/replay';
import type { ReportQueue } from '../../src/report/queue';

const RECORD = JSON.stringify({
  report_id: '01J0SIGNALREPLAYAUTH001', spot_id: 'playa-venao', observed_at: '2026-08-10T14:00:00.000Z', submitted_at: '2026-08-10T14:30:00.000Z',
  size_band: 'waist_chest', size_band_schema: 1, wind: 'choppy', quality: 'good', trigger: 'organic', photo_ids: [],
});

describe('authenticated offline report replay', () => {
  it('mints against the configured direct URL, replays unchanged with the credential, and deletes only after the real receipt', async () => {
    const requests: Request[] = [];
    const discarded: string[] = [];
    const queue: ReportQueue = {
      pendingRecords: async () => [{ report_id: '01J0SIGNALREPLAYAUTH001', bytes: RECORD }],
      discardSavedRecord: async (id) => { discarded.push(id); },
      settleSavedRecord: async () => { throw new Error('test bug: the accepted report must not settle'); },
      identity: {
        read: async () => undefined,
        write: async () => {},
        clear: async () => {},
      },
      commit: async () => ({ kind: 'queued', report_id: 'unused' }),
    };
    const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
      requests.push(new Request(url, init));
      if (url === 'https://mint.lambda.example/') return Response.json({ credential: 'signed-credential' });
      if (url === 'https://report.lambda.example/') {
        assert.equal(init.headers instanceof Headers ? init.headers.get('x-surf-credential') : (init.headers as Record<string, string>)['x-surf-credential'], 'signed-credential');
        return Response.json({ report_id: '01J0SIGNALREPLAYAUTH001', outcome: 'no_snapshot', predicted: null });
      }
      throw new Error(`unexpected endpoint ${url}`);
    };

    const outcome = await replayQueuedReports({
      queue,
      endpoints: { mint: 'https://mint.lambda.example/', report: 'https://report.lambda.example/' },
      fetcher,
    });

    assert.equal(outcome.retryable, 0);
    assert.deepEqual(requests.map((request) => request.url), ['https://mint.lambda.example/', 'https://report.lambda.example/']);
    assert.equal(await requests[1]!.text(), RECORD, 'the immutable committed bytes reach the direct report handler unchanged');
    assert.deepEqual(discarded, ['01J0SIGNALREPLAYAUTH001'], 'only the matching server receipt releases the queued record');
  });

  it('keeps a permanently refused label settled with the site reason instead of retrying it forever', async () => {
    const settled: Array<{ id: string; reason: string | undefined }> = [];
    const queue: ReportQueue = {
      pendingRecords: async () => [{ report_id: '01J0SIGNALREPLAYAUTH001', bytes: RECORD }],
      discardSavedRecord: async () => { throw new Error('a permanent refusal must retain the label'); },
      settleSavedRecord: async (id, reason) => { settled.push({ id, reason }); },
      identity: { read: async () => ({ deviceId: 'd_saved', credential: 'signed-credential' }), write: async () => {}, clear: async () => {} },
      commit: async () => ({ kind: 'queued', report_id: 'unused' }),
    };
    const result = await replayQueuedReports({
      queue,
      endpoints: { mint: 'https://mint.lambda.example/', report: 'https://report.lambda.example/' },
      fetcher: async (_url, _init) => Response.json({ error: { code: 'schema_invalid', what: 'El reporte no tiene la forma que esperamos.' } }, { status: 400 }),
    });

    assert.equal(result.retryable, 0);
    assert.deepEqual(settled, [{ id: '01J0SIGNALREPLAYAUTH001', reason: 'El reporte no tiene la forma que esperamos.' }]);
  });
});
