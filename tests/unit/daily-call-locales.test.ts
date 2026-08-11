// The ranked call is a producer-owned bilingual projection of one day's
// structured facts. The page selects a member; it never translates Spanish or
// recomputes the sentence. Authority: application-architecture.md section 10
// and f-read-it-in-your-language/deliver/01-01-call-en-blocker.md.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { SizeBandToken } from '../../src/data/size-bands';
import type { Locale } from '../../src/i18n/strings';
import { composeDailyCall, type DailyCallFacts } from '../../src/publish/daily-call';

const SIZE_WORDS: Readonly<Record<SizeBandToken, Readonly<Record<Locale, string>>>> = {
  flat: { es: 'Plano', en: 'Flat' },
  ankle_knee: { es: 'Tobillo a rodilla', en: 'Ankle to knee' },
  knee_waist: { es: 'Rodilla a cintura', en: 'Knee to waist' },
  waist_chest: { es: 'Cintura a pecho', en: 'Waist to chest' },
  chest_head: { es: 'Pecho a cabeza', en: 'Chest to head' },
  head_overhead: { es: 'Cabeza a un metro más', en: 'Head to overhead' },
  double_overhead_plus: { es: 'Doble o más', en: 'Double overhead +' },
};

const WIND_WORDS = {
  clean: { es: 'limpio', en: 'clean' },
  choppy: { es: 'picado', en: 'choppy' },
  blown_out: { es: 'destrozado', en: 'blown out' },
} as const;

const sizeBand = fc.constantFrom(...Object.keys(SIZE_WORDS) as SizeBandToken[]);
const windState = fc.option(fc.constantFrom(...Object.keys(WIND_WORDS) as (keyof typeof WIND_WORDS)[]), { nil: null });
const localTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hour, minute]) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
const bestWindow = fc.option(fc.record({ start: localTime, end: localTime }), { nil: null });

function authority(locale: Locale, facts: DailyCallFacts): string {
  const size = SIZE_WORDS[facts.size_band][locale];
  if (locale === 'es') {
    const wind = facts.wind_state === null ? 'sin datos' : WIND_WORDS[facts.wind_state].es;
    const window = facts.best_window === null
      ? 'sin ventana estimada'
      : `mejor de ${facts.best_window.start} a ${facts.best_window.end}`;
    return `${size}, viento ${wind}, ${window}.`;
  }
  const wind = facts.wind_state === null ? 'no wind data' : `${WIND_WORDS[facts.wind_state].en} wind`;
  const window = facts.best_window === null
    ? 'no estimated window'
    : `best from ${facts.best_window.start} to ${facts.best_window.end}`;
  return `${size}, ${wind}, ${window}.`;
}

describe('producer-owned bilingual daily call', () => {
  it('matches the exact authority for every size and every present/absent wind-window state', () => {
    fc.assert(
      fc.property(sizeBand, windState, bestWindow, (band, wind, window) => {
        const facts: DailyCallFacts = {
          size_band: band,
          wind_state: wind,
          best_window: window,
        };

        for (const locale of ['es', 'en'] as const) {
          const actual = composeDailyCall(locale, facts);
          assert.equal(
            actual,
            authority(locale, facts),
            `The ${locale} call must be composed from this row's exact facts, never translated from its twin: ${JSON.stringify(facts)}.`,
          );
          assert.ok(actual.length <= 280, `P1 caps each published call at 280 characters. Got ${actual.length}: ${actual}`);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a size token outside the canonical seven-band vocabulary', () => {
    assert.throws(
      () => composeDailyCall('en', {
        size_band: 'invented_band' as SizeBandToken,
        wind_state: 'clean',
        best_window: { start: '06:00', end: '09:30' },
      }),
      /size_band.*outside the v1 seven-band vocabulary/u,
      'An invalid size must refuse the publish instead of falling back to invented prose.',
    );
  });
});
