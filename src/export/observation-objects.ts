// Which UTC day a run exports, and which object each of its rows lands in.
//
// The day is the one that JUST CLOSED. A 00:30Z run exports yesterday, so a
// report received at 00:10Z today belongs to the next run, not this one.
//
// Partitioning is by `received_at`, the server clock, NOT by `observed_at`.
// A report can be observed up to twelve hours back and synced days late, so
// observed-day partitions would need rewriting closed files; received-day
// partitions are complete the moment the day ends. Consumers join on the
// in-row `observed_at`; the partition carries no semantics for them
// (adr-observation-export.md Decision 3).
//
// The tile is geohash4 of the spot seed's lat/lon, computed with the SAME
// function the publisher's spot index uses. Importing it rather than copying
// it is deliberate: two tile hashes that drifted would fork the partitioning
// and the log could never be re-partitioned.

import { geohash4 } from '../pipeline/static-publication';
import type { SpotCoordinate } from '../pipeline/adapters/spot-coordinates';
import type { ObservationRow } from './observation-row';

/** 07-write-path.md section 7.4's prefix, and src/learning/inputs.ts's. */
export const OBSERVATION_LOG_PREFIX = 'log/observations/v1/';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** One object offered to the log: its key and the JSON lines it carries. */
export type ObservationObject = {
  readonly key: string;
  readonly body: string;
};

/** The UTC day that had already closed at this instant, as `YYYY-MM-DD`. */
export function closedUtcDayAt(now: Date): string {
  const dayItIsStandingIn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(dayItIsStandingIn - MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * True when this instant falls inside that UTC day. An instant nobody can read
 * parses as NaN and every comparison against it is false, so an unreadable
 * `received_at` is never silently counted into the night being closed.
 */
export function isWithinUtcDay(day: string, instant: string): boolean {
  const opened = Date.parse(`${day}T00:00:00Z`);
  const at = Date.parse(instant);
  return at >= opened && at < opened + MILLISECONDS_PER_DAY;
}

/** log/observations/v1/dt=<received-utc-date>/<tile>.jsonl.gz */
export function observationObjectKey(day: string, tile: string): string {
  return `${OBSERVATION_LOG_PREFIX}dt=${day}/${tile}.jsonl.gz`;
}

/**
 * The day's rows, grouped into one object per tile. Rows keep the order they
 * arrived in: the log is write-once, so the first bytes under a key are the
 * only bytes, and nothing downstream reads a line's position.
 */
export function observationObjectsFor(
  day: string,
  rows: readonly ObservationRow[],
  spots: readonly SpotCoordinate[],
): readonly ObservationObject[] {
  const tileBySpotId = new Map(spots.map((spot) => [spot.spot_id, tileOf(spot)] as const));
  const linesByTile = new Map<string, string[]>();

  for (const row of rows) {
    const tile = tileBySpotId.get(row.spot_id);
    if (tile === undefined) throw new Error(unseededSpotRefusal(row.report_id, row.spot_id));
    const lines = linesByTile.get(tile) ?? [];
    lines.push(JSON.stringify(row));
    linesByTile.set(tile, lines);
  }

  return [...linesByTile].map(([tile, lines]) => ({
    key: observationObjectKey(day, tile),
    body: `${lines.join('\n')}\n`,
  }));
}

/**
 * An accepted report naming a beach the seed does not carry stops the night,
 * loudly, rather than being dropped.
 *
 * The write path validates `spot_id` against the published spot index before
 * it stores anything, so this fires only when the seed has LOST a beach that
 * already has real reports. Skipping the row would delete an accepted
 * observation from an append-only log, where it could never be recovered;
 * refusing costs one night that a re-run repairs.
 */
function unseededSpotRefusal(reportId: string, spotId: string): string {
  return `observation export refused: WHAT report ${reportId} names ${spotId}, which the launch seed does not carry a coordinate for; `
    + 'WHY every accepted observation must land in its own beach\'s tile and a row dropped from an append-only log can never be recovered; '
    + `HOW restore ${spotId} in data/spots/pa-pacific.yaml, or hand the export the seed that covers the beaches the write store accepted.`;
}

/** A seeded spot's tile: the publisher's own geohash4, never a second copy of it. */
export function tileOf(spot: SpotCoordinate): string {
  return geohash4(spot.lat, spot.lon);
}
