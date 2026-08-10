// Property laws for the day-one empty-state sentence composer: the module
// that turns the block's two integers into the settled Spanish, split into
// prose and counted parts so a renderer never has to parse a digit back out
// of a sentence.
//
// application-architecture.md section 10 line 419 settles the wording; the
// acceptance harness
// (tests/acceptance/f-show-our-track-record/steps/support/track-record-box.ts)
// pins the same sentence byte for byte with n=0, threshold=30 and reads it
// off the built page. These laws prove the composer for every integer the
// block could carry, not only that one pinned pair.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { composeEmptyStateSentence, joinSentenceParts, type SentencePart } from '../../src/scorecard/copy';
import { decideScorecardBlock } from '../../src/scorecard/scorecard-block';
import { REPORTS_REQUIRED } from '../../src/scorecard/threshold';
import type { ClauseResult } from '../../src/scorecard/publish-gate';

/**
 * The settled Spanish, application-architecture.md section 10 line 419,
 * spelled out here as the interpolation the composer must reproduce -- not
 * imported from the acceptance harness, which pins its own copy
 * independently so the two do not share a single point of failure.
 */
const settledSentence = (n: number, threshold: number): string =>
  `Todavía no podemos decirte si acertamos aquí. Van ${n} reportes de los ${threshold} que hacen falta.`;

// A wide-enough band to include negative counts: the composer is a total
// formatting function over the block's two integers, and `decideScorecardBlock`
// itself never rejects a negative count (it just cannot ever earn a claim
// from one), so the composer must not assume non-negativity either.
const anyInteger = fc.integer({ min: -1_000, max: 1_000_000 });

const clauseResult = fc.constantFrom<ClauseResult>('satisfied', 'unsatisfied', 'unavailable');

describe('empty-state sentence composer — reproduces the settled sentence exactly', () => {
  // covers: criterion 1, verbatim. The one pair slice-01 can honestly
  // produce today (no report ever filed, threshold 30) must equal the
  // settled sentence the acceptance harness pins, word for word.
  it('composes the exact settled sentence for the day-one pair n=0, threshold=30', () => {
    const joined = joinSentenceParts(composeEmptyStateSentence({ n_obs: 0, threshold: REPORTS_REQUIRED }));
    assert.equal(joined, 'Todavía no podemos decirte si acertamos aquí. Van 0 reportes de los 30 que hacen falta.');
  });

  // covers: criteria 2 and 3. Joining the parts reproduces the settled
  // sentence with the block's own integers in place, spaces included, for
  // any pair the block could carry -- and no prose part ever carries a
  // digit, which is what lets a renderer wrap only the counted parts.
  it('joins back to the settled sentence with the block\'s integers in place, and keeps every digit out of the prose parts', () => {
    fc.assert(
      fc.property(anyInteger, anyInteger, (n, threshold) => {
        const parts = composeEmptyStateSentence({ n_obs: n, threshold });
        const joined = joinSentenceParts(parts);
        assert.equal(
          joined,
          settledSentence(n, threshold),
          `joining the parts for n_obs=${n}, threshold=${threshold} must reproduce the settled sentence exactly`,
        );
        const proseCarryingADigit = parts.filter(
          (part: SentencePart) => part.kind === 'text' && /\d/.test(part.value),
        );
        assert.deepEqual(
          proseCarryingADigit,
          [],
          `a prose part must never carry a digit; got ${JSON.stringify(proseCarryingADigit)} for n_obs=${n}, threshold=${threshold}`,
        );
      }),
    );
  });
});

describe('empty-state sentence composer — copy rules', () => {
  // covers: criterion 4, verbatim. Same regexes the acceptance oracle
  // itself greps with in honest-track-record-box.steps.ts, so a failure here
  // and a failure in the acceptance run point at the same rule.
  it('carries no em dash, no unreplaced placeholder, no English word and no technical vocabulary, at any integer values', () => {
    fc.assert(
      fc.property(anyInteger, anyInteger, (n, threshold) => {
        const text = joinSentenceParts(composeEmptyStateSentence({ n_obs: n, threshold }));
        const offences: string[] = [];
        if (text.includes('—')) offences.push('an em dash');
        if (/\{n\}|\{threshold\}|\{\{|\[[A-Za-z]/.test(text)) offences.push('an unreplaced placeholder token');
        if (/\breports?\b|\bwe need\b|\btrack record\b|\bcan't tell\b/i.test(text)) offences.push('English copy');
        if (/\bnull\b|\bundefined\b|\bNaN\b|claim_ok|n_obs|n_reporters|scorecard|JSON/i.test(text)) offences.push('technical text');
        assert.deepEqual(
          offences,
          [],
          `the composed sentence breaks the project copy rules for n_obs=${n}, threshold=${threshold}: ${offences.join(', ')}.\n  text: ${text}`,
        );
      }),
    );
  });
});

describe('empty-state sentence composer — never leaks an accuracy figure', () => {
  // covers: the QUALITY_GATES property. For every block the gate refuses --
  // any counts, any bias clause, the whole domain `decideScorecardBlock`
  // accepts -- the composed sentence must carry no digit that could be read
  // as a percentage, a plus-minus margin, a metre figure or claim wording.
  // Falsifiability proven manually: temporarily appending a literal
  // '(0%)' to PROSE_AFTER_THRESHOLD in src/scorecard/copy.ts made this
  // property fail with the exact offending text quoted in the assertion,
  // then `git diff` confirmed the revert left copy.ts unchanged.
  it('for every block the gate refuses, the composed sentence carries no percentage, margin or metre figure', () => {
    fc.assert(
      fc.property(anyInteger, anyInteger, clauseResult, (pairedObservations, distinctTrustEligibleReporters, biasClause) => {
        const block = decideScorecardBlock({
          pairedObservations,
          distinctTrustEligibleReporters,
          biasClause,
        });
        fc.pre(block.claim_ok === false);

        const text = joinSentenceParts(composeEmptyStateSentence(block));
        const offences: string[] = [];
        if (text.includes('%')) offences.push('a percentage sign');
        if (text.includes('±')) offences.push('a plus-minus margin');
        if (/\d+[.,]\d+\s*m\b/.test(text)) offences.push('a metre figure');
        if (/\bsesgo\b|\bacierto del\b|\bprecisión\b/i.test(text)) offences.push('claim wording');
        assert.deepEqual(
          offences,
          [],
          `a refused block must never compose a sentence that reads like a claim: ${offences.join(', ')}.\n  block: ${JSON.stringify(block)}\n  text: ${text}`,
        );
      }),
    );
  });
});
