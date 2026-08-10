// Read-time correction gates are a second line of defence. These laws use
// hand-forged `applied: true` records deliberately: the scorer must derive
// its verdict from the record's evidence, never trust its stored claim.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  applyCorrection,
  type CorrectionGate,
  type CorrectionRecord,
  type SpotSeed,
} from '../../src/scoring/engine';

const seed: SpotSeed = {
  spot_id: 'playa-venao',
  name: 'Playa Venao',
  region_id: 'pa-pacific',
  timezone: 'America/Panama',
  shore_normal_deg: 175,
  swell_window_deg: [150, 210],
  h_ref_m: 1.3,
  s_size: 0.5,
  wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
  tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
};

type Evidence = { b: number; se: number; n: number; reporters: number; applied: boolean };

function correctionWithScore(evidence: Evidence): CorrectionRecord {
  return {
    spot_id: seed.spot_id,
    schema: 'spot-correction/1',
    score_delta: { ...evidence, units: 'display_points' },
  };
}

function expectedGate({ b, se, n, reporters }: Evidence, sigmaEff: number): CorrectionGate {
  const flooredSe = Math.max(se, 0.5 * sigmaEff / Math.sqrt(n));
  if (n < 10) return 'n_lt_10';
  if (reporters < 5) return 'reporters_lt_5';
  if (Math.abs(b) <= 2 * flooredSe) return 'not_significant';
  return 'applied';
}

describe('applyCorrection: read-time gates are derived from evidence, not a file claim', () => {
  it('re-checks every forged score record against its own G1, G2 and floored G3 evidence', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 80 }),
        fc.integer({ min: 1, max: 20 }),
        fc.double({ min: -80, max: 80, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true }),
        (n, reporters, b, se) => {
          const evidence = { b, se, n, reporters, applied: true };
          const outcome = applyCorrection(seed, correctionWithScore(evidence));
          const expected = expectedGate(evidence, 25);

          assert.equal(
            outcome.gate,
            expected,
            `the scorer must derive ${expected} from n=${n}, reporters=${reporters}, b=${b}, se=${se}, not trust the forged applied claim`,
          );
          assert.equal(
            outcome.delta_q,
            expected === 'applied' ? -b / 100 : 0,
            'only admitted evidence may move the score, with forecast-minus-observed sign',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('re-checks every forged height key before resolving it for a member', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 80 }),
        fc.integer({ min: 1, max: 20 }),
        fc.double({ min: -8, max: 8, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 3, noNaN: true, noDefaultInfinity: true }),
        (n, reporters, b, se) => {
          const evidence = { b, se, n, reporters, applied: true };
          const correction: CorrectionRecord = {
            spot_id: seed.spot_id,
            schema: 'spot-correction/1',
            bias: { swell_h_m: { per_source: { ncep_gfswave016: { lead_24_48: evidence } } } },
          };
          const outcome = applyCorrection(seed, correction);
          const expected = expectedGate(evidence, 0.48);

          assert.equal(outcome.gate, expected);
          assert.equal(
            outcome.memberHBias('ncep_gfswave016', 36),
            expected === 'applied' ? b : 0,
            'only a height key that clears every re-check may reach the matching member',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses an admitted height key only for its own source and lead bucket', () => {
    const evidence = { b: -0.18, se: 0.08, n: 22, reporters: 7, applied: true };
    const correction: CorrectionRecord = {
      spot_id: seed.spot_id,
      schema: 'spot-correction/1',
      bias: { swell_h_m: { per_source: { ncep_gfswave016: { lead_24_48: evidence } } } },
    };

    const outcome = applyCorrection(seed, correction);
    assert.equal(outcome.gate, 'applied');
    assert.equal(outcome.memberHBias('ncep_gfswave016', 36), evidence.b);
    assert.equal(outcome.memberHBias('ncep_gfswave016', 12), 0);
    assert.equal(outcome.memberHBias('another-source', 36), 0);
  });
});
