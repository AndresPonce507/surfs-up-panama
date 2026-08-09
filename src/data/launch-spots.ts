import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SpotSeed } from '../scoring/engine';

/**
 * The policy and source paths are a declared data adapter boundary. Production
 * uses the repository defaults; an isolated build can point at a checked
 * policy copy without ever changing the human-owned source file.
 */
export type LaunchSeedData = {
  readonly sourceSeedPath?: string;
  readonly policyPath?: string;
};

type LaunchPolicy = {
  readonly launch_spot_ids: readonly string[];
  readonly scoring_priors: {
    readonly h_ref_m: number;
    readonly s_size: number;
    readonly wind_optimum: SpotSeed['wind_optimum'];
    readonly tide_sigma_by_bottom: Readonly<Record<string, SpotSeed['tide']['sigma']>>;
  };
};

type SourceSpot = SpotSeed & { readonly bottom: string };

const DEFAULT_SOURCE_SEED_PATH = resolve('data/spots/pa-pacific.yaml');
const DEFAULT_POLICY_PATH = resolve('data/spots/pa-pacific-launch-v1.json');

export function loadLaunchSpotSeeds(data: LaunchSeedData = {}): readonly SpotSeed[] {
  const policy = readPolicy(data.policyPath ?? DEFAULT_POLICY_PATH);
  if (policy.launch_spot_ids.length !== 20) {
    throw new Error(
      `launch policy refused: WHAT policy selects ${policy.launch_spot_ids.length} spots; WHY the Pacific home must publish the complete 20-spot launch coast; HOW update launch_spot_ids to exactly 20 source spot IDs before publishing.`,
    );
  }
  const sourceById = readSourceEntries(data.sourceSeedPath ?? DEFAULT_SOURCE_SEED_PATH);
  return policy.launch_spot_ids.map((spotId) => {
    const entry = sourceById.get(spotId);
    if (entry === undefined) {
      throw new Error(
        `launch policy refused: WHAT ${spotId} is absent from the source seed; WHY every ranked row must retain a human-owned spot identity; HOW select only IDs from data/spots/pa-pacific.yaml.`,
      );
    }
    return withPolicyPriors(sourceSpot(entry), policy);
  });
}

function readPolicy(path: string | URL): LaunchPolicy {
  return JSON.parse(readFileSync(path, 'utf8')) as LaunchPolicy;
}

function readSourceEntries(path: string | URL): ReadonlyMap<string, string> {
  const entries = readFileSync(path, 'utf8')
    .split(/^  - spot_id: /m)
    .slice(1);
  return new Map(entries.map((entry) => [entry.slice(0, entry.indexOf('\n')).trim(), entry]));
}

function sourceSpot(entry: string): SourceSpot {
  const tide = requiredMatch(entry, /\n    tide:\n      optimum: ([^\n]+)\n      sigma: [^\n]+\n      range_class: ([^\n]+)/, 'tide');
  const window = requiredMatch(entry, /\n    swell_window_deg: \[([^,]+), ([^\]]+)\]/, 'swell_window_deg');
  return {
    spot_id: entry.slice(0, entry.indexOf('\n')).trim(),
    name: sourceScalar(requiredMatch(entry, /\n    name: ([^\n]+)/, 'name')[1]! ),
    region_id: requiredMatch(entry, /\n    region_id: ([^\n]+)/, 'region_id')[1]!.trim(),
    timezone: requiredMatch(entry, /\n    timezone: ([^\n]+)/, 'timezone')[1]!.trim(),
    shore_normal_deg: Number(requiredMatch(entry, /\n    shore_normal_deg: ([^\n]+)/, 'shore_normal_deg')[1]),
    swell_window_deg: [Number(window[1]), Number(window[2])],
    h_ref_m: 0,
    s_size: 0,
    wind_optimum: { u_star_kt: 0, k_on_kt: 0, k_off_kt: 0, k_cross_kt: 0 },
    tide: {
      optimum: tideOptimum(tide[1]!.trim()),
      sigma: 'wide',
      range_class: tide[2]!.trim() as SpotSeed['tide']['range_class'],
    },
    bottom: requiredMatch(entry, /\n    bottom: ([^\n]+)/, 'bottom')[1]!.trim(),
  };
}

function requiredMatch(value: string, pattern: RegExp, field: string): RegExpMatchArray {
  const match = value.match(pattern);
  if (match === null) {
    throw new Error(
      `launch seed refused: WHAT source spot lacks ${field}; WHY every published spot needs its declared scoring input; HOW restore ${field} in data/spots/pa-pacific.yaml.`,
    );
  }
  return match;
}

function sourceScalar(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function tideOptimum(value: string): SpotSeed['tide']['optimum'] {
  if (value === 'low') return 'low';
  if (value === 'high' || value === 'mid_high') return 'high';
  if (value === 'mid_falling') return 'mid_falling';
  return 'mid_rising';
}

function withPolicyPriors(source: SourceSpot, policy: LaunchPolicy): SpotSeed {
  const { bottom, ...spot } = source;
  return {
    ...spot,
    h_ref_m: policy.scoring_priors.h_ref_m,
    s_size: policy.scoring_priors.s_size,
    wind_optimum: policy.scoring_priors.wind_optimum,
    tide: {
      ...spot.tide,
      sigma: policy.scoring_priors.tide_sigma_by_bottom[bottom] ?? 'wide',
    },
  };
}
