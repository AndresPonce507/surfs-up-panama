// Spot identity only: id and display name. Deliberately free of any forecast
// field so the report capture route can import spot identity without ever
// touching forecast data (application-architecture.md section 8, leak path L1).
//
// Slice-01's verified seed record. Future spot expansion remains data-only.

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
  region_id: 'pa-pacific',
  spots: [
    { spot_id: 'playa-venao', name: 'Playa Venao' },
  ],
};

export function spotById(spotId: string): SpotIdentity | undefined {
  return region.spots.find((spot) => spot.spot_id === spotId);
}
