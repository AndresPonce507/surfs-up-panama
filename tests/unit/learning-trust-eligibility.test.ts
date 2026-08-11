// Trust eligibility, 06-learning-layer.md section 7 (G2), as declared laws
// over the pure predicate in src/learning/trust.ts.
//
// THE STRUCTURE THAT MATTERS, and the one a careless reading gets wrong.
// The config ships {min_credential_age_days: 0, min_prior_reports: 0,
// min_prior_spots: 2}. There are TWO clauses, not three. 06 section 7 states
// it exactly: "The spots clause qualifies the history clause: at
// min_prior_reports = 0 it is vacuous, which is why the shipped
// min_prior_spots: 2 is inactive at launch." A standalone spots requirement
// would drop every sample in this slice, because every synthetic morning is
// at one spot.
//
// Layer: unit, pure function only. Eligibility is a function of the stored
// record plus the config and NOTHING else -- no store, no wall clock -- so
// a recompute months later reaches the same verdict on the same log.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { ObservationRow } from '../../src/learning/inputs';
import {
  SHIPPED_TRUST_GATE,
  selectTrustEligible,
  type TrustGateConfig,
} from '../../src/learning/trust';

const RUNS = 100;

const someSpotId = fc.constantFrom('playa-venao', 'santa-catalina', 'mariatos');

/** A stored report carrying the two day-one trust fields (07 section 6), both server-set and frozen at receipt. */
const someStoredReport: fc.Arbitrary<ObservationRow> = fc
  .record({
    spot_id: someSpotId,
    reporterIndex: fc.integer({ min: 0, max: 8 }),
    dayOffset: fc.integer({ min: 0, max: 60 }),
    credentialAgeDays: fc.integer({ min: 0, max: 400 }),
  })
  .map(({ spot_id, reporterIndex, dayOffset, credentialAgeDays }) => {
    const receivedAt = new Date('2026-07-01T18:44:00Z');
    receivedAt.setUTCDate(receivedAt.getUTCDate() + dayOffset);
    const issuedAt = new Date(receivedAt.getTime() - credentialAgeDays * 86_400_000);
    return {
      spot_id,
      device_id: `d_trust_${reporterIndex}`,
      observed_at: receivedAt.toISOString(),
      size_band: 'chest_head' as const,
      received_at: receivedAt.toISOString(),
      credential_issued_at: issuedAt.toISOString(),
    };
  });

describe('the shipped trust settings are a proven no-op: the eligible set is the full set', () => {
  it('returns every stored report, in its stored order, for any generated log', () => {
    fc.assert(
      fc.property(fc.array(someStoredReport, { maxLength: 40 }), (reports) => {
        assert.deepEqual(
          selectTrustEligible(reports, SHIPPED_TRUST_GATE),
          reports,
          'at the shipped config the predicate reduces to age >= 0 and priors >= 0, so it must drop nobody and reorder nothing',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('is inactive because the spots clause only qualifies a required prior report, never stands alone', () => {
    // Every synthetic morning in this slice is at ONE spot, so a standalone
    // min_prior_spots: 2 would drop the entire log. This is the trap 06
    // section 7 names, stated as an executable law.
    const oneSpotLog = Array.from({ length: 12 }, (_unused, index) => ({
      spot_id: 'playa-venao',
      device_id: `d_trust_${index % 7}`,
      observed_at: `2026-07-${String(index + 1).padStart(2, '0')}T18:41:00Z`,
      size_band: 'chest_head' as const,
      received_at: `2026-07-${String(index + 1).padStart(2, '0')}T18:44:00Z`,
      credential_issued_at: '2026-01-04T09:00:00Z',
    }));

    assert.deepEqual(
      selectTrustEligible(oneSpotLog, SHIPPED_TRUST_GATE),
      oneSpotLog,
      'the shipped min_prior_spots: 2 must be inactive at min_prior_reports: 0, or every one-spot morning would be dropped',
    );
  });

  it('reads the shipped thresholds from the one config file that owns them', () => {
    assert.equal(SHIPPED_TRUST_GATE.min_credential_age_days, 0);
    assert.equal(SHIPPED_TRUST_GATE.min_prior_reports, 0);
    assert.equal(SHIPPED_TRUST_GATE.min_prior_spots, 2);
  });
});

describe('raising the age threshold can only shrink the eligible set, never grow it (06 section 7)', () => {
  it('is monotone in min_credential_age_days, for any generated log and any pair of thresholds', () => {
    fc.assert(
      fc.property(
        fc.array(someStoredReport, { maxLength: 40 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (reports, thresholdA, thresholdB) => {
          fc.pre(thresholdA < thresholdB);
          const config = (days: number): TrustGateConfig => ({
            ...SHIPPED_TRUST_GATE,
            min_credential_age_days: days,
          });

          const atLowerThreshold = selectTrustEligible(reports, config(thresholdA));
          const atHigherThreshold = selectTrustEligible(reports, config(thresholdB));

          assert.ok(
            atHigherThreshold.length <= atLowerThreshold.length,
            `asking for ${thresholdB} days of standing must never admit more reporters than asking for ${thresholdA}`,
          );
          for (const report of atHigherThreshold) {
            assert.ok(
              atLowerThreshold.includes(report),
              'every report eligible at the higher threshold must already have been eligible at the lower one',
            );
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('fails closed: above a zero threshold, a report that cannot prove its age is not eligible', () => {
    // The repository's own hard-won lesson: an optional field that is simply
    // absent must never read as the most favourable value. At a zero
    // threshold absence is harmless (age >= 0 holds by construction); above
    // it, a record with no timestamps cannot earn the benefit of the doubt.
    const unprovable: ObservationRow = {
      spot_id: 'playa-venao',
      device_id: 'd_trust_unprovable',
      observed_at: '2026-07-01T18:41:00Z',
      size_band: 'chest_head',
    };

    assert.deepEqual(
      selectTrustEligible([unprovable], SHIPPED_TRUST_GATE),
      [unprovable],
      'at the shipped zero threshold a missing timestamp changes nothing, so the launch no-op is preserved',
    );
    assert.deepEqual(
      selectTrustEligible([unprovable], {
        ...SHIPPED_TRUST_GATE,
        min_credential_age_days: 30,
      }),
      [],
      'above zero, a record that cannot prove a month of standing must be excluded, never admitted by default',
    );
  });
});
