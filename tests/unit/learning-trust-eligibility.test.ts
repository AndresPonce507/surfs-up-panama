// The launch trust configuration is deliberately a no-op. This law proves it
// over records as stored, including a credential minted on the morning of its
// report. Eligibility is pure: no test clock and no ambient time participate.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  SHIPPED_TRUST_GATE,
  eligibleTrustRecords,
  type TrustRecord,
} from '../../src/learning/trust';

const DAY_MS = 24 * 60 * 60 * 1000;

function isoAtDay(day: number): string {
  return new Date(Date.UTC(2026, 0, 1) + day * DAY_MS).toISOString();
}

function storedRecord(input: {
  spot: string;
  reporter: string;
  receivedDay: number;
  credentialDay: number;
}): TrustRecord {
  return {
    spot_id: input.spot,
    device_id: input.reporter,
    received_at: isoAtDay(input.receivedDay),
    credential_issued_at: isoAtDay(input.credentialDay),
  };
}

const storedRecords = fc.array(
  fc
    .record({
      spot: fc.constantFrom('playa-venao', 'santa-catalina', 'el-palmar'),
      reporter: fc.constantFrom('d_0', 'd_1', 'd_2', 'd_3', 'd_4', 'd_5', 'd_6'),
      receivedDay: fc.integer({ min: 0, max: 180 }),
    })
    .chain((record) =>
      fc.integer({ min: 0, max: record.receivedDay }).map((credentialDay) =>
        storedRecord({ ...record, credentialDay }),
      ),
    ),
  { maxLength: 40 },
);

describe('shipped trust settings', () => {
  it('drop nobody, including same-morning credentials, and are bit-identical to no settings', () => {
    const twentyTwoMorningsFromSevenPeople = Array.from({ length: 22 }, (_unused, index) =>
      storedRecord({
        spot: 'playa-venao',
        reporter: `d_${index % 7}`,
        receivedDay: index,
        credentialDay: index % 7 === 0 ? index : 0,
      }),
    );

    assert.deepEqual(
      eligibleTrustRecords(twentyTwoMorningsFromSevenPeople, SHIPPED_TRUST_GATE),
      twentyTwoMorningsFromSevenPeople,
      'min_prior_spots qualifies the history clause, so its shipped value of two is inactive while min_prior_reports is zero',
    );

    fc.assert(
      fc.property(storedRecords, (records) => {
        assert.deepEqual(
          eligibleTrustRecords(records, SHIPPED_TRUST_GATE),
          eligibleTrustRecords(records),
          'the shipped gate must be a pure no-op over every stored record, not an accidental dependence on the wall clock',
        );
      }),
      { numRuns: 100 },
    );
  });
});
