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
//   - ObjectStore carries S3's contract, including the conditional PUT that
//     enforces the prediction log's insert-only guarantee (04 section 7):
//     putIfAbsent is If-None-Match:*, first write wins, a duplicate gets
//     'already-exists' and treats it as a duplicate ack, never an error.
//   - Clock is passed in because nothing in the core may read the ambient
//     clock (contract:declared-inputs-not-ambient-reads).

import type { SpotSeed, SwellTrain, WindObs } from '../scoring/engine';

export interface ObjectStore {
  /** S3 conditional PUT (If-None-Match:*): first write wins. */
  putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'>;
  /** Plain PUT (raw archive, published artifacts, manifest). */
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
  list(prefix: string): Promise<string[]>;
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
  store: ObjectStore;
  clock: Clock;
  spots: SpotSeed[];
}

export type IngestOutcome = {
  /** True iff the source loop completed and every attempted log PUT succeeded
   *  or was a verified duplicate (04 section 3 step 8). */
  completed: boolean;
  events: { type: string; detail?: string }[];
};

export interface BuildDeps {
  store: ObjectStore;
  clock: Clock;
  spots: SpotSeed[];
  region_id: string;
}

export type BuildOutcome =
  | { published: true; build_id: string }
  | { published: false; reason: string };
