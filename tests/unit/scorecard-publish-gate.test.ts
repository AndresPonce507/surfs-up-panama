// Property laws for the publish gate: the decision over an already-formed
// scorecard block that decides whether the box may say a claim, or must stay
// the counter state.
//
// Domain-model.md section 9 and 06-learning-layer.md section 7 (G2/G3) own
// the rule: n_obs >= 10 AND distinct trust-eligible reporters >= 5 AND
// |bias| > 2 * se_gate. Slice-01 has no residual model to compute the bias
// clause from at all, so every law below drives the gate with an
// UNAVAILABLE bias clause, and proves the gate refuses rather than assumes.
// The gate itself accepts any of the three clause states for bias, because
// slice-02 flips that one clause from unavailable to computed and every
// property proven here must keep holding unchanged.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { dayOneObservationSource } from '../../src/scorecard/observation-source';
import { decidePublishGate, evaluateBiasClause, type ClauseResult } from '../../src/scorecard/publish-gate';
import { decideScorecardBlock, scorecardBlockFromObservationCount } from '../../src/scorecard/scorecard-block';
import { REPORTS_REQUIRED } from '../../src/scorecard/threshold';

const clauseResult = fc.constantFrom<ClauseResult>('satisfied', 'unsatisfied', 'unavailable');

// Deliberately wider than any legitimate count: negative counts, NaN and
// Infinity all have to yield a decision rather than throw, because the box
// must always be able to ask the gate a question and always get an answer.
const anyCount = fc.oneof(
  fc.integer({ min: -1_000, max: 100_000 }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

const satisfyingCount = (minimum: number) => fc.integer({ min: minimum, max: minimum + 100_000 });

// Concentrated just below a threshold, rather than spanning the same wide
// range as `anyCount`. A pure threshold-value mutation (10 -> 0) only
// changes the outcome for counts inside the shifted band, so a diffuse
// generator samples that band too rarely to falsify reliably; re-centering
// on the boundary (Hebert ch.7's ?SHRINK: prefer simpler, domain-relevant
// alternative generators) makes every mandatory-refusal property below a
// dependable falsification, not a lucky one.
const belowThreshold = (minimum: number) => fc.integer({ min: minimum - 10, max: minimum - 1 });

describe('publish gate — totality and the fail-closed rule', () => {
  // covers: criterion 1 (total, exactly one of two outcomes, no throws) and
  // criterion 2 (a claim only when all three clauses read satisfied).
  it('decides for every input without throwing, and claim_ok is exactly the AND of the three clauses reading satisfied', () => {
    fc.assert(
      fc.property(anyCount, anyCount, clauseResult, (pairedObservations, distinctTrustEligibleReporters, biasClause) => {
        const decision = decidePublishGate({ pairedObservations, distinctTrustEligibleReporters, biasClause });
        const allThreeSatisfied =
          decision.clauses.pairedObservations === 'satisfied' &&
          decision.clauses.distinctReporters === 'satisfied' &&
          decision.clauses.bias === 'satisfied';
        assert.equal(
          decision.claimOk,
          allThreeSatisfied,
          `claim_ok must be exactly the AND of the three clauses; got clauses ${JSON.stringify(decision.clauses)} and claimOk ${decision.claimOk}`,
        );
        assert.equal(typeof decision.claimOk, 'boolean', 'claim_ok must be exactly one of two outcomes, never a third');
      }),
    );
  });

  // covers: criterion 3 (unavailable is refused, never assumed satisfied).
  // Non-vacuous: pairedObservations and distinctReporters are generated
  // strong enough to satisfy G1 and G2 on their own, so the only thing that
  // can be refusing the claim is the unavailable bias clause.
  it('refuses the claim when the bias clause is unavailable, however strong the other two clauses read', () => {
    fc.assert(
      fc.property(satisfyingCount(10), satisfyingCount(5), (pairedObservations, distinctTrustEligibleReporters) => {
        const decision = decidePublishGate({
          pairedObservations,
          distinctTrustEligibleReporters,
          biasClause: 'unavailable',
        });
        assert.equal(
          decision.claimOk,
          false,
          `an unavailable bias clause must refuse the claim even with n_obs=${pairedObservations} and n_reporters=${distinctTrustEligibleReporters}`,
        );
        assert.equal(decision.clauses.bias, 'unavailable', 'the bias clause must be reported as unavailable, not silently upgraded');
      }),
    );
  });
});

describe('publish gate — the reporter-count law (mandatory)', () => {
  // covers: criterion 4, verbatim. Fewer than five distinct trust-eligible
  // reporters must always decide the counter state, whatever pairedObservations
  // and the bias clause say -- including cases where both would otherwise
  // satisfy their own clauses.
  it('with fewer than five distinct trust-eligible reporters the decision is always the counter state, never a claim, whatever the other numbers say', () => {
    fc.assert(
      fc.property(
        satisfyingCount(10),
        belowThreshold(5),
        clauseResult,
        (pairedObservations, distinctTrustEligibleReporters, biasClause) => {
          const decision = decidePublishGate({ pairedObservations, distinctTrustEligibleReporters, biasClause });
          assert.equal(
            decision.claimOk,
            false,
            `fewer than five distinct reporters (${distinctTrustEligibleReporters}) must always decide the counter state; ` +
              `got claimOk=true with pairedObservations=${pairedObservations}, biasClause=${biasClause}`,
          );
        },
      ),
    );
  });

  // G1's mirror of the mandatory law above: fewer than ten paired
  // observations must always decide the counter state too, whatever the
  // reporter count and the bias clause say -- including cases where both
  // would otherwise satisfy their own clauses. Without this, G1's threshold
  // is unpinned: nothing else in this file ties the number 10 to anything.
  it('with fewer than ten paired observations the decision is always the counter state, never a claim, whatever the other numbers say', () => {
    fc.assert(
      fc.property(
        belowThreshold(10),
        satisfyingCount(5),
        clauseResult,
        (pairedObservations, distinctTrustEligibleReporters, biasClause) => {
          const decision = decidePublishGate({ pairedObservations, distinctTrustEligibleReporters, biasClause });
          assert.equal(
            decision.claimOk,
            false,
            `fewer than ten paired observations (${pairedObservations}) must always decide the counter state; ` +
              `got claimOk=true with distinctTrustEligibleReporters=${distinctTrustEligibleReporters}, biasClause=${biasClause}`,
          );
        },
      ),
    );
  });
});

describe('publish gate — the claim is reachable at all', () => {
  // Both mandatory-refusal properties above are trivially satisfiable by an
  // always-false predicate. This is the witness that stops that: the exact
  // boundary of all three clauses (G1 at 10, G2 at 5, bias satisfied) must
  // decide the gated claim, not the counter state.
  it('decides the gated claim exactly at the boundary: n_obs=10, n_reporters=5, bias satisfied', () => {
    const decision = decidePublishGate({
      pairedObservations: 10,
      distinctTrustEligibleReporters: 5,
      biasClause: 'satisfied',
    });
    assert.equal(decision.claimOk, true, `the exact boundary must decide a claim; got clauses ${JSON.stringify(decision.clauses)}`);
    assert.deepEqual(decision.clauses, { pairedObservations: 'satisfied', distinctReporters: 'satisfied', bias: 'satisfied' });
  });
});

describe('publish gate — computed bias evidence', () => {
  it('uses the strict two-times-floored-error boundary and refuses missing or non-finite evidence', () => {
    const finiteStandardError = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(finiteStandardError, (seGate) => {
        const margin = Math.max(Math.abs(seGate) * 1e-6, 1e-9);
        assert.equal(evaluateBiasClause(2 * seGate, seGate), 'unsatisfied', 'a bias exactly on 2 * se_gate is not enough');
        assert.equal(evaluateBiasClause(2 * seGate + margin, seGate), 'satisfied', 'bias must strictly exceed 2 * se_gate');
        assert.equal(evaluateBiasClause(Number.NaN, seGate), 'unavailable', 'a non-finite bias cannot earn a claim');
        assert.equal(evaluateBiasClause(1, Number.NaN), 'unavailable', 'a non-finite floored error cannot earn a claim');
      }),
    );
  });
});

describe('scorecard block — composing the box\'s decision', () => {
  // The block never invents a claim on its own: with the bias clause pinned
  // to 'unavailable' (the only value slice-01 can honestly produce), no
  // combination of counts can ever make claim_ok true, and threshold is
  // always the settled 30.
  it('carries the settled threshold and never a claim, for any counted inputs, while the bias clause stays unavailable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (pairedObservations, distinctTrustEligibleReporters) => {
          const block = decideScorecardBlock({
            pairedObservations,
            distinctTrustEligibleReporters,
            biasClause: 'unavailable',
          });
          assert.equal(block.n_obs, pairedObservations);
          assert.equal(block.n_reporters, distinctTrustEligibleReporters);
          assert.equal(block.threshold, REPORTS_REQUIRED);
          assert.equal(block.claim_ok, false, 'the bias clause is unavailable in slice-01, so no count can ever earn a claim');
          assert.equal(block.headline, null, 'a counter block must not invent a claim headline');
        },
      ),
    );
  });

  // covers: the sixth law (dropped from the criteria list only to stay
  // inside the five-criterion budget, still required). Today's one real
  // input, the store-absent outcome, must always decide the counter state
  // with n=0 and threshold=30 -- for every spot id, because the day-one
  // source answers the same outcome for all of them.
  it('turns the store-absent outcome into the settled counter state (n=0, threshold=30) for any spot id', () => {
    fc.assert(
      fc.property(fc.string(), (spotId) => {
        const block = scorecardBlockFromObservationCount(dayOneObservationSource(spotId));
        assert.deepEqual(block, {
          n_obs: 0,
          n_reporters: 0,
          threshold: REPORTS_REQUIRED,
          counter: `0 / ${REPORTS_REQUIRED}`,
          claim_ok: false,
          headline: null,
        });
      }),
    );
  });
});
