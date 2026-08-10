// Property laws for the report record and its identity mint.
//
// These four properties own the two claims the whole write path later rests
// on. domain-model.md section 7.4 queues the composed record and replays it
// byte-identical, and section 10 gives the SurfReport aggregate no edit
// command, so a record composed wrong today is a permanently invalid record,
// not a bug someone fixes later. That is why these are properties over the
// whole answer space rather than three examples: every size band, every wind
// state and every quality the form can emit must compose to something the
// endpoint of 07-write-path.md section 4.1 would accept.
//
// Both functions are pure and take every dependency as a parameter, so the
// unit driving port is the function signature itself: the clock and the
// randomness are injected here exactly as the island will inject them.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../../src/data/report-vocab';
import { sizeBands } from '../../src/data/size-bands';
import {
  SIZE_BAND_SCHEMA,
  composeReportRecord,
  type Clock,
  type ReportAnswers,
  type ReportRecord,
} from '../../src/report/report-record';
import { mintReportId, type RandomSource } from '../../src/report/ulid';

/**
 * Crockford base32, 26 symbols, written out here rather than imported: an
 * oracle that reads the production alphabet would follow it into any mistake,
 * including re-admitting the I/L/O/U a ULID must never carry.
 */
const ULID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

const SIZE_BAND_TOKENS = sizeBands.map((band) => band.value);

/** The full field list of the record, 07-write-path.md section 4.1 plus photo_ids. */
const RECORD_FIELDS = [
  'observed_at',
  'photo_ids',
  'quality',
  'report_id',
  'size_band',
  'size_band_schema',
  'spot_id',
  'submitted_at',
  'trigger',
  'wind',
];

const anySpotId = fc.stringMatching(/^[a-z]{3,12}(-[a-z]{3,12}){0,2}$/);

const anyAnswers: fc.Arbitrary<ReportAnswers> = fc.record({
  size_band: fc.constantFrom(...SIZE_BAND_TOKENS),
  wind: fc.constantFrom(...WIND_STATE_TOKENS),
  quality: fc.constantFrom(...QUALITY_TOKENS),
});

/** Instants a phone at a beach can plausibly report at. */
const anyInstant = fc.date({
  min: new Date('2026-01-01T00:00:00.000Z'),
  max: new Date('2099-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

/** A draw honouring the RandomSource contract: one value in [0, 1). */
const anyDraw = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

/** Sixteen draws: one per random ULID symbol, the full 80 bits. */
const anyDraws = fc.array(anyDraw, { minLength: 16, maxLength: 16 });

/** Sixteen symbol indices; `index / 32` is the draw that selects exactly that symbol. */
const anySymbolIndices = fc.array(fc.integer({ min: 0, max: 31 }), { minLength: 16, maxLength: 16 });

function sourceOf(draws: readonly number[]): RandomSource {
  let cursor = 0;
  return () => {
    const draw = draws[cursor % draws.length] ?? 0;
    cursor += 1;
    return draw;
  };
}

function sourceOfSymbols(indices: readonly number[]): RandomSource {
  return sourceOf(indices.map((index) => index / 32));
}

/**
 * A clock that returns a DIFFERENT instant on every read, one hour apart.
 * A composer that reads it twice cannot then produce two equal stamps, which
 * is what makes "the commit instant is read once" a falsifiable claim rather
 * than an untested intention.
 */
function advancingClock(first: Date): Clock {
  let reads = 0;
  return () => {
    const instant = new Date(first.getTime() + reads * 3_600_000);
    reads += 1;
    return instant;
  };
}

/** Every string anywhere in the record, including inside photo_ids. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

/** Independent oracle: the same instant floored to its second, in milliseconds. */
function flooredToSecond(instant: Date): number {
  return Math.floor(instant.getTime() / 1000) * 1000;
}

describe('the record the phone keeps', () => {
  it("is the surfer's three answers at one injected instant, and carries nothing else", () => {
    fc.assert(
      fc.property(anySpotId, anyAnswers, anyInstant, anyDraws, (spot_id, answers, instant, draws) => {
        const record: ReportRecord = composeReportRecord(
          advancingClock(instant),
          sourceOf(draws),
          spot_id,
          answers,
        );

        assert.deepEqual(
          Object.keys(record).sort(),
          RECORD_FIELDS,
          'the record carries exactly the fields a client may set: 07-write-path.md section 4.1 '
            + 'plus photo_ids. A stray field is a schema_invalid POST the day the endpoint exists '
            + '(section 4.2 step 2), and a missing one can never be added to a record that replays '
            + 'byte-identical.',
        );

        assert.equal(record.spot_id, spot_id, 'the record belongs to the spot the surfer reported');
        assert.equal(record.size_band, answers.size_band, 'the size answer lands verbatim');
        assert.equal(record.wind, answers.wind, 'the wind answer lands verbatim');
        assert.equal(record.quality, answers.quality, 'the quality answer lands verbatim');

        assert.equal(
          record.size_band_schema,
          SIZE_BAND_SCHEMA,
          'the record states which size-band table it was picked from, or the learning lane cannot '
            + 'compare it to anything (domain-model.md section 7.2)',
        );
        assert.equal(record.trigger, 'organic', 'nothing solicited this report');
        assert.deepEqual(record.photo_ids, [], 'photos are the only later-mutable slot, and it starts empty');

        for (const stamp of [record.observed_at, record.submitted_at]) {
          assert.match(
            stamp,
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
            `${JSON.stringify(stamp)} is not the settled second-precision UTC stamp both settled `
              + 'examples carry verbatim (domain-model.md section 7.3, 07-write-path.md section 4.1)',
          );
          assert.equal(
            Date.parse(stamp),
            flooredToSecond(instant),
            'the stamp is the injected commit instant, floored to its second. Any other value means '
              + 'something read a clock that was not passed in',
          );
        }
        assert.equal(
          record.submitted_at,
          record.observed_at,
          'the commit instant is read once. The record is composed and queued in one step and '
            + 'replays byte-identical, so there is no second reading to make',
        );

        assert.equal(
          record.report_id,
          mintReportId(instant, sourceOf(draws)),
          'the identity is minted at the commit instant from the injected randomness, once, before '
            + 'any network attempt (domain-model.md section 7.3)',
        );
      }),
      { numRuns: 300 },
    );
  });

  it('says everything in the one shared vocabulary, so no placeholder wording can reach it', () => {
    const canonical = new Set<string>([...SIZE_BAND_TOKENS, ...WIND_STATE_TOKENS, ...QUALITY_TOKENS]);

    fc.assert(
      fc.property(anySpotId, anyAnswers, anyInstant, anyDraws, (spot_id, answers, instant, draws) => {
        const record = composeReportRecord(advancingClock(instant), sourceOf(draws), spot_id, answers);

        assert.ok(canonical.has(record.size_band), 'the size token comes from src/data/size-bands.ts');
        assert.ok(canonical.has(record.wind), 'the wind token comes from src/data/report-vocab.ts');
        assert.ok(canonical.has(record.quality), 'the quality token comes from src/data/report-vocab.ts');

        const allowed = new Set<string>([
          ...canonical,
          spot_id,
          record.report_id,
          record.observed_at,
          record.submitted_at,
          'organic',
        ]);
        for (const text of stringsIn(record)) {
          assert.ok(
            allowed.has(text),
            `the record carries the word ${JSON.stringify(text)}, which is neither the spot, the `
              + 'identity, a timestamp, the settled trigger, nor a token from the two constants '
              + 'files. Every word in a record that replays byte-identical must come from the one '
              + 'shared vocabulary; anything else is a schema_invalid POST that can never be repaired',
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('the identity minted at commit', () => {
  it('is always 26 Crockford symbols, and only ever the injected instant and draws decide it', () => {
    fc.assert(
      fc.property(anyInstant, anyDraws, (instant, draws) => {
        const minted = mintReportId(instant, sourceOf(draws));

        assert.match(
          minted,
          ULID_PATTERN,
          `${JSON.stringify(minted)} is not a 26-symbol Crockford base32 ULID. The identity is half `
            + 'of the dedup natural key forever (domain-model.md section 7.4), so a malformed one is '
            + 'a report the server can neither store nor recognise',
        );
        assert.equal(
          minted,
          mintReportId(instant, sourceOf(draws)),
          'the same instant and the same draws mint the same identity. A different one means the '
            + 'mint reached for an ambient clock or an ambient random source',
        );
      }),
      { numRuns: 300 },
    );
  });

  it('gives two different reports two different identities whenever the randomness differs', () => {
    fc.assert(
      fc.property(anyInstant, anySymbolIndices, anySymbolIndices, (instant, first, second) => {
        fc.pre(first.join() !== second.join());

        assert.notEqual(
          mintReportId(instant, sourceOfSymbols(first)),
          mintReportId(instant, sourceOfSymbols(second)),
          'two reports minted in the same millisecond from different randomness share an identity. '
            + 'The second one is silently dropped as a duplicate at the write path '
            + '(domain-model.md section 7.4), so the surfer loses a label and is told it was saved',
        );
      }),
      { numRuns: 300 },
    );
  });
});
