// Slice-01, step 01-02: SurfaceCall carries the published culprit token.
//
// Driving port: `assertStrictTwoDayUpdate()` in src/publish/static-surface.ts,
// the same validator every committed reading surface goes through. This
// step widens `SurfaceCall.weakest_link` to `FactorToken | null | undefined`
// (optional) and touches nothing else -- population is a serialized
// cross-lane edit to `surfaceCall()` in src/pipeline/build.ts, owned
// elsewhere. These properties only prove the wire type and its validator
// hold up: they never call the pipeline and never assert anything the
// producer lane still owes.
//
// The hazard this test guards against (HANDOFF.md section 10): this repo
// already shipped a reading surface where five optional fields went missing
// on 19 of 20 spots and every gate stayed green, because those fields are
// optional on SurfaceCall and nothing checked that a missing key and a
// present-but-empty value are different claims. weakest_link repeats that
// exact shape -- optional, and this time the two honest "no culprit" states
// (missing key vs explicit null) must never collapse into each other. The
// second test below is written to fail the moment they do; it is proven
// falsifiable by deliberately breaking it once, per QUALITY_GATES.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { FACTOR_TOKENS, type FactorToken } from '../../src/publish/factor-vocab';
import {
  assertStrictTwoDayUpdate,
  type PublishedSurfaceUpdate,
  type SurfaceCall,
} from '../../src/publish/static-surface';
import {
  resolveWeakestLink,
  type WeakestLinkReading,
} from '../../src/publish/weakest-link';

// ------------------------------------------------------------- fixtures --

type WeakestLinkMode = 'absent' | 'null' | 'token';
const MODES: readonly WeakestLinkMode[] = ['absent', 'null', 'token'];

const modeArb = fc.constantFrom(...MODES);
const tokenArb = fc.constantFrom<FactorToken>(...FACTOR_TOKENS);
const spotCountArb = fc.integer({ min: 1, max: 4 });
// Anchors the whole generated calendar window; UTC noon avoids DST/rounding
// edges the same way the module under test does (isCivilDate/nextCivilDate).
const dayOffsetArb = fc.integer({ min: 0, max: 3650 });

function civilDate(offsetDays: number): string {
  const date = new Date('2020-01-01T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextCivilDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function spotIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `playa-${index}`);
}

/** Attaches weakest_link per the mode, or omits the key entirely -- never `weakest_link: undefined`. */
function withWeakestLink(base: Omit<SurfaceCall, 'weakest_link'>, mode: WeakestLinkMode, token: FactorToken): SurfaceCall {
  if (mode === 'absent') return { ...base };
  return { ...base, weakest_link: mode === 'null' ? null : token };
}

function baseCall(spotId: string, scoreQ: number, label: string): Omit<SurfaceCall, 'weakest_link'> {
  return { spot_id: spotId, score_q: scoreQ, call_es: `${label} en ${spotId}` };
}

/**
 * A well-formed two-day update where every call carries weakest_link
 * according to `modes` (one mode per spot, reused for that spot's calls
 * entry and its days[0] entry; tomorrow always gets its own independent
 * mode so the property covers every combination of "today has it, tomorrow
 * doesn't" and back).
 */
function buildValidSurface(
  spotCount: number,
  dayOffset: number,
  todayModes: readonly WeakestLinkMode[],
  tomorrowModes: readonly WeakestLinkMode[],
  todayTokens: readonly FactorToken[],
  tomorrowTokens: readonly FactorToken[],
): PublishedSurfaceUpdate {
  const ids = spotIds(spotCount);
  const surfDate = civilDate(dayOffset);
  const tomorrowDate = nextCivilDate(surfDate);
  // A fixed nonzero offset on every tomorrow score is what guarantees
  // sameRankedCalls(today, tomorrow) is false for every spot, so this
  // construction is never accidentally rejected by the distinct-ranking
  // refusal this property is not exercising.
  const todaySpots = ids.map((id, index) => withWeakestLink(baseCall(id, index, 'hoy'), todayModes[index] ?? 'absent', todayTokens[index] ?? 'dir'));
  const tomorrowSpots = ids.map((id, index) => withWeakestLink(baseCall(id, index + 1000, 'mañana'), tomorrowModes[index] ?? 'absent', tomorrowTokens[index] ?? 'dir'));
  return {
    schema: 'published-surface-update/v1',
    surf_date: surfDate,
    published_at: `${surfDate}T11:00:00.000Z`,
    build_kind: 'dawn',
    calls: todaySpots,
    days: [
      { date: surfDate, spots: todaySpots },
      { date: tomorrowDate, spots: tomorrowSpots },
    ],
  };
}

function withoutOwnKey<T extends Record<string, unknown>>(value: T, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * A stand-in for any downstream reader of the wire type (a renderer, a
 * guard, a future consumer). The correct reading keeps three distinct
 * outcomes: the key is absent, the key is present and explicitly null, or
 * the key carries a real token. This is the exact function the QUALITY_GATES
 * falsifiability proof breaks: see the recorded evidence in the RED_UNIT
 * phase log for the collapsed, incorrect version and its failing run.
 */
function readWeakestLink(call: SurfaceCall): 'absent' | 'null' | FactorToken {
  if (withoutOwnKey(call, 'weakest_link')) return 'absent';
  return call.weakest_link === null ? 'null' : (call.weakest_link as FactorToken);
}

function tryValidate(value: unknown): { threw: false; value: PublishedSurfaceUpdate } | { threw: true; message: string } {
  try {
    return { threw: false, value: assertStrictTwoDayUpdate(value) };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : String(error) };
  }
}

const modesArb = (count: number) => fc.array(modeArb, { minLength: count, maxLength: count });
const tokensArb = (count: number) => fc.array(tokenArb, { minLength: count, maxLength: count });

// ------------------------------------------------------------- properties --

describe('SurfaceCall.weakest_link: the reading-surface half of the day summary', () => {
  it('validates surfaces whose calls mix present, null and absent weakest_link, on either day independently', () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          todayModes: modesArb(count),
          tomorrowModes: modesArb(count),
          todayTokens: tokensArb(count),
          tomorrowTokens: tokensArb(count),
        })),
        ({ count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens }) => {
          const surface = buildValidSurface(count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens);

          const validated = assertStrictTwoDayUpdate(surface);

          assert.equal(validated.days[0].spots.length, count);
          assert.equal(validated.days[1].spots.length, count);
        },
      ),
    );
  });

  it('keeps a missing weakest_link and an explicit null distinguishable through validation and the published JSON wire', () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          todayModes: modesArb(count),
          tomorrowModes: modesArb(count),
          todayTokens: tokensArb(count),
          tomorrowTokens: tokensArb(count),
        })),
        ({ count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens }) => {
          const surface = buildValidSurface(count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens);
          const validated = assertStrictTwoDayUpdate(surface);
          // The reading surface is a committed JSON file (static-surface.ts
          // module docs); the round trip is the real transport, not a stand-in.
          const onTheWire = JSON.parse(JSON.stringify(validated)) as PublishedSurfaceUpdate;

          const days: readonly [readonly WeakestLinkMode[], readonly FactorToken[]][] = [
            [todayModes, todayTokens],
            [tomorrowModes, tomorrowTokens],
          ];
          days.forEach(([modes, tokens], dayIndex) => {
            onTheWire.days[dayIndex]?.spots.forEach((call, spotIndex) => {
              const mode = modes[spotIndex] ?? 'absent';
              const token = tokens[spotIndex] ?? 'dir';
              const expected = mode === 'token' ? token : mode;
              assert.equal(
                readWeakestLink(call),
                expected,
                `day ${dayIndex} spot ${spotIndex}: expected reading "${expected}", a consumer read "${readWeakestLink(call)}" from ${JSON.stringify(call)}`,
              );
            });
          });
        },
      ),
    );
  });

  it('never lets weakest_link change any other published field, or a two-day/distinct-ranking refusal', () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          scenario: fc.constantFrom<'valid' | 'same-ranking' | 'bad-date'>('valid', 'same-ranking', 'bad-date'),
          todayModes: modesArb(count),
          tomorrowModes: modesArb(count),
          todayTokens: tokensArb(count),
          tomorrowTokens: tokensArb(count),
        })),
        ({ count, dayOffset, scenario, todayModes, tomorrowModes, todayTokens, tomorrowTokens }) => {
          const ids = spotIds(count);
          const surfDate = civilDate(dayOffset);
          const tomorrowDate = scenario === 'bad-date' ? civilDate(dayOffset) : nextCivilDate(surfDate);
          const todayBase = ids.map((id, index) => baseCall(id, index, 'hoy'));
          // 'same-ranking' publishes tomorrow as a byte-for-byte clone of
          // today's ranked calls, which is exactly the refusal
          // sameRankedCalls exists to catch; every other scenario shifts
          // every tomorrow score so the ranking is always genuinely its own.
          const tomorrowBase = scenario === 'same-ranking'
            ? ids.map((id, index) => baseCall(id, index, 'hoy'))
            : ids.map((id, index) => baseCall(id, index + 1000, 'mañana'));

          const buildSurface = (attach: boolean): PublishedSurfaceUpdate => {
            const todaySpots = todayBase.map((call, index) => (attach ? withWeakestLink(call, todayModes[index] ?? 'absent', todayTokens[index] ?? 'dir') : { ...call }));
            const tomorrowSpots = tomorrowBase.map((call, index) => (attach ? withWeakestLink(call, tomorrowModes[index] ?? 'absent', tomorrowTokens[index] ?? 'dir') : { ...call }));
            return {
              schema: 'published-surface-update/v1',
              surf_date: surfDate,
              published_at: `${surfDate}T11:00:00.000Z`,
              build_kind: 'dawn',
              calls: todaySpots,
              days: [
                { date: surfDate, spots: todaySpots },
                { date: tomorrowDate, spots: tomorrowSpots },
              ],
            };
          };

          const withoutField = tryValidate(buildSurface(false));
          const withField = tryValidate(buildSurface(true));

          assert.equal(withField.threw, withoutField.threw, `attaching weakest_link changed whether the ${scenario} surface validates`);
          if (withoutField.threw && withField.threw) {
            assert.equal(withField.message, withoutField.message, 'attaching weakest_link changed the refusal reason');
          }
          if (!withoutField.threw && !withField.threw) {
            const strip = (calls: readonly SurfaceCall[]) => calls.map(({ spot_id, score_q, call_es }) => ({ spot_id, score_q, call_es }));
            assert.deepEqual(strip(withField.value.calls), strip(withoutField.value.calls), 'attaching weakest_link changed a published field on calls');
            withField.value.days.forEach((day, index) => {
              assert.deepEqual(strip(day.spots), strip(withoutField.value.days[index]!.spots), `attaching weakest_link changed a published field on days[${index}]`);
            });
          }
        },
      ),
    );
  });
});

// ------------------------------------------------------- culprit scalar --
//
// Slice-02, step 02-01: this is deliberately the strict wire-validator
// boundary, not scoring.  The scalar is a raw score for the already-published
// factor, never a second choice of factor and never Slice-04's four-score
// record.

type ValidatorState = {
  readonly suppliedCall: unknown;
  readonly dayOrdering: readonly string[];
  readonly validation: 'pending' | 'accepted' | 'rejected';
};

/**
 * State-delta universe for this pure boundary: the supplied call and day
 * ordering are read-only inputs; only the observable validation outcome may
 * change.  Keeping the full universe here prevents a scalar guard from
 * silently changing the existing two-day contract.
 */
function captureValidatorState(
  surface: PublishedSurfaceUpdate,
  suppliedCall: unknown,
  validation: ValidatorState['validation'],
): ValidatorState {
  return {
    suppliedCall: structuredClone(suppliedCall),
    dayOrdering: surface.days.map((day) => day.date),
    validation,
  };
}

function assertValidatorStateDelta(
  before: ValidatorState,
  after: ValidatorState,
  expectedValidation: Exclude<ValidatorState['validation'], 'pending'>,
): void {
  assert.deepEqual(after.suppliedCall, before.suppliedCall, 'validator mutated the supplied call');
  assert.deepEqual(after.dayOrdering, before.dayOrdering, 'scalar changed the two-day ordering');
  assert.equal(after.validation, expectedValidation, 'validator returned the wrong observable result');
}

function withWeakestLinkSubscore(call: SurfaceCall, weakestLinkSubscore: unknown): SurfaceCall {
  return { ...call, weakest_link_subscore: weakestLinkSubscore } as SurfaceCall;
}

function namedSurfaceWithScalar(score: number, token: FactorToken): PublishedSurfaceUpdate {
  const surface = buildValidSurface(1, 0, ['token'], ['token'], [token], [token]);
  const calls = surface.calls.map((call) => withWeakestLinkSubscore(call, score));
  const tomorrowSpots = surface.days[1].spots.map((call) => withWeakestLinkSubscore(call, score));
  return {
    ...surface,
    calls,
    days: [
      { ...surface.days[0]!, spots: calls },
      { ...surface.days[1]!, spots: tomorrowSpots },
    ],
  };
}

type InvalidScalarPairing = 'missing-link' | 'null-link' | 'nan' | 'infinity' | 'below-zero' | 'above-one';

function surfaceWithInvalidScalar(pairing: InvalidScalarPairing, token: FactorToken): PublishedSurfaceUpdate {
  const surface = namedSurfaceWithScalar(0.5, token);
  const original = surface.calls[0]!;
  const { weakest_link: _namedLink, ...withoutLink } = original;
  const invalid = pairing === 'missing-link'
    ? withWeakestLinkSubscore(withoutLink as SurfaceCall, 0.5)
    : pairing === 'null-link'
      ? withWeakestLinkSubscore({ ...original, weakest_link: null }, 0.5)
      : pairing === 'nan'
        ? withWeakestLinkSubscore(original, Number.NaN)
        : pairing === 'infinity'
          ? withWeakestLinkSubscore(original, Number.POSITIVE_INFINITY)
          : pairing === 'below-zero'
            ? withWeakestLinkSubscore(original, -0.01)
            : withWeakestLinkSubscore(original, 1.01);
  return {
    ...surface,
    calls: [invalid],
    days: [
      { ...surface.days[0]!, spots: [invalid] },
      surface.days[1]!,
    ],
  };
}

describe('SurfaceCall.weakest_link_subscore: raw value paired with the published culprit', () => {
  it('preserves every finite named raw scalar in the inclusive range without changing other surface state', () => {
    fc.assert(
      fc.property(
        tokenArb,
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (token, scalar) => {
          const surface = namedSurfaceWithScalar(scalar, token);
          const before = captureValidatorState(surface, surface.calls[0], 'pending');
          const outcome = tryValidate(surface);
          const after = captureValidatorState(surface, surface.calls[0], outcome.threw ? 'rejected' : 'accepted');

          assertValidatorStateDelta(before, after, 'accepted');
          assert.ok(!outcome.threw, outcome.threw ? outcome.message : 'valid scalar must validate');
          assert.equal(outcome.value.calls[0]?.weakest_link_subscore, scalar, 'today scalar changed during validation');
          assert.equal(outcome.value.days[1]?.spots[0]?.weakest_link_subscore, scalar, 'tomorrow scalar changed during validation');
        },
      ),
    );
  });

  it('refuses every scalar that lacks a named culprit or is not a finite inclusive raw score', () => {
    fc.assert(
      fc.property(
        tokenArb,
        fc.constantFrom<InvalidScalarPairing>('missing-link', 'null-link', 'nan', 'infinity', 'below-zero', 'above-one'),
        (token, pairing) => {
          const surface = surfaceWithInvalidScalar(pairing, token);
          const before = captureValidatorState(surface, surface.calls[0], 'pending');
          const outcome = tryValidate(surface);
          const after = captureValidatorState(surface, surface.calls[0], outcome.threw ? 'rejected' : 'accepted');

          assertValidatorStateDelta(before, after, 'rejected');
        },
      ),
    );
  });
});

// ----------------------------------------------- counterfactual surface --
//
// Slice-03, step 03-01: the reading surface carries a producer-decided
// counterfactual score, never enough material for a page to calculate one.
// The `rounded_equal` marker preserves the distinction between a fresh,
// deliberately suppressed equality and a compatible legacy named row.

type CounterfactualRepresentation =
  | { readonly counterfactual_score_q: number }
  | { readonly counterfactual_suppression: 'rounded_equal' }
  | Record<never, never>;

function withCounterfactual(
  call: SurfaceCall,
  scoreQ: number,
  representation: CounterfactualRepresentation,
): SurfaceCall {
  return { ...call, score_q: scoreQ, ...representation };
}

function namedSurfaceWithCounterfactual(
  scoreQ: number,
  representation: CounterfactualRepresentation,
  token: FactorToken,
): PublishedSurfaceUpdate {
  const surface = buildValidSurface(1, 0, ['token'], ['token'], [token], [token]);
  const calls = surface.calls.map((call) => withCounterfactual(call, scoreQ, representation));
  const tomorrowSpots = surface.days[1].spots.map((call) => withCounterfactual(call, scoreQ, representation));
  return {
    ...surface,
    calls,
    days: [
      { ...surface.days[0]!, spots: calls },
      { ...surface.days[1]!, spots: tomorrowSpots },
    ],
  };
}

type InvalidCounterfactualPairing =
  | 'clean-score'
  | 'clean-marker'
  | 'missing-link'
  | 'equal'
  | 'lower'
  | 'fractional'
  | 'below-range'
  | 'above-range'
  | 'both'
  | 'bad-marker';

const INVALID_COUNTERFACTUAL_PAIRINGS: readonly InvalidCounterfactualPairing[] = [
  'clean-score', 'clean-marker', 'missing-link', 'equal', 'lower',
  'fractional', 'below-range', 'above-range', 'both', 'bad-marker',
];

function invalidCounterfactualSurface(
  pairing: InvalidCounterfactualPairing,
  token: FactorToken,
  scoreQ: number,
): PublishedSurfaceUpdate {
  const base = namedSurfaceWithCounterfactual(scoreQ, {}, token);
  const named = base.calls[0]!;
  const { weakest_link: _namedLink, ...withoutLink } = named;
  const score = pairing === 'above-range'
    ? 101
    : pairing === 'below-range'
      ? -1
      : pairing === 'fractional'
        ? scoreQ + 0.5
        : Math.max(0, scoreQ - 1);
  const invalid = pairing === 'clean-score'
    ? { ...named, weakest_link: null, counterfactual_score_q: scoreQ + 1 }
    : pairing === 'clean-marker'
      ? { ...named, weakest_link: null, counterfactual_suppression: 'rounded_equal' }
      : pairing === 'missing-link'
        ? { ...withoutLink, counterfactual_score_q: scoreQ + 1 }
        : pairing === 'equal'
          ? { ...named, counterfactual_score_q: scoreQ }
          : pairing === 'lower' || pairing === 'fractional' || pairing === 'below-range' || pairing === 'above-range'
            ? { ...named, counterfactual_score_q: score }
            : pairing === 'both'
              ? { ...named, counterfactual_score_q: Math.min(100, scoreQ + 1), counterfactual_suppression: 'rounded_equal' }
              : { ...named, counterfactual_suppression: 'not-rounded-equal' };
  return {
    ...base,
    calls: [invalid as SurfaceCall],
    days: [
      { ...base.days[0]!, spots: [invalid as SurfaceCall] },
      base.days[1]!,
    ],
  };
}

describe('SurfaceCall.counterfactual_score_q: producer-decided honest score without the named weakness', () => {
  it('retains a strictly higher integer, an explicit equality marker, or a legacy omission without changing other surface state', () => {
    fc.assert(
      fc.property(
        tokenArb,
        fc.integer({ min: 0, max: 99 }),
        fc.constantFrom<'higher' | 'rounded-equal' | 'legacy'>('higher', 'rounded-equal', 'legacy'),
        (token, scoreQ, mode) => {
          const representation: CounterfactualRepresentation = mode === 'higher'
            ? { counterfactual_score_q: scoreQ + 1 }
            : mode === 'rounded-equal'
              ? { counterfactual_suppression: 'rounded_equal' }
              : {};
          const surface = namedSurfaceWithCounterfactual(scoreQ, representation, token);
          const before = captureValidatorState(surface, surface.calls[0], 'pending');
          const outcome = tryValidate(surface);
          const after = captureValidatorState(surface, surface.calls[0], outcome.threw ? 'rejected' : 'accepted');

          assertValidatorStateDelta(before, after, 'accepted');
          assert.ok(!outcome.threw, outcome.threw ? outcome.message : 'valid counterfactual representation must validate');
          assert.deepEqual(outcome.value.calls[0], surface.calls[0], 'today counterfactual row changed during validation');
          assert.deepEqual(outcome.value.days[1]?.spots[0], surface.days[1]?.spots[0], 'tomorrow counterfactual row changed during validation');
        },
      ),
    );
  });

  it('refuses non-higher, non-integral, malformed, clean-day, or double counterfactual representations', () => {
    fc.assert(
      fc.property(
        tokenArb,
        fc.integer({ min: 1, max: 99 }),
        (token, scoreQ) => {
          for (const pairing of INVALID_COUNTERFACTUAL_PAIRINGS) {
            const rowScoreQ = pairing === 'below-range' ? -2 : scoreQ;
            const surface = invalidCounterfactualSurface(pairing, token, rowScoreQ);
            const before = captureValidatorState(surface, surface.calls[0], 'pending');
            const outcome = tryValidate(surface);
            const after = captureValidatorState(surface, surface.calls[0], outcome.threw ? 'rejected' : 'accepted');

            assertValidatorStateDelta(before, after, 'rejected');
          }
        },
      ),
    );
  });
});

// --------------------------------------------------- weakest-link reader --
//
// Slice-01, step 01-03: `resolveWeakestLink()` is the publish-side reader
// that answers, for one spot id and one day index, the published culprit
// token or the honest reason there isn't one. These properties reuse the
// fixtures above -- the same generated surfaces that prove the wire contract
// also drive the reader, so the two halves of the same contract can never
// quietly disagree about what a well-formed surface looks like.

function expectedReading(mode: WeakestLinkMode, token: FactorToken): WeakestLinkReading {
  if (mode === 'absent') return { kind: 'unknown' };
  if (mode === 'null') return { kind: 'clean' };
  return { kind: 'named', factor: token };
}

describe('resolveWeakestLink: the publish-side reader for one spot, one day', () => {
  // The falsifiable law QUALITY_GATES demands: missing and null must never
  // collapse into each other, and neither may ever surface as a named
  // factor. Proven falsifiable by deliberately collapsing `readingFor()` to
  // `weakestLink ?? { kind: 'unknown' }` in src/publish/weakest-link.ts and
  // re-running this file: the 'null' rows then read as `{ kind: 'unknown' }`
  // instead of `{ kind: 'clean' }`, and this property fails with a semantic
  // AssertionError naming the mismatched spot and day (see the RED_UNIT
  // phase log / crafter report for the captured failing run). Reverted, and
  // `git diff` shows src/publish/weakest-link.ts unchanged.
  it('keeps missing, explicit null and a named factor as three distinguishable readings, for every published row on either day', () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          todayModes: modesArb(count),
          tomorrowModes: modesArb(count),
          todayTokens: tokensArb(count),
          tomorrowTokens: tokensArb(count),
        })),
        ({ count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens }) => {
          const surface = buildValidSurface(count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens);
          spotIds(count).forEach((spotId, index) => {
            const todayExpected = expectedReading(todayModes[index] ?? 'absent', todayTokens[index] ?? 'dir');
            const tomorrowExpected = expectedReading(tomorrowModes[index] ?? 'absent', tomorrowTokens[index] ?? 'dir');
            assert.deepEqual(resolveWeakestLink(surface, spotId, 0), todayExpected, `today reading for ${spotId}`);
            assert.deepEqual(resolveWeakestLink(surface, spotId, 1), tomorrowExpected, `tomorrow reading for ${spotId}`);
          });
        },
      ),
    );
  });

  it('pairs a named factor with only its own row and day scalar, never a lower neighbor or an invented legacy value', () => {
    fc.assert(
      fc.property(
        tokenArb,
        tokenArb,
        tokenArb,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (todayFactor, tomorrowFactor, legacyFactor, todayHundredths, tomorrowHundredths, decoyHundredths) => {
          const surfDate = civilDate(0);
          const tomorrowDate = nextCivilDate(surfDate);
          const todayScalar = todayHundredths / 100;
          const tomorrowScalar = tomorrowHundredths / 100;
          const dayZeroDecoyScalar = decoyHundredths / 100;
          const named = (spotId: string, scoreQ: number, label: string, factor: FactorToken, scalar: number): SurfaceCall => ({
            ...baseCall(spotId, scoreQ, label),
            weakest_link: factor,
            weakest_link_subscore: scalar,
          });
          const legacy = (spotId: string, scoreQ: number, label: string, factor: FactorToken): SurfaceCall => ({
            ...baseCall(spotId, scoreQ, label),
            weakest_link: factor,
          });
          const clean = (spotId: string, scoreQ: number, label: string): SurfaceCall => ({
            ...baseCall(spotId, scoreQ, label),
            weakest_link: null,
          });
          const calls = [
            named('playa-pareada', 1, 'hoy', todayFactor, todayScalar),
            legacy('playa-legada', 2, 'hoy', legacyFactor),
            clean('playa-limpia', 3, 'hoy'),
          ];
          const dayZeroSpots = [
            named('playa-pareada', 1, 'espejo', legacyFactor, dayZeroDecoyScalar),
            legacy('playa-legada', 2, 'espejo', todayFactor),
            clean('playa-limpia', 3, 'espejo'),
          ];
          const tomorrowSpots = [
            named('playa-pareada', 101, 'mañana', tomorrowFactor, tomorrowScalar),
            // Its zero can be lower than playa-pareada's raw value, but it
            // is a different row and must never replace the published pair.
            named('playa-vecina', 102, 'mañana', legacyFactor, 0),
            legacy('playa-legada', 103, 'mañana', legacyFactor),
            clean('playa-limpia', 104, 'mañana'),
          ];
          const surface: PublishedSurfaceUpdate = {
            schema: 'published-surface-update/v1',
            surf_date: surfDate,
            published_at: `${surfDate}T11:00:00.000Z`,
            build_kind: 'dawn',
            calls,
            days: [
              { date: surfDate, spots: dayZeroSpots },
              { date: tomorrowDate, spots: tomorrowSpots },
            ],
          };
          const validated = assertStrictTwoDayUpdate(surface);
          const before = structuredClone(validated);

          assert.deepEqual(resolveWeakestLink(validated, 'playa-pareada', 0), {
            kind: 'named', factor: todayFactor, weakest_link_subscore: todayScalar,
          });
          assert.deepEqual(resolveWeakestLink(validated, 'playa-pareada', 1), {
            kind: 'named', factor: tomorrowFactor, weakest_link_subscore: tomorrowScalar,
          });
          assert.deepEqual(resolveWeakestLink(validated, 'playa-legada', 0), { kind: 'named', factor: legacyFactor });
          assert.deepEqual(resolveWeakestLink(validated, 'playa-limpia', 1), { kind: 'clean' });
          assert.deepEqual(resolveWeakestLink(validated, 'playa-ausente', 0), { kind: 'unknown' });
          assert.deepEqual(validated, before, 'reader changed the published rows it only reads');
        },
      ),
    );
  });

  // Pins src/data/forecast.ts line 77 exactly. The acceptance suite cannot
  // catch a reversal of this rule (its own fixture plants the same today
  // plan into both `calls` and `days[0].spots`), so this is a UNIT-TEST
  // OBLIGATION: `calls` and `days[0].spots` are given deliberately different
  // weakest_link values below, a shape assertStrictTwoDayUpdate allows, and
  // day 0 must always resolve from `calls`.
  it("reads today from surface.calls and tomorrow from surface.days[1].spots -- forecast.ts:77's alias, never the more obvious days[0].spots", () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          callsModes: modesArb(count),
          callsTokens: tokensArb(count),
          days0Modes: modesArb(count),
          days0Tokens: tokensArb(count),
        })),
        ({ count, dayOffset, callsModes, callsTokens, days0Modes, days0Tokens }) => {
          const ids = spotIds(count);
          const surfDate = civilDate(dayOffset);
          const tomorrowDate = nextCivilDate(surfDate);
          const calls = ids.map((id, index) => withWeakestLink(baseCall(id, index, 'hoy'), callsModes[index] ?? 'absent', callsTokens[index] ?? 'dir'));
          // days[0].spots deliberately diverges from calls in its
          // weakest_link only -- a legitimate shape the validator allows --
          // so this property fails the instant the reader picks the wrong
          // array.
          const days0Spots = ids.map((id, index) => withWeakestLink(baseCall(id, index, 'hoy'), days0Modes[index] ?? 'absent', days0Tokens[index] ?? 'dir'));
          const tomorrowSpots = ids.map((id, index) => baseCall(id, index + 1000, 'mañana'));
          const surface: PublishedSurfaceUpdate = {
            schema: 'published-surface-update/v1',
            surf_date: surfDate,
            published_at: `${surfDate}T11:00:00.000Z`,
            build_kind: 'dawn',
            calls,
            days: [
              { date: surfDate, spots: days0Spots },
              { date: tomorrowDate, spots: tomorrowSpots },
            ],
          };
          const validated = assertStrictTwoDayUpdate(surface);
          ids.forEach((spotId, index) => {
            const expectedFromCalls = expectedReading(callsModes[index] ?? 'absent', callsTokens[index] ?? 'dir');
            assert.deepEqual(resolveWeakestLink(validated, spotId, 0), expectedFromCalls, `${spotId}: day 0 must read surface.calls, not surface.days[0].spots`);
          });
        },
      ),
    );
  });

  it('answers unknown for a spot with no row on that day at all, on either day, never a fabricated factor', () => {
    fc.assert(
      fc.property(
        spotCountArb.chain((count) => fc.record({
          count: fc.constant(count),
          dayOffset: dayOffsetArb,
          todayModes: modesArb(count),
          tomorrowModes: modesArb(count),
          todayTokens: tokensArb(count),
          tomorrowTokens: tokensArb(count),
        })),
        ({ count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens }) => {
          const surface = buildValidSurface(count, dayOffset, todayModes, tomorrowModes, todayTokens, tomorrowTokens);
          const unpublishedSpotId = 'playa-que-no-esta-publicada';
          assert.deepEqual(resolveWeakestLink(surface, unpublishedSpotId, 0), { kind: 'unknown' });
          assert.deepEqual(resolveWeakestLink(surface, unpublishedSpotId, 1), { kind: 'unknown' });
        },
      ),
    );
  });

  it("keeps each spot's reading tied to its own row and its own day: two spots with different published factors never read the same, and one spot's today never equals its own tomorrow when the morning published them differently", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        dayOffsetArb,
        fc.uniqueArray(tokenArb, { minLength: 3, maxLength: 3 }),
        (count, dayOffset, distinctTokens) => {
          const [spotAToday, spotBToday, spotATomorrow] = distinctTokens as [FactorToken, FactorToken, FactorToken];
          const ids = spotIds(count);
          const modes: WeakestLinkMode[] = ids.map(() => 'token');
          const todayTokens: FactorToken[] = ids.map((_, index) => {
            if (index === 0) return spotAToday;
            if (index === 1) return spotBToday;
            return 'dir';
          });
          const tomorrowTokens: FactorToken[] = ids.map((_, index) => (index === 0 ? spotATomorrow : 'dir'));
          const surface = buildValidSurface(count, dayOffset, modes, modes, todayTokens, tomorrowTokens);

          const readingA = resolveWeakestLink(surface, ids[0]!, 0);
          const readingB = resolveWeakestLink(surface, ids[1]!, 0);
          const readingATomorrow = resolveWeakestLink(surface, ids[0]!, 1);

          assert.deepEqual(readingA, { kind: 'named', factor: spotAToday });
          assert.deepEqual(readingB, { kind: 'named', factor: spotBToday });
          assert.deepEqual(readingATomorrow, { kind: 'named', factor: spotATomorrow });
          assert.notDeepEqual(readingA, readingB, `${ids[0]} and ${ids[1]} published different factors today and must read differently`);
          assert.notDeepEqual(readingA, readingATomorrow, `${ids[0]}'s own today must never equal its own tomorrow when the morning published them differently`);
        },
      ),
    );
  });

  // Single-example smoke read against the real committed artifact, the same
  // one src/data/forecast.ts imports -- proves the reader works against
  // production data, not only synthetic fixtures. The oracle below reads the
  // row directly (own-key check, own value), independently of
  // resolveWeakestLink()'s internals, so this stays a real assertion rather
  // than a tautology once the cross-lane population lands and some spot
  // finally carries a token here.
  function readOwnWeakestLink(row: SurfaceCall | undefined): WeakestLinkReading {
    if (row === undefined || withoutOwnKey(row, 'weakest_link')) return { kind: 'unknown' };
    if (row.weakest_link === null) return { kind: 'clean' };
    return { kind: 'named', factor: row.weakest_link as FactorToken };
  }

  it('reads a real culprit or an honest absence from the committed data/published-surface.json, matching the row itself', () => {
    const committed = JSON.parse(readFileSync(
      new URL('../../data/published-surface.json', import.meta.url),
      'utf8',
    )) as { current: unknown };
    const surface = assertStrictTwoDayUpdate(committed.current);
    const firstSpot = surface.calls[0];
    assert.ok(firstSpot, 'test fixture error: the committed surface published zero spots');
    const tomorrowRow = surface.days[1].spots.find((call) => call.spot_id === firstSpot.spot_id);

    assert.deepEqual(
      resolveWeakestLink(surface, firstSpot.spot_id, 0),
      readOwnWeakestLink(firstSpot),
      'today reading must match what the committed calls row itself carries',
    );
    assert.deepEqual(
      resolveWeakestLink(surface, firstSpot.spot_id, 1),
      readOwnWeakestLink(tomorrowRow),
      'tomorrow reading must match what the committed days[1] row itself carries',
    );
  });
});
