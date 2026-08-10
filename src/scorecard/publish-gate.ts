// The publish gate: the one place that decides whether a scorecard is allowed
// to say anything about accuracy, or must stay a counter.
//
// Domain model section 9 and 06-learning-layer section 7 (G2/G3) settle the
// rule: a claim renders only when n_obs >= 10 AND distinct trust-eligible
// reporters >= 5 AND |bias| > 2 * se_gate. Each of the three clauses is asked
// separately because each can independently be UNAVAILABLE, not merely false:
// slice-01 has no residual model to compute a bias from at all, so the bias
// clause is unavailable by construction. An unavailable clause is refused,
// never assumed satisfied -- the single worst outcome this feature can
// produce is a claim published from a clause nobody evaluated. That is what
// "fail-closed" means here: the gate does not need every clause to fail for
// the claim to be refused, it only needs one clause not to have been proven.
//
// This module knows nothing about paired-observation counting, reporter
// eligibility, or bias computation. It receives three already-evaluated
// clause outcomes and combines them. Slice-02 computes the bias clause for
// real and hands it in here unchanged; every property proven against this
// function today still holds once that clause starts arriving as
// 'satisfied' or 'unsatisfied' instead of always 'unavailable'.

/**
 * What a single gate clause can honestly say about itself: it held, it did
 * not hold, or there was nothing to evaluate it against yet. `unavailable`
 * is its own outcome, not a stand-in for either of the other two -- treating
 * it as `satisfied` is exactly the dishonesty this gate exists to prevent.
 */
export type ClauseResult = 'satisfied' | 'unsatisfied' | 'unavailable';

/** The three settled gate clauses (domain-model.md section 9, G1/G2/G3). */
export type GateClauses = {
  readonly pairedObservations: ClauseResult;
  readonly distinctReporters: ClauseResult;
  readonly bias: ClauseResult;
};

/**
 * The already-counted inputs a caller hands the gate. `pairedObservations`
 * and `distinctTrustEligibleReporters` are counts the gate evaluates itself
 * against the settled thresholds (G1, G2). `biasClause` arrives
 * pre-evaluated because computing it needs a residual model this slice does
 * not have; the gate never invents one.
 */
export type GateInputs = {
  readonly pairedObservations: number;
  readonly distinctTrustEligibleReporters: number;
  readonly biasClause: ClauseResult;
};

/** A total decision: exactly one of two outcomes, never a third. */
export type GateDecision = {
  readonly claimOk: boolean;
  readonly clauses: GateClauses;
};

/** G1: domain-model.md section 9 / 06-learning-layer.md section 7. */
const MIN_PAIRED_OBSERVATIONS = 10;

/** G2: domain-model.md section 9 / 06-learning-layer.md section 7. */
const MIN_DISTINCT_TRUST_ELIGIBLE_REPORTERS = 5;

const evaluateCountClause = (count: number, minimum: number): ClauseResult =>
  count >= minimum ? 'satisfied' : 'unsatisfied';

/** Evaluates G3 from computed window evidence; missing or malformed evidence refuses fail-closed. */
export const evaluateBiasClause = (bias: number, seGate: number): ClauseResult => {
  if (!Number.isFinite(bias) || !Number.isFinite(seGate) || seGate < 0) return 'unavailable';
  return Math.abs(bias) > 2 * seGate ? 'satisfied' : 'unsatisfied';
};

const allSatisfied = (clauses: GateClauses): boolean =>
  clauses.pairedObservations === 'satisfied' &&
  clauses.distinctReporters === 'satisfied' &&
  clauses.bias === 'satisfied';

/**
 * Decide whether a scorecard may publish a claim. Total: every input,
 * including negative counts, `NaN` and `Infinity`, yields a decision rather
 * than a thrown error, because the box on the page must always be able to
 * ask this question and always get an answer.
 *
 * `claimOk` is true only when all three clauses read `satisfied`. A clause
 * reading `unavailable` refuses exactly like one reading `unsatisfied` --
 * the gate is fail-closed, never fail-open.
 */
export const decidePublishGate = (inputs: GateInputs): GateDecision => {
  const clauses: GateClauses = {
    pairedObservations: evaluateCountClause(inputs.pairedObservations, MIN_PAIRED_OBSERVATIONS),
    distinctReporters: evaluateCountClause(
      inputs.distinctTrustEligibleReporters,
      MIN_DISTINCT_TRUST_ELIGIBLE_REPORTERS,
    ),
    bias: inputs.biasClause,
  };
  return { claimOk: allSatisfied(clauses), clauses };
};
