// Declared-law tests for the monthly evaluation's metrics builder
// (src/learning/metrics.ts), accepted roadmap 05-01. The acceptance test
// (tests/acceptance/f-forecast-learns-from-the-beach/the-monthly-file-...)
// drives one fixture with a single spot and a single reporting cadence; it
// never exercises a cross-spot pairwise comparison, a tie, a second
// co-observer, or an isolated single-report month. These properties cover
// exactly those branches this step's own design notes call out as candidate
// laws, entering through `buildMonthlyMetrics` -- the pure function's own
// driving port -- and asserting on its return value alone (port-to-port at
// domain scope).
//
// Layer: unit, pure function only. buildMonthlyMetrics reads nothing but its
// four input arrays; no store, no clock, no ambient world.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { OPEN_ENDED_SIZE_BAND, sizeBands, type SizeBandToken } from '../../src/data/size-bands';
import { CORRECTIONS_PREFIX, type StoredCorrection } from '../../src/learning/correction-file';
import { TOP_BAND_NOMINAL_M } from '../../src/learning/constants';
import { runMonthlyEvaluationOnce } from '../../src/learning/evaluate';
import type { ObservationRow, PredictionRow } from '../../src/learning/inputs';
import { buildMonthlyMetrics } from '../../src/learning/metrics';
import { hEff } from '../../src/scoring/engine';
import { FixedClock, InMemoryStore } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fakes';

const sizeBandToken = fc.constantFrom(...sizeBands.map((band) => band.value));
const qualityToken = fc.constantFrom('bad', 'ok', 'good', 'epic');

/**
 * The oracle's own midpoint lookup, independent of metrics.ts's (private)
 * copy: read straight off the canonical size-band table rather than
 * re-importing the module under test.
 */
function midpointOf(band: SizeBandToken): number {
  if (band === OPEN_ENDED_SIZE_BAND) return TOP_BAND_NOMINAL_M;
  const row = sizeBands.find((candidate) => candidate.value === band)!;
  return (row.lo_m + row.hi_m) / 2;
}

const observationArb = fc.record({
  spot_id: fc.constantFrom('playa-venao', 'santa-catalina'),
  device_id: fc.constantFrom('d_1', 'd_2', 'd_3'),
  observed_at: fc.constantFrom(
    '2026-07-01T08:00:00Z',
    '2026-07-01T09:30:00Z',
    '2026-07-02T08:00:00Z',
    '2026-07-03T08:00:00Z',
  ),
  size_band: sizeBandToken,
  quality: qualityToken,
  trigger: fc.constantFrom('push_solicited', 'organic'),
}) as fc.Arbitrary<ObservationRow>;

function metricsFor(
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[] = [],
): ReturnType<typeof buildMonthlyMetrics> {
  return buildMonthlyMetrics({ observations, predictions, calls: [], corrections: [] });
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

describe('buildMonthlyMetrics: selection.solicited_share is a share, never outside its own bound', () => {
  it('stays inside [0,1] for any generated log', () => {
    fc.assert(
      fc.property(fc.array(observationArb, { maxLength: 40 }), (observations) => {
        const metrics = metricsFor(observations);
        assert.ok(
          metrics.selection.solicited_share >= 0 && metrics.selection.solicited_share <= 1,
          `solicited_share (${metrics.selection.solicited_share}) must be a share of the log, never outside [0,1]`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe('buildMonthlyMetrics: pairwise, the declared tie-exclusion', () => {
  it('excludes a same-reporter same-day cross-spot pair when the quality labels tie, and counts exactly one when they do not', () => {
    fc.assert(
      fc.property(qualityToken, qualityToken, (qualityA, qualityB) => {
        const observations: ObservationRow[] = [
          { spot_id: 'playa-venao', device_id: 'd_1', observed_at: '2026-07-01T08:00:00Z', quality: qualityA },
          { spot_id: 'santa-catalina', device_id: 'd_1', observed_at: '2026-07-01T15:00:00Z', quality: qualityB },
        ];
        const metrics = metricsFor(observations);
        const expected = qualityA === qualityB ? 0 : 1;
        assert.equal(
          metrics.pairwise.pairs,
          expected,
          `two spots rated by one reporter on one day with quality (${qualityA}, ${qualityB}) must yield ${expected} qualifying pair(s)`,
        );
      }),
      { numRuns: 20 },
    );
  });

  it('never counts a same-spot pair, whatever the two quality labels are', () => {
    fc.assert(
      fc.property(qualityToken, qualityToken, (qualityA, qualityB) => {
        const observations: ObservationRow[] = [
          { spot_id: 'playa-venao', device_id: 'd_1', observed_at: '2026-07-01T08:00:00Z', quality: qualityA },
          { spot_id: 'playa-venao', device_id: 'd_2', observed_at: '2026-07-01T09:00:00Z', quality: qualityB },
        ];
        assert.equal(
          metricsFor(observations).pairwise.pairs,
          0,
          'the pairwise metric compares which of two SPOTS was better; two reports of one spot are never a pair',
        );
      }),
      { numRuns: 20 },
    );
  });
});

describe('buildMonthlyMetrics: sigma_human, order-independence and the non-negative floor', () => {
  it('counts the same co-observer pairs and the same disagreement whichever order the reports arrive in', () => {
    fc.assert(
      fc.property(sizeBandToken, sizeBandToken, fc.integer({ min: 0, max: 119 }), (bandA, bandB, minutesApart) => {
        const obsA: ObservationRow = {
          spot_id: 'playa-venao',
          device_id: 'd_1',
          observed_at: '2026-07-01T08:00:00Z',
          size_band: bandA,
        };
        const obsB: ObservationRow = {
          spot_id: 'playa-venao',
          device_id: 'd_2',
          observed_at: addMinutes('2026-07-01T08:00:00Z', minutesApart),
          size_band: bandB,
        };
        const forward = metricsFor([obsA, obsB]);
        const backward = metricsFor([obsB, obsA]);

        assert.equal(
          forward.sigma_human.co_observer_pairs,
          1,
          'two different reporters at the same spot within two hours must count as exactly one co-observer pair',
        );
        assert.equal(
          forward.sigma_human.co_observer_pairs,
          backward.sigma_human.co_observer_pairs,
          'the co-observer count must not depend on report order',
        );
        assert.equal(
          forward.sigma_human.value,
          backward.sigma_human.value,
          'the disagreement measured must not depend on report order',
        );
        assert.ok(
          (forward.sigma_human.value ?? 0) >= 0,
          'a mean absolute disagreement can never be negative',
        );
      }),
      { numRuns: 50 },
    );
  });
});

describe('buildMonthlyMetrics: mae, a hand-computed degenerate fixture and the non-negative floor', () => {
  it('reports a zero climatology baseline and no persistence baseline for one isolated report, whatever spot and band', () => {
    fc.assert(
      fc.property(fc.constantFrom('playa-venao', 'santa-catalina'), sizeBandToken, (spotId, band) => {
        const observations: ObservationRow[] = [
          { spot_id: spotId, device_id: 'd_1', observed_at: '2026-07-01T08:00:00Z', size_band: band },
        ];
        const metrics = metricsFor(observations);
        assert.equal(
          metrics.mae.baselines.climatology,
          0,
          'one report is its own mean; the climatology baseline error is exactly zero, never a placeholder',
        );
        assert.equal(
          metrics.mae.baselines.persistence,
          null,
          'no earlier day exists for this report, so persistence has nothing honest to compare against',
        );
      }),
      { numRuns: 20 },
    );
  });

  it('reports the per-key MAE exactly as an independently computed |forecast - observed| height difference, for one paired report', () => {
    // `Math.abs(...) >= 0` is guaranteed by the language, not by this
    // module's logic (test-optimization skill section 2: a property that
    // cannot fail is not a property). The oracle here is Hebert's
    // "Modeling" strategy instead: a simpler, independently-derived
    // reference computation -- hEff plus the canonical band midpoint, read
    // straight off src/data/size-bands.ts rather than re-deriving
    // metrics.ts's own (private) helper -- checked against the module's
    // actual output for one exactly-paired report.
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 4, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 4, max: 20, noNaN: true, noDefaultInfinity: true }),
        sizeBandToken,
        (swellHeightM, swellPeriodS, band) => {
          const observedAt = '2026-07-01T08:00:00Z';
          const observations: ObservationRow[] = [
            { spot_id: 'playa-venao', device_id: 'd_1', observed_at: observedAt, size_band: band },
          ];
          const predictions: PredictionRow[] = [
            {
              spot_id: 'playa-venao',
              source: 'ncep_gfswave016',
              valid_ts: observedAt,
              lead_h: 24,
              swell_h_m: swellHeightM,
              swell_t_s: swellPeriodS,
              land_masked: false,
            },
          ];
          const metrics = metricsFor(observations, predictions);
          const expectedMae = Math.abs(hEff(swellHeightM, swellPeriodS) - midpointOf(band));

          assert.equal(
            metrics.mae.per_key.length,
            1,
            'one spot with one paired report and one source/lead must yield exactly one key',
          );
          assert.ok(
            Math.abs(metrics.mae.per_key[0]!.mae - expectedMae) < 1e-9,
            `mae (${metrics.mae.per_key[0]!.mae}) must equal the independently computed |hEff - mid(band)| (${expectedMae})`,
          );
          assert.equal(metrics.mae.per_key[0]!.spot_id, 'playa-venao');
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('buildMonthlyMetrics: shrinkage, one row per gated spot read off the correction\'s own fields', () => {
  it('reports the fullest applied key\'s shrink weight, n and reporters, exactly as the stored correction carries them', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 10, max: 200 }),
        fc.integer({ min: 5, max: 50 }),
        (shrunkFromGlobal, n, reporters) => {
          const correction: StoredCorrection = {
            spot_id: 'playa-venao',
            schema: 'spot-correction/1',
            computed_at: '2026-08-09T07:00:00.000Z',
            bias: {
              swell_h_m: {
                per_source: {
                  ncep_gfswave016: {
                    lead_24_48: {
                      b: -0.18,
                      se: 0.09,
                      n,
                      reporters,
                      applied: true,
                      shrunk_from_global: shrunkFromGlobal,
                    },
                  },
                },
              },
            },
            clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
          };

          const metrics = buildMonthlyMetrics({
            observations: [],
            predictions: [],
            calls: [],
            corrections: [correction],
          });

          assert.deepEqual(
            metrics.shrinkage,
            [
              {
                spot_id: 'playa-venao',
                shrink_weight: shrunkFromGlobal,
                n,
                reporters,
                flagged: false,
              },
            ],
            'the shrinkage row must read shrink_weight, n and reporters straight off the stored correction, never invent them',
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it('reports nothing for a spot whose only keys were refused by the gates', () => {
    const ungatedCorrection: StoredCorrection = {
      spot_id: 'santa-catalina',
      schema: 'spot-correction/1',
      computed_at: '2026-08-09T07:00:00.000Z',
      bias: {
        swell_h_m: {
          per_source: {
            ncep_gfswave016: {
              lead_24_48: { b: -0.03, se: 0.09, n: 12, reporters: 4, applied: false, shrunk_from_global: 0.8 },
            },
          },
        },
      },
      clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
    };

    const metrics = buildMonthlyMetrics({
      observations: [],
      predictions: [],
      calls: [],
      corrections: [ungatedCorrection],
    });

    assert.deepEqual(
      metrics.shrinkage,
      [],
      'a correction file with no applied key has nothing gated to report, and must never appear as a phantom row',
    );
  });
});

describe('runMonthlyEvaluationOnce: the real store is read, not bypassed', () => {
  // Every property above drives buildMonthlyMetrics directly, which never
  // touches src/learning/evaluate.ts's own readCurrentCorrections --
  // the store list() call, the get() call, and parseStoredCorrection's three
  // refusal branches all go unexercised by a fixture with zero correction
  // files (this step's AT included). These two examples close that gap by
  // driving the real port against the same InMemoryStore fake
  // tests/unit/learning-fit-outcome.test.ts already uses for the nightly fit.

  function correctionRecord(spotId: string, keys: readonly { lead: string; n: number; reporters: number; shrunkFromGlobal: number }[]): StoredCorrection {
    const perLead: Record<string, { b: number; se: number; n: number; reporters: number; applied: boolean; shrunk_from_global: number }> = {};
    for (const key of keys) {
      perLead[key.lead] = {
        b: -0.18,
        se: 0.09,
        n: key.n,
        reporters: key.reporters,
        applied: true,
        shrunk_from_global: key.shrunkFromGlobal,
      };
    }
    return {
      spot_id: spotId,
      schema: 'spot-correction/1',
      computed_at: '2026-08-09T07:00:00.000Z',
      bias: { swell_h_m: { per_source: { ncep_gfswave016: perLead } } },
      clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
    };
  }

  it('reads a stored correction with two applied keys off the real store, and the metrics file it writes carries the fullest one', async () => {
    const store = new InMemoryStore();
    const correction = correctionRecord('playa-venao', [
      { lead: 'lead_12_24', n: 20, reporters: 6, shrunkFromGlobal: 0.5 },
      { lead: 'lead_24_48', n: 50, reporters: 9, shrunkFromGlobal: 0.3 },
    ]);
    await store.put(`${CORRECTIONS_PREFIX}current/playa-venao.json`, JSON.stringify(correction));

    const outcome = await runMonthlyEvaluationOnce({ store, clock: new FixedClock('2026-08-09T07:00:00Z') });
    assert.equal(outcome.completed, true);

    const body = await store.get(outcome.metrics_key);
    assert.ok(body, 'the run must write the metrics file it names in its own outcome');
    const metrics = JSON.parse(body!) as { shrinkage: { spot_id: string; shrink_weight: number; n: number; reporters: number }[] };

    assert.deepEqual(
      metrics.shrinkage,
      [{ spot_id: 'playa-venao', shrink_weight: 0.3, n: 50, reporters: 9, flagged: false }],
      'the shrinkage row must be the fullest applied key (n=50) read straight off the real stored correction, never the emptier one (n=20)',
    );
  });

  it('reads an unparseable correction byte as absent rather than crashing the run', async () => {
    const store = new InMemoryStore();
    await store.put(`${CORRECTIONS_PREFIX}current/santa-catalina.json`, 'not valid json at all');

    const outcome = await runMonthlyEvaluationOnce({ store, clock: new FixedClock('2026-08-09T07:00:00Z') });
    assert.equal(outcome.completed, true, 'a corrupt correction byte must not abort the run');

    const body = await store.get(outcome.metrics_key);
    const metrics = JSON.parse(body!) as { shrinkage: unknown[] };
    assert.deepEqual(
      metrics.shrinkage,
      [],
      'a byte nobody can parse names nobody: it must be read as absent, not as a phantom shrinkage row',
    );
  });
});
