import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { selectNewestEligibleSnapshots, type SnapshotRow } from '../../src/pipeline/snapshot-selection';

const BUILD_TIME = new Date('2026-08-10T11:22:00.000Z');
const base = (overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
  spot_id: 'playa-venao',
  source: 'ncep',
  valid_ts: '2026-08-10T18:00:00Z',
  run_ts: '2026-08-10T06:00:00.000Z',
  tie_breaker: 'a',
  ...overrides,
});

describe('selectNewestEligibleSnapshots', () => {
  it('never selects a run timestamp later than the build instant', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: -12, max: 12 })), (offsets) => {
      const rows = offsets.map((offset, index) => base({
        run_ts: new Date(BUILD_TIME.getTime() + offset * 3_600_000).toISOString(),
        tie_breaker: String(index),
      }));
      expect(selectNewestEligibleSnapshots(rows, BUILD_TIME).every((row) => Date.parse(row.run_ts) <= BUILD_TIME.getTime())).toBe(true);
    }));
  });

  it('selects the newest eligible run for each observable', () => {
    const rows = [
      base({ run_ts: '2026-08-10T01:00:00.000Z', tie_breaker: 'old' }),
      base({ run_ts: '2026-08-10T09:00:00.000Z', tie_breaker: 'new' }),
      base({ run_ts: '2026-08-10T12:00:00.000Z', tie_breaker: 'future' }),
    ];
    expect(selectNewestEligibleSnapshots(rows, BUILD_TIME)).toEqual([rows[1]]);
  });

  it('has deterministic lexical ties regardless of S3/object-list order', () => {
    const rows = [base({ tie_breaker: 'z' }), base({ tie_breaker: 'a' }), base({ tie_breaker: 'm' })];
    fc.assert(fc.property(fc.shuffledSubarray(rows, { minLength: rows.length, maxLength: rows.length }), (permuted) => {
      expect(selectNewestEligibleSnapshots(permuted, BUILD_TIME)).toEqual([rows[1]]);
    }));
  });
});
