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
import { formatBestWindowEs, formatSizeEs } from '../../src/publish/display-format';

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
