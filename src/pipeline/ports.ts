// Pipeline ports: the seams the acceptance tests drive through. Types only.
// Authored by DISTILL 2026-08-08 from the DESIGN contracts:
//   - ForecastSource is 04-ingest-pipeline.md's ForecastSourcePort
//     (adr-openmeteo-vs-raw-grib2: hard adapter boundary; swapping providers
//     is a registry change plus one adapter). The port speaks POST-ACL domain
//     language: units normalized, UTC timestamps, land-mask already translated
//     to a flag, run_ts already attributed. Wire-format parsing, the
//     anti-corruption ladder (04 section 8) and cycle attribution (04
//     section 5) live inside the adapter, with their own unit tests owed in
//     DELIVER (04 section 3 step 5 names the land-mask unit test explicitly).
//   - Storage capabilities are deliberately split. Ingest can archive raw
//     source payloads and create prediction receipts, while build can only
//     read those receipts and publish its own named artifacts. Neither run
//     receives a broad bucket client capable of writing in the other run's
//     durable universe.
//   - Clock is passed in because nothing in the core may read the ambient
//     clock (contract:declared-inputs-not-ambient-reads).

import type { LaunchSeedData } from '../data/launch-spots';
import type { SpotIndexCoordinate } from './static-publication';
import type { SpotSeed, SwellTrain, WindObs } from '../scoring/engine';

export interface IngestStore {
  /** Archive a verbatim provider response in the raw forensic prefix. */
  putRaw(key: string, body: string): Promise<void>;
  /** S3 conditional PUT (If-None-Match:*): first prediction write wins. */
  putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'>;
}

export interface BuildStore {
  /** Read a durable prediction receipt, never a raw provider payload. */
  getPrediction(key: string): Promise<string | null>;
  listPredictions(prefix: string): Promise<string[]>;
  /** Learned corrections are optional build inputs. */
  getCorrection(key: string): Promise<string | null>;
  /** A call receipt is immutable after its first successful write. */
  putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'>;
  /** The public bundle and manifest are the build's only mutable artifacts. */
  putBundle(key: string, body: string): Promise<void>;
  putManifest(key: string, body: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export type SourceFailure = 'error' | 'malformed' | 'stale' | 'dark';

export type SourceResult<T> =
  | { ok: true; verbatim: string; data: T }
  | { ok: false; reason: SourceFailure };

/** One normalized hour of one wave member. land_masked per domain-model section 17. */
export type MemberHour = {
  valid_ts: string;
  swell: SwellTrain;
  swell2: SwellTrain | null;
  land_masked: boolean;
};

export type MemberSeries = {
  source: string;
  /** Model cycle time, already attributed by the adapter (04 section 5). */
  run_ts: string;
  hours: MemberHour[];
};

export type WindHour = { valid_ts: string; wind: WindObs | null };
export type TideHour = { valid_ts: string; tide_m: number | null };

export interface ForecastSource {
  /** One call returns every wave member's normalized series for the spot. */
  fetchWaveMembers(spot_id: string): Promise<SourceResult<MemberSeries[]>>;
  fetchWind(spot_id: string): Promise<SourceResult<WindHour[]>>;
  fetchTide(spot_id: string): Promise<SourceResult<TideHour[]>>;
}

export interface IngestDeps {
  source: ForecastSource;
  store: IngestStore;
  clock: Clock;
  /** Omit for the normal Pacific publication path, which loads its data-owned launch seed. */
  spots?: SpotSeed[];
  /** Isolated immutable source/policy paths for a controlled publication run. */
  launchData?: LaunchSeedData;
}

export type IngestOutcome = {
  /** True iff the source loop completed and every attempted log PUT succeeded
   *  or was a verified duplicate (04 section 3 step 8). */
  completed: boolean;
  events: { type: string; detail?: string }[];
};

export interface BuildDeps {
  store: BuildStore;
  clock: Clock;
  /** Omit for the normal Pacific publication path, which loads its data-owned launch seed. */
  spots?: SpotSeed[];
  /** Isolated immutable source/policy paths for a controlled publication run. */
  launchData?: LaunchSeedData;
  /** Coordinate projection from the human-owned seed, used only to publish
   * the report handler's minimal spot index. */
  spotCoordinates?: readonly SpotIndexCoordinate[];
  region_id: string;
}

export type BuildOutcome =
  | { published: true; build_id: string }
  | { published: false; reason: string };
