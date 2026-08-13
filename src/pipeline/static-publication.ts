// Public static metadata contracts emitted by the hourly builder. These are
// deliberately pure: the build owns when to publish them and adapters own
// where the bytes go.

import type { SpotSeed } from '../scoring/engine';

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

export type SpotIndexCoordinate = {
  readonly spot_id: string;
  readonly lat: number;
  readonly lon: number;
};

export type SpotIndexEntry = {
  readonly region_id: string;
  readonly geohash4: string;
};

export type SpotIndex = {
  readonly schema: 'spot-index/1';
  readonly spots: Readonly<Record<string, SpotIndexEntry>>;
};

/**
 * The write path validates an incoming spot id and computes its tile from
 * this one small build artifact. Coordinate ownership remains in the
 * human-maintained seed; this is only the handler's minimal read model.
 */
export function serializeSpotIndex(
  spots: readonly SpotSeed[],
  coordinates: readonly SpotIndexCoordinate[],
): string {
  const coordinatesBySpotId = new Map(coordinates.map((coordinate) => [coordinate.spot_id, coordinate]));
  const entries = [...spots].sort((left, right) => left.spot_id.localeCompare(right.spot_id)).map((spot) => {
    const coordinate = coordinatesBySpotId.get(spot.spot_id);
    if (coordinate === undefined) {
      throw new Error(
        `spot index refused: WHAT ${spot.spot_id} has no coordinate; WHY the report handler must compute its tile from the published index; HOW restore the spot's lat/lon in the human-owned seed before publishing.`,
      );
    }
    return [spot.spot_id, {
      region_id: spot.region_id,
      geohash4: geohash4(coordinate.lat, coordinate.lon),
    }] as const;
  });
  const index: SpotIndex = { schema: 'spot-index/1', spots: Object.fromEntries(entries) };
  return JSON.stringify(index);
}

/**
 * The one tile hash. Exported, not copied, because it now has two callers: the
 * published spot index above, and the nightly observation export's partitioning
 * (src/export/observation-objects.ts). Two implementations that drifted would
 * fork the partitioning of an append-only log, which could never be re-tiled.
 */
export function geohash4(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`spot tile refused: WHAT coordinates ${String(lat)}, ${String(lon)} are outside Earth bounds; WHY both the published spot index and the nightly observation export tile a spot from this one hash, so neither could identify a real location; HOW restore finite seed coordinates in data/spots/pa-pacific.yaml before publishing.`);
  }
  let minLatitude = -90;
  let maxLatitude = 90;
  let minLongitude = -180;
  let maxLongitude = 180;
  let longitudeBit = true;
  let bitCount = 0;
  let character = 0;
  let result = '';

  while (result.length < 4) {
    if (longitudeBit) {
      const midpoint = (minLongitude + maxLongitude) / 2;
      if (lon >= midpoint) {
        character = (character << 1) | 1;
        minLongitude = midpoint;
      } else {
        character <<= 1;
        maxLongitude = midpoint;
      }
    } else {
      const midpoint = (minLatitude + maxLatitude) / 2;
      if (lat >= midpoint) {
        character = (character << 1) | 1;
        minLatitude = midpoint;
      } else {
        character <<= 1;
        maxLatitude = midpoint;
      }
    }
    longitudeBit = !longitudeBit;
    bitCount += 1;
    if (bitCount === 5) {
      result += GEOHASH_ALPHABET[character];
      bitCount = 0;
      character = 0;
    }
  }
  return result;
}
