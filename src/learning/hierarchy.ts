// Pooling hierarchy keys come from spot seed metadata only. The first rung
// that can differ at launch is the basin: coast is a hard partition, so no
// correction record may inherit evidence from another coast.

import {
  SIGMA_EFF,
  TAU_ESTIMATION_MIN_GATED_SPOTS,
  TAU_PERMANENT_FLOOR,
  TAU_SPOT_PRIOR,
} from './constants';

export type PoolingSpot = {
  spot_id: string;
  region_id: string;
  coast: string;
  break_type: string;
};

type SpotInput = { spotId: string };

/** One independently gated spot estimate at one height key. */
export type GatedSpotEstimate = { readonly b: number; readonly se: number };

/**
 * The launch prior is necessary before there are enough independently gated
 * spots to identify between-spot variation.  At eight, method-of-moments
 * replaces it: tau = sigma_within^2 / (var(b_hat) - mean(se^2)).  A negative
 * or zero denominator means the data has not earned weaker pooling, so the
 * prior remains; a large denominator can only reduce tau to its permanent
 * floor, never to raw per-spot estimates.
 */
export function estimatedSpotTau(gatedEstimates: readonly GatedSpotEstimate[]): number {
  if (gatedEstimates.length < TAU_ESTIMATION_MIN_GATED_SPOTS) return TAU_SPOT_PRIOR;

  const mean = gatedEstimates.reduce((sum, estimate) => sum + estimate.b, 0) / gatedEstimates.length;
  const variance = gatedEstimates.reduce((sum, estimate) => sum + (estimate.b - mean) ** 2, 0) / gatedEstimates.length;
  const meanSeSquared = gatedEstimates.reduce((sum, estimate) => sum + estimate.se ** 2, 0) / gatedEstimates.length;
  const sigmaBetweenSquared = variance - meanSeSquared;
  if (sigmaBetweenSquared <= 0) return TAU_SPOT_PRIOR;

  return Math.max(TAU_PERMANENT_FLOOR, (SIGMA_EFF.height.value ** 2) / sigmaBetweenSquared);
}

/**
 * Splits one fit run into independent basin universes. Omitting seed metadata
 * preserves the shipped single-universe fit exactly; a reported spot lacking
 * metadata is isolated rather than silently pooled into an invented basin.
 */
export function partitionByBasin<T extends SpotInput>(
  inputs: readonly T[],
  spots: readonly PoolingSpot[] | undefined,
): T[][] {
  if (spots === undefined) return [Array.from(inputs)];

  const coastBySpot = new Map(spots.map((spot) => [spot.spot_id, spot.coast]));
  const partitions = new Map<string, T[]>();
  for (const input of inputs) {
    const basin = coastBySpot.get(input.spotId) ?? `unclassified:${input.spotId}`;
    const members = partitions.get(basin) ?? [];
    members.push(input);
    partitions.set(basin, members);
  }
  return [...partitions.values()];
}

/**
 * Groups only the break types that have independently earned three gated
 * spots in one region. Non-active types deliberately stay in the enclosing
 * region universe, so a pair has not silently become a family.
 */
export function activeSimilarityGroups<T extends SpotInput>(
  inputs: readonly T[],
  spots: readonly PoolingSpot[] | undefined,
  gatedSpotIds: ReadonlySet<string>,
): T[][] {
  if (spots === undefined) return [];

  const spotById = new Map(spots.map((spot) => [spot.spot_id, spot]));
  const gatedCountByGroup = new Map<string, number>();
  for (const spotId of gatedSpotIds) {
    const spot = spotById.get(spotId);
    if (spot === undefined) continue;
    const key = `${spot.region_id}\u0000${spot.break_type}`;
    gatedCountByGroup.set(key, (gatedCountByGroup.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, T[]>();
  for (const input of inputs) {
    const spot = spotById.get(input.spotId);
    if (spot === undefined) continue;
    const key = `${spot.region_id}\u0000${spot.break_type}`;
    if ((gatedCountByGroup.get(key) ?? 0) < 3) continue;
    const members = groups.get(key) ?? [];
    members.push(input);
    groups.set(key, members);
  }
  return [...groups.values()];
}
