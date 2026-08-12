// The two canonical display formats of the published surface. Both are pure
// functions over already-published fields: the page renders what the build
// decided, it never recomputes a size or a window (application-architecture.md
// section 10, P1 "client renders, never computes").
//
// Oracles, in authority order:
//   - domain-model.md section 7.2, the v1 seven-band table (token, metre range,
//     es label). Nothing here mints size vocabulary of its own.
//   - application-architecture.md section 10: body-height word first, metre
//     RANGE second, always with the "≈" character so the copy never claims
//     precision the range does not carry (decision 18).
//   - application-architecture.md section 14 wireframe: "Ventana 6:00-9:30".

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { sizeBands } from '../../src/data/size-bands';
import {
  formatBestWindowBreakdownEs,
  formatBestWindowEs,
  formatSizeEs,
  formatWeakestLinkEs,
  type BreakdownFactorRow,
} from '../../src/publish/display-format';
import { FACTOR_TOKENS, factorWord } from '../../src/publish/factor-vocab';
import type {
  BestWindowBreakdownReading,
  CounterfactualReading,
  SurfaceDayIndex,
} from '../../src/publish/weakest-link';

/** The row's visible name is the shared vocabulary noun, opened with a capital. */
function capitalisedNoun(noun: string): string {
  return `${noun.slice(0, 1).toUpperCase()}${noun.slice(1)}`;
}

// domain-model.md section 7.2, transcribed. The test owns this table as its
// oracle so a silent edit of the constants file cannot also edit the expectation.
const SECTION_7_2: readonly (readonly [string, number, number, string])[] = [
  ['flat', 0, 0.1, 'Plano ≈0.0–0.1 m'],
  ['ankle_knee', 0.1, 0.4, 'Tobillo a rodilla ≈0.1–0.4 m'],
  ['knee_waist', 0.4, 0.7, 'Rodilla a cintura ≈0.4–0.7 m'],
  ['waist_chest', 0.7, 1.1, 'Cintura a pecho ≈0.7–1.1 m'],
  ['chest_head', 1.1, 1.6, 'Pecho a cabeza ≈1.1–1.6 m'],
  ['head_overhead', 1.6, 2.4, 'Cabeza a un metro más ≈1.6–2.4 m'],
  ['double_overhead_plus', 2.4, 3, 'Doble o más ≈2.4 m o más'],
] as const;

/**
 * A metre number that is neither the low edge of a range nor an open-ended
 * floor. `≈1.2 m` is the exact failure this contract exists to prevent: it
 * promises a precision four wave models do not agree on.
 */
const BARE_METRE_VALUE = /(?:^|[^–\d.])\d+(?:[.,]\d+)?\s*m\b(?!\s*o más)/u;

const bandToken = fc.constantFrom(...SECTION_7_2.map(([band]) => band));
const metre = fc.double({ min: -1, max: 30, noNaN: true, noDefaultInfinity: true });
const clockTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hour, minute]) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

// Mirrors the two oracles that already gate this copy elsewhere (the
// acceptance steps' copy check and tests/unit/weakest-link-vocab.test.ts), so
// a leak fails here first, locally, in milliseconds.
const CODE_LEAK = /\b(?:dir|size|wind|tide|weakest[_ -]?link|null|undefined|NaN|true|false|the|today|tomorrow)\b/i;
const EM_DASH = /[—]|--/;
const DATA_PUNCTUATION = /[{}[\]"]/;

const namedReading = fc.constantFrom(...FACTOR_TOKENS).map((factor) => ({ kind: 'named', factor }) as const);
const anyWeakestLinkReading = fc.oneof(
  namedReading,
  fc.constant({ kind: 'clean' } as const),
  fc.constant({ kind: 'unknown' } as const),
);

describe('the one size vocabulary', () => {
  it('offers exactly the seven canonical bands, smallest first, on section 7.2 edges', () => {
    assert.deepEqual(
      sizeBands.map((band) => `${band.value} ${Math.max(0, band.lo_m)}-${band.hi_m}`),
      [
        'flat 0-0.1',
        'ankle_knee 0.1-0.4',
        'knee_waist 0.4-0.7',
        'waist_chest 0.7-1.1',
        'chest_head 1.1-1.6',
        'head_overhead 1.6-2.4',
        'double_overhead_plus 2.4-Infinity',
      ],
      'The capture form, the published call and the residual math read this one list. A token that is not the domain-model section 7.2 enum makes a report incomparable with the forecast it was meant to check.',
    );
  });
});

describe('published size display format', () => {
  it('names the body-height band first and then an approximate metre range', () => {
    for (const [band, lo, hi, expected] of SECTION_7_2) {
      assert.equal(
        formatSizeEs(band as never, [lo, hi]),
        expected,
        `Band ${band} must render its domain-model section 7.2 words and metre range so every surface says the same thing about the same wave.`,
      );
    }
  });

  it('can never print an exact metre value, whatever the build published', () => {
    fc.assert(
      fc.property(bandToken, metre, metre, (band, first, second) => {
        const range = [Math.min(first, second), Math.max(first, second)] as const;
        const text = formatSizeEs(band as never, range);
        const word = SECTION_7_2.find(([token]) => token === band)?.[3].split(' ≈')[0] ?? '';

        assert.ok(
          text.startsWith(`${word} ≈`),
          `A size must lead with the body-height words and only then approximate metres. Got "${text}".`,
        );
        assert.doesNotMatch(
          text,
          BARE_METRE_VALUE,
          'A published size must never read as one exact metre value: the range is the honest claim and the "≈" is what keeps it honest.',
        );
        assert.doesNotMatch(
          text,
          /-\d/u,
          `A displayed wave is never negative metres. Got "${text}".`,
        );
      }),
      { numRuns: 200 },
    );
  });
});

describe('published best-window display format', () => {
  it('renders the published start and end as one Spanish hour range', () => {
    assert.equal(
      formatBestWindowEs({ start: '06:00', end: '09:30' }),
      'Ventana 6:00–9:30',
      'A published morning window must read as the wireframe reads it, with no leading zero on the hour.',
    );
  });

  it('always names both edges of the window and never a single hour', () => {
    fc.assert(
      fc.property(clockTime, clockTime, (start, end) => {
        const text = formatBestWindowEs({ start, end });
        assert.match(
          text,
          /^Ventana (?:[0-9]|1[0-9]|2[0-3]):[0-5][0-9]–(?:[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/u,
          'A window must always read as "Ventana H:MM-H:MM": one hour on its own would tell a surfer when to arrive but never when it stops working.',
        );
        assert.ok(
          text.endsWith(`:${end.slice(3)}`) && text.includes(`${String(Number(start.slice(0, 2)))}:${start.slice(3)}`),
          `A window must repeat the published minutes exactly, never round them. Published ${start} to ${end}, rendered "${text}".`,
        );
      }),
      { numRuns: 200 },
    );
  });
});

describe('published weakest-link display format', () => {
  it('renders the settled Pre-requisite 3 wording for a named culprit, article from the shared vocabulary', () => {
    assert.equal(
      formatWeakestLinkEs({ kind: 'named', factor: 'wind' }),
      'Lo que lo tumba: el viento.',
      'This is the open copy item from Pre-requisite 3 (minus the sub-score, which is slice-02): held in one exported constant so the pending settlement is a one-line swap.',
    );
  });

  it('keeps each named factor paired with its own published raw score as one two-place decimal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FACTOR_TOKENS),
        fc.integer({ min: 0, max: 100 }),
        (factor, hundredths) => {
          const rawScore = hundredths / 100;
          const text = formatWeakestLinkEs({ kind: 'named', factor, weakest_link_subscore: rawScore });
          const { article, noun } = factorWord(factor);
          const decimal = hundredths === 100 ? '1.00' : `0.${String(hundredths).padStart(2, '0')}`;

          assert.equal(
            text,
            `Lo que lo tumba: ${article} ${noun}, a ${decimal}.`,
            `The visible reason must retain ${factor}'s own published ${decimal} score, rather than select or rescale another value.`,
          );
        },
      ),
    );
  });

  it('never reads a missing field the same as an explicit null: a stated absence and a genuinely clean day stay two different sentences', () => {
    const clean = formatWeakestLinkEs({ kind: 'clean' });
    const unknown = formatWeakestLinkEs({ kind: 'unknown' });
    assert.notEqual(
      clean,
      unknown,
      `A day nothing cost any score and a day published before this field existed are different facts. Got "${clean}" for clean and "${unknown}" for unknown.`,
    );
  });

  it('names the published factor in the shared vocabulary\'s own words, with no engine token, no English word, no em dash and no double hyphen', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FACTOR_TOKENS), (token) => {
        const text = formatWeakestLinkEs({ kind: 'named', factor: token });
        const { article, noun } = factorWord(token);

        assert.ok(
          text.includes(`${article} ${noun}`),
          `"${text}" does not name ${token} the way src/publish/factor-vocab.ts spells it.`,
        );
        assert.doesNotMatch(text, CODE_LEAK, `"${text}" leaks an engine token or an English word.`);
        assert.doesNotMatch(text, EM_DASH, `"${text}" uses a long dash or a double hyphen.`);
      }),
    );
  });

  it('never contains data punctuation or a code sentinel word, whatever the reading', () => {
    fc.assert(
      fc.property(anyWeakestLinkReading, (reading) => {
        const text = formatWeakestLinkEs(reading);
        assert.doesNotMatch(text, DATA_PUNCTUATION, `"${text}" leaks data punctuation.`);
        assert.doesNotMatch(text, /\b(?:null|undefined|NaN)\b/i, `"${text}" leaks a code sentinel word.`);
      }),
    );
  });

  it('never names a factor when the day is clean or the field was never published', () => {
    fc.assert(
      fc.property(fc.constantFrom('clean' as const, 'unknown' as const), (kind) => {
        const text = formatWeakestLinkEs({ kind });
        for (const token of FACTOR_TOKENS) {
          const { noun } = factorWord(token);
          assert.ok(!text.includes(noun), `"${text}" names ${noun} even though the morning published no culprit for it.`);
        }
      }),
    );
  });

  it('appends only the selected day’s published whole counterfactual, while every honest omission leaves the named sentence complete', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FACTOR_TOKENS),
        fc.constantFrom<SurfaceDayIndex>(0, 1),
        fc.integer({ min: 0, max: 100 }),
        fc.constantFrom<CounterfactualReading>(
          { kind: 'rounded_equal' },
          { kind: 'legacy_missing' },
          { kind: 'clean' },
          { kind: 'unknown' },
        ),
        (factor, day, publishedScore, suppressed) => {
          const reading = { kind: 'named', factor, weakest_link_subscore: 0.18 } as const;
          const { article, noun } = factorWord(factor);
          const base = `Lo que lo tumba: ${article} ${noun}, a 0.18.`;
          const pronoun = article === 'el' ? 'él' : 'ella';
          const dayWord = day === 0 ? 'hoy' : 'mañana';

          assert.equal(
            formatWeakestLinkEs(reading, { kind: 'available', score_q: publishedScore }, day),
            `${base} Sin ${pronoun}, ${dayWord} marcaría ${publishedScore}.`,
            'The page must append the one whole score its own row published, with no browser-side calculation or other day’s value.',
          );
          assert.equal(
            formatWeakestLinkEs(reading, suppressed, day),
            base,
            'A rounded collision, legacy omission, clean day, or missing row must retain the complete named sentence without an invented, repeated, or dangling clause.',
          );
        },
      ),
    );
  });
});

// ------------------------------------- the four best-window factor rows --
//
// Slice-04, step 04-04. Four rows, always in the engine's own tiebreak
// order, each showing the number the producer already published for that
// factor in that hour, or saying plainly that the observation is missing.
//
// TWO THINGS THIS FORMATTER MUST NEVER DO, both of which would look right
// on screen:
//   - turn a missing observation into a number. A null is not a zero and
//     not a small bar; it is a sentence.
//   - let a bar height decide the callout. The weak factor was decided by
//     the producer and published as `weakest_link`; the lowest of these
//     four numbers is frequently a different factor, and following it
//     would be the page re-deciding what killed the day.

const RAW_SCORE = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const dayIndexArb = fc.constantFrom<SurfaceDayIndex>(0, 1);

function availableBreakdown(sub: { dir: number; size: number; wind: number | null; tide: number | null }): BestWindowBreakdownReading {
  return { kind: 'available', sub };
}

function scoredValue(row: BreakdownFactorRow): number | null {
  return row.kind === 'scored' ? Number(row.value) : null;
}

describe('formatBestWindowBreakdownEs: four honest rows for one published hour', () => {
  it('prints every published value verbatim, states every missing observation, and marks only the published weak factor', () => {
    fc.assert(
      fc.property(
        RAW_SCORE,
        RAW_SCORE,
        fc.oneof(RAW_SCORE, fc.constant(null)),
        fc.oneof(RAW_SCORE, fc.constant(null)),
        anyWeakestLinkReading,
        dayIndexArb,
        (dir, size, wind, tide, weakest, day) => {
          const sub = { dir, size, wind, tide };
          const display = formatBestWindowBreakdownEs(availableBreakdown(sub), weakest, day);

          assert.equal(display.kind, 'present', 'a selected hour must produce rows');
          if (display.kind !== 'present') return;

          assert.deepEqual(
            display.rows.map((row) => row.factor),
            [...FACTOR_TOKENS],
            'the four rows keep the engine\'s own fixed order; a page must not reorder them by size',
          );

          for (const row of display.rows) {
            const published = sub[row.factor];
            assert.equal(row.label, capitalisedNoun(factorWord(row.factor).noun), `${row.factor}: the row must be named with the shared Spanish vocabulary`);
            if (published === null) {
              assert.equal(row.kind, 'absent', `${row.factor}: a missing observation must be a stated absence, never a row with a number`);
              if (row.kind !== 'absent') continue;
              assert.equal(
                row.absence,
                `sin dato de ${factorWord(row.factor).noun} ${day === 0 ? 'hoy' : 'mañana'}`,
                `${row.factor}: the absence must say which factor and which day, in Spanish`,
              );
              assert.ok(!Object.hasOwn(row, 'value') && !Object.hasOwn(row, 'fillPercent'), `${row.factor}: an absent row carries no number and no fill, not even a zero one`);
              assert.ok(!/\d/u.test(row.absence), `${row.factor}: the absence sentence must carry no digit: "${row.absence}"`);
              continue;
            }
            assert.equal(row.kind, 'scored', `${row.factor}: a published value must render as a scored row`);
            if (row.kind !== 'scored') continue;
            assert.equal(row.value, published.toFixed(2), `${row.factor}: the row must print the published value to two places, unaltered`);
            assert.equal(row.fillPercent, Math.round(published * 100), `${row.factor}: the fill is presentation only and follows the same published value`);
          }

          const marked = display.rows.filter((row) => row.weakest).map((row) => row.factor);
          assert.deepEqual(
            marked,
            weakest.kind === 'named' ? [weakest.factor] : [],
            `only the published weakest_link may be marked; got ${JSON.stringify(marked)} for reading ${JSON.stringify(weakest)}`,
          );

          for (const row of display.rows) {
            const text = row.kind === 'absent' ? row.absence : row.label;
            assert.ok(!CODE_LEAK.test(text) && !EM_DASH.test(text) && !DATA_PUNCTUATION.test(text), `${row.factor}: the row leaks technical text: "${text}"`);
          }
        },
      ),
    );
  });

  it('never lets the lowest bar take the arrow from the factor the morning published', () => {
    // tide is the numeric minimum on every one of these hours; wind is what
    // the producer published as the weakness. This is the substitution the
    // slice exists to prevent, pinned as an example because it is the exact
    // shape a reviewer needs to see.
    const sub = { dir: 0.90, size: 0.80, wind: 0.64, tide: 0.12 };
    const display = formatBestWindowBreakdownEs(availableBreakdown(sub), { kind: 'named', factor: 'wind' }, 0);

    assert.equal(display.kind, 'present');
    if (display.kind !== 'present') return;
    const marked = display.rows.filter((row) => row.weakest);
    assert.deepEqual(marked.map((row) => row.factor), ['wind'], 'the arrow follows the published weakest_link, not the shortest bar');
    assert.equal(scoredValue(display.rows.find((row) => row.factor === 'tide')!), 0.12, 'the lower tide stays an ordinary row with its own published value');
  });

  it('passes an unavailable breakdown through with its own reason and invents no row', () => {
    for (const reason of ['no_best_window', 'legacy_hourly_missing', 'hour_not_projected', 'hour_duplicated', 'malformed_point'] as const) {
      assert.deepEqual(
        formatBestWindowBreakdownEs({ kind: 'unavailable', reason }, { kind: 'named', factor: 'wind' }, 0),
        { kind: 'unavailable', reason },
        `"${reason}" must reach the caller as itself: the page decides whether to omit the element, and the build decides whether to log a compatibility gap`,
      );
    }
  });
});
