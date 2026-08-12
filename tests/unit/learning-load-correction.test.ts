// The correction reader's totality law (src/learning/load-correction.ts),
// accepted roadmap 02-01.
//
// TEST PARADIGM, per the step's own design notes: the parser totality law is
// the fast-check property; the named sad paths are examples and live in the
// step's acceptance file. This module owes exactly one law, quantified over
// arbitrary bytes.
//
// WHY TOTALITY IS THE LAW WORTH GENERATING. The correction file is the only
// input to the build that a machine writes for another machine to read a day
// later, and it is read on EVERY build of every spot. A parser that throws on
// one shape of bad bytes takes the whole publication down rather than
// publishing the day-zero numbers, which is the opposite of what a missing
// correction is supposed to cost. So: for any bytes whatsoever, a verdict.
//
// The generator deliberately mixes free-form strings with NEAR-MISS records -
// a valid record with one field dropped, retyped or emptied - because random
// strings almost never reach past the JSON parse, and every interesting
// refusal lives beyond it.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  CLAMP_MAX_ABS_HEIGHT_FRACTION,
  CLAMP_MAX_ABS_SCORE_POINTS,
} from '../../src/learning/constants';
import { parseStoredCorrection } from '../../src/learning/load-correction';

const SOURCE = 'ncep_gfswave016';
const LEAD_BUCKET = 'lead_24_48';

/** A record shaped exactly like the one the emitter writes, as a plain value the generator can damage. */
function wellFormedRecord(): Record<string, unknown> {
  return {
    spot_id: 'playa-venao',
    schema: 'spot-correction/1',
    computed_at: '2026-08-09T07:00:00.000Z',
    score_delta: {
      b: 9,
      units: 'display_points',
      se: 1.5,
      n: 18,
      reporters: 6,
      applied: false,
      shrunk_from_global: 0.25,
    },
    bias: {
      swell_h_m: {
        per_source: {
          [SOURCE]: {
            [LEAD_BUCKET]: {
              b: -0.18,
              se: 0.05,
              n: 18,
              reporters: 6,
              applied: false,
              shrunk_from_global: 0.25,
            },
          },
        },
      },
    },
    clamp: {
      max_abs_h_frac: CLAMP_MAX_ABS_HEIGHT_FRACTION,
      max_abs_score: CLAMP_MAX_ABS_SCORE_POINTS,
    },
  };
}

/** Every path in the record a damage can be aimed at, dotted. */
const DAMAGEABLE_PATHS: readonly string[] = [
  'spot_id',
  'schema',
  'computed_at',
  'score_delta',
  'score_delta.units',
  'score_delta.b',
  'score_delta.n',
  'score_delta.reporters',
  'score_delta.se',
  'score_delta.applied',
  'bias',
  'bias.swell_h_m',
  'bias.swell_h_m.per_source',
  `bias.swell_h_m.per_source.${SOURCE}`,
  `bias.swell_h_m.per_source.${SOURCE}.${LEAD_BUCKET}`,
  `bias.swell_h_m.per_source.${SOURCE}.${LEAD_BUCKET}.b`,
  `bias.swell_h_m.per_source.${SOURCE}.${LEAD_BUCKET}.n`,
  'clamp',
  'clamp.max_abs_h_frac',
  'clamp.max_abs_score',
];

type Damage = 'drop' | 'null' | 'empty-string' | 'number' | 'string' | 'array' | 'nan';

function damageAt(
  record: Record<string, unknown>,
  path: string,
  damage: Damage,
): Record<string, unknown> {
  const segments = path.split('.');
  const last = segments.pop();
  if (last === undefined) return record;

  let cursor: Record<string, unknown> = record;
  for (const segment of segments) {
    const next = cursor[segment];
    if (typeof next !== 'object' || next === null) return record;
    cursor = next as Record<string, unknown>;
  }

  if (damage === 'drop') {
    delete cursor[last];
    return record;
  }
  cursor[last] = damageValue(damage);
  return record;
}

function damageValue(damage: Damage): unknown {
  if (damage === 'null') return null;
  if (damage === 'empty-string') return '';
  if (damage === 'number') return 42;
  if (damage === 'string') return 'not-what-belongs-here';
  if (damage === 'array') return [];
  return Number.NaN;
}

const nearMissBytes = fc
  .tuple(
    fc.constantFrom(...DAMAGEABLE_PATHS),
    fc.constantFrom<Damage>(
      'drop',
      'null',
      'empty-string',
      'number',
      'string',
      'array',
      'nan',
    ),
  )
  .map(([path, damage]) =>
    JSON.stringify(damageAt(wellFormedRecord(), path, damage)),
  );

const arbitraryBytes = fc.oneof(
  { arbitrary: nearMissBytes, weight: 6 },
  { arbitrary: fc.string(), weight: 2 },
  { arbitrary: fc.json(), weight: 2 },
  { arbitrary: fc.constant(''), weight: 1 },
  { arbitrary: fc.constant('null'), weight: 1 },
  { arbitrary: fc.constant('[]'), weight: 1 },
  {
    arbitrary: fc.constant(JSON.stringify(wellFormedRecord())),
    weight: 2,
  },
);

describe('parseStoredCorrection: a correction file can never take a build down', () => {
  it('returns a verdict for any bytes at all, and every refusal carries a reason', () => {
    fc.assert(
      fc.property(arbitraryBytes, (bytes) => {
        const parsed = parseStoredCorrection(bytes);

        assert.ok(
          parsed.kind === 'accepted' || parsed.kind === 'refused',
          'the parser must return one of its two declared verdicts, whatever it was handed',
        );

        if (parsed.kind === 'refused') {
          assert.notEqual(
            parsed.event.type,
            '',
            'a refusal must be reportable: an untyped event says nothing to whoever reads the archive',
          );
          assert.ok(
            (parsed.event.detail ?? '').length > 0,
            'a refusal must say what it found, not merely that it refused',
          );
          return;
        }

        assert.equal(
          parsed.record.schema,
          'spot-correction/1',
          'an accepted record must carry the one schema this reader accepts',
        );
        assert.equal(
          parsed.record.score_delta?.units ?? 'display_points',
          'display_points',
          'an accepted score move can only ever be stated in the points a surfer sees',
        );
      }),
      { numRuns: 300 },
    );
  });
});
