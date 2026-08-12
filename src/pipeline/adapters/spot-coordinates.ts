// Real spot coordinates for the launch policy's 20 spots. SpotSeed
// (src/scoring/engine.ts) carries no lat/lon: it is a scoring input, not a
// location. The forecast source needs a real coordinate per spot, so this
// reads the same human-owned files loadLaunchSpotSeeds() reads
// (data/spots/pa-pacific.yaml + data/spots/pa-pacific-launch-v1.json),
// narrowly, for lat/lon only. Read-only: this module never writes either file.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SpotCoordinate = {
  readonly spot_id: string;
  readonly lat: number;
  readonly lon: number;
};

const DEFAULT_SOURCE_SEED_PATH = resolve('data/spots/pa-pacific.yaml');
const DEFAULT_POLICY_PATH = resolve('data/spots/pa-pacific-launch-v1.json');

export function loadLaunchSpotCoordinates(
  sourceSeedPath: string = DEFAULT_SOURCE_SEED_PATH,
  policyPath: string = DEFAULT_POLICY_PATH,
): readonly SpotCoordinate[] {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as { launch_spot_ids: readonly string[] };
  const bySpotId = readCoordinateEntries(sourceSeedPath);
  return policy.launch_spot_ids.map((spot_id) => {
    const coordinate = bySpotId.get(spot_id);
    if (coordinate === undefined) {
      throw new Error(
        `spot coordinates refused: WHAT ${spot_id} is absent from the source seed; WHY every capture target needs a real lat/lon; HOW select only IDs present in data/spots/pa-pacific.yaml.`,
      );
    }
    return coordinate;
  });
}

function readCoordinateEntries(sourceSeedPath: string): ReadonlyMap<string, SpotCoordinate> {
  const entries = readFileSync(sourceSeedPath, 'utf8').split(/^  - spot_id: /m).slice(1);
  return new Map(entries.map((entry) => {
    const spot_id = entry.slice(0, entry.indexOf('\n')).trim();
    const lat = requiredNumber(entry, /\n {4}lat: ([^\n]+)/, spot_id, 'lat');
    const lon = requiredNumber(entry, /\n {4}lon: ([^\n]+)/, spot_id, 'lon');
    return [spot_id, { spot_id, lat, lon }] as const;
  }));
}

// ------------------------------------------- the map build's own seed read --

/**
 * One launch spot's drawable seed record: where it is, and the ONE direction the
 * seed declares it faces.
 *
 * Deliberately a second type and a second reader rather than two more fields on
 * SpotCoordinate. The forecast source needs a coordinate and must not acquire an
 * opinion about facing; the map generator needs both. Keeping them apart is what
 * stops a map field from leaking into src/data/region.ts, which stays
 * report-safe identity (05-03 implementation note).
 *
 * `shore_normal_deg` is `null` when the seed states no usable facing. Null is not
 * "north" and not "unknown but probably fine": the seed derives this value on
 * every row and two rows carry no citable orientation at all. A null must lose
 * its map rather than receive an arrow, and the caller is forced to decide that
 * because the type says so.
 */
export type SpotOrientation = {
  readonly spot_id: string;
  readonly lat: number;
  readonly lon: number;
  readonly shore_normal_deg: number | null;
};

export function loadLaunchSpotOrientations(
  sourceSeedPath: string = DEFAULT_SOURCE_SEED_PATH,
  policyPath: string = DEFAULT_POLICY_PATH,
): readonly SpotOrientation[] {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as { launch_spot_ids: readonly string[] };
  const bySpotId = readOrientationEntries(sourceSeedPath);
  return policy.launch_spot_ids.map((spot_id) => {
    const orientation = bySpotId.get(spot_id);
    if (orientation === undefined) {
      throw new Error(
        `spot orientations refused: WHAT ${spot_id} is absent from the source seed; WHY a map may not be drawn for a break the seed does not describe; HOW select only IDs present in data/spots/pa-pacific.yaml.`,
      );
    }
    return orientation;
  });
}

function readOrientationEntries(sourceSeedPath: string): ReadonlyMap<string, SpotOrientation> {
  const entries = readFileSync(sourceSeedPath, 'utf8').split(/^  - spot_id: /m).slice(1);
  return new Map(entries.map((entry) => {
    const spot_id = entry.slice(0, entry.indexOf('\n')).trim();
    const lat = requiredNumber(entry, /\n {4}lat: ([^\n]+)/, spot_id, 'lat');
    const lon = requiredNumber(entry, /\n {4}lon: ([^\n]+)/, spot_id, 'lon');
    return [spot_id, { spot_id, lat, lon, shore_normal_deg: declaredFacing(entry) }] as const;
  }));
}

/**
 * The row's own `shore_normal_deg`, anchored to that row's block. A value the
 * seed writes as `null`, omits, or writes outside a compass turn comes back as
 * `null` rather than as a number the generator would happily draw.
 */
function declaredFacing(entry: string): number | null {
  const raw = entry.match(/\n {4}shore_normal_deg: ([^\n]+)/)?.[1]?.trim();
  if (raw === undefined || raw === 'null') return null;
  const facing = Number(raw);
  if (!Number.isFinite(facing) || facing < 0 || facing >= 360) return null;
  return facing;
}

function requiredNumber(entry: string, pattern: RegExp, spot_id: string, field: string): number {
  const match = entry.match(pattern);
  const raw = match?.[1];
  if (raw === undefined) {
    throw new Error(
      `spot coordinates refused: WHAT ${spot_id} lacks ${field}; WHY the forecast source needs a real coordinate; HOW restore ${field} in data/spots/pa-pacific.yaml.`,
    );
  }
  return Number(raw);
}
