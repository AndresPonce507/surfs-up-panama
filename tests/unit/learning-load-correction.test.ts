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
import { currentCorrectionKey } from '../../src/learning/correction-file';
import {
  loadStoredCorrections,
  parseStoredCorrection,
  type CorrectionSource,
} from '../../src/learning/load-correction';

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

// ---------- loadStoredCorrections: verdict consumption at the apply seam ----------
//
// wave-decisions.md D-2026-08-12-1, roadmap 05-02 pin 4: the apply lane
// consults the latest monthly verdict under learned/metrics/v1/ before
// trusting any stored record. Modeling strategy (Hebert ch.3): a small
// reference oracle predicts, from the two probed months' verdict shapes
// alone, whether the loader must map every spot to null; the property below
// asserts the real loader agrees with that oracle over the whole named
// vocabulary of probe outcomes -- killed / stay / not_evaluated / absent /
// corrupt / unknown-value are all covered as the "current month" arm, and
// "previous-month-probe" is covered whenever the current month is not a
// known verdict and the previous month is.
//
// The seeded record below carries an APPLIED height key, deliberately unlike
// `wellFormedRecord()` above: loadStoredCorrections only ever spends the
// probe when at least one loaded record has something a kill could actually
// change (see that function's own comment). A record with zero applied keys
// would make this property vacuous -- the probe would never fire, and every
// outcome would read as "not killed" regardless of the fixture.

const SPOT_ID = 'playa-venao';
const NOW = new Date('2026-08-09T07:00:00.000Z');
const CURRENT_MONTH_METRICS_KEY = 'learned/metrics/v1/dt=2026-08/metrics.json';
const PREVIOUS_MONTH_METRICS_KEY = 'learned/metrics/v1/dt=2026-07/metrics.json';

type ProbeOutcome = 'killed' | 'stay' | 'not_evaluated' | 'absent' | 'corrupt' | 'unknown-value';

const PROBE_OUTCOMES: readonly ProbeOutcome[] = ['killed', 'stay', 'not_evaluated', 'absent', 'corrupt', 'unknown-value'];

/** `undefined` means "put nothing at this key", exactly what an absent metrics file is. */
function bytesFor(outcome: ProbeOutcome): string | undefined {
  switch (outcome) {
    case 'killed':
      return JSON.stringify({ cv: { verdict: 'corrections-killed' } });
    case 'stay':
      return JSON.stringify({ cv: { verdict: 'corrections-stay' } });
    case 'not_evaluated':
      return JSON.stringify({ cv: { verdict: 'not_evaluated' } });
    case 'absent':
      return undefined;
    case 'corrupt':
      return '{not json at all';
    case 'unknown-value':
      return JSON.stringify({ cv: { verdict: 'some-future-verdict-this-reader-does-not-know' } });
  }
}

/** The oracle: current month wins outright the moment it is a KNOWN verdict; only an unreadable/absent/unknown current month falls back to the previous one. */
function expectedKilled(current: ProbeOutcome, previous: ProbeOutcome): boolean {
  if (current === 'killed') return true;
  if (current === 'stay' || current === 'not_evaluated') return false;
  return previous === 'killed';
}

function inMemoryCorrectionSource(entries: ReadonlyMap<string, string>): CorrectionSource {
  return {
    getCorrection: (key: string): Promise<string | null> => Promise.resolve(entries.get(key) ?? null),
  };
}

/** `wellFormedRecord()` with its height key's own gate verdict flipped applied: something the monthly kill could actually cost. */
function appliedRecord(): Record<string, unknown> {
  const record = wellFormedRecord();
  const bias = record.bias as { swell_h_m: { per_source: Record<string, Record<string, Record<string, unknown>>> } };
  const heightKey = bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  if (heightKey !== undefined) heightKey.applied = true;
  return record;
}

describe('loadStoredCorrections: the apply lane consumes the latest monthly verdict, and only an affirmative kill kills', () => {
  it('maps every spot to null exactly when the oracle says the latest known verdict is corrections-killed, for every named probe outcome', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...PROBE_OUTCOMES), fc.constantFrom(...PROBE_OUTCOMES), async (current, previous) => {
        const entries = new Map<string, string>();
        entries.set(
          currentCorrectionKey(SPOT_ID),
          JSON.stringify(appliedRecord()),
        );
        const currentBytes = bytesFor(current);
        if (currentBytes !== undefined) entries.set(CURRENT_MONTH_METRICS_KEY, currentBytes);
        const previousBytes = bytesFor(previous);
        if (previousBytes !== undefined) entries.set(PREVIOUS_MONTH_METRICS_KEY, previousBytes);

        const appliedBySpot = await loadStoredCorrections({
          store: inMemoryCorrectionSource(entries),
          spotIds: [SPOT_ID],
          clock: { now: () => NOW },
        });

        const killed = expectedKilled(current, previous);
        const record = appliedBySpot.get(SPOT_ID);
        if (killed) {
          assert.equal(
            record,
            null,
            `current=${current}, previous=${previous}: an affirmative kill (this month, or a fall-back to last month when this month is unreadable) must map the spot to null`,
          );
        } else {
          assert.ok(
            record !== null && record !== undefined,
            `current=${current}, previous=${previous}: corrections-stay, not_evaluated, or an unreadable/absent/unknown month at every probe must leave the stored record standing`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
