// Declared constants for the nightly fit: the two residual forms this lane
// ever computes, their single-sample noise floors, and the numeric priors the
// estimator and gates read. 06-learning-layer.md section 8 is the one
// citation for every number below; nothing here is invented.
//
// RESIDUAL_FORMS and SIGMA_EFF are read by src/learning/declarations.ts,
// which examines the whole shipped source for two safety rules (01-02
// through 01-04): only src/learning/gates.ts may ever mark a correction
// applied, and a wind residual may never ship without its own noise floor.
// Declaring wind nowhere in RESIDUAL_FORMS and nowhere in SIGMA_EFF is
// deliberate: wind is claim-exempt (06 section 8's closing paragraph) and
// that examination's own acceptance suite watches this file stay that way.

/** The two residual forms this lane ever computes. Exactly two, never three (06 section 1, section 8). */
export const RESIDUAL_FORMS = ["r_height", "r_score"] as const;

export type NoiseFloor = {
  readonly value: number;
  readonly derived_from: string;
};

/** Single-sample noise floor, one home per variable (06 section 8). No `wind` entry: see the module header. */
export const SIGMA_EFF: {
  readonly height: NoiseFloor;
  readonly score: NoiseFloor;
} = {
  height: {
    value: 0.48,
    derived_from:
      "height-error-decomposition: band interval (~0.13 sd) + eyeball (~0.30 sd) + day-to-day model error (~0.35 sd), in quadrature",
  },
  score: {
    value: 25,
    derived_from: "one q_obs anchor step across the Bad/OK/Good/Epic ladder",
  },
};

/** G3, 06 section 7: agreement below this share of physical uncertainty buys no extra precision. */
export const PHYSICAL_NOISE_FLOOR_MULTIPLIER = 0.5;

/** G1, 06 section 7: fewer paired mornings than this and nothing may be evaluated further. */
export const G1_MIN_MORNINGS = 10;

/**
 * Spot-level shrinkage prior, 06 section 8: tau ~= 6 at sigma_between ~= 0.17 m
 * against sigma_within ~= 0.42 m. Hand-set until >= 8 gated spots exist
 * (06 section 5.3's stated switchover); one prior for both bias.swell_h_m and
 * score_delta at launch, since no separate score-scale prior is derived yet.
 */
export const TAU_SPOT_PRIOR = 6;

/**
 * The permanent floor under every tau this lane ever uses, 06 section 8
 * ("tau (spot level): estimated; prior 6, floor 2") and
 * adr-pooling-hierarchy-activation decision 5. It is what keeps the two
 * cold-start laws true for every tau the ladder can ever reach rather than
 * only for today's hand-set prior: at one morning a spot can never move more
 * than 1/(1 + 2) of the way from its parents toward its own claim. Its
 * production reader arrives at 03-04, where tau stops being a constant; it is
 * declared here, with the laws that rest on it, so those laws are never
 * restated against a prior that 03-04 replaces.
 */
export const TAU_FLOOR = 2;

/**
 * The pooling ladder's levels above the spot have no separately derived tau
 * anywhere in 06 section 8; only the spot level does. Until one is estimated,
 * the spot prior stands at every level, for the same reason one prior stands
 * for both bias.swell_h_m and score_delta above: there is no second derivation
 * to read. Inert at the launch shape, where one region on one coast makes a
 * basin identical to its only region and the shrink between them the identity.
 */
export const TAU_PARENT_LEVEL_PRIOR = TAU_SPOT_PRIOR;

/**
 * How many spots must pass the correction gates before tau stops being a
 * hand-set prior and is estimated from the data instead (06 section 5.3's
 * stated switchover, adr-pooling-hierarchy-activation decision 5). Research 09
 * section 17.4 says never hand-set tau; with one region and a handful of gated
 * spots sigma_between is unidentifiable, so the rule's spirit is kept with a
 * floor and this switchover rather than its letter.
 */
export const TAU_ESTIMATION_MIN_GATED_SPOTS = 8;

/**
 * How many spots of one break type must pass the correction gates before that
 * family stops being carried by its region and starts pooling among itself
 * (06 section 5.3, adr-pooling-hierarchy-activation decision 3). Data-driven
 * per group: no code change and no configuration flip is involved in a family
 * coming into existence, only one more spot earning its way through the gates.
 */
export const SIMILARITY_GROUP_MIN_GATED_SPOTS = 3;

/**
 * A region's maximum weight in its basin's mean, 06 section 8 (`n_eff cap per
 * region (parent levels)`, research 09 section 17.5 item 2), so one hyperactive
 * region can never silently become the prior every other region inherits.
 */
export const PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION = 200;

/** G5/G6, 06 section 7: the limits a correction's reader must enforce at apply/read time. This lane only states them. */
export const CLAMP_MAX_ABS_HEIGHT_FRACTION = 0.4;
export const CLAMP_MAX_ABS_SCORE_POINTS = 12;

/**
 * The open top band stays IN the fit rather than censoring the dependent
 * variable (06 section 5.1): a nominal value standing in for its missing
 * upper edge, and a per-sample variance standing in for its missing width.
 */
export const TOP_BAND_NOMINAL_M = 3.0;
export const TOP_BAND_VARIANCE_M2 = 0.25;

/** Lead buckets, 06 section 8, half-open [min, max). The last bucket has no upper edge. */
export const LEAD_BUCKETS: readonly {
  readonly id: string;
  readonly minH: number;
  readonly maxH: number;
}[] = [
  { id: "lead_0_12", minH: 0, maxH: 12 },
  { id: "lead_12_24", minH: 12, maxH: 24 },
  { id: "lead_24_48", minH: 24, maxH: 48 },
  { id: "lead_48_96", minH: 48, maxH: 96 },
  { id: "lead_96_inf", minH: 96, maxH: Number.POSITIVE_INFINITY },
];

/** Which lead bucket a lead time in hours falls into; the open-ended last bucket is the safety default. */
export function leadBucketOf(leadH: number): string {
  const bucket = LEAD_BUCKETS.find(
    (candidate) => leadH >= candidate.minH && leadH < candidate.maxH,
  );
  return bucket !== undefined
    ? bucket.id
    : LEAD_BUCKETS[LEAD_BUCKETS.length - 1]!.id;
}
