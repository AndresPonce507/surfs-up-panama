// Property laws for where a night's rows land: which UTC day the run exports,
// and which object each row belongs in.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// The day law is checked against an independent model rather than against the
// implementation's own arithmetic: a run standing at any instant of day D
// exports day D minus one, computed here from the calendar rather than by
// re-running the code under test.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  closedUtcDayAt,
  isWithinUtcDay,
  observationObjectsFor,
} from '../../src/export/observation-objects';
import type { ObservationRow } from '../../src/export/observation-row';
import type { SpotCoordinate } from '../../src/pipeline/adapters/spot-coordinates';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Two seeded beaches and the tiles they sit in, pinned. `d1qf` is the value the landed spot-index test already pins. */
const SEEDED_SPOTS: readonly SpotCoordinate[] = [
  { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 },
  { spot_id: 'santa-catalina-la-punta', lat: 7.6342047, lon: -81.2546103 },
];
const TILE_BY_SPOT_ID: Readonly<Record<string, string>> = {
  'playa-venao': 'd1qf',
  'santa-catalina-la-punta': 'd1q5',
};

const CLOSED_DAY = '2026-08-12';

const instant = fc.integer({ min: 1_577_836_800, max: 1_893_456_000 }).map((second) => new Date(second * 1000));

function rowAt(spotId: string, reportId: string): ObservationRow {
  return {
    report_id: reportId,
    spot_id: spotId,
    device_id: 'd_any',
    observed_at: `${CLOSED_DAY}T12:00:00Z`,
    submitted_at: `${CLOSED_DAY}T12:00:00Z`,
    received_at: `${CLOSED_DAY}T12:30:00Z`,
    credential_issued_at: '2026-07-01T12:00:00Z',
    size_band: 'waist_chest',
    size_band_schema: 1,
    wind: 'choppy',
    quality: 'good',
    trigger: 'organic',
    predicted: null,
  };
}

const spotIds = SEEDED_SPOTS.map((spot) => spot.spot_id);

const rows = fc
  .array(fc.constantFrom(...spotIds), { minLength: 1, maxLength: 12 })
  .map((chosen) => chosen.map((spotId, index) => rowAt(spotId, `01JROW${String(index).padStart(18, '0')}`)));

function linesOf(body: string): Record<string, unknown>[] {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('a night of rows partitions by received day and beach tile', () => {
  // covers: R3
  it('names every object for the closed day and its beach tile, and lands each row in its own beach exactly once', () => {
    fc.assert(
      fc.property(rows, (nightsRows) => {
        const objects = observationObjectsFor(CLOSED_DAY, nightsRows, SEEDED_SPOTS);

        const reportedSpotIds = [...new Set(nightsRows.map((row) => row.spot_id))];
        assert.deepEqual(
          objects.map((object) => object.key).sort(),
          reportedSpotIds.map((spotId) => `log/observations/v1/dt=${CLOSED_DAY}/${TILE_BY_SPOT_ID[spotId]}.jsonl.gz`).sort(),
          'one object per reported tile, named log/observations/v1/dt=<received-utc-date>/<tile>.jsonl.gz. A beach nobody reported gets no empty file.',
        );

        const placed: Record<string, unknown>[] = [];
        for (const object of objects) {
          const tile = object.key.slice(object.key.lastIndexOf('/') + 1, -'.jsonl.gz'.length);
          for (const line of linesOf(object.body)) {
            assert.equal(
              TILE_BY_SPOT_ID[String(line['spot_id'])],
              tile,
              `a row landed in ${tile}, which is not its own beach's tile. The tile is geohash4 of the seed lat/lon, and a row filed under the wrong one could never be re-tiled out of an append-only log.`,
            );
            placed.push(line);
          }
        }

        assert.deepEqual(
          placed.map((line) => line['report_id']).sort(),
          nightsRows.map((row) => row.report_id).sort(),
          'every row of the night is written exactly once: none dropped, none duplicated across tiles',
        );
      }),
    );
  });

  // covers: R3
  it('refuses the night out loud rather than dropping a row it cannot tile', () => {
    fc.assert(
      fc.property(fc.constantFrom(...spotIds), (lostSpotId) => {
        const seedWithoutIt = SEEDED_SPOTS.filter((spot) => spot.spot_id !== lostSpotId);
        const nightsRows = spotIds.map((spotId, index) => rowAt(spotId, `01JROW${String(index).padStart(18, '0')}`));

        assert.throws(
          () => observationObjectsFor(CLOSED_DAY, nightsRows, seedWithoutIt),
          (error: Error) => error.message.includes(lostSpotId) && error.message.startsWith('observation export refused:'),
          'a beach the seed has lost still has accepted reports, and silently dropping them would delete real observations from an append-only log where they could never be recovered. The write path already validates spot_id at accept time, so this fires only on a seed that lost a beach: refusing costs one night that a re-run repairs.',
        );
      }),
    );
  });

  // covers: R11
  it('exports the UTC day that just closed, and counts a report into it only while that day was open', () => {
    fc.assert(
      fc.property(instant, fc.integer({ min: -MILLISECONDS_PER_DAY, max: 2 * MILLISECONDS_PER_DAY }), (now, offset) => {
        const day = closedUtcDayAt(now);

        const standingIn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        assert.equal(
          day,
          new Date(standingIn - MILLISECONDS_PER_DAY).toISOString().slice(0, 10),
          'the run exports the day that JUST CLOSED, never the one it is standing in: a 00:30Z run exports yesterday',
        );

        const dayStart = Date.parse(`${day}T00:00:00Z`);
        const received = new Date(dayStart + offset).toISOString();
        assert.equal(
          isWithinUtcDay(day, received),
          offset >= 0 && offset < MILLISECONDS_PER_DAY,
          `${received} belongs to ${day} only while that day was open. A report received after 00:00Z the next morning waits for the next run, because exporting it now would need this closed file rewritten and the log is write-once.`,
        );
      }),
    );
  });

  // covers: R11
  it('reads an instant it cannot parse as belonging to no day at all', () => {
    fc.assert(
      fc.property(fc.string(), (notAnInstant) => {
        fc.pre(Number.isNaN(Date.parse(notAnInstant)));
        assert.equal(
          isWithinUtcDay(CLOSED_DAY, notAnInstant),
          false,
          'a received_at nobody can read is not silently counted into the night being closed',
        );
      }),
    );
  });
});
