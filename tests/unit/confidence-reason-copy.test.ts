// WHY-NEW-FILE: tests/unit/confidence-reason-copy.test.ts
//   CLOSEST-EXISTING: tests/unit/scoring-laws.test.ts
//   EXTENSION-COST: scoring-laws.test.ts owns the scoring/confidence VALUE
//     laws (bounds, blending, and level bucketing from real member
//     disagreement); mixing literal Spanish copy assertions into that file
//     would put numeric-law tests and wording tests behind one name.
//   PARALLEL-RATIONALE: different concern (the honesty of published copy,
//     not scoring math) and a different lifecycle — copy wording can change
//     on product-owner review without touching the scoring law tests, and
//     the reverse.
//
// The reason text one tap away from every row's confidence word
// (slice-07). Driving port: `confidenceReasonEs`, a pure domain function —
// calling it directly IS port-to-port (nw-tdd-methodology, "pure domain
// function IS its own driving port"). Oracle: HANDOFF.md section 5, settled
// and not to be relitigated — day-one confidence is model agreement, and
// zero beach reports exist in this system, so no reason may claim or imply
// one.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { composeConfidenceReasonEs, type FactorVocabEs } from '../../src/publish/confidence-reason';
import {
  CONFIDENCE_LEVEL_WORD_ES,
  confidence,
  confidenceReasonEs,
  type ConfidenceLevel,
  type ConfidenceResult,
  type SpreadInput,
} from '../../src/scoring/confidence';
import type { MemberRow } from '../../src/scoring/engine';

const ALL_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];
const level = fc.constantFrom(...ALL_LEVELS);

const EXPECTED_WORD: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

/** A reason claiming or implying anyone checked the actual waves. Zero beach
 * reports exist in this system today (HANDOFF.md section 5); this is the
 * exact regression the negative acceptance test also guards. Byte-identical
 * to the acceptance oracle
 * (tests/acceptance/f-know-how-much-to-trust-it/steps/confidence-reason.steps.ts)
 * and to tests/unit/confidence-reason-compose.test.ts, so the three cannot
 * drift apart. */
const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

/**
 * Widened 2026-08-10 (step 01-07, DoD 10): this guard used to cover only
 * `confidenceReasonEs`'s three level-keyed constants with a narrower token
 * list (missing `gfswave`, `gwam`, `meteofrance`, `confidence_reason`,
 * `spread_terms`, `dominant`, `track_state`, `score_q`, `size_band`,
 * `true`/`false`), which let this file's guard silently drift weaker than
 * the acceptance oracle's. Now byte-identical to the acceptance oracle and
 * to confidence-reason-compose.test.ts's copy, so the three cannot drift
 * apart, and the property below applies it to BOTH reason paths this
 * codebase ships today: the level-keyed one (still live, still mounted by
 * every ranked row via Confidence.astro) and the per-spot composed one
 * (composeConfidenceReasonEs, not yet wired to a page -- src/pipeline/build.ts
 * computes the ConfidenceResult needed to call it and discards it, flagged in
 * 20507fa and ee1d728, out of this lane's files_to_modify).
 */
const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|gfswave|dwd|gwam|ecmwf|meteofrance)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|confidence_reason|spread_terms|dominant|track_state|score_q|size_band|json|undefined|nan|null|true|false)\b/iu;

describe('day-one confidence display words (CONFIDENCE_LEVEL_WORD_ES)', () => {
  it('publishes exactly the three charter words, one per level', () => {
    assert.deepEqual(
      CONFIDENCE_LEVEL_WORD_ES,
      EXPECTED_WORD,
      'The charter requires the literal words "alta", "media" or "baja" beside every row; nothing else satisfies "la palabra al lado".',
    );
  });
});

describe('day-one confidence reason copy (confidenceReasonEs)', () => {
  it('names model agreement and is honest that no one has reported from the beach, for every level', () => {
    fc.assert(
      fc.property(level, (lvl) => {
        const reason = confidenceReasonEs(lvl);

        assert.ok(reason.trim().length > 0, `The reason for "${lvl}" must never open empty.`);
        assert.match(
          reason,
          /modelo/iu,
          `The reason for "${lvl}" must explain model agreement in words a surfer understands. Got "${reason}".`,
        );
        assert.match(
          reason,
          /nadie.*playa|playa.*nadie/isu,
          `The reason for "${lvl}" must say plainly that nobody has reported from the beach yet. Got "${reason}".`,
        );
        assert.doesNotMatch(
          reason,
          CLAIMS_BEACH_CONFIRMATION,
          `WHAT: the reason for "${lvl}" claims or implies a beach confirmation. WHY: zero beach reports exist in this system today, so the reason may never claim more certainty than the data earns. HOW: derive the reason from model agreement only. Got "${reason}".`,
        );
        assert.doesNotMatch(
          reason,
          LEAKS_RAW_DATA,
          `The reason for "${lvl}" must never leak model names or internal field names. Got "${reason}".`,
        );
      }),
      { numRuns: 50 },
    );
  });

  it('never varies with anything but the level: same level, same reason', () => {
    fc.assert(
      fc.property(level, (lvl) => {
        assert.equal(
          confidenceReasonEs(lvl),
          confidenceReasonEs(lvl),
          'The published bundle carries no per-spot spread breakdown and no conf_value (domain-model.md section 13): the reason can only be a pure function of level.',
        );
      }),
      { numRuns: 20 },
    );
  });
});

// ---------------------------------------------------------------------------
// Step 01-07, DoD 10: the beach-claim and raw-data guards above covered only
// confidenceReasonEs's three level-keyed constants. After slice-01 the reason
// space is per (spot, day) via composeConfidenceReasonEs. One property, run
// over generated engine states, extends the SAME guards to that composer's
// output -- and, in the same property, re-checks the level-keyed path under
// the now-wider LEAKS_RAW_DATA pattern, so a future edit cannot narrow either
// path's honesty guard without this file catching it.
// ---------------------------------------------------------------------------

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

/** One generated morning, run through the same engine the pipeline runs --
 * exactly like confidence-reason-compose.test.ts, so the composer under test
 * here sees the same input domain it composes for in production. */
const engineResult: fc.Arbitrary<ConfidenceResult> = fc
  .tuple(members, spreadInput, trackInput, freshnessInput, missingInputs)
  .map(([rows, spread, track, fresh, missing]) => confidence(rows, spread, track, fresh, missing));

/** The shipping factor nouns (not sentinels): this property is about the
 * OUTPUT staying safe to render, not about proving the composer injects
 * vocabulary rather than hardcoding it -- that proof already lives in
 * confidence-reason-compose.test.ts. */
const FACTOR_VOCAB_ES: FactorVocabEs = {
  height: 'altura',
  period: 'período',
  direction: 'dirección',
  wind: 'viento',
  tide: 'marea',
};

describe('honesty guards hold for both reason paths this codebase ships (level-keyed and per-spot)', () => {
  it('never claims a beach confirmation and never leaks raw data, for confidenceReasonEs(level) and composeConfidenceReasonEs(result, vocab) alike', () => {
    fc.assert(
      fc.property(level, engineResult, (lvl, result) => {
        const levelKeyed = confidenceReasonEs(lvl);
        const perSpot = composeConfidenceReasonEs(result, FACTOR_VOCAB_ES);

        for (const [path, reason] of [['confidenceReasonEs', levelKeyed], ['composeConfidenceReasonEs', perSpot]] as const) {
          assert.doesNotMatch(
            reason,
            CLAIMS_BEACH_CONFIRMATION,
            `WHAT: ${path}'s reason claims or implies a beach confirmation. WHY: zero beach reports exist in this system today, so the reason may never claim more certainty than the data earns. Got "${reason}".`,
          );
          assert.doesNotMatch(
            reason,
            LEAKS_RAW_DATA,
            `WHAT: ${path}'s reason leaks a model name or an internal field name. WHY: the Spanish surface carries zero technical text (project CLAUDE.md copy rules). Got "${reason}".`,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
