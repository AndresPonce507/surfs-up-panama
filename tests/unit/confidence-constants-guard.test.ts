// Constants guard for confidence(): pins cap_missing_tide, cap_missing_wind
// and both level boundaries bit-identical to 82be859's confidence.ts
// (`git show 82be859:src/scoring/confidence.ts` lines 58-63 -- unchanged on
// HEAD as of this commit).
//
// THE TRAP THIS FILE EXISTS TO CLOSE: `alta` is arithmetically unreachable
// today, not merely rare. With the tide missing, cap_missing_tide (0.7) lands
// EXACTLY on the high boundary (`level = 'high'` needs `c_total > 0.7`), so a
// future well-meaning edit that nudges either constant a hair would
// manufacture confidence the data has not earned -- the one rule this whole
// product rests on (project CLAUDE.md). The real fix for a missing tide
// belongs upstream, in the ingest seed schema: `confidence()` receives
// `missing` from `src/pipeline/adapters/open-meteo-source.ts`, which returns
// `'dark'` for tide because no per-spot tide station exists in the seed data
// yet (docs/product/architecture/04-ingest-pipeline.md section 11, a
// recorded DELIVER BLOCKER). NOT here. No cap, no boundary and no spread
// constant may move to satisfy any test, ever
// (docs/feature/f-know-how-much-to-trust-it/distill/red-classification.md
// contract item 4).
//
// `confidence.ts` exports no constants -- by its own contract comment,
// nothing it computes is readable by combine(), and the four literals below
// are inline in the function body, not symbols to import. So this guard pins
// them BEHAVIOURALLY: call confidence() with inputs chosen so each literal
// alone determines the observable output, and assert the exact value. AST /
// source-text pinning is a banned pattern (nw-quality-framework); this file
// never reads confidence.ts's source text.
//
// Two of the four cases below are example-based by nature -- DoD 5 pins
// exact literals, which a property cannot express -- documented bypass per
// nw-tdd-methodology's Paradigm Mandate. The two properties that follow ARE
// the property-based half (house style tests/unit/scoring-laws.test.ts): the
// unconditional law that no input, however generated, can push a tide-dark
// or wind-dark morning past its cap.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { composeConfidenceReasonEs, type FactorVocabEs } from '../../src/publish/confidence-reason';
import { confidence, type SpreadInput } from '../../src/scoring/confidence';
import type { MemberRow } from '../../src/scoring/engine';

/**
 * The four literal constants this guard pins, transcribed from
 * `git show 82be859:src/scoring/confidence.ts` lines 58-63:
 *   cap = Math.min(missing.includes('wind') ? 0.4 : 1, missing.includes('tide') ? 0.7 : 1);
 *   const level = c_total <= 0.4 ? 'low' : c_total <= 0.7 ? 'medium' : 'high';
 * Named here for readable assertions only -- confidence() is never called
 * with these as literals substituted in; every case below drives the real
 * function and reads its real output.
 */
const PINNED_82BE859 = {
  CAP_MISSING_WIND: 0.4,
  CAP_MISSING_TIDE: 0.7,
  LOW_BOUNDARY: 0.4,
  MEDIUM_BOUNDARY: 0.7,
} as const;

/** c_spread = 1 exactly (climatology pct <= 20), so with track and freshness
 * both absent the whole product collapses to 1 -- the cleanest way to place
 * `c_total` at an exact cap literal with zero floating noise from the
 * absolute-spread formula. Used only where the case is about a cap in
 * isolation, not about real member agreement. */
const PERFECT_SPREAD_CLIMATOLOGY: SpreadInput = { kind: 'climatology', pct: 10 };

/**
 * The real 2026-08-08 Venao pull that DISTILL measured before authoring
 * (tests/acceptance/f-know-how-much-to-trust-it/steps/confidence-reason.steps.ts
 * `MODELS_THAT_AGREE`): four genuinely agreeing members, c_spread ≈ 0.9922 --
 * comfortably above the 0.7 tide cap -- so `Math.min(product, cap)` always
 * resolves to the cap's bit-exact value, never to spread float noise. This is
 * criterion 3's own "four agreeing members" case.
 */
const FOUR_AGREEING_MEMBERS: readonly MemberRow[] = [
  { source: 'ncep_gfswave016', lead_h: 0, swell: { h_m: 0.70, t_s: 12.0, dir_deg: 205 }, swell2: null },
  { source: 'ncep_gfswave025', lead_h: 0, swell: { h_m: 0.71, t_s: 12.1, dir_deg: 206 }, swell2: null },
  { source: 'meteofrance_wave', lead_h: 0, swell: { h_m: 0.70, t_s: 12.0, dir_deg: 205 }, swell2: null },
  { source: 'dwd_gwam', lead_h: 0, swell: { h_m: 0.72, t_s: 12.2, dir_deg: 204 }, swell2: null },
];

const FACTOR_VOCAB_ES: FactorVocabEs = {
  height: 'altura',
  period: 'período',
  direction: 'dirección',
  wind: 'viento',
  tide: 'marea',
};

describe('confidence() constants guard (bit-identical to 82be859)', () => {
  it('pins cap_missing_wind and the low boundary together: wind missing, otherwise pristine agreement, caps at exactly 0.4 and reads low, inclusive', () => {
    const result = confidence([], PERFECT_SPREAD_CLIMATOLOGY, null, null, ['wind']);
    const productBeforeCap = result.c_spread * result.c_track * (result.c_fresh ?? 1);

    assert.ok(
      productBeforeCap > PINNED_82BE859.CAP_MISSING_WIND,
      `test fixture error: el producto sin tope (${productBeforeCap}) debe superar el tope de viento para que el tope sea lo que realmente ata c_total, no el producto`,
    );
    assert.equal(
      result.c_total,
      PINNED_82BE859.CAP_MISSING_WIND,
      `cap_missing_wind se movió: c_total midió ${result.c_total}, se esperaba exactamente ${PINNED_82BE859.CAP_MISSING_WIND}`,
    );
    assert.equal(
      result.level,
      'low',
      `la frontera baja se movió: con c_total en ${PINNED_82BE859.LOW_BOUNDARY} exacto el nivel midió "${result.level}", se esperaba "low" (frontera inclusiva)`,
    );
  });

  it('pins cap_missing_tide and the medium/high boundary together: tide missing, four agreeing members, caps at exactly 0.7 and reads medium, never high', () => {
    const result = confidence(FOUR_AGREEING_MEMBERS as MemberRow[], { kind: 'absolute' }, null, null, ['tide']);
    const productBeforeCap = result.c_spread * result.c_track * (result.c_fresh ?? 1);

    assert.ok(
      productBeforeCap > PINNED_82BE859.CAP_MISSING_TIDE,
      `test fixture error: el producto sin tope (${productBeforeCap}) debe superar el tope de marea para que el tope sea lo que realmente ata c_total, no el acuerdo entre modelos`,
    );
    assert.equal(
      result.c_total,
      PINNED_82BE859.CAP_MISSING_TIDE,
      `cap_missing_tide se movió: c_total midió ${result.c_total}, se esperaba exactamente ${PINNED_82BE859.CAP_MISSING_TIDE}`,
    );
    assert.equal(
      result.level,
      'medium',
      `la frontera media/alta se movió: con c_total en ${PINNED_82BE859.MEDIUM_BOUNDARY} exacto (el propio tope de marea) el nivel midió "${result.level}", se esperaba "medium". Si esto mide "high", alguien volvió "alta" alcanzable sin un dato real de marea -- exactamente lo que este archivo existe para impedir.`,
    );
  });

  /** Criterion 3, end to end: the level projection AND the composed reason,
   * over the same real engine call. */
  it('criterion 3: four agreeing members with the tide dark stay media and the reason names the missing tide', () => {
    const result = confidence(FOUR_AGREEING_MEMBERS as MemberRow[], { kind: 'absolute' }, null, null, ['tide']);
    assert.equal(result.level, 'medium');
    assert.equal(result.c_total, PINNED_82BE859.MEDIUM_BOUNDARY);

    const reason = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);
    assert.match(
      reason,
      /\bmareas?\b/iu,
      `la razón no nombra la marea que falta con cuatro modelos de acuerdo y marea ausente: "${reason}"`,
    );
  });

  // -- Property half: the unconditional law over the whole input space, not
  // just the two isolated cases above. A property that only re-checked
  // "<= 0.7" would stay green even if the cap literal shrank to, say, 0.65 --
  // it would not catch a MOVE, only a widening past 0.7. That is exactly why
  // the example-based pins above exist alongside this: the pins catch any
  // drift of the literal in either direction, this property is the
  // behavioural guarantee that matters -- alta stays unreachable -- proven
  // over every generated morning, not merely the one hand-picked shape.

  const decimal = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

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

  const members: fc.Arbitrary<MemberRow[]> = fc.array(memberRow, { minLength: 0, maxLength: 6 });

  const spreadInput: fc.Arbitrary<SpreadInput> = fc.oneof(
    fc.constant<SpreadInput>({ kind: 'absolute' }),
    decimal(0, 100).map<SpreadInput>((pct) => ({ kind: 'climatology', pct })),
  );

  const trackInput = fc.option(
    fc.record({ mae: decimal(0, 2), mae_ref: decimal(0.5, 3) }),
    { nil: null },
  );

  const freshnessInput = fc.option(decimal(0, 240), { nil: null });

  /** `missing` always contains 'tide', optionally also 'wind'. Filtering
   * the generator (rather than `fc.pre`) means every generated case is
   * usable, not discarded after the fact. */
  const missingWithTide: fc.Arbitrary<('wind' | 'tide')[]> = fc
    .subarray(['wind'] as const)
    .map((extra) => ['tide', ...extra] as ('wind' | 'tide')[]);

  /** `missing` always contains 'wind', optionally also 'tide'. */
  const missingWithWind: fc.Arbitrary<('wind' | 'tide')[]> = fc
    .subarray(['tide'] as const)
    .map((extra) => ['wind', ...extra] as ('wind' | 'tide')[]);

  it('law: whenever the tide is missing, c_total never exceeds 0.7 and the level is never high -- for every generated morning', () => {
    fc.assert(
      fc.property(members, spreadInput, trackInput, freshnessInput, missingWithTide,
        (rows, spread, track, fresh, missing) => {
          const result = confidence(rows, spread, track, fresh, missing);
          assert.ok(
            result.c_total <= PINNED_82BE859.CAP_MISSING_TIDE,
            `con marea ausente c_total midió ${result.c_total}, más del tope ${PINNED_82BE859.CAP_MISSING_TIDE}`,
          );
          assert.notEqual(
            result.level,
            'high',
            `con marea ausente el nivel midió "high" (c_total=${result.c_total}): alta se volvió alcanzable sin un dato real de marea`,
          );
        }),
      { examples: [[FOUR_AGREEING_MEMBERS as MemberRow[], { kind: 'absolute' }, null, null, ['tide']]] },
    );
  });

  it('law: whenever the wind is missing, the level is always low -- for every generated morning', () => {
    fc.assert(
      fc.property(members, spreadInput, trackInput, freshnessInput, missingWithWind,
        (rows, spread, track, fresh, missing) => {
          const result = confidence(rows, spread, track, fresh, missing);
          assert.ok(
            result.c_total <= PINNED_82BE859.CAP_MISSING_WIND,
            `con viento ausente c_total midió ${result.c_total}, más del tope ${PINNED_82BE859.CAP_MISSING_WIND}`,
          );
          assert.equal(
            result.level,
            'low',
            `con viento ausente el nivel midió "${result.level}" (c_total=${result.c_total}), se esperaba "low"`,
          );
        }),
      { examples: [[[], PERFECT_SPREAD_CLIMATOLOGY, null, null, ['wind']]] },
    );
  });
});
