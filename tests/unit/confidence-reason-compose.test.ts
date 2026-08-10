// Property laws for the per-spot confidence reason. House style:
// tests/unit/scoring-laws.test.ts — the composer is a pure function of a
// declared input, so its contract is explored with fast-check rather than
// pinned with three examples.
//
// Every property drives the REAL engine: the generated morning goes through
// `confidence()` and its result is what the composer reads. That is what
// proves the additively carried `missing` and `members_used` actually reach
// the composer, rather than a hand-built literal proving only itself.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  composeConfidenceReasonEs,
  REASON_MAX_CHARS,
  type FactorVocabEs,
} from '../../src/publish/confidence-reason';
import {
  confidence,
  type ConfidenceLevel,
  type ConfidenceResult,
  type SpreadInput,
} from '../../src/scoring/confidence';
import type { MemberRow } from '../../src/scoring/engine';

const decimal = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const memberRow: fc.Arbitrary<MemberRow> = fc.record({
  source: fc.constantFrom('uno', 'dos', 'tres', 'cuatro'),
  lead_h: decimal(0, 48),
  swell: fc.record({
    h_m: decimal(0.2, 4),
    t_s: decimal(4, 22),
    dir_deg: decimal(0, 359.999),
  }),
  swell2: fc.constant(null),
});

/** Zero members is a real morning: every declared source went dark. */
const members: fc.Arbitrary<MemberRow[]> = fc.array(memberRow, { minLength: 0, maxLength: 6 });

const missingInputs: fc.Arbitrary<('wind' | 'tide')[]> = fc.subarray(['wind', 'tide'] as const, {
  minLength: 0,
  maxLength: 2,
}).map((tokens) => [...tokens]);

const spreadInput: fc.Arbitrary<SpreadInput> = fc.oneof(
  fc.constant<SpreadInput>({ kind: 'absolute' }),
  decimal(0, 100).map<SpreadInput>((pct) => ({ kind: 'climatology', pct })),
);

const trackInput = fc.option(
  fc.record({ mae: decimal(0, 2), mae_ref: decimal(0.5, 3) }),
  { nil: null },
);

const freshnessInput = fc.option(decimal(0, 240), { nil: null });

/** One generated morning, run through the engine the pipeline runs. */
const engineResult: fc.Arbitrary<ConfidenceResult> = fc
  .tuple(members, spreadInput, trackInput, freshnessInput, missingInputs)
  .map(([rows, spread, track, fresh, missing]) => confidence(rows, spread, track, fresh, missing));

/**
 * Nonsense-but-pronounceable stand-ins for the Spanish factor nouns. Passing
 * the real words would let a composer that hardcodes "marea" pass a property
 * that claims to prove injection. None of these appears, as a word or as a
 * substring, in any composed clause.
 */
const SENTINEL_POOL = ['zarpa', 'quilla', 'cresta', 'proa', 'duna', 'remo', 'coral', 'boya'];

const sentinelVocab: fc.Arbitrary<FactorVocabEs> = fc
  .shuffledSubarray(SENTINEL_POOL, { minLength: 5, maxLength: 5 })
  .map(([height, period, direction, wind, tide]) => ({
    height: height as string,
    period: period as string,
    direction: direction as string,
    wind: wind as string,
    tide: tide as string,
  }));

/** The shipping words. Used only where the property is about the copy itself. */
const FACTOR_VOCAB_ES: FactorVocabEs = {
  height: 'altura',
  period: 'período',
  direction: 'dirección',
  wind: 'viento',
  tide: 'marea',
};

/**
 * Wording that asserts the models disagreed. Kept byte-identical to the
 * acceptance oracle in
 * tests/acceptance/f-know-how-much-to-trust-it/steps/confidence-reason.steps.ts
 * so the unit bound and the published bound cannot drift apart.
 */
const CLAIMS_MODEL_DISAGREEMENT =
  /no\s+se\s+ponen\s+de\s+acuerdo|coinciden\s+solo\s+en\s+parte|se\s+contradicen|\bdifieren\b|\bdiscrepan\b|no\s+coinciden|se\s+parten/iu;

const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|gfswave|dwd|gwam|ecmwf|meteofrance)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|confidence_reason|spread_terms|dominant|track_state|score_q|size_band|json|undefined|nan|null|true|false)\b/iu;

const LONG_DASH = /[—–]/u;

const SPREAD_DOMINANTS: readonly ConfidenceResult['dominant'][] = [
  'spread_height',
  'spread_period',
  'spread_direction',
];

const LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];

describe('composeConfidenceReasonEs', () => {
  /**
   * 05-scoring-engine.md section 3.6, cap-application row: when an input is
   * missing, the cap it applies is what topped the level, so the reason must
   * name that absence by its own name. The other half is the asymmetry that
   * makes the sentence honest in both directions: an input that is present
   * never gets named, because nothing about it bound anything.
   */
  it('names every missing input, and never an input that is not missing', () => {
    fc.assert(
      fc.property(members, spreadInput, trackInput, freshnessInput, missingInputs, sentinelVocab,
        (rows, spread, track, fresh, missing, vocab) => {
          const result = confidence(rows, spread, track, fresh, missing);
          const reason = composeConfidenceReasonEs(result, vocab);

          for (const token of ['wind', 'tide'] as const) {
            assert.equal(
              reason.includes(vocab[token]),
              missing.includes(token),
              `con missing=[${missing.join(', ')}] la razón ${missing.includes(token) ? 'debe' : 'no debe'} nombrar "${vocab[token]}" (${token}): "${reason}"`,
            );
          }
        }),
    );
  });

  /**
   * The live misattribution defect, stated as a law. A row whose level was
   * capped by a missing input, or whose single answering model had nothing to
   * disagree with, may never read as model disagreement.
   */
  it('claims a model disagreement only where a spread term dominates two or more models', () => {
    fc.assert(
      fc.property(engineResult, (result) => {
        const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);
        if (!CLAIMS_MODEL_DISAGREEMENT.test(reason)) return;

        assert.ok(
          SPREAD_DOMINANTS.includes(result.dominant) && result.members_used >= 2,
          `la razón habla de desacuerdo con dominant="${result.dominant}" y ${result.members_used} modelo(s): "${reason}"`,
        );
      }),
    );
  });

  /**
   * application-architecture.md section 7 P1 bounds the published reason at
   * 160 characters, and the project copy rules forbid technical text and long
   * dashes on the Spanish surface. Counted in code points, exactly as the
   * acceptance oracle counts them. An over-budget wording must fail here, in
   * seconds, because truncating instead is forbidden outright.
   */
  it('fits the published bound and leaks nothing from the code', () => {
    fc.assert(
      fc.property(engineResult, (result) => {
        const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);

        assert.ok(reason.length > 0, 'una razón vacía se publica como una caja vacía, no como una ausencia declarada');
        assert.ok(
          [...reason].length <= REASON_MAX_CHARS,
          `la razón mide ${[...reason].length} caracteres, más de ${REASON_MAX_CHARS}: "${reason}"`,
        );
        assert.ok(!LEAKS_RAW_DATA.test(reason), `la razón filtra texto del código: "${reason}"`);
        assert.ok(!LONG_DASH.test(reason), `la razón trae una raya larga: "${reason}"`);
      }),
    );
  });

  /**
   * The level word is a projection of the reason's own causes, never their
   * source. Two results that differ only in `level` must compose the same
   * sentence: that is what stops the composer sliding back into
   * `confidenceReasonEs(level)`, which is the shape this slice replaces.
   */
  it('composes the same sentence when only the level word differs', () => {
    fc.assert(
      fc.property(engineResult, fc.constantFrom(...LEVELS), (result, level) => {
        const relabelled: ConfidenceResult = { ...result, level };

        assert.equal(
          composeConfidenceReasonEs(relabelled, FACTOR_VOCAB_ES),
          composeConfidenceReasonEs(result, FACTOR_VOCAB_ES),
          `la razón cambió al reetiquetar el nivel de "${result.level}" a "${level}": la compone el nivel, no las causas`,
        );
      }),
    );
  });
});
