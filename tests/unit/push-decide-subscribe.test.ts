// Property laws for decideSubscribe (07-write-path.md §8.1, §10). Slice-01
// step 01-01 covers only the upsert-by-identity walking skeleton (R10, R11):
// the endpoint-allowlist reject (R12), the daily-quota reject (R13), and
// unsubscribe (R14) are later slice-01 steps and are not exercised here.
// House style: fast-check properties over the declared driving-port
// signature, per tests/unit/scoring-laws.test.ts.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { decideSubscribe } from '../../src/push/decide-subscribe';
import type { StoredSub, SubscribeRequest } from '../../src/push/types';

const identifier = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((value) => value.trim().length > 0);
const lang = fc.constantFrom('es', 'en', 'fr');
const isoDate = fc.constantFrom('2026-08-01', '2026-08-09', '2026-08-10');
const bar = fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined });

function requestFor(
  spotId: string,
  endpoint: string,
  overrides: {
    lang: string;
    threshold_score?: number;
    device_id: string;
    now: string;
  },
): SubscribeRequest {
  return {
    action: 'subscribe',
    spot_id: spotId,
    subscription: { endpoint, keys: { p256dh: 'clave-publica', auth: 'clave-auth' } },
    lang: overrides.lang,
    threshold_score: overrides.threshold_score,
    device_id: overrides.device_id,
    now: overrides.now,
    existing: [],
    writes_today: 0,
    allowlist: ['fcm.googleapis.com'],
  };
}

const askSequence = fc.array(
  fc.record({
    lang,
    threshold_score: bar,
    device_id: identifier,
    now: fc.constantFrom(
      '2026-08-10T18:00:00-05:00',
      '2026-08-10T18:05:00-05:00',
      '2026-08-10T19:30:00-05:00',
    ),
  }),
  { minLength: 1, maxLength: 6 },
);

const arbitraryStoredSub: fc.Arbitrary<StoredSub> = fc.record({
  spot_id: identifier,
  endpoint_hash: identifier,
  lang,
  threshold_score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  last_notified_date: fc.option(isoDate, { nil: null }),
  followup_date: fc.option(isoDate, { nil: null }),
  device_id: identifier,
});

const arbitraryRequest: fc.Arbitrary<SubscribeRequest> = fc.record({
  action: fc.constant('subscribe' as const),
  spot_id: identifier,
  subscription: fc.record({
    endpoint: identifier.map((s) => `https://fcm.googleapis.com/fcm/send/${s}`),
    keys: fc.record({ p256dh: identifier, auth: identifier }),
  }),
  lang,
  threshold_score: bar,
  device_id: identifier,
  now: fc.constantFrom('2026-08-10T18:00:00-05:00', '2026-08-10T07:25:00-05:00'),
  existing: fc.array(arbitraryStoredSub, { maxLength: 3 }),
  writes_today: fc.integer({ min: 0, max: 25 }),
  allowlist: fc.constant(['fcm.googleapis.com']),
});

describe('decideSubscribe', () => {
  // covers: R10, R11
  it('upserts by (spot_id, endpoint_hash): repeated asks from the same identity always leave exactly one row carrying the latest lang/bar/device, notify-job state already on file survives, an unrelated identity is left untouched, and all five declared attributes are stored with an omitted bar as an explicit null', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier.map((s) => `https://fcm.googleapis.com/fcm/send/${s}`),
        isoDate,
        isoDate,
        askSequence,
        (spotId, endpoint, notifiedBeforeAny, followupBeforeAny, asks) => {
          const otherRow: StoredSub = {
            spot_id: `${spotId}-ajeno`,
            endpoint_hash: 'hash-de-otro-suscriptor',
            lang: 'en',
            threshold_score: 55,
            last_notified_date: '2026-07-01',
            followup_date: '2026-07-01',
            device_id: 'dispositivo-ajeno',
          };

          // First ask establishes the identity's row.
          const firstAsk = asks[0]!;
          const opened = decideSubscribe(requestFor(spotId, endpoint, firstAsk));
          let stored = [otherRow, ...opened.stored];
          const mineAfterFirst = stored.filter(
            (row) => row.spot_id === spotId && row.device_id !== otherRow.device_id,
          );
          assert.equal(
            mineAfterFirst.length,
            1,
            'The very first subscribe request for a new identity must create exactly one row.',
          );

          // Simulate the notify job stamping today's dedup state onto that
          // row, exactly as 07-write-path.md §8.2 would after a real send.
          const identityHash = mineAfterFirst[0]!.endpoint_hash;
          stored = stored.map((row) =>
            row.spot_id === spotId && row.endpoint_hash === identityHash
              ? { ...row, last_notified_date: notifiedBeforeAny, followup_date: followupBeforeAny }
              : row,
          );

          // Fold every remaining ask through decideSubscribe, feeding each
          // decision's stored rows forward as the next ask's existing state.
          let lastAsk = firstAsk;
          for (const ask of asks.slice(1)) {
            lastAsk = ask;
            const decision = decideSubscribe(
              Object.assign(requestFor(spotId, endpoint, ask), { existing: stored }),
            );
            stored = decision.stored;
          }

          const mine = stored.filter((row) => row.spot_id === spotId && row.endpoint_hash === identityHash);
          assert.equal(
            mine.length,
            1,
            'Any sequence of subscribe requests sharing (spot_id, endpoint_hash) must fold to exactly one stored row, never a stack of rows.',
          );
          const [row] = mine;
          assert.ok(row !== undefined, 'The identity row must still exist after the full sequence of asks.');
          assert.equal(
            row?.lang,
            lastAsk.lang,
            'The stored row must carry the most recent request\'s language, so a re-ask is not silently dropped.',
          );
          assert.equal(
            row?.threshold_score,
            lastAsk.threshold_score ?? null,
            'The stored row must carry the most recent request\'s bar, explicit null when the surfer chose none — decideSubscribe never substitutes a default.',
          );
          assert.equal(
            row?.device_id,
            lastAsk.device_id,
            'The stored row must carry the most recent request\'s device id.',
          );
          assert.equal(
            row?.last_notified_date,
            notifiedBeforeAny,
            'Re-asking for avisos must never reset the notify-job dedup date already on file.',
          );
          assert.equal(
            row?.followup_date,
            followupBeforeAny,
            'Re-asking for avisos must never reset the afternoon follow-up date already on file.',
          );
          for (const field of ['lang', 'threshold_score', 'last_notified_date', 'followup_date', 'device_id'] as const) {
            assert.ok(row !== undefined && field in row, `The stored row must carry the key ${field}, present even when its value is null.`);
          }

          const untouched = stored.find(
            (candidate) => candidate.spot_id === otherRow.spot_id && candidate.endpoint_hash === otherRow.endpoint_hash,
          );
          assert.deepEqual(
            untouched,
            otherRow,
            'A different identity already on file must be left byte-for-byte untouched by an unrelated upsert.',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // covers: contract:declared-inputs-not-ambient-reads
  it('is a deterministic pure function of its declared inputs: identical declared inputs always produce a bit-identical decision', () => {
    fc.assert(
      fc.property(arbitraryRequest, (request) => {
        const first = decideSubscribe(structuredClone(request));
        const second = decideSubscribe(structuredClone(request));
        assert.deepEqual(
          second,
          first,
          'Identical declared inputs must produce a bit-identical decision so the call never depends on a clock, environment, or filesystem read.',
        );
      }),
      { numRuns: 100 },
    );
  });
});
