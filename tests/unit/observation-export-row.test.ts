// Property laws for the observation row: what one stored write-store item
// becomes on its way into an append-only log.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// These drive the pure mapper directly, which IS its driving port: the
// function signature is the whole public interface. The acceptance suite owns
// the same contract at run scope, with fixed fixtures; these explore the input
// space around it, which is the only way to state "exactly these keys, for
// every well-formed item" rather than "these keys, for the two items I picked".

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { observationRowOf, type ExportedPrediction } from '../../src/export/observation-row';

/** The whole row contract, sorted. Nothing else may ever reach a consumer. */
const ROW_KEYS = [
  'credential_issued_at',
  'device_id',
  'observed_at',
  'predicted',
  'quality',
  'received_at',
  'report_id',
  'size_band',
  'size_band_schema',
  'spot_id',
  'submitted_at',
  'trigger',
  'wind',
];

/** Exactly the keys src/report/local-write-store.ts's PredictedCall carries. */
const PREDICTED_KEYS = ['conf_level', 'score_q', 'size_band', 'size_range_m', 'wind_state'];

const stamp = fc
  .integer({ min: 1_577_836_800, max: 1_893_456_000 })
  .map((second) => `${new Date(second * 1000).toISOString().slice(0, 19)}Z`);

const token = fc.stringMatching(/^[a-z][a-z_]{2,20}$/);
const identifier = fc.stringMatching(/^[A-Za-z0-9_-]{4,26}$/);
const metre = fc.double({ min: 0, max: 12, noNaN: true, noDefaultInfinity: true });

// `.map` back onto a plain object literal: fc.record hands back a
// null-prototype object, and node's deepEqual compares prototypes, so an
// unmapped fixture would fail against a real row for a reason that has nothing
// to do with the export.
const predictedCall: fc.Arbitrary<ExportedPrediction> = fc
  .record({
    score_q: fc.integer({ min: 0, max: 100 }),
    size_band: token,
    size_range_m: fc.tuple(metre, metre),
    wind_state: token,
    conf_level: token,
  })
  .map((call) => ({ ...call }));

type StoredFixture = {
  report_id: string;
  spot_id: string;
  device_id: string;
  received_at: string;
  credential_issued_at: string;
  observed_at: string;
  submitted_at: string;
  size_band: string;
  size_band_schema: number;
  wind: string;
  quality: string;
  trigger: string;
  photo_ids: string[];
  predicted: ExportedPrediction | null;
};

const storedFixture: fc.Arbitrary<StoredFixture> = fc.record({
  report_id: identifier,
  spot_id: token,
  device_id: identifier,
  received_at: stamp,
  credential_issued_at: stamp,
  observed_at: stamp,
  submitted_at: stamp,
  size_band: token,
  size_band_schema: fc.integer({ min: 1, max: 9 }),
  wind: token,
  quality: token,
  trigger: token,
  photo_ids: fc.array(identifier, { maxLength: 3 }),
  predicted: fc.option(predictedCall, { nil: null }),
});

/** The item exactly as src/report/aws-write-store.ts stores it: nested, with server fields hoisted. */
function storedItem(fixture: StoredFixture): Record<string, unknown> {
  return {
    pk: `REP#${fixture.report_id}`,
    sk: 'REPORT',
    report_id: fixture.report_id,
    device_id: fixture.device_id,
    received_at: fixture.received_at,
    credential_issued_at: fixture.credential_issued_at,
    record: {
      report_id: fixture.report_id,
      spot_id: fixture.spot_id,
      observed_at: fixture.observed_at,
      submitted_at: fixture.submitted_at,
      size_band: fixture.size_band,
      size_band_schema: fixture.size_band_schema,
      wind: fixture.wind,
      quality: fixture.quality,
      trigger: fixture.trigger,
      photo_ids: fixture.photo_ids,
    },
    receipt: {
      outcome: fixture.predicted === null ? 'no_snapshot' : 'compared',
      report_id: fixture.report_id,
      predicted: fixture.predicted,
      counter: { n_reports: 3, threshold: 30 },
    },
  };
}

/** Every field the row cannot be built without, as a path into the stored item. */
const REQUIRED_PATHS = [
  'device_id',
  'received_at',
  'credential_issued_at',
  'record',
  'record.report_id',
  'record.spot_id',
  'record.observed_at',
  'record.submitted_at',
  'record.size_band',
  'record.size_band_schema',
  'record.wind',
  'record.quality',
  'record.trigger',
] as const;

function withoutPath(item: Record<string, unknown>, path: string): Record<string, unknown> {
  const [head, tail] = path.split('.');
  if (head === undefined) return item;
  if (tail === undefined) {
    const { [head]: _removed, ...rest } = item;
    return rest;
  }
  const nested = item[head] as Record<string, unknown>;
  const { [tail]: _alsoRemoved, ...restOfNested } = nested;
  return { ...item, [head]: restOfNested };
}

describe('one stored item becomes one observation row', () => {
  // covers: R1 R5 R12
  it('flattens to exactly the settled keys, carries both trust-gate timings, and names no person or photo', () => {
    fc.assert(
      fc.property(storedFixture, (fixture) => {
        const row = observationRowOf(storedItem(fixture));

        assert.ok(row !== null, 'a well-formed accepted report always becomes a row');
        assert.deepEqual(
          Object.keys(row).sort(),
          ROW_KEYS,
          `the row is flat and closed. The store's nesting under record/receipt must never reach a consumer, and a key that leaks into an append-only log can never be taken back.\n  got: ${JSON.stringify(Object.keys(row).sort())}`,
        );

        assert.equal(row.report_id, fixture.report_id);
        assert.equal(row.spot_id, fixture.spot_id, 'spot_id is lifted out of the nested record');
        assert.equal(row.device_id, fixture.device_id, 'device_id is the server-owned hoisted field, never one the client set');
        assert.equal(row.observed_at, fixture.observed_at);
        assert.equal(row.submitted_at, fixture.submitted_at);
        assert.equal(row.size_band, fixture.size_band);
        assert.equal(row.size_band_schema, fixture.size_band_schema);
        assert.equal(row.wind, fixture.wind);
        assert.equal(row.quality, fixture.quality);
        assert.equal(row.trigger, fixture.trigger);
        assert.equal(
          row.received_at,
          fixture.received_at,
          'received_at rides on every row from day one; the retroactive trust gate has no other input',
        );
        assert.equal(row.credential_issued_at, fixture.credential_issued_at, 'the second trust-gate carrier rides too');

        assert.ok(
          !('person_id' in row),
          'person_id is OMITTED, never present-and-empty: residuals.ts reads an empty string as absent while trust.ts accepts it as a real reporter key, so an empty string would collapse every empty reporter into one',
        );
        assert.ok(!('photo_ids' in row), 'a photo reference is not an observation and can never be un-shipped from an append-only log');
        assert.ok(!('src_hash' in row), 'src_hash belongs to the abuse-signals file only');
        assert.ok(!('pk' in row) && !('sk' in row), 'the store\'s keys are its own business');
      }),
    );
  });

  // covers: R2
  it('lifts the shown call whole and enumerated, and says null rather than guessing when none was live', () => {
    fc.assert(
      fc.property(storedFixture, (fixture) => {
        const row = observationRowOf(storedItem(fixture));
        assert.ok(row !== null);

        if (fixture.predicted === null) {
          assert.equal(row.predicted, null, 'no call was live, so the row says so and never invents one');
          return;
        }

        assert.ok(row.predicted !== null, 'a call the surfer was shown must ride out');
        assert.deepEqual(
          Object.keys(row.predicted).sort(),
          PREDICTED_KEYS,
          'all five keys of PredictedCall ride out together. A row carrying score_q but no conf_level makes calibrationOf skip it, which yields zero calibration bins forever and silently disarms the C_spread kill switch.',
        );
        assert.deepEqual(row.predicted, fixture.predicted, 'the call rides out unchanged, none added and none dropped');
      }),
    );
  });

  // covers: R10
  it('turns everything that is not a whole accepted report into no row at all, and never throws', () => {
    fc.assert(
      fc.property(
        storedFixture,
        fc.constantFrom(...REQUIRED_PATHS),
        fc.constantFrom('MINT', 'QUOTA#2026-08-12', 'COUNTER', 'PUSH#d_abc', 'RECEIPT', ''),
        fc.anything(),
        (fixture, missingPath, otherSortKey, junk) => {
          const whole = storedItem(fixture);

          assert.equal(
            observationRowOf({ ...whole, sk: otherSortKey }),
            null,
            `the selection rule is positive: only sk === 'REPORT' is exported, so ${otherSortKey || '(empty)'} and every shape added later are skipped by construction`,
          );

          assert.equal(
            observationRowOf(withoutPath(whole, missingPath)),
            null,
            `a report item missing ${missingPath} cannot be read whole, so it contributes no row rather than a row with a hole in it`,
          );

          assert.doesNotThrow(
            () => observationRowOf(junk),
            'a scan hands over every shape the table holds; one unreadable item must never cost the night its export',
          );
        },
      ),
    );
  });
});
