// The correction reader is a pure boundary: arbitrary stored bytes must
// always become an observable report, never an exception or a made-up record.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { loadStoredCorrection } from '../../src/learning/load-correction';

const KEY = 'learned/corrections/v1/current/playa-venao.json';

function storeWith(body: string | null): { get(key: string): Promise<string | null> } {
  return { get: async () => body };
}

function validRecord(units = 'display_points'): Record<string, unknown> {
  return {
    spot_id: 'playa-venao',
    schema: 'spot-correction/1',
    computed_at: '2026-08-10T09:10:00Z',
    clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
    bias: {
      swell_h_m: {
        per_source: {
          ncep_gfswave016: {
            lead_24_48: { b: -0.18, se: 0.08, n: 22, reporters: 7, applied: false },
          },
        },
      },
    },
    score_delta: { b: 9, se: 3, n: 22, reporters: 7, applied: false, units },
  };
}

describe('loadStoredCorrection: total parser boundary', () => {
  it('returns a rejected-as-absent report for arbitrary malformed bytes without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (suffix) => {
        const report = await loadStoredCorrection({ store: storeWith(`not-json:${suffix}`), key: KEY });

        assert.equal(report.record, null, 'malformed bytes may not become a partial or default correction');
        assert.equal(report.outcome, 'rejected-as-absent', 'malformed bytes must degrade to absence');
        assert.ok(report.events.length > 0, 'the rejection must say why rather than hiding corrupt bytes');
      }),
      { numRuns: 100 },
    );
  });

  it('never throws for arbitrary stored bytes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (body) => {
        const report = await loadStoredCorrection({ store: storeWith(body), key: KEY });

        assert.ok(
          ['loaded', 'absent', 'rejected-as-absent'].includes(report.outcome),
          `the reader must always return one declared outcome, not throw: ${report.outcome}`,
        );
        assert.ok(Array.isArray(report.events), 'every outcome carries an event list, even when it is empty');
      }),
      { numRuns: 100 },
    );
  });

  it('turns a store read failure into a diagnostic absence report', async () => {
    const report = await loadStoredCorrection({
      store: { get: async () => { throw new Error('fixture read failed'); } },
      key: KEY,
    });

    assert.equal(report.record, null);
    assert.equal(report.outcome, 'rejected-as-absent');
    assert.ok(report.events.some((event) => `${event.detail ?? ''}`.includes('fixture read failed')));
  });
});

describe('loadStoredCorrection: named correction-file fences', () => {
  it('rejects unreadable bytes with a diagnostic event', async () => {
    const report = await loadStoredCorrection({ store: storeWith('this was never JSON {{{'), key: KEY });

    assert.deepEqual(report.record, null);
    assert.equal(report.outcome, 'rejected-as-absent');
    assert.ok(report.events.length > 0);
  });

  it('rejects a foreign score unit by name', async () => {
    const report = await loadStoredCorrection({
      store: storeWith(JSON.stringify(validRecord('q_units'))),
      key: KEY,
    });

    assert.equal(report.record, null);
    assert.equal(report.outcome, 'rejected-as-absent');
    assert.ok(report.events.some((event) => `${event.type} ${event.detail ?? ''}`.includes('q_units')));
  });

  it('loads a well-formed spot-correction/1 record intact', async () => {
    const record = validRecord();
    const report = await loadStoredCorrection({ store: storeWith(JSON.stringify(record)), key: KEY });

    assert.equal(report.outcome, 'loaded');
    assert.deepEqual(report.record, record);
    assert.deepEqual(report.events, []);
  });
});
