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

/**
 * "nadie ... playa" in either order. Kept byte-identical to the acceptance
 * oracle for scenario 2 (05-scoring-engine.md section 6.3, c_fresh null).
 */
const SAYS_NOBODY_REPORTED = /nadie[\s\S]*playa|playa[\s\S]*nadie/iu;

/**
 * "un solo modelo", "solo un modelo", "único modelo" or "un modelo solo".
 * Kept byte-identical to the acceptance oracle in
 * tests/acceptance/f-know-how-much-to-trust-it/steps/confidence-reason.steps.ts
 * so the unit bound and the published bound cannot drift apart.
 */
const SAYS_ONE_MODEL_ANSWERED = /\b(?:un\s+solo|solo\s+un|[uú]nico)\s+modelo\b|\bun\s+modelo\s+solo\b/iu;

/**
 * "historial" or "historiales". Kept byte-identical to the acceptance oracle
 * for scenario 2 (05-scoring-engine.md section 6.2, track_state unverified).
 */
const NAMES_A_TRACK_RECORD_GAP = /\bhistorial(?:es)?\b/iu;

/**
 * Zero beach reports exist in this system today (HANDOFF.md section 5). Kept
 * byte-identical to the acceptance oracle so the unit bound and the published
 * bound cannot drift apart.
 */
const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|gfswave|dwd|gwam|ecmwf|meteofrance)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|confidence_reason|spread_terms|dominant|track_state|score_q|size_band|json|undefined|nan|null|true|false)\b/iu;

const LONG_DASH = /[—–]/u;

const SPREAD_DOMINANTS: readonly ConfidenceResult['dominant'][] = [
  'spread_height',
  'spread_period',
  'spread_direction',
];

const LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];

/**
 * The tightest reachable shape today: both declared inputs missing, no track
 * record and no beach report, so all three clauses in this slice (the cap
 * that bound the level, nobody-reported, no-verified-record) compose at
 * once. `numRuns` default sampling reaches this corner rarely (missing both
 * plus track nil plus freshness nil is roughly a 1-in-100 draw), so it rides
 * as an explicit fast-check example rather than hoping a random run finds it
 * -- exactly the "green tests do not mean it works" trap this repo has
 * already shipped twice.
 */
const WORST_CASE_RESULT: ConfidenceResult = confidence([], { kind: 'absolute' }, null, null, ['wind', 'tide']);

/**
 * The tightest single-model shape: exactly one member answered AND both
 * declared inputs are missing, so the cap clause, the single-model clause and
 * both honesty clauses all compose in the same sentence at once (01-05's own
 * worst case). Default sampling for `engineResult` reaches exactly one member
 * crossed with both inputs missing rarely enough that this rides as an
 * explicit fast-check example rather than hoping a random run finds it --
 * the same "green tests do not mean it works" trap `WORST_CASE_RESULT` above
 * exists to close.
 */
const SINGLE_MODEL_WORST_CASE: ConfidenceResult = confidence(
  [{ source: 'uno', lead_h: 0, swell: { h_m: 0.7, t_s: 12, dir_deg: 205 }, swell2: null }],
  { kind: 'absolute' },
  null,
  null,
  ['wind', 'tide'],
);

/**
 * The real 2026-08-08 Venao pull with the tide present, mirroring
 * `MODELS_SPLIT_ON_PERIOD` in the acceptance steps: heights and directions
 * close, periods split 15.5 s against 10.05 s. Verified before authoring:
 * with `missing` empty this gives `dominant: 'spread_period'`, so it is the
 * one shape 01-04 exists for -- the cause the sentence must name is the
 * period, and the tide, though the cap that binds on other mornings, bound
 * nothing here. Default sampling for `engineResult` reaches two spread terms
 * far enough apart for period alone to dominate only rarely, so this rides as
 * an explicit fast-check example rather than hoping a random run finds it.
 */
const PERIOD_SPLIT_RESULT: ConfidenceResult = confidence(
  [
    { source: 'uno', lead_h: 0, swell: { h_m: 0.64, t_s: 15.5, dir_deg: 206 }, swell2: null },
    { source: 'dos', lead_h: 0, swell: { h_m: 0.66, t_s: 15.5, dir_deg: 204 }, swell2: null },
    { source: 'tres', lead_h: 0, swell: { h_m: 0.78, t_s: 11.6, dir_deg: 212 }, swell2: null },
    { source: 'cuatro', lead_h: 0, swell: { h_m: 0.86, t_s: 10.05, dir_deg: 203 }, swell2: null },
  ],
  { kind: 'absolute' },
  null,
  null,
  [],
);

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
   * The degenerate case 01-05 exists for: with exactly one answering model
   * there is nothing to compare, so the sentence must say so plainly and
   * must never read as either agreement or disagreement between models.
   * `members_used` is the only input that tells "nobody disagreed because
   * one model spoke" apart from "the models agree": `dominant` carries no
   * signal here, because `confidence()` already forces every spread term to
   * zero below two members, so a composer that fell through to
   * spread_disagreement on a single-model day would invent a disagreement
   * that cannot exist.
   */
  it('says exactly one model answered when members_used is 1, and never claims disagreement', () => {
    fc.assert(
      fc.property(engineResult, (result) => {
        const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);

        assert.equal(
          SAYS_ONE_MODEL_ANSWERED.test(reason),
          result.members_used === 1,
          `members_used=${result.members_used} pero la razón ${result.members_used === 1 ? 'no dice' : 'dice'} que respondió un solo modelo: "${reason}"`,
        );
        if (result.members_used === 1) {
          assert.ok(
            !CLAIMS_MODEL_DISAGREEMENT.test(reason),
            `con un solo modelo la razón habla de un desacuerdo entre modelos que no puede existir: "${reason}"`,
          );
        }
      }),
      { examples: [[SINGLE_MODEL_WORST_CASE]] },
    );
  });

  /**
   * The other half of 01-04's misattribution fix. `PERIOD_SPLIT_RESULT`
   * confirms the branch is reachable at all (default sampling rarely lands
   * period alone dominating), and the generic property alongside it proves
   * the same law over the whole engine domain: whenever period genuinely
   * dominates, the reason names it from the injected vocabulary, and never
   * once smuggles in the tide -- even though `missing` is empty for every
   * row this property inspects, so no cap is topping anything to blame the
   * tide for (05-scoring-engine.md section 6.1).
   */
  it('names the period disagreement when period dominates, and never the tide', () => {
    assert.equal(PERIOD_SPLIT_RESULT.dominant, 'spread_period', 'test fixture error: PERIOD_SPLIT_RESULT must actually dominate on period');

    fc.assert(
      fc.property(engineResult, sentinelVocab, (result, vocab) => {
        if (result.dominant !== 'spread_period') return;
        const reason = composeConfidenceReasonEs(result, vocab);

        assert.ok(
          reason.includes(vocab.period),
          `dominant="spread_period" pero la razón no nombra "${vocab.period}": "${reason}"`,
        );
        assert.ok(
          !reason.includes(vocab.tide),
          `dominant="spread_period" con missing=[] pero la razón culpa a la marea ("${vocab.tide}"): "${reason}"`,
        );
      }),
      { examples: [[PERIOD_SPLIT_RESULT, FACTOR_VOCAB_ES]] },
    );
  });

  /**
   * application-architecture.md section 7 P1 bounds the published reason at
   * 160 characters, and the project copy rules forbid technical text and long
   * dashes on the Spanish surface. Counted in code points, exactly as the
   * acceptance oracle counts them. An over-budget wording must fail here, in
   * seconds, because truncating instead is forbidden outright. The explicit
   * `WORST_CASE_RESULT` example guarantees the tightest shape is always
   * measured, not merely likely to be sampled.
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
        assert.ok(
          !CLAIMS_BEACH_CONFIRMATION.test(reason),
          `la razón reclama o sugiere una confirmación desde la playa que hoy no existe: "${reason}"`,
        );
      }),
      { examples: [[WORST_CASE_RESULT], [SINGLE_MODEL_WORST_CASE]] },
    );
  });

  /**
   * 05-scoring-engine.md section 6.3: `c_fresh === null` because no beach
   * report has ever reached this spot, so the sentence must say so. The
   * biconditional is the point of this slice (implementation_notes,
   * DoD 4): a composer that names the absence unconditionally would pass the
   * "emits" half and lie the day a real report lands with `c_fresh`
   * non-null, which the "disappears" half catches.
   */
  it('says nobody has reported from the beach exactly when c_fresh is null', () => {
    fc.assert(
      fc.property(engineResult, (result) => {
        const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);
        assert.equal(
          SAYS_NOBODY_REPORTED.test(reason),
          result.c_fresh === null,
          `c_fresh=${result.c_fresh} pero la razón ${result.c_fresh === null ? 'no dice' : 'dice'} que nadie ha reportado: "${reason}"`,
        );
      }),
      { examples: [[WORST_CASE_RESULT]] },
    );
  });

  /**
   * 05-scoring-engine.md section 6.2: `track_state === 'unverified'` because
   * no gated scorecard exists yet, so the sentence must name that gap. Same
   * biconditional shape as the report clause above, exercised over the same
   * real engine so the 'measured' branch (a track record present) is what
   * proves the clause actually disappears, not merely that it can appear.
   */
  it('names the missing verified track record exactly when track_state is unverified', () => {
    fc.assert(
      fc.property(engineResult, (result) => {
        const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);
        assert.equal(
          NAMES_A_TRACK_RECORD_GAP.test(reason),
          result.track_state === 'unverified',
          `track_state="${result.track_state}" pero la razón ${result.track_state === 'unverified' ? 'no nombra' : 'nombra'} el historial: "${reason}"`,
        );
      }),
      { examples: [[WORST_CASE_RESULT]] },
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
