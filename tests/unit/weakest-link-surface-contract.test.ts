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

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { FACTOR_TOKENS, type FactorToken } from '../../src/publish/factor-vocab';
import {
  assertStrictTwoDayUpdate,
  type PublishedSurfaceUpdate,
  type SurfaceCall,
} from '../../src/publish/static-surface';

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
