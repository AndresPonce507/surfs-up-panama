// What the browser does with a refusal the write path sends back.
//
// The driving port is sendSavedReport (src/report/submit.ts): saved bytes in,
// a settled outcome out. The refusals it reads are not written down here as
// fixtures -- they are produced by the real handler, createWriteLambda from
// src/report/local-lambda.ts, composed in process with a narrow store. The
// slice charter is explicit that no fixture may stand in for the handler's
// refusal bounds or its plain-language reply, and in a node test the handler
// itself is available, so it is the one in the loop.
//
// Two things must come back from a refusal, and today only the first does:
//
//  - the handler's own plain sentence, which is what the surfer reads;
//  - whether waiting could ever make that report valid. A wrong clock is
//    settled: observed_at never changes, so every later send is further
//    outside the window than the one just refused. A daily allowance is not
//    settled: the same bytes arrive fine tomorrow. The screen tells them
//    apart by wording; the queue must tell them apart by behaviour.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { Fetcher } from '../../src/report/mint';
import {
  createWriteLambda,
  type LocalWriteLambda,
  type WriteStore,
} from '../../src/report/local-lambda';
import { openReportQueue, type CommitOutcome, type QueueStore } from '../../src/report/queue';
import { composeReportRecord, type ReportRecord } from '../../src/report/report-record';
import { finalizeSavedReport, sendSavedReport, type SubmissionOutcome } from '../../src/report/submit';

const SECRET = 'test-only-credential-secret-that-is-long-enough';
const SERVER_NOW = new Date('2026-08-10T18:30:00.000Z');
const DEVICE = 'd_0123456789abcdef0123456789abcdef';
const REPORT_URL = 'https://report-id.lambda-url.us-east-1.on.aws/';

/** local-lambda.ts's own window, restated so the property has an oracle it did not borrow. */
const OLDEST_ACCEPTED_SECONDS = -(12 * 60 + 15) * 60;
const NEWEST_ACCEPTED_SECONDS = 15 * 60;

/**
 * The two durable capabilities the handler needs, in memory, refusing exactly
 * what the real store refuses: a missing record, an empty device, a
 * non-positive quota. A permissive double would let a wiring bug through.
 */
function memoryWriteStore(quotaExceeded: boolean): WriteStore {
  const stored = new Map<string, ReportRecord>();
  return {
    mintCredential: async (candidate) => {
      assert.ok(candidate.device_id, 'a credential must be bound to a device');
      return candidate;
    },
    storeReport: async (record, deviceId, receivedDay, quotaLimit) => {
      assert.ok(record, 'a report record is required');
      assert.ok(deviceId, 'a stored report must carry its device');
      assert.ok(receivedDay.length === 10, 'a stored report must carry its received day');
      assert.ok(quotaLimit > 0, 'a daily allowance must be positive');
      if (quotaExceeded) return { kind: 'quota_exceeded' };
      const duplicate = stored.has(record.report_id);
      stored.set(record.report_id, record);
      const receipt = {
        report_id: record.report_id,
        outcome: 'no_snapshot' as const,
        predicted: null,
        counter: { n_reports: stored.size + 1, threshold: 30 },
      };
      return duplicate ? { kind: 'duplicate', receipt } : { kind: 'accepted', receipt };
    },
  };
}

function writeHandler(quotaExceeded = false): LocalWriteLambda {
  return createWriteLambda({
    store: memoryWriteStore(quotaExceeded),
    credentialSecret: SECRET,
    knownSpotIds: ['playa-venao'],
    clock: () => SERVER_NOW,
  });
}

/** Everything the report page sends, routed into the real handler. */
function browserFetcher(handler: LocalWriteLambda): Fetcher {
  return async (_url, init) => {
    const request = init as { readonly headers: Record<string, string>; readonly body: string };
    const response = await handler.handle({
      path: '/api/report',
      method: 'POST',
      headers: request.headers,
      body: request.body,
      sourceIp: '198.51.100.10',
    });
    return new Response(JSON.stringify(response.body), { status: response.statusCode });
  };
}

async function credentialFor(handler: LocalWriteLambda): Promise<string> {
  const minted = await handler.handle({
    path: '/api/mint',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_id: DEVICE }),
    sourceIp: '198.51.100.10',
  });
  assert.equal(minted.statusCode, 200, 'the test device must hold a real credential');
  return (minted.body as { readonly credential: string }).credential;
}

/** The exact durable bytes a phone whose clock is `offsetSeconds` off would have saved. */
function savedBytes(offsetSeconds: number): string {
  const observed = new Date(SERVER_NOW.getTime() + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return JSON.stringify({
    report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN',
    spot_id: 'playa-venao',
    observed_at: observed,
    submitted_at: observed,
    size_band: 'waist_chest',
    size_band_schema: 1,
    wind: 'choppy',
    quality: 'good',
    trigger: 'organic',
    photo_ids: [],
  });
}

async function sendWithClockOffset(offsetSeconds: number, quotaExceeded = false) {
  const handler = writeHandler(quotaExceeded);
  return sendSavedReport(savedBytes(offsetSeconds), await credentialFor(handler), browserFetcher(handler), REPORT_URL);
}

describe('reading a wrong phone clock back off the real write path', () => {
  it('gives every out-of-window report the same plain sentence and calls it settled', async () => {
    await fc.assert(fc.asyncProperty(
      fc.oneof(
        fc.integer({ min: -60 * 60 * 24 * 30, max: OLDEST_ACCEPTED_SECONDS - 1 }),
        fc.integer({ min: NEWEST_ACCEPTED_SECONDS + 1, max: 60 * 60 * 24 * 30 }),
      ),
      async (offsetSeconds) => {
        const outcome = await sendWithClockOffset(offsetSeconds);

        assert.equal(outcome.kind, 'refused', `a clock ${offsetSeconds}s outside the window must be refused`);
        assert.equal(
          outcome.message,
          'La hora del reporte no parece correcta.',
          'the surfer reads the handler own sentence, never a substitute the browser invented',
        );
        assert.equal(
          outcome.persistence,
          'settled',
          'observed_at never changes, so waiting can only put this report further outside the window',
        );
      },
    ), { numRuns: 40 });
  });

  it('leaves every in-window report alone, including both edges of the window', async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: OLDEST_ACCEPTED_SECONDS, max: NEWEST_ACCEPTED_SECONDS }),
      async (offsetSeconds) => {
        const outcome = await sendWithClockOffset(offsetSeconds);

        assert.equal(outcome.kind, 'received', `a clock ${offsetSeconds}s inside the window must not be refused`);
      },
    ), { numRuns: 40 });

    for (const edge of [OLDEST_ACCEPTED_SECONDS, NEWEST_ACCEPTED_SECONDS]) {
      assert.equal((await sendWithClockOffset(edge)).kind, 'received', `the window includes ${edge}s exactly`);
    }
  });
});

describe('telling a wrong clock apart from a full daily allowance', () => {
  it('keeps each refusal in the handler own words and only settles the one waiting cannot fix', async () => {
    const clock = await sendWithClockOffset(NEWEST_ACCEPTED_SECONDS + 60);
    const quota = await sendWithClockOffset(0, true);

    assert.equal(clock.kind, 'refused');
    assert.equal(quota.kind, 'refused');
    assert.equal(quota.message, 'Este dispositivo ya llegó a su límite de hoy.');
    assert.notEqual(quota.message, clock.message, 'the two refusals must not collapse into one sentence');
    assert.equal(
      quota.persistence,
      'may_arrive_later',
      'the same bytes are accepted tomorrow, so a full allowance must keep the report waiting',
    );

    for (const { kind, message } of [{ kind: 'clock', message: clock.message }, { kind: 'quota', message: quota.message }]) {
      // The report flow may never leak the forecast (application-architecture.md
      // section 9), and a refusal is the easiest place to leak one.
      for (const leak of ['Dijimos', 'puntos', 'score', 'pronóstico']) {
        assert.ok(!message.includes(leak), `the ${kind} refusal must say nothing about our forecast (${leak})`);
      }
      for (const raw of ['undefined', 'NaN', 'Error', '{"error"', 'HTTP', '400', '429']) {
        assert.ok(!message.includes(raw), `the ${kind} refusal must carry no raw technical text (${raw})`);
      }
    }
  });

  it('falls back to a plain sentence, still waiting, when a refusal carries no readable reason', async () => {
    // A front door can refuse before the handler runs, with no body at all.
    const bodyless: Fetcher = async () => new Response('', { status: 429 });

    const outcome = await sendSavedReport(savedBytes(0), 'credential-1', bodyless, REPORT_URL);

    assert.equal(outcome.kind, 'refused');
    assert.equal(outcome.message, 'No pudimos enviar el reporte ahora.');
    assert.equal(
      outcome.persistence,
      'may_arrive_later',
      'an unreadable refusal must never strand a report the server may well accept next time',
    );
  });
});

// ---------------------------------------------------------------------------
// What the durable queue does with a report the server has settled.
//
// The report page drains its queue on every visit (flushWaitingReport in
// src/report/island.ts), so "does not send itself again" cannot live in the
// island: a reload starts a new island. It lives in the queue, the same way
// "commit never runs after a refused probe" already does -- pendingRecords
// stops listing a settled report, and the flush has no rule to remember.
//
// The label itself is never deleted. A settled report keeps its durable bytes
// and stays readable; it simply stops being something to send.
// ---------------------------------------------------------------------------

const ANSWERS = { size_band: 'waist_chest', wind: 'choppy', quality: 'good' } as const;

/** The three verbs plus enumeration, in memory. Refuses nothing, records everything. */
function memoryQueueStore(): QueueStore {
  const rows = new Map<string, string>();
  return {
    put: async (key, value) => { rows.set(key, value); },
    get: async (key) => rows.get(key),
    remove: async (key) => { rows.delete(key); },
    entries: async () => [...rows].map(([key, value]) => ({ key, value })),
  };
}

async function queueWithReports(count: number) {
  const opened = await openReportQueue({
    openStore: async () => memoryQueueStore(),
    newSentinel: () => 'sentinel-for-this-probe',
  });
  assert.equal(opened.kind, 'ready', 'the in memory store must pass the Earned Trust probe');
  const reportIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const committed: CommitOutcome = await opened.queue.commit(
      composeReportRecord(() => SERVER_NOW, Math.random, 'playa-venao', ANSWERS),
    );
    assert.equal(committed.kind, 'queued', 'the label must reach durable storage before anything is settled');
    reportIds.push(committed.report_id);
  }
  return { queue: opened.queue, reportIds };
}

describe('keeping a settled report out of the next visit flush', () => {
  it('stops listing exactly the settled reports and keeps every saved label readable', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
      async (isSettled) => {
        const { queue, reportIds } = await queueWithReports(isSettled.length);
        assert.ok(queue.settleSavedRecord, 'the queue must be able to settle a report the server will never accept');

        const settled = reportIds.filter((_, index) => isSettled[index]);
        const waiting = reportIds.filter((_, index) => !isSettled[index]);
        for (const reportId of settled) await queue.settleSavedRecord(reportId);

        const pending = (await queue.pendingRecords?.() ?? []).map(({ report_id }) => report_id);
        assert.deepEqual(
          [...pending].sort(),
          [...waiting].sort(),
          'a settled report must leave the flush list, and a waiting one must stay in it',
        );
        for (const reportId of settled) {
          assert.notEqual(
            await queue.savedRecord?.(reportId),
            undefined,
            'the label is settled, not deleted: the surfer was told, so the bytes stay readable',
          );
        }
      },
    ), { numRuns: 25 });
  });
});

describe('deciding what a send outcome does to the durable label', () => {
  it('discards only on its own receipt and settles only a refusal waiting cannot fix', async () => {
    const done: string[] = [];
    const store = {
      discard: async (reportId: string) => { done.push(`discard ${reportId}`); },
      settle: async (reportId: string) => { done.push(`settle ${reportId}`); },
    };
    const receipt = { report_id: 'report-1', outcome: 'no_snapshot' as const, predicted: null };
    const outcomes: readonly SubmissionOutcome[] = [
      { kind: 'received', receipt },
      { kind: 'refused', message: 'La hora del reporte no parece correcta.', persistence: 'settled', credentialInvalid: false },
      { kind: 'refused', message: 'Este dispositivo ya llegó a su límite de hoy.', persistence: 'may_arrive_later', credentialInvalid: false },
      { kind: 'received', receipt: { ...receipt, report_id: 'a-different-report' } },
    ];

    for (const outcome of outcomes) {
      assert.deepEqual(await finalizeSavedReport('report-1', outcome, store), outcome, 'the outcome itself is passed straight through');
    }

    // The whole observable surface of this port, in order: nothing else may
    // have happened to the durable row.
    assert.deepEqual(done, ['discard report-1', 'settle report-1']);
  });
});
