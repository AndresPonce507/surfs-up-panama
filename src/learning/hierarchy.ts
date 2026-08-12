// The pooling ladder, 06-learning-layer.md section 5.3 (research 09 sections
// 5.4 and 17.2): the parent estimate every spot's own evidence is shrunk
// toward.
//
// WHY-NEW-FILE: src/learning/hierarchy.ts
//   CLOSEST-EXISTING: src/learning/shrink.ts
//   EXTENSION-COST: shrink.ts is a two-function leaf with no imports that
//     answers one question -- given a raw estimate and A parent, what is
//     stored. Putting the ladder inside it would give it a dependency on the
//     seed roster, the influence caps and the constants table, and would make
//     the one module that produces every stored `b` also the module that
//     decides which spots may see each other.
//   PARALLEL-RATIONALE: the two have different inputs and different
//     lifecycles. shrink.ts is called once per key per spot with scalars; this
//     module is called once per key with the whole run's cross-spot evidence,
//     and is the only module in the lane that reads spot-seed metadata. Their
//     signatures cannot merge without one of them taking arguments it never
//     uses.
//
// The ladder is global -> basin -> region -> similarity group -> spot, keyed
// ONLY on spot-seed data (coast, region_id, break_type, spot_id); nothing here
// is keyed on Panama. It ships COLLAPSED: at one region on one coast every
// level above the spot is the same number, and the parent this module returns
// is exactly the sample-weighted mean of every examined spot's own estimate
// that the launch two-level shape has stored since 01-12.
//
// THE CHAIN TERMINATES AT THE BASIN, deliberately. 09 section 17.2 puts a
// global level above the basin, and 09 section 17.4 guardrail 1 says a
// Caribbean spot must never borrow from a Pacific one at any weight. A global
// level feeding back down into a basin would be exactly that borrowing, at a
// small weight rather than a large one. The two cannot both hold and the
// guardrail wins: a basin is where borrowing stops. The global record 06
// section 5.3 describes is a labeled report of one region's data
// (`n_regions: 1`), not a term any spot's stored number reads.
//
// Pure and total. No store, no clock, no ambient anything (the rule at the top
// of src/pipeline/ports.ts).

import {
  PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION,
  SIMILARITY_GROUP_MIN_GATED_SPOTS,
  TAU_PARENT_LEVEL_PRIOR,
} from "./constants";
import { weightedMean } from "./estimate";
import { shrinkTowardParent } from "./shrink";

/** The spot-seed fields the ladder keys on, domain-model.md section 11 (spot-seed/1). */
export type SpotSeed = {
  readonly spot_id: string;
  readonly region_id: string;
  readonly coast: string;
  readonly break_type: string;
};

/**
 * The influence caps of 09 section 17.5 items 1-2, so one loud region -- or
 * one loud person inside a region -- can never silently become the prior every
 * other spot inherits.
 */
export type PoolingCaps = {
  /** A region's weight in its basin's mean, whatever its real morning count. */
  readonly max_effective_samples_per_region: number;
  /** One reporter's weight in their own region's mean. */
  readonly max_effective_samples_per_reporter: number;
};

/**
 * What ships. The region cap is 06 section 8's declared 200. The reporter cap
 * has NO declared value anywhere in 06 section 8, so nothing is invented here:
 * it ships uncapped, which makes every launch weight the plain morning count
 * and every launch number bit-identical to the two-level shape. The mechanism
 * is proven to fire by injecting a cap in the unit laws, per 06 section 7's
 * `check:unfired-is-not-evidence` rule.
 */
export const SHIPPED_POOLING_CAPS: PoolingCaps = {
  max_effective_samples_per_region: PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION,
  max_effective_samples_per_reporter: Number.POSITIVE_INFINITY,
};

/** One spot's own evidence at one key, as the ladder reads it. */
export type SpotEvidence = {
  readonly spotId: string;
  /** The spot's own raw weighted-mean estimate at this key, never a shrunken one. */
  readonly b: number;
  /** The spot's own morning count at this key. */
  readonly n: number;
  /** How many of those mornings each distinct reporter contributed; sums to n. */
  readonly samplesPerReporter: readonly number[];
  /**
   * Whether this spot's own evidence passed the correction gates when the
   * ladder was collapsed. Carried as a decided boolean rather than re-judged
   * here: only src/learning/gates.ts weighs evidence, and the count of spots
   * that cleared it is the only thing a similarity family activates on.
   */
  readonly gated: boolean;
};

/** A spot with no seed row sits in one unnamed basin and one unnamed region, which is the launch shape. */
const UNSEEDED = "";

/** One region's spots, its own estimate, and the weight it carries in its basin's mean. */
type Region = {
  readonly spots: readonly SpotEvidence[];
  readonly own: number;
  readonly weight: number;
};

/** The parent estimate each spot shrinks toward, keyed by spot id. */
export function parentEstimateBySpot(
  evidence: readonly SpotEvidence[],
  seeds: readonly SpotSeed[],
  caps: PoolingCaps,
): Map<string, number> {
  const placement = placementFrom(seeds);
  const parents = new Map<string, number>();

  for (const basin of groupedBy(evidence, (spot) => placement.coastOf(spot.spotId))) {
    const regions = groupedBy(basin, (spot) => placement.regionOf(spot.spotId)).map(
      (spotsOfRegion) => regionOf(spotsOfRegion, caps),
    );
    const basinEstimate = estimateOfBasin(regions);
    for (const region of regions) {
      const regionEstimate = shrinkTowardParent(
        region.own,
        region.weight,
        TAU_PARENT_LEVEL_PRIOR,
        basinEstimate,
      );
      const families = groupedBy(region.spots, (spot) =>
        placement.breakTypeOf(spot.spotId),
      );
      for (const family of families) {
        const parent = familyParent(family, regionEstimate, caps);
        for (const spot of family) parents.set(spot.spotId, parent);
      }
    }
  }

  return parents;
}

/**
 * What carries a break-type family: its region, until three of its own spots
 * have passed the gates, and then itself. The similarity level ships collapsed
 * and comes into existence per family on the evidence alone -- no code change
 * and no configuration flip (06 section 5.3,
 * adr-pooling-hierarchy-activation decision 3). Below the threshold this
 * returns the region's estimate untouched, so a family that has not formed
 * costs its members nothing, not even a rounding step.
 */
function familyParent(
  family: readonly SpotEvidence[],
  regionEstimate: number,
  caps: PoolingCaps,
): number {
  const proven = family.filter((spot) => spot.gated).length;
  if (proven < SIMILARITY_GROUP_MIN_GATED_SPOTS) return regionEstimate;
  const pooled = poolOf(family, caps);
  return shrinkTowardParent(
    pooled.own,
    pooled.weight,
    TAU_PARENT_LEVEL_PRIOR,
    regionEstimate,
  );
}

/** Where the seed roster says each spot sits. A spot the roster does not name sits in the unnamed levels. */
function placementFrom(seeds: readonly SpotSeed[]): {
  coastOf: (spotId: string) => string;
  regionOf: (spotId: string) => string;
  breakTypeOf: (spotId: string) => string;
} {
  const bySpot = new Map(seeds.map((seed) => [seed.spot_id, seed]));
  return {
    coastOf: (spotId) => bySpot.get(spotId)?.coast ?? UNSEEDED,
    regionOf: (spotId) => bySpot.get(spotId)?.region_id ?? UNSEEDED,
    breakTypeOf: (spotId) => bySpot.get(spotId)?.break_type ?? UNSEEDED,
  };
}

/** Spots gathered under one key, each group and each group's members in first-appearance order. */
function groupedBy(
  evidence: readonly SpotEvidence[],
  keyOf: (spot: SpotEvidence) => string,
): SpotEvidence[][] {
  const groups = new Map<string, SpotEvidence[]>();
  for (const spot of evidence) {
    const key = keyOf(spot);
    groups.set(key, [...(groups.get(key) ?? []), spot]);
  }
  return [...groups.values()];
}

/** A set of spots pooled into one estimate: the weighted mean of their own estimates (09 section 17.5 item 1). */
function poolOf(
  spots: readonly SpotEvidence[],
  caps: PoolingCaps,
): { own: number; weight: number } {
  const weights = spots.map((spot) => effectiveSpotWeight(spot, caps));
  return {
    own: weightedMean(
      spots.map((spot, index) => ({ value: spot.b, weight: weights[index]! })),
    ),
    weight: weights.reduce((sum, weight) => sum + weight, 0),
  };
}

/** A region: its spots pooled, with its influence on the basin above it capped. */
function regionOf(spots: readonly SpotEvidence[], caps: PoolingCaps): Region {
  const pooled = poolOf(spots, caps);
  return {
    spots,
    own: pooled.own,
    weight: Math.min(pooled.weight, caps.max_effective_samples_per_region),
  };
}

/**
 * A basin's estimate: the weighted mean of its REGIONS' own estimates, never
 * of their observations (09 section 17.5 item 1), each region capped. A basin
 * of one region IS that region, returned untouched rather than re-averaged,
 * so the collapsed launch shape carries no rounding drift of its own -- the
 * same reasoning src/learning/shrink.ts records for a one-spot hierarchy.
 */
function estimateOfBasin(regions: readonly Region[]): number {
  if (regions.length === 1) return regions[0]!.own;
  return weightedMean(
    regions.map((region) => ({ value: region.own, weight: region.weight })),
  );
}

/**
 * A spot's weight inside its own region's mean: its mornings, with no single
 * reporter counted past the cap (09 section 17.5 item 2). Uncapped this is the
 * plain morning count, exactly, because the per-reporter counts are integers
 * that sum to n.
 */
function effectiveSpotWeight(spot: SpotEvidence, caps: PoolingCaps): number {
  return spot.samplesPerReporter.reduce(
    (sum, count) => sum + Math.min(count, caps.max_effective_samples_per_reporter),
    0,
  );
}
