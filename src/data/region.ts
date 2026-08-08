// Spot identity only: id and display name. Deliberately free of any forecast
// field so the report capture route can import spot identity without ever
// touching forecast data (application-architecture.md section 8, leak path L1).
//
// Placeholder seed. Nothing here is region-specific by design: the real
// region and spot list arrive as seed data keyed by region_id, owned by the
// data lane. Nothing in src/ may hardcode a region or a spot.

export interface SpotIdentity {
  /** spot_id IS the URL slug. Language-neutral kebab, one value, one home. */
  readonly spot_id: string;
  /** Display name, a proper noun, language-neutral. */
  readonly name: string;
}

export interface RegionSeed {
  readonly region_id: string;
  readonly spots: readonly SpotIdentity[];
}

export const region: RegionSeed = {
  region_id: 'region-placeholder',
  spots: [
    { spot_id: 'spot-placeholder-1', name: 'Placeholder Spot One' },
    { spot_id: 'spot-placeholder-2', name: 'Placeholder Spot Two' },
  ],
};

export function spotById(spotId: string): SpotIdentity | undefined {
  return region.spots.find((spot) => spot.spot_id === spotId);
}
