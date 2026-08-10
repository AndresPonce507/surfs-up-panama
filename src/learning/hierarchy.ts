// Pooling hierarchy keys come from spot seed metadata only. The first rung
// that can differ at launch is the basin: coast is a hard partition, so no
// correction record may inherit evidence from another coast.

export type PoolingSpot = {
  spot_id: string;
  region_id: string;
  coast: string;
  break_type: string;
};

type SpotInput = { spotId: string };

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
