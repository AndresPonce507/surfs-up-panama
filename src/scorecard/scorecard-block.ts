// Assembles the one thing a spot page needs to render its track-record box:
// two counted integers, the settled display threshold, and the gate's
// decision. Nothing here composes a sentence -- domain-model.md section 13
// keeps `threshold` beside the counter precisely so the two numbers stay
// numbers until 01-03 (the copy step) turns them into words. A block that
// pre-rendered its own sentence would make this module the one place a
// wording change could silently diverge from the settled Spanish.
//
// This module owns the DECISION over an already-formed block only. It does
// not pair observations, does not compute bias, se_sample, se_gate or
// sigma_eff, and does not touch the 30/90-day windows: those inputs belong
// to the C3 scorecard (domain-model.md section 9) and land in a later slice.
// Slice-01 has exactly one real source of paired-observation counts, the
// day-one observation source, which always answers store-absent -- so every
// block this build can produce today is the counter state, and that is
// correct, not a shortfall.

import { decidePublishGate, type ClauseResult } from './publish-gate';
import type { ObservationCount } from './observation-source';
import { REPORTS_REQUIRED } from './threshold';

/**
 * What a spot page renders about its own track record. Carries integers
 * only, plus the gate's boolean verdict -- never a pre-rendered sentence.
 * `claim_ok` is the total decision from `decidePublishGate`: exactly one of
 * two outcomes, the counter state (`false`) or a gated claim (`true`).
 */
export type ScorecardBlock = {
  readonly n_obs: number;
  readonly n_reporters: number;
  readonly threshold: number;
  readonly counter: string;
  readonly claim_ok: boolean;
};

/**
 * What a caller hands in to build a block: the two counts the gate itself
 * thresholds, plus the bias clause pre-evaluated elsewhere (slice-01 always
 * hands in 'unavailable', because no residual model exists yet to compute
 * it from).
 */
export type BlockInputs = {
  readonly pairedObservations: number;
  readonly distinctTrustEligibleReporters: number;
  readonly biasClause: ClauseResult;
};

/** Builds the block from already-counted inputs and the gate's decision. */
export const decideScorecardBlock = (inputs: BlockInputs): ScorecardBlock => {
  const decision = decidePublishGate(inputs);
  return {
    n_obs: inputs.pairedObservations,
    n_reporters: inputs.distinctTrustEligibleReporters,
    threshold: REPORTS_REQUIRED,
    counter: `${inputs.pairedObservations} / ${REPORTS_REQUIRED}`,
    claim_ok: decision.claimOk,
  };
};

/**
 * Builds the block from what the observation source answered. `store-absent`
 * is the only outcome slice-01's source can produce, and it always means
 * zero paired observations, zero distinct reporters, and a bias clause with
 * nothing to compute it from -- so it always decides the counter state.
 * `counted` is handled too, unchanged in shape, so slice-03 swapping the
 * real store read in under `ObservationSource` needs no change here.
 */
export const scorecardBlockFromObservationCount = (count: ObservationCount): ScorecardBlock => {
  if (count.kind === 'store-absent') {
    return decideScorecardBlock({
      pairedObservations: 0,
      distinctTrustEligibleReporters: 0,
      biasClause: 'unavailable',
    });
  }
  return decideScorecardBlock({
    pairedObservations: count.n_obs,
    distinctTrustEligibleReporters: count.n_reporters,
    biasClause: 'unavailable',
  });
};
