// Property laws for the scoring core. These tests own the laws declared in
// 05-scoring-engine.md section 10. They deliberately drive only pure,
// declared-input functions with fast-check. The example-level pipeline
// contract remains in the acceptance suite.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { confidence } from '../../src/scoring/confidence';
import {
  applyCorrection,
  blend,
  combine,
  hEff,
  rankSpots,
  sDir,
  sSize,
  sTide,
  sWind,
  type DeclaredMember,
  type EffectiveSpotParams,
  type MemberRow,
  type ScoreResult,
  type SpotSeed,
  type SubScores,
  type TideObs,
  type WindObs,
} from '../../src/scoring/engine';
import { venaoMorningMembers, venaoSeed } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fixtures';

const decimal = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const unit = decimal(0, 1);
const positiveUnit = decimal(0.01, 1);
const angle = decimal(0, 359.999);

const params: EffectiveSpotParams = {
  swell_window_deg: [150, 210],
  sigma_dir_deg: 20,
  h_ref_m: 1.3,
  s_size: 0.5,
  shore_normal_deg: 175,
  wind: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
  tide: { eta_opt: 0.5, sigma_eta: 0.35, neutral: false },
  weights: { w_size: 0.4, w_wind: 0.4, w_tide: 0.2 },
};

const microtidalParams: EffectiveSpotParams = {
  ...params,
  tide: { ...params.tide, neutral: true },
};

const venaoMembers: MemberRow[] = venaoMorningMembers.map((member) => ({
  source: member.source,
  lead_h: 12,
  swell: { h_m: member.h_m, t_s: member.t_s, dir_deg: member.dir_deg },
  swell2: null,
}));

const tide: TideObs = { height_m: 2.31, day_low_m: 0.9, day_high_m: 4.3 };
const wind: WindObs = { speed_kt: 7, dir_deg: 40 };

function close(actual: number, expected: number, tolerance: number, explanation: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${explanation}. Expected ${expected} within ${tolerance}; got ${actual}.`,
  );
}

function scoreClose(actual: ScoreResult, expected: ScoreResult, explanation: string): void {
  const tolerance = 1e-12;
  close(actual.q, expected.q, tolerance, `${explanation}: q`);
  close(actual.q_final, expected.q_final, tolerance, `${explanation}: q_final`);
  close(actual.h_eff_m, expected.h_eff_m, tolerance, `${explanation}: h_eff_m`);
  assert.equal(actual.score, expected.score, `${explanation}: rounded score`);
  assert.deepEqual(actual.missing, expected.missing, `${explanation}: missing factors`);
  assert.equal(actual.weakest_link, expected.weakest_link, `${explanation}: weakest link`);
  assert.deepEqual(actual.correction, expected.correction, `${explanation}: correction`);

  for (const factor of ['dir', 'size', 'wind', 'tide'] as const) {
    const actualValue = actual.sub[factor];
    const expectedValue = expected.sub[factor];
    if (actualValue === null || expectedValue === null) {
      assert.equal(actualValue, expectedValue, `${explanation}: ${factor} availability`);
    } else {
      close(actualValue, expectedValue, tolerance, `${explanation}: ${factor}`);
    }
  }

  assert.equal(actual.damages.length, expected.damages.length, `${explanation}: damage count`);
  actual.damages.forEach((damage, index) => {
    const expectedDamage = expected.damages[index];
    assert.ok(expectedDamage !== undefined, `${explanation}: expected damage ${index}`);
    assert.equal(damage.factor, expectedDamage.factor, `${explanation}: damage factor ${index}`);
    close(damage.damage, expectedDamage.damage, tolerance, `${explanation}: damage value ${index}`);
  });
}

function scoreFor(
  swell: { h_m: number; t_s: number; dir_deg: number },
  p: EffectiveSpotParams = params,
  chosenWind: WindObs | null = wind,
  chosenTide: TideObs | null = tide,
) {
  const effectiveHeight = hEff(swell.h_m, swell.t_s);
  const sub: SubScores = {
    dir: sDir(swell.dir_deg, p),
    size: sSize(effectiveHeight, p),
    wind: sWind(chosenWind, p),
    tide: sTide(chosenTide, p),
  };
  return combine(sub, p, 0);
}

function rotate(degrees: number, by: number): number {
  return (degrees + by + 360) % 360;
}

function paramsWithAngles(
  p: EffectiveSpotParams,
  by: number,
): EffectiveSpotParams {
  return {
    ...p,
    swell_window_deg: [rotate(p.swell_window_deg[0], by), rotate(p.swell_window_deg[1], by)],
    shore_normal_deg: rotate(p.shore_normal_deg, by),
  };
}

function member(source: string, h_m: number, t_s: number, dir_deg: number): MemberRow {
  return { source, lead_h: 12, swell: { h_m, t_s, dir_deg }, swell2: null };
}

const seed: SpotSeed = venaoSeed;

describe('scoring engine laws', () => {
  // covers: R12
  it('keeps every score and present sub-score inside its declared bounds', () => {
    fc.assert(
      fc.property(angle, decimal(0, 3), decimal(1, 20), decimal(0, 80), angle, unit, (dir, h, period, windSpeed, windDir, tideLevel) => {
        const result = scoreFor(
          { h_m: h, t_s: period, dir_deg: dir },
          params,
          { speed_kt: windSpeed, dir_deg: windDir },
          { height_m: tideLevel, day_low_m: 0, day_high_m: 1 },
        );
        const values = [result.sub.dir, result.sub.size, result.sub.wind, result.sub.tide, result.q, result.q_final];
        for (const value of values) {
          assert.ok(value !== null && value >= 0 && value <= 1, 'Every present score must stay in [0, 1] so publication cannot emit impossible physics.');
        }
        assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100, 'The public score must be an integer from 0 to 100 so every reader sees one canonical scale.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R13
  it('returns bit-identical scores for identical declared inputs', () => {
    fc.assert(
      fc.property(angle, decimal(0, 3), decimal(1, 20), (dir, h, period) => {
        const input = { h_m: h, t_s: period, dir_deg: dir };
        assert.deepEqual(
          scoreFor(input),
          scoreFor(input),
          'Identical declared inputs must produce bit-identical output so the call never depends on a clock, environment, or filesystem.',
        );
      }),
      { numRuns: 100 },
    );
  });

  // covers: R14
  it('lets the direction gate dominate the total score', () => {
    fc.assert(
      fc.property(unit, positiveUnit, positiveUnit, positiveUnit, (dir, size, windScore, tideScore) => {
        const result = combine({ dir, size, wind: windScore, tide: tideScore }, params, 0);
        assert.ok(result.q <= dir + 1e-12, 'The direction gate must cap the score so strong size, wind, and tide never average away an unsuitable swell direction.');
        const closed = combine({ dir: 0, size, wind: windScore, tide: tideScore }, params, 0);
        assert.equal(closed.q, 0, 'A fully closed direction gate must force the total score to zero, not merely reduce it.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R15
  it('uses a geometric mean that any zero present factor can collapse', () => {
    fc.assert(
      fc.property(positiveUnit, positiveUnit, positiveUnit, positiveUnit, (dir, size, windScore, tideScore) => {
        const result = combine({ dir, size, wind: windScore, tide: tideScore }, params, 0);
        assert.ok(result.q <= Math.max(size, windScore, tideScore) + 1e-12, 'The geometric mean must never exceed its strongest non-gate factor, otherwise one weak condition could disappear.');
        const collapsed = combine({ dir, size: 0, wind: windScore, tide: tideScore }, params, 0);
        assert.equal(collapsed.q, 0, 'A zero present factor must force the published score to zero so a fatal condition cannot be hidden by averaging.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R16
  it('scores direction at one inside the swell window and never improves farther outside it', () => {
    fc.assert(
      fc.property(decimal(0, 120), decimal(0, 120), (nearDelta, fartherDelta) => {
        const low = Math.min(nearDelta, fartherDelta);
        const high = Math.max(nearDelta, fartherDelta);
        assert.equal(sDir(180, params), 1, 'A swell inside the configured window must receive a full direction score.');
        const near = sDir(210 + low, params);
        const far = sDir(210 + high, params);
        assert.ok(far <= near + 1e-12, 'Moving farther outside the configured swell window must never improve direction fit.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R17
  it('makes size improve toward the spot reference and decline past it', () => {
    fc.assert(
      fc.property(decimal(0.01, 1.28), decimal(0.02, 1.29), decimal(1.31, 3.99), decimal(1.32, 4), (leftA, leftB, rightA, rightB) => {
        const below = Math.min(leftA, leftB);
        const closerBelow = Math.max(leftA, leftB);
        const above = Math.min(rightA, rightB);
        const fartherAbove = Math.max(rightA, rightB);
        const left = sSize(below, params);
        const closer = sSize(closerBelow, params);
        const atReference = sSize(params.h_ref_m, params);
        const right = sSize(above, params);
        const farther = sSize(fartherAbove, params);
        assert.ok(left < closer, 'Below the reference, every height closer to the reference must score strictly higher.');
        assert.ok(farther < right, 'Past the reference, every height farther from the reference must score strictly lower.');
        assert.ok(closer < atReference, 'A height below the reference must score below the reference so the size curve has a meaningful ascent.');
        assert.ok(right < atReference, 'A height above the reference must score below the reference so the size curve has a meaningful descent.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R18
  it('penalizes onshore wind more than offshore wind and treats crosswind signs equally', () => {
    const windParams: EffectiveSpotParams = { ...params, shore_normal_deg: 0 };
    fc.assert(
      fc.property(decimal(0.01, 80), (speed) => {
        const onshore = sWind({ speed_kt: speed, dir_deg: 0 }, windParams);
        const offshore = sWind({ speed_kt: speed, dir_deg: 180 }, windParams);
        assert.ok(onshore !== null && offshore !== null && onshore < offshore, 'At the same speed, pure onshore wind must score below pure offshore wind because onshore wind ruins the break faster.');
        const crossEast = sWind({ speed_kt: speed, dir_deg: 90 }, windParams);
        const crossWest = sWind({ speed_kt: speed, dir_deg: 270 }, windParams);
        assert.equal(crossEast, crossWest, 'Crosswind penalty must be sign-symmetric so mirrored crosswinds are treated equally.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R19
  it('keeps the no-file correction hook inert and clamps its published delta', () => {
    fc.assert(
      fc.property(unit, positiveUnit, positiveUnit, positiveUnit, decimal(-1, 1), decimal(-1, 1), (dir, size, windScore, tideScore, firstDelta, secondDelta) => {
        const sub = { dir, size, wind: windScore, tide: tideScore } satisfies SubScores;
        const plain = combine(sub, params, 0);
        const corrected = combine(sub, params, firstDelta);
        const lowerDelta = Math.min(firstDelta, secondDelta);
        const higherDelta = Math.max(firstDelta, secondDelta);
        assert.equal(plain.q_final, plain.q, 'A zero correction delta must leave physics unchanged so launch begins as the seed model.');
        assert.ok(Math.abs(corrected.q_final - corrected.q) <= Math.abs(firstDelta) + 1e-12, 'The correction may move the score by no more than its declared delta before the [0, 1] clamp.');
        assert.ok(combine(sub, params, lowerDelta).q_final <= combine(sub, params, higherDelta).q_final, 'Increasing the declared correction delta must never lower the corrected score.');
        const noFile = applyCorrection(seed, null);
        assert.equal(noFile.gate, 'no_file', 'An absent correction file must report the no_file gate so the public record explains why learning did not change it.');
        assert.equal(noFile.delta_q, 0, 'An absent correction file must contribute exactly zero score delta, never an implicit prior.');
        assert.equal(noFile.memberHBias('any-source', 24), 0, 'An absent correction file must contribute exactly zero member height bias, never an implicit prior.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R20
  it('keeps confidence inputs outside the scoring signature', () => {
    assert.equal(combine.length, 3, 'The score combiner must accept only sub-scores, spot parameters, and correction delta so confidence cannot be multiplied into the score.');
    const sub = { dir: 1, size: 0.7, wind: 0.8, tide: 0.9 } satisfies SubScores;
    const before = combine(sub, params, 0);
    const lowConfidence = confidence([venaoMembers[0]!], { kind: 'absolute' }, { mae: 2, mae_ref: 2 }, 240, []);
    const highConfidence = confidence(venaoMembers, { kind: 'absolute' }, null, null, []);
    assert.notEqual(lowConfidence.c_total, highConfidence.c_total, 'The confidence inputs must be able to change confidence, otherwise their independence would be vacuous.');
    assert.deepEqual(combine(sub, params, 0), before, 'Changing only confidence inputs must leave the score result bit-identical because confidence is outside the score path.');
  });

  // covers: R21
  it('decomposes every positive score into ordered log damages', () => {
    fc.assert(
      fc.property(positiveUnit, positiveUnit, positiveUnit, positiveUnit, (dir, size, windScore, tideScore) => {
        const result = combine({ dir, size, wind: windScore, tide: tideScore }, params, 0);
        const totalDamage = result.damages.reduce((sum, item) => sum + item.damage, 0);
        close(result.q, Math.exp(-totalDamage), 1e-10, 'The damage list must multiply back to the score so the displayed weakest link explains the actual physics');
        const first = result.damages.at(0);
        assert.equal(result.weakest_link, first?.factor ?? null, 'The weakest link must be the first ordered damage so the UI names the factor that cost the most score.');
        const perfect = combine({ dir: 1, size: 1, wind: 1, tide: 1 }, params, 0);
        assert.equal(perfect.weakest_link, null, 'A perfect score has no weakest link and must not fabricate a culprit.');
      }),
      { numRuns: 100 },
    );
    const tie = combine({ dir: 1, size: 0.5, wind: 0.5, tide: 1 }, params, 0);
    assert.equal(tie.weakest_link, 'size', 'Equal largest damages must use the fixed dir, size, wind, tide tiebreak order.');
  });

  // covers: R22
  it('blends the declared member universe independently of order and preserves every exclusion count', () => {
    fc.assert(
      fc.property(decimal(0.01, 5), decimal(1, 20), angle, fc.integer({ min: 1, max: 4 }), (h, period, dir, excludedCount) => {
        const excluded: DeclaredMember[] = Array.from({ length: excludedCount }, (_, index) => ({
          source: `excluded-${index}`,
          exclusion: index % 2 === 0 ? 'land_masked' : 'unavailable',
        }));
        const members: DeclaredMember[] = [
          member('a', h, period, dir),
          ...excluded,
          member('b', h * 1.1, period * 1.1, dir),
        ];
        assert.deepEqual(blend(members), blend([...members].reverse()), 'Reordering the same model opinions must not change the blend because model order has no physical meaning.');
        const result = blend(members);
        assert.equal(result.kind, 'ok', 'Two usable members in a declared universe must still produce a blend.');
        if (result.kind === 'ok') {
          assert.equal(result.members_used, 2, 'Every usable member must be counted in the same declared universe.');
          assert.equal(result.members_null, excludedCount, 'Every excluded member must remain visible as a null count, never silently disappear.');
          assert.equal(result.members_used + result.members_null, members.length, 'Used plus excluded members must exactly equal the declared member universe.');
        }
      }),
      { numRuns: 100 },
    );
    assert.deepEqual(
      rankSpots([
        { spot_id: 'bravo', v: 80 },
        { spot_id: 'alpha', v: 80 },
        { spot_id: 'charlie', v: 20 },
      ]),
      [
        { spot_id: 'alpha', rank: 1 },
        { spot_id: 'bravo', rank: 1 },
        { spot_id: 'charlie', rank: 3 },
      ],
      'Equal scores must retain one deterministic lexical order and one shared rank before the next rank advances.',
    );
    const aroundNorth = blend([member('west-of-north', 1, 10, 359), member('east-of-north', 1, 10, 1)]);
    assert.equal(aroundNorth.kind, 'ok', 'Two valid members must produce a usable blend, not a missing-data result.');
    if (aroundNorth.kind === 'ok') {
      close(aroundNorth.swell.dir_deg, 0, 1e-9, 'Directions at 359 and 1 degrees must blend to north, never the opposite direction');
    }
    const arithmetic = blend([
      member('first', 1, 8, 180),
      member('second', 3, 12, 180),
    ]);
    assert.equal(arithmetic.kind, 'ok', 'Two usable opinions must produce a blend.');
    if (arithmetic.kind === 'ok') {
      assert.equal(arithmetic.swell.h_m, 2, 'Blending must use the arithmetic mean of member heights.');
      assert.equal(arithmetic.swell.t_s, 10, 'Blending must use the arithmetic mean of member periods.');
      assert.equal(arithmetic.members_used, 2, 'The blend must publish how many usable model opinions it consumed.');
      assert.equal(arithmetic.members_null, 0, 'A blend given no excluded member must report zero excluded members.');
    }
  });

  // covers: R23
  it('is rotationally invariant when every physical angle rotates together', () => {
    fc.assert(
      fc.property(angle, decimal(0.01, 3), decimal(1, 20), angle, angle, (swellDir, h, period, windDir, rotation) => {
        const initial = scoreFor({ h_m: h, t_s: period, dir_deg: swellDir }, params, { speed_kt: 12, dir_deg: windDir }, tide);
        const rotatedParams = paramsWithAngles(params, rotation);
        const rotated = scoreFor(
          { h_m: h, t_s: period, dir_deg: rotate(swellDir, rotation) },
          rotatedParams,
          { speed_kt: 12, dir_deg: rotate(windDir, rotation) },
          tide,
        );
        scoreClose(rotated, initial, 'Rotating swell, wind, shore normal, and swell window together must leave every score output unchanged so no Panama-specific direction is hardcoded');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R24
  it('rewards a longer period while effective height remains below the reference', () => {
    close(hEff(1.5, 16), 1.8973665961010275, 1e-12, 'The documented H_eff sanity example must remain reproducible for callers and reviewers');
    close(hEff(1.5, 8), 1.3416407864998738, 1e-12, 'The documented short-period H_eff sanity example must remain reproducible for callers and reviewers');
    fc.assert(
      fc.property(decimal(0.01, 0.8), decimal(1, 10), decimal(10.01, 20), (h, shortPeriod, longPeriod) => {
        const short = scoreFor({ h_m: h, t_s: shortPeriod, dir_deg: 180 }, params, { speed_kt: 5, dir_deg: 175 }, tide);
        const long = scoreFor({ h_m: h, t_s: longPeriod, dir_deg: 180 }, params, { speed_kt: 5, dir_deg: 175 }, tide);
        assert.ok(hEff(h, longPeriod) < params.h_ref_m, 'This generated case must remain below the size reference or period monotonicity is not the law under test.');
        assert.ok(long.q >= short.q, 'Below the reference size, a longer period must never lower the score because it raises effective swell height.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R25
  it('treats microtidal spots as independent of tide readings', () => {
    fc.assert(
      fc.property(unit, unit, (firstHeight, secondHeight) => {
        const first = { height_m: firstHeight, day_low_m: 0, day_high_m: 1 };
        const second = { height_m: secondHeight, day_low_m: 0, day_high_m: 1 };
        assert.equal(sTide(first, microtidalParams), 1, 'A microtidal spot with a real tide reading must treat tide as neutral, not weak.');
        assert.equal(sTide(second, microtidalParams), 1, 'Changing a microtidal reading must not change its neutral tide score.');
      }),
      { numRuns: 100 },
    );
  });

  // covers: R26
  it('ranks a complete spot population descending with stable ties', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), decimal(0, 100)), { selector: ([spotId]) => spotId, minLength: 1, maxLength: 12 }),
        (values) => {
          const ranked = rankSpots(values.map(([spot_id, v]) => ({ spot_id, v })));
          assert.equal(ranked.length, values.length, 'Ranking must return one position for every supplied spot so no beach silently disappears from the list.');
          assert.deepEqual(new Set(ranked.map((item) => item.spot_id)), new Set(values.map(([spot_id]) => spot_id)), 'Ranking must be a permutation of the supplied spot population, not a subset.');
          for (let index = 1; index < ranked.length; index += 1) {
            const before = values.find((item) => item[0] === ranked[index - 1]?.spot_id)?.[1];
            const after = values.find((item) => item[0] === ranked[index]?.spot_id)?.[1];
            assert.ok(before !== undefined && after !== undefined && before >= after, 'Ranking must descend by score so the first listed spot is actually the better call.');
          }
          assert.deepEqual(rankSpots(values.map(([spot_id, v]) => ({ spot_id, v }))), ranked, 'Identical score inputs must rank deterministically so a tie never makes the published order flicker.');
        },
      ),
      { numRuns: 100 },
    );
  });

  // covers: R27
  it('records missing wind or tide as absence and renormalizes the known factors', () => {
    fc.assert(
      fc.property(positiveUnit, positiveUnit, positiveUnit, (dir, size, tideScore) => {
        const withoutWind = combine({ dir, size, wind: null, tide: tideScore }, params, 0);
        assert.equal(withoutWind.sub.wind, null, 'A missing wind observation must stay null in the published sub-scores, never become a fabricated perfect number.');
        assert.ok(withoutWind.missing.includes('wind'), 'A missing wind observation must be named so the user can tell which input the score lacks.');
        assert.ok(!withoutWind.damages.some((damage) => damage.factor === 'wind'), 'A missing wind observation cannot be named the weakest link because no wind was observed.');
        const expected = dir * Math.pow(Math.pow(size, params.weights.w_size) * Math.pow(tideScore, params.weights.w_tide), 1 / (params.weights.w_size + params.weights.w_tide));
        close(withoutWind.q, expected, 1e-12, 'A missing wind factor must leave the score as the renormalized geometric mean of only the known factors');
        const windConfidence = confidence(venaoMembers, { kind: 'absolute' }, null, null, ['wind']);
        assert.ok(windConfidence.c_total <= 0.4, 'Missing wind must bind the documented 0.4 confidence cap.');
        assert.equal(windConfidence.dominant, 'missing_data', 'A binding missing-factor cap must be the named dominant confidence reason.');
      }),
      { numRuns: 100 },
    );
    const withoutTide = combine({ dir: 0.8, size: 0.7, wind: 0.6, tide: null }, params, 0);
    assert.equal(withoutTide.sub.tide, null, 'A missing tide observation must stay null, distinct from the microtidal neutral score of one.');
    assert.ok(withoutTide.missing.includes('tide'), 'A missing tide observation must be named in the score output.');
    assert.ok(!withoutTide.damages.some((damage) => damage.factor === 'tide'), 'A missing tide observation cannot appear in the damage list.');
    assert.ok(confidence(venaoMembers, { kind: 'absolute' }, null, null, ['tide']).c_total <= 0.7, 'Missing tide must bind the documented 0.7 confidence cap.');
  });

  // covers: R28
  it('excludes never-reported freshness and decays reported freshness without inventing certainty', () => {
    fc.assert(
      fc.property(decimal(0, 240), decimal(0, 240), (firstAge, secondAge) => {
        const noReport = confidence(venaoMembers, { kind: 'absolute' }, null, null, []);
        const reportedFirst = confidence(venaoMembers, { kind: 'absolute' }, null, firstAge, []);
        const reportedSecond = confidence(venaoMembers, { kind: 'absolute' }, null, secondAge, []);
        assert.equal(noReport.c_fresh, null, 'No report ever must stay distinct from a stale report, so the product does not fabricate a freshness observation.');
        assert.ok(reportedFirst.c_fresh !== null && reportedSecond.c_fresh !== null, 'A real report age must create a freshness factor so genuinely stale evidence lowers confidence.');
        close(noReport.c_total, noReport.c_spread * noReport.c_track, 1e-12, 'No-report freshness must be excluded from the confidence product, not treated as a hidden neutral or floor.');
        if (reportedFirst.c_fresh !== null) {
          close(reportedFirst.c_fresh, Math.max(Math.exp(-firstAge / 36), 0.3), 1e-12, 'A reported freshness value must follow the documented decay and floor exactly.');
          close(reportedFirst.c_total, reportedFirst.c_spread * reportedFirst.c_track * reportedFirst.c_fresh, 1e-12, 'A real report freshness factor must participate in the confidence product.');
        }
        if (firstAge <= secondAge) {
          assert.ok(reportedFirst.c_fresh >= reportedSecond.c_fresh, 'Freshness must never improve as a real report gets older.');
        } else {
          assert.ok(reportedSecond.c_fresh >= reportedFirst.c_fresh, 'Freshness must never improve as a real report gets older.');
        }
      }),
      { numRuns: 100 },
    );
  });

  // covers: R29
  it('projects day-one confidence from model agreement while a thin ensemble remains low', () => {
    const tight = [
      member('a', 0.71, 12.8, 203),
      member('b', 0.73, 13.0, 205),
      member('c', 0.74, 13.2, 206),
      member('d', 0.76, 13.5, 207),
    ];
    const moderatePeriodSplit = [
      member('a', 0.71, 10.5, 203),
      member('b', 0.73, 11.5, 205),
      member('c', 0.74, 14.0, 206),
      member('d', 0.76, 15.0, 207),
    ];
    assert.equal(confidence(tight, { kind: 'absolute' }, null, null, []).level, 'high', 'Tightly agreeing models with no reports must still reach alta because launch confidence is agreement, not a fabricated track record.');
    close(confidence(tight, { kind: 'absolute' }, null, null, []).c_total, 0.96, 0.02, 'The tight-agreement worked example must remain near 0.96 confidence.');
    assert.equal(confidence(moderatePeriodSplit, { kind: 'absolute' }, null, null, []).level, 'medium', 'A meaningful period split must project to media rather than hide disagreement behind a high label.');
    close(confidence(moderatePeriodSplit, { kind: 'absolute' }, null, null, []).c_total, 0.59, 0.02, 'The moderate period-split worked example must remain near 0.59 confidence.');
    assert.equal(confidence(venaoMembers, { kind: 'absolute' }, null, null, []).level, 'low', 'The documented Venao member disagreement must remain baja so the worked example stays trustworthy.');
    close(confidence(venaoMembers, { kind: 'absolute' }, null, null, []).c_total, 0.31, 0.02, 'The documented Venao member disagreement must remain near 0.31 confidence.');
    assert.equal(confidence([venaoMembers[0]!], { kind: 'absolute' }, null, null, []).level, 'low', 'A single usable model must remain baja because thin evidence cannot claim high agreement.');
  });
});
