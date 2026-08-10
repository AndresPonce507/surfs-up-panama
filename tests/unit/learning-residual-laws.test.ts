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
import { formHeightResidualRows, formScoreResidualSamples } from '../../src/learning/residuals';
import { shrinkTowardParent } from '../../src/learning/shrink';
import { hEff } from '../../src/scoring/engine';
import type { QualityToken } from '../../src/data/report-vocab';
import { sizeBands, type SizeBandToken } from '../../src/data/size-bands';
import type { ObservationRow, PredictionRow } from '../../src/learning/inputs';

const RUNS = 100;

const someBand: fc.Arbitrary<SizeBandToken> = fc.constantFrom(...sizeBands.map((row) => row.value));
const someSwellHeightM = fc.double({ min: 0.1, max: 4, noNaN: true, noDefaultInfinity: true });
const someSwellPeriodS = fc.double({ min: 6, max: 20, noNaN: true, noDefaultInfinity: true });

function onePairedMorning(
  swellHeightM: number,
  swellPeriodS: number,
  band: SizeBandToken,
  deviceId = 'd_law_0',
): {
  observation: ObservationRow;
  prediction: PredictionRow;
} {
  const validTs = '2026-07-01T18:00Z';
  return {
    observation: {
      spot_id: 'playa-venao',
      device_id: deviceId,
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

  it('strictly rises when the paired forecast rises and the observed band is held fixed', () => {
    fc.assert(
      fc.property(
        someSwellHeightM,
        someSwellPeriodS,
        someBand,
        fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }),
        (swellHeightM, swellPeriodS, band, raiseM) => {
          const before = onePairedMorning(swellHeightM, swellPeriodS, band);
          const raised = onePairedMorning(swellHeightM + raiseM, swellPeriodS, band);
          const beforeValue = formHeightResidualRows([before.observation], [before.prediction])[0]!.sample.value;
          const raisedValue = formHeightResidualRows([raised.observation], [raised.prediction])[0]!.sample.value;

          assert.deepEqual(
            raised.observation.size_band,
            before.observation.size_band,
            'this law changes the forecast alone, never what the person reported',
          );
          assert.ok(
            raisedValue > beforeValue,
            `raising H_eff's source height from ${swellHeightM} m by ${raiseM} m must raise r_height; got ${raisedValue} not above ${beforeValue}`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('strictly falls when the observed band rises and the paired forecast is held fixed', () => {
    fc.assert(
      fc.property(someSwellHeightM, someSwellPeriodS, (swellHeightM, swellPeriodS) => {
        const smaller = onePairedMorning(swellHeightM, swellPeriodS, 'chest_head');
        const bigger = onePairedMorning(swellHeightM, swellPeriodS, 'head_overhead');
        const smallerValue = formHeightResidualRows([smaller.observation], [smaller.prediction])[0]!.sample.value;
        const biggerValue = formHeightResidualRows([bigger.observation], [bigger.prediction])[0]!.sample.value;

        assert.deepEqual(
          bigger.prediction,
          smaller.prediction,
          'this law changes the observed report alone, never the paired forecast',
        );
        assert.ok(
          biggerValue < smallerValue,
          `moving the observed band from chest_head to head_overhead must lower r_height; got ${biggerValue} not below ${smallerValue}`,
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps the ordered numeric residual stream unchanged when reporters are reassigned before anyone has history', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 30 }),
        fc.integer({ min: 1, max: 5 }),
        someSwellHeightM,
        someSwellPeriodS,
        (count, rotation, swellHeightM, swellPeriodS) => {
          const original = Array.from({ length: count }, (_unused, index) =>
            onePairedMorning(swellHeightM, swellPeriodS, 'chest_head', `d_law_${index % 6}`),
          );
          const reassigned = Array.from({ length: count }, (_unused, index) =>
            onePairedMorning(swellHeightM, swellPeriodS, 'chest_head', `d_law_${(index + rotation) % 6}`),
          );
          const originalRows = formHeightResidualRows(
            original.map((morning) => morning.observation),
            [original[0]!.prediction],
          );
          const reassignedRows = formHeightResidualRows(
            reassigned.map((morning) => morning.observation),
            [reassigned[0]!.prediction],
          );

          assert.notDeepEqual(
            reassigned.map((morning) => morning.observation.device_id),
            original.map((morning) => morning.observation.device_id),
            'the reassignment must actually give mornings to different people',
          );
          assert.deepEqual(
            reassignedRows.map(({ source, leadBucket, sample }) => ({ source, leadBucket, value: sample.value, weight: sample.weight })),
            originalRows.map(({ source, leadBucket, sample }) => ({ source, leadBucket, value: sample.value, weight: sample.weight })),
            'with u_hat fixed at zero, reassignment may change only carried identity, never the ordered residual values the deterministic fit stores',
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

const someQuality: fc.Arbitrary<QualityToken> = fc.constantFrom('bad', 'ok', 'good', 'epic');

describe('the score residual omits mornings without a captured forecast', () => {
  it('emits exactly the same score samples, in the same order, after null-forecast mornings are added', () => {
    const reportedMorning = fc.record({
      quality: someQuality,
      shownScore: fc.integer({ min: 0, max: 100 }),
    });
    const morningWithOrWithoutForecast = fc.oneof(
      reportedMorning.map(({ quality, shownScore }) => ({ quality, shownScore, captured: true as const })),
      reportedMorning.map(({ quality, shownScore }) => ({ quality, shownScore, captured: false as const })),
    );

    fc.assert(
      fc.property(fc.array(morningWithOrWithoutForecast, { maxLength: 30 }), (mornings) => {
        const observations: ObservationRow[] = mornings.map((morning, index) => ({
          spot_id: 'playa-venao',
          device_id: `d_score_${index}`,
          quality: morning.quality,
          predicted: morning.captured ? { score_q: morning.shownScore } : null,
        }));
        const withForecastOnly = observations.filter((observation) => observation.predicted !== null);

        assert.deepEqual(
          formScoreResidualSamples(observations),
          formScoreResidualSamples(withForecastOnly),
          'a null forecast is omitted, not converted into a zero-valued sample or allowed to disturb the retained sample order',
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
