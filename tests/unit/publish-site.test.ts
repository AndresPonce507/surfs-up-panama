// Property laws for the two pure functions this slice introduces.
// runPublishOnce's orchestration is fully pinned by the acceptance suite
// (tests/acceptance/weather-to-site-bridge/a-fresh-bundle-republishes-the-site.feature)
// through the driving port; these unit properties amplify coverage over the
// input space for the pure sub-laws the AT can only pin with a handful of
// fixture examples (same reasoning as tests/unit/scoring-laws.test.ts).

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  PUBLISH_REFUSED_EVENT,
  PUBLISH_SUCCESS_EVENT,
  derivePublishLogLines,
} from '../../src/pipeline/lambda/log-events';
import type { PublishOutcome } from '../../src/pipeline/publish-site';
import { assertCurrentCivilDay, type StaticSurface } from '../../src/publish/static-surface';

const publishedOutcome: fc.Arbitrary<PublishOutcome> = fc.record({
  published: fc.constant(true as const),
  build_id: fc.string({ minLength: 1, maxLength: 30 }),
  uploaded_objects: fc.nat({ max: 1000 }),
  directory_aliases: fc.nat({ max: 1000 }),
});

const refusedOutcome: fc.Arbitrary<PublishOutcome> = fc.record({
  published: fc.constant(false as const),
  reason: fc.string({ minLength: 1, maxLength: 200 }),
});

const anyPublishOutcome: fc.Arbitrary<PublishOutcome> = fc.oneof(publishedOutcome, refusedOutcome);

describe('derivePublishLogLines: publish.success is 1 iff outcome.published, else 0', () => {
  it('derives exactly one honest line naming the outcome, and success/refused are mutually exclusive', () => {
    fc.assert(
      fc.property(anyPublishOutcome, (outcome) => {
        const lines = derivePublishLogLines(outcome);
        const successes = lines.filter((line) => line['event'] === PUBLISH_SUCCESS_EVENT);
        const refusals = lines.filter((line) => line['event'] === PUBLISH_REFUSED_EVENT);

        assert.equal(lines.length, 1, 'exactly one line is derived per outcome');
        assert.equal(successes.length, outcome.published ? 1 : 0, 'publish.success count is 1 iff published');
        assert.equal(refusals.length, outcome.published ? 0 : 1, 'publish.refused count is 1 iff refused');
        if (outcome.published) {
          assert.equal(successes[0]?.['build_id'], outcome.build_id, 'the success line carries the outcome\'s own build_id');
        } else {
          assert.equal(refusals[0]?.['reason'], outcome.reason, 'the refusal line carries the outcome\'s own reason');
        }
      }),
    );
  });
});

function surfaceForDay(date: string): StaticSurface {
  return {
    schema: 'static-surface/v1',
    dawn_receipts: [],
    current: {
      schema: 'published-surface-update/v1',
      surf_date: date,
      published_at: '2026-01-01T00:00:00.000Z',
      build_kind: 'hourly',
      calls: [],
      days: [
        { date, spots: [] },
        { date, spots: [] },
      ],
    },
  };
}

/** Same T12:00:00Z-noon pattern static-surface.ts's own previousCivilDate/nextCivilDate use, to dodge DST. */
function shiftCivilDate(date: string, days: number): string {
  const atNoonUtc = new Date(`${date}T12:00:00Z`);
  atNoonUtc.setUTCDate(atNoonUtc.getUTCDate() + days);
  return atNoonUtc.toISOString().slice(0, 10);
}

describe('assertCurrentCivilDay: the midnight rule against an injected instant, never the wall clock', () => {
  it('never throws when the surface is for Panama\'s civil day at the instant, and always names both days otherwise', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true }),
        fc.integer({ min: -3, max: 3 }),
        (instant, dayOffset) => {
          const panamaToday = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Panama',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(instant);
          const publishedDay = shiftCivilDate(panamaToday, dayOffset);
          const surface = surfaceForDay(publishedDay);

          if (dayOffset === 0) {
            assert.doesNotThrow(() => assertCurrentCivilDay(surface, instant));
          } else {
            assert.throws(
              () => assertCurrentCivilDay(surface, instant),
              (error: unknown) => {
                const text = error instanceof Error ? error.message : String(error);
                return text.includes(publishedDay) && text.includes(panamaToday);
              },
              'the refusal must name both the surface\'s own day and Panama\'s actual civil day',
            );
          }
        },
      ),
    );
  });
});
