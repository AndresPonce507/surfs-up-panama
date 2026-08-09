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

import { CONFIDENCE_LEVEL_WORD_ES, confidenceReasonEs, type ConfidenceLevel } from '../../src/scoring/confidence';

const ALL_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];
const level = fc.constantFrom(...ALL_LEVELS);

const EXPECTED_WORD: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

/** A reason claiming or implying anyone checked the actual waves. Zero beach
 * reports exist in this system today (HANDOFF.md section 5); this is the
 * exact regression the negative acceptance test also guards. */
const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|dwd|ecmwf)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|undefined|nan|null|json)\b/iu;

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
