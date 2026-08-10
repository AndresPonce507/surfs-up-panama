// Property laws for the pure pieces the nightly fit's emission spine is built
// from: the residual form (06-learning-layer.md section 5.1), the weighted
// mean and its standard error (section 5.2, 6.1), and shrinkage (section 5.3).
// Each is a declared law, not a re-implementation: every property below
// restates the formula the design document states, over generated inputs,
// rather than asserting a fixed example the implementation could satisfy by
// accident.
//
// Layer: unit, pure functions only. No store, no clock read from the
// ambient environment -- every instant a residual needs is a field on a
// generated fixture, never `new Date()`.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { weightedMean, weightedSampleStandardError, type WeightedSample } from '../../src/learning/estimate';
import { formHeightResidualRows } from '../../src/learning/residuals';
import { shrinkTowardParent } from '../../src/learning/shrink';
import { hEff } from '../../src/scoring/engine';
import { sizeBands, type SizeBandToken } from '../../src/data/size-bands';
import type { ObservationRow, PredictionRow } from '../../src/learning/inputs';

const RUNS = 100;

const someBand: fc.Arbitrary<SizeBandToken> = fc.constantFrom(...sizeBands.map((row) => row.value));
const someSwellHeightM = fc.double({ min: 0.1, max: 4, noNaN: true, noDefaultInfinity: true });
const someSwellPeriodS = fc.double({ min: 6, max: 20, noNaN: true, noDefaultInfinity: true });

function onePairedMorning(swellHeightM: number, swellPeriodS: number, band: SizeBandToken): {
  observation: ObservationRow;
  prediction: PredictionRow;
} {
  const validTs = '2026-07-01T18:00Z';
  return {
    observation: {
      spot_id: 'playa-venao',
      device_id: 'd_law_0',
      observed_at: '2026-07-01T18:41:00Z',
      size_band: band,
    },
    prediction: {
      spot_id: 'playa-venao',
      source: 'ncep_gfswave016',
      valid_ts: validTs,
      lead_h: 36,
      swell_h_m: swellHeightM,
      swell_t_s: swellPeriodS,
      land_masked: false,
    },
  };
}

function midOf(band: SizeBandToken): number {
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) throw new Error(`test bug: unknown band ${band}`);
  if (row.hi_m === Number.POSITIVE_INFINITY) return 3.0; // the open top band's nominal value, 06 section 5.1
  return (row.lo_m + row.hi_m) / 2;
}

describe('the residual form is r_height = H_eff_pred - mid(band), u_hat = 0 this slice', () => {
  it('matches the declared formula exactly, for any paired morning', () => {
    fc.assert(
      fc.property(someSwellHeightM, someSwellPeriodS, someBand, (swellHeightM, swellPeriodS, band) => {
        const { observation, prediction } = onePairedMorning(swellHeightM, swellPeriodS, band);
        const rows = formHeightResidualRows([observation], [prediction]);

        assert.equal(rows.length, 1, 'one report pairing with one prediction row must form exactly one sample');
        const expected = hEff(swellHeightM, swellPeriodS) - midOf(band);
        assert.ok(
          Math.abs(rows[0]!.sample.value - expected) < 1e-9,
          `r_height must equal hEff(swell_h_m, swell_t_s) - mid(band); got ${rows[0]!.sample.value}, expected ${expected}`,
        );
      }),
      { numRuns: RUNS },
    );
  });
});

const someWeight = fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true });
const someValue = fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true });

describe('the weighted mean is a declared law, not a re-implementation', () => {
  it('reduces to the plain arithmetic mean when every sample carries the same weight, for any nonempty list', () => {
    fc.assert(
      fc.property(fc.array(someValue, { minLength: 1, maxLength: 20 }), someWeight, (values, weight) => {
        const samples: WeightedSample[] = values.map((value) => ({ value, weight }));
        const arithmeticMean = values.reduce((sum, value) => sum + value, 0) / values.length;

        assert.ok(
          Math.abs(weightedMean(samples) - arithmeticMean) < 1e-9,
          `uniform weights must reduce the weighted mean to the arithmetic mean; got ${weightedMean(samples)}, expected ${arithmeticMean}`,
        );
      }),
      { numRuns: RUNS },
    );
  });
});

describe('the standard error is the samples\' own spread, never invented from nothing', () => {
  it('is exactly 0 when every sample carries an identical value, however many samples or whatever their weights', () => {
    fc.assert(
      fc.property(
        someValue,
        fc.array(someWeight, { minLength: 1, maxLength: 20 }),
        (value, weights) => {
          const samples: WeightedSample[] = weights.map((weight) => ({ value, weight }));
          const se = weightedSampleStandardError(samples);
          assert.ok(
            Math.abs(se) < 1e-9,
            `reports that agree perfectly have no spread of their own, so se_sample must read as 0 (within floating-point tolerance) before any physical floor is applied; got ${se}`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('shrinkage moves an estimate toward its parent as evidence thins, never away from it (06 section 5.3, G4)', () => {
  it('pulls a raw estimate strictly closer to zero than the raw estimate itself, for any finite n and any tau > 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true }).filter((raw) => Math.abs(raw) > 0.01),
        fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 60 }),
        (raw, tau, n) => {
          const shrunk = shrinkTowardParent(raw, n, tau, 0);
          assert.ok(
            Math.abs(shrunk) < Math.abs(raw) - 1e-9,
            `with tau > 0 and a finite n, some pull toward the zero parent must always happen: got |${shrunk}| not smaller than |${raw}|`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('pulls a raw estimate closer to zero, monotonically, as the number of mornings behind it shrinks, tau and the raw estimate held fixed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true }).filter((raw) => raw !== 0),
        fc.double({ min: 0.5, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        (raw, tau, nA, nB) => {
          fc.pre(nA < nB);
          const shrunkAtFewerMornings = shrinkTowardParent(raw, nA, tau, 0);
          const shrunkAtMoreMornings = shrinkTowardParent(raw, nB, tau, 0);

          assert.ok(
            Math.abs(shrunkAtFewerMornings) <= Math.abs(shrunkAtMoreMornings) + 1e-9,
            `fewer mornings (${nA}) must pull the estimate at least as close to zero as more mornings (${nB}) does: got |${shrunkAtFewerMornings}| > |${shrunkAtMoreMornings}|`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});
