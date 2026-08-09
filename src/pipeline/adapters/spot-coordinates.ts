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
