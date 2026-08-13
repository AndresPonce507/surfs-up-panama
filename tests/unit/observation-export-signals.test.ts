// Property laws for the night's coordination signals: which local day a report
// falls in, how much of that day the file actually held, and what each of the
// four section 7.4 signals is allowed to say.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// The completeness law is the one that needed care. In Panama no local day is
// ever whole inside one received-UTC file, so a test that only ever asserted
// `complete === false` would pass against an implementation that hardcoded the
// word false. The law below therefore exercises the predicate in a zone where
// the local day genuinely fits (UTC) alongside the zone the product runs in,
// and demands BOTH answers from the same function. That is what makes it a
// predicate rather than a constant, and it is the one place where breaking the
// code to watch a test fail could not have proved anything: a constant cannot
// be broken into failing.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  abuseSignalsFor,
  clipToFile,
  localDayOf,
  localDayUtcWindow,
  utcDayWindow,
  type MintLedgerEntry,
  type UtcWindow,
} from '../../src/export/abuse-signals';
import type { ObservationRow } from '../../src/export/observation-row';

const PANAMA = 'America/Panama';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const closedDays = fc
  .integer({ min: 18_262, max: 21_915 })
  .map((dayNumber) => new Date(dayNumber * MILLISECONDS_PER_DAY).toISOString().slice(0, 10));

const spotIds = ['playa-venao', 'santa-catalina-la-punta'];
const deviceIds = ['d_one', 'd_two', 'd_three', 'd_four'];
const sizeBands = ['knee_thigh', 'waist_chest', 'head_high'];

/** A night's rows, all received inside the closed day, ages and answers varying. */
function rowsWithin(day: string) {
  const opened = Date.parse(`${day}T00:00:00Z`);
  return fc.array(
    fc.record({
      spot_id: fc.constantFrom(...spotIds),
      device_id: fc.constantFrom(...deviceIds),
      size_band: fc.constantFrom(...sizeBands),
      offsetMs: fc.integer({ min: 0, max: MILLISECONDS_PER_DAY - 1 }),
      credentialAgeMs: fc.integer({ min: 0, max: 90 * MILLISECONDS_PER_DAY }),
    }),
    { minLength: 1, maxLength: 24 },
  ).map((drafts) => drafts.map((draft, index): ObservationRow => {
    const receivedAt = opened + draft.offsetMs;
    return {
      report_id: `01JROW${String(index).padStart(18, '0')}`,
      spot_id: draft.spot_id,
      device_id: draft.device_id,
      observed_at: new Date(receivedAt).toISOString(),
      submitted_at: new Date(receivedAt).toISOString(),
      received_at: new Date(receivedAt).toISOString(),
      credential_issued_at: new Date(receivedAt - draft.credentialAgeMs).toISOString(),
      size_band: draft.size_band,
      size_band_schema: 1,
      wind: 'choppy',
      quality: 'good',
      trigger: 'organic',
      predicted: null,
    };
  }));
}

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

function spans(window: UtcWindow): number {
  return Date.parse(window.to) - Date.parse(window.from);
}

describe('a bucket says which UTC hours it was really built from', () => {
  // covers: R6
  it('answers true where the local day fits inside the file and false where the file cut it short', () => {
    fc.assert(
      fc.property(closedDays, (day) => {
        const file = utcDayWindow(day);

        assert.equal(
          clipToFile(localDayUtcWindow(day, 'UTC'), file).complete,
          true,
          'in a zone with no offset the local day IS the file\'s UTC day, so the bucket is whole. Without this half, an implementation that simply wrote "false" would pass.',
        );

        for (const localDay of [dayBefore(day), day]) {
          assert.equal(
            clipToFile(localDayUtcWindow(localDay, PANAMA), file).complete,
            false,
            `Panama runs five hours behind UTC, so a UTC-day file spans local 19:00 of one day to 19:00 of the next and NEITHER local day it touches is whole. A median over ${localDay} that presented as complete would claim certainty the data never earned.`,
          );
        }
      }),
    );
  });

  // covers: R6
  it('reports the intersection of the two windows and never a minute the file did not hold', () => {
    fc.assert(
      fc.property(closedDays, fc.integer({ min: -2, max: 2 }), fc.constantFrom('UTC', PANAMA, 'Asia/Tokyo'), (day, dayOffset, timezone) => {
        const file = utcDayWindow(day);
        const localDay = new Date(Date.parse(`${day}T00:00:00Z`) + (dayOffset * MILLISECONDS_PER_DAY)).toISOString().slice(0, 10);
        const bucket = localDayUtcWindow(localDay, timezone);
        const clipped = clipToFile(bucket, file);

        assert.ok(
          Date.parse(clipped.window.from) >= Date.parse(file.from) && Date.parse(clipped.window.to) <= Date.parse(file.to),
          `a bucket may only name hours the file actually covered.\n  bucket ${JSON.stringify(bucket)}\n  clipped ${JSON.stringify(clipped.window)}`,
        );
        assert.ok(
          Date.parse(clipped.window.from) >= Date.parse(bucket.from) && Date.parse(clipped.window.to) <= Date.parse(bucket.to),
          'a bucket may only name hours its own local day covered',
        );
        assert.equal(
          clipped.complete,
          spans(clipped.window) === spans(bucket),
          'a bucket is complete exactly when the clip took nothing off it, and says so either way',
        );
      }),
    );
  });
});

describe('the four coordination signals report what the night held and nothing more', () => {
  // covers: R6
  it('groups every report into its own beach and its own local day, losing none and inventing none', () => {
    fc.assert(
      fc.property(
        closedDays.chain((day) => fc.record({ day: fc.constant(day), rows: rowsWithin(day) })),
        ({ day, rows }) => {
          const buckets = abuseSignalsFor(day, rows, [], PANAMA).spot_local_days;

          assert.equal(
            buckets.reduce((total, bucket) => total + bucket.reports, 0),
            rows.length,
            'every report of the night lands in exactly one bucket: none dropped, none double counted',
          );
          for (const bucket of buckets) {
            const its = rows.filter((row) => row.spot_id === bucket.spot_id && localDayOf(row.received_at, PANAMA) === bucket.local_day);
            assert.equal(bucket.reports, its.length, 'a bucket counts its own beach on its own local day, and nobody else');
            assert.equal(
              bucket.distinct_devices,
              new Set(its.map((row) => row.device_id)).size,
              'distinct devices is how many senders there were, not how many reports they sent',
            );
            assert.ok(
              bucket.distinct_devices >= 1 && bucket.distinct_devices <= bucket.reports,
              'a bucket has at least one device and never more devices than reports',
            );
          }
        },
      ),
    );
  });

  // covers: R6
  it('says nothing where too few devices or too few reports leave nothing honest to say', () => {
    fc.assert(
      fc.property(
        closedDays.chain((day) => fc.record({ day: fc.constant(day), rows: rowsWithin(day) })),
        ({ day, rows }) => {
          for (const bucket of abuseSignalsFor(day, rows, [], PANAMA).spot_local_days) {
            const its = rows.filter((row) => row.spot_id === bucket.spot_id && localDayOf(row.received_at, PANAMA) === bucket.local_day);
            const arrivals = its.map((row) => Date.parse(row.received_at)).sort((left, right) => left - right);
            const gaps = arrivals.slice(1).map((arrival, index) => arrival - (arrivals[index] ?? arrival));

            assert.equal(
              bucket.band_dispersion === null,
              bucket.distinct_devices < 3,
              'section 7.4 measures band dispersion across three or more devices. Fewer than three has no spread to report, and a number printed there would claim one',
            );
            if (bucket.band_dispersion !== null) {
              assert.ok(bucket.band_dispersion > 0 && bucket.band_dispersion <= 1, 'dispersion is distinct answers over reports, so it sits in (0, 1]');
            }

            assert.equal(
              bucket.min_interarrival_ms === null,
              its.length < 2,
              'one report has no gap to another; zero would read as instantaneous rather than as not applicable',
            );
            if (bucket.min_interarrival_ms !== null) {
              assert.equal(bucket.min_interarrival_ms, Math.min(...gaps), 'the reported gap is the closest two arrivals in the bucket');
            }

            assert.ok(
              bucket.burst_clusters >= 0 && bucket.burst_clusters <= Math.max(0, its.length - 1),
              'a bucket cannot hold more bursts than it has gaps between arrivals',
            );
            assert.equal(
              bucket.burst_clusters > 0,
              gaps.some((gap) => gap < 500),
              'a burst exists exactly when two reports arrived less than half a second apart',
            );

            const ages = its.map((row) => (Date.parse(row.received_at) - Date.parse(row.credential_issued_at)) / MILLISECONDS_PER_DAY);
            assert.ok(
              bucket.median_credential_age_days !== null
              && bucket.median_credential_age_days >= Math.min(...ages) - 0.01
              && bucket.median_credential_age_days <= Math.max(...ages) + 0.01,
              `the median credential age sits between the youngest and oldest credential in the bucket; got ${bucket.median_credential_age_days} from ${JSON.stringify(ages)}`,
            );
          }
        },
      ),
    );
  });

  // covers: R6
  it('counts a host\'s mints only inside the trailing week, and lists no host that minted none', () => {
    const mints = fc.array(
      fc.record({ src_hash: fc.constantFrom('sh_a', 'sh_b', 'sh_c'), offsetDays: fc.integer({ min: -20, max: 2 }) }),
      { maxLength: 30 },
    );
    fc.assert(
      fc.property(closedDays, mints, (day, drafts) => {
        const closed = Date.parse(`${day}T00:00:00Z`) + MILLISECONDS_PER_DAY;
        const ledger: MintLedgerEntry[] = drafts.map((draft) => ({
          src_hash: draft.src_hash,
          issued_at: new Date(closed + (draft.offsetDays * MILLISECONDS_PER_DAY)).toISOString(),
        }));
        const signal = abuseSignalsFor(day, [], ledger, PANAMA).mints_per_src_hash;

        const opened = closed - (7 * MILLISECONDS_PER_DAY);
        const inside = ledger.filter((mint) => Date.parse(mint.issued_at) >= opened && Date.parse(mint.issued_at) < closed);
        assert.deepEqual(
          signal.utc_window,
          { from: new Date(opened).toISOString(), to: new Date(closed).toISOString() },
          'the mint signal looks back seven whole days from the close of the exported day, and says which days those were',
        );
        assert.equal(
          signal.counts.reduce((total, count) => total + count.mints, 0),
          inside.length,
          'a mint from outside the window is not counted at all: the ledger is append-only and holds every night it has ever seen',
        );
        for (const count of signal.counts) {
          assert.ok(count.mints > 0, 'a host that minted nothing in the window is absent, never listed as zero');
          assert.equal(
            count.mints,
            inside.filter((mint) => mint.src_hash === count.src_hash).length,
            'each host is counted against its own src_hash, the one join key section 7.4 names',
          );
        }
      }),
    );
  });
});

describe('an instant belongs to the local day the signals file it in', () => {
  // covers: R6
  it('places every instant inside the UTC window of the local day it was assigned', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_577_836_800_000, max: 1_893_456_000_000 }),
        fc.constantFrom('UTC', PANAMA, 'Asia/Tokyo'),
        (epochMs, timezone) => {
          const instant = new Date(epochMs).toISOString();
          const window = localDayUtcWindow(localDayOf(instant, timezone), timezone);
          assert.ok(
            Date.parse(instant) >= Date.parse(window.from) && Date.parse(instant) < Date.parse(window.to),
            `${instant} was filed under a local day whose real-time span does not contain it (${timezone}: ${JSON.stringify(window)}). The bucket's window has to be the window its reports actually arrived in, or the number above it is describing different hours than it names.`,
          );
        },
      ),
    );
  });
});
