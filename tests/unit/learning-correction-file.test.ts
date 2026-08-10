// Unit-level, mostly example-shaped tests for the emitted correction record
// (src/learning/correction-file.ts), schema spot-correction/1 (domain-model.md
// section 11). Test paradigm, per this step's own design notes: the emitted
// record SHAPE is example-shaped, single-example the documented fallback --
// but the refusal below the morning threshold is THE property this step
// exists to prove, so it stays a genuine fast-check property, quantified over
// arbitrary residual values: a run of beautiful-looking data must still be
// refused.
//
// Real production port types throughout (ObservationRow, PredictionRow,
// SpotInputs) -- no mocks, since buildCorrectionRecords is a pure function
// and a fake would test nothing about it that calling it directly does not.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { buildCorrectionRecords, type SpotInputs } from '../../src/learning/correction-file';
import { G1_MIN_MORNINGS } from '../../src/learning/constants';
import type { ObservationRow, PredictionRow } from '../../src/learning/inputs';
import { formScoreResidualSamples } from '../../src/learning/residuals';
import { QUALITY_OBSERVED_SCORE, type QualityToken } from '../../src/data/report-vocab';

const SPOT_ID = 'playa-venao';
const SOURCE = 'ncep_gfswave016';
const LEAD_BUCKET = 'lead_24_48';

class FixedClock {
  constructor(private readonly iso: string) {}
  now(): Date {
    return new Date(this.iso);
  }
}

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** n paired mornings for one spot, one model, one lead bucket -- the same shape 06 section 5.1 pairs on. */
function pairedMornings(spotId: string, count: number, reporters: number, biggerThanForecastM: number): SpotInputs {
  const observedMidM = 1.35; // chest_head band midpoint
  const observations: ObservationRow[] = [];
  const predictions: PredictionRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const observedDate = addDays('2026-07-01', index);
    predictions.push({
      spot_id: spotId,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00Z`,
      lead_h: 36,
      swell_h_m: observedMidM - biggerThanForecastM,
      swell_t_s: 10,
      land_masked: false,
    });
    observations.push({
      spot_id: spotId,
      device_id: `d_key_${index % reporters}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: 'chest_head',
    });
  }
  return { spotId, observations, predictions };
}

const clock = new FixedClock('2026-08-09T07:00:00Z');

describe('buildCorrectionRecords: below G1, refusal is auditable rather than invisible', () => {
  it('writes a record with applied: false, recording the mornings and reporters it examined', () => {
    const records = buildCorrectionRecords([pairedMornings(SPOT_ID, 9, 3, 0.22)], clock);

    const record = records.get(SPOT_ID);
    assert.ok(record, 'a refusal must still produce a record, so it can be audited');
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key, 'the height key must be keyed to the model and lead bucket it was measured on');
    assert.equal(key.applied, false, 'nine mornings from three people must not clear G1');
    assert.equal(key.n, 9);
    assert.equal(key.reporters, 3);
  });

  it('marks applied: true once G1 is cleared', () => {
    const records = buildCorrectionRecords([pairedMornings(SPOT_ID, 22, 7, 0.22)], clock);

    const key = records.get(SPOT_ID)?.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key);
    assert.equal(key.applied, true, 'twenty-two mornings clears G1, and this step owes no gate that could still refuse it');
  });
});

describe('buildCorrectionRecords: the emitted record shape (domain-model.md section 11)', () => {
  it('names the schema, the model+lead key, and the clamp limits its reader must honour', () => {
    const record = buildCorrectionRecords([pairedMornings(SPOT_ID, 12, 5, 0.22)], clock).get(SPOT_ID);

    assert.ok(record);
    assert.equal(record.schema, 'spot-correction/1');
    assert.equal(record.spot_id, SPOT_ID);
    assert.equal(typeof record.computed_at, 'string');
    assert.equal(record.clamp.max_abs_h_frac, 0.4);
    assert.equal(record.clamp.max_abs_score, 12);
    assert.ok(Object.keys(record.bias.swell_h_m.per_source).includes(SOURCE));
  });
});

describe('buildCorrectionRecords: G4, only the shrunken estimate ever reaches the file (06 section 7)', () => {
  it('pulls two spots with disagreeing raw estimates away from their own raw mean, toward each other', () => {
    const spotA = pairedMornings('spot-a', 10, 5, 0.6);
    const spotB = pairedMornings('spot-b', 10, 5, -0.6);

    const records = buildCorrectionRecords([spotA, spotB], clock);
    const keyA = records.get('spot-a')?.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    const keyB = records.get('spot-b')?.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(keyA && keyB);

    // Each spot's own raw weighted mean is exactly -biggerThanForecastM (06 section 4's convention).
    assert.notEqual(keyA.b, -0.6, 'spot A must not store its own raw estimate once a differing parent exists to pool toward');
    assert.notEqual(keyB.b, 0.6, 'spot B must not store its own raw estimate once a differing parent exists to pool toward');
    // Pooling toward each other must not overshoot: each shrunk value stays between its own raw and the parent (their mean, 0).
    assert.ok(keyA.b >= -0.6 - 1e-9 && keyA.b <= 0 + 1e-9, `spot A's shrunk b (${keyA.b}) must sit between its own raw (-0.6) and the parent (0)`);
    assert.ok(keyB.b <= 0.6 + 1e-9 && keyB.b >= 0 - 1e-9, `spot B's shrunk b (${keyB.b}) must sit between its own raw (0.6) and the parent (0)`);
  });
});

describe('buildCorrectionRecords: the point -- below the morning threshold, no correction is ever applied', () => {
  it('never marks applied: true below G1, however the residuals look', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: G1_MIN_MORNINGS - 1 }),
        fc.integer({ min: 1, max: 9 }),
        fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
        (count, reportersRaw, biggerThanForecastM) => {
          const reporters = Math.min(reportersRaw, count);
          const records = buildCorrectionRecords([pairedMornings(SPOT_ID, count, reporters, biggerThanForecastM)], clock);
          const key = records.get(SPOT_ID)?.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];

          assert.ok(key, 'a refusal must still be recorded, so it is auditable rather than invisible');
          assert.equal(
            key.applied,
            false,
            `${count} mornings is below the ${G1_MIN_MORNINGS}-morning floor, so applied must be false whatever the measured difference (${biggerThanForecastM} m) looks like`,
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('formScoreResidualSamples: displayed score residual law', () => {
  it('uses the shown score less the shipped quality anchor and skips a report with no captured prediction', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<QualityToken>('bad', 'ok', 'good', 'epic'),
        fc.integer({ min: 0, max: 100 }),
        (quality, shownScore) => {
          const samples = formScoreResidualSamples([
            {
              spot_id: SPOT_ID,
              device_id: 'd_shown_score',
              quality,
              predicted: { score_q: shownScore },
            },
            {
              spot_id: SPOT_ID,
              device_id: 'd_no_prediction',
              quality,
              predicted: null,
            },
          ]);

          assert.deepEqual(samples, [
            {
              device_id: 'd_shown_score',
              value: shownScore - QUALITY_OBSERVED_SCORE[quality],
              weight: 1 / 25 ** 2,
            },
          ]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
