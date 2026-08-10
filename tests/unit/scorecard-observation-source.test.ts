// Property laws for the day-one observation source: the driven port slice-01
// asks how many surf reports a spot has.
//
// Zero reports have ever been filed and no observation store is deployed in
// this build, so the only outcome the source can produce today is a structured
// absence. These laws exist because an absence oracle that merely reads "the
// store is empty" stays green with no production code at all. Every assertion
// below is a positive claim about an outcome the source had to hand back, from
// a surface that had to exist.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  dayOneObservationSource,
  probeObservationSource,
  type ObservationCount,
  type ObservationSource,
} from '../../src/scorecard/observation-source';
import { REPORTS_REQUIRED } from '../../src/scorecard/threshold';

// Any spot id at all, including the ones a generator rarely reaches on its
// own: the empty id, an all-whitespace id, an accented id and a very long one.
// The unconditional render in 01-05 is only safe if the source answers for
// every one of them.
const anySpotId = fc.oneof(
  fc.string(),
  fc.constantFrom('', '   ', 'venao', 'playa-el-palmar', 'Ñ-ñuñoa', 'x'.repeat(400)),
);

// A source name a refusal has to quote back. Filtered so the name is never
// blank: `''.includes('')` is true for any message and would make the naming
// assertion vacuous.
const anySourceName = fc.string({ minLength: 3 }).filter((name) => name.trim().length >= 3);

interface Refusal {
  readonly what: string;
  readonly source: ObservationSource;
}

const answeringSource = (answer: unknown): ObservationSource => (() => answer) as unknown as ObservationSource;

// Real values the test constructs: a source that throws, and sources that
// answer with something that is not a structured outcome. Injecting them is
// what makes the refusal law non-vacuous, and it is why the source is a
// parameter rather than a module-scope singleton.
const anyRefusingSource = fc.oneof(
  fc.constant<Refusal>({
    what: 'a source that throws',
    source: () => {
      throw new Error('the observation store could not be opened');
    },
  }),
  fc
    .constantFrom<unknown>(
      undefined,
      null,
      0,
      '',
      'store-absent',
      [],
      {},
      { kind: 'unknown' },
      { kind: 'store-absent' },
      { kind: 'store-absent', reason: '' },
      { kind: 'store-absent', reason: '   ' },
      { kind: 'counted', n_obs: 1 },
    )
    .map((answer) => ({
      what: `a source answering ${JSON.stringify(answer) ?? String(answer)}`,
      source: answeringSource(answer),
    })),
);

const asStoreAbsent = (answer: ObservationCount) => {
  if (answer.kind !== 'store-absent') {
    assert.fail(`expected a store-absent outcome, got kind ${JSON.stringify(answer.kind)}`);
  }
  return answer;
};

describe('day-one observation source', () => {
  it('answers a structured store-absent outcome, with a plain reason, for any spot id', () => {
    fc.assert(
      fc.property(anySpotId, (spotId) => {
        const answer: ObservationCount = dayOneObservationSource(spotId);

        assert.ok(
          answer !== undefined && answer !== null,
          `the source must answer for spot id ${JSON.stringify(spotId)}, never undefined`,
        );
        assert.ok(
          !Array.isArray(answer),
          `the source must answer with an outcome, never a bare collection (got ${JSON.stringify(answer)})`,
        );

        const absent = asStoreAbsent(answer);
        assert.ok(
          absent.reason.trim().length > 0,
          `the absence must carry a plain reason for spot id ${JSON.stringify(spotId)}`,
        );
        assert.ok(
          !('n_obs' in answer) && !('n_reporters' in answer),
          `the day-one source must not report a count; a fabricated zero is the dishonesty this feature refuses (got ${JSON.stringify(answer)})`,
        );
      }),
    );
  });

  it('gives the same answer twice for the same spot id', () => {
    fc.assert(
      fc.property(anySpotId, (spotId) => {
        assert.deepEqual(dayOneObservationSource(spotId), dayOneObservationSource(spotId));
      }),
    );
  });

  it('passes its own probe, so the composition root can wire, then probe, then read', () => {
    assert.doesNotThrow(() => {
      probeObservationSource('day-one observation source', dayOneObservationSource);
    });
  });
});

describe('observation source probe', () => {
  it('refuses loudly, naming the source, when the source cannot answer with an outcome', () => {
    fc.assert(
      fc.property(anySourceName, anyRefusingSource, (sourceName, refusal) => {
        let thrown: unknown;
        try {
          probeObservationSource(sourceName, refusal.source);
        } catch (error) {
          thrown = error;
        }

        assert.ok(
          thrown instanceof Error,
          `probing ${refusal.what} must refuse loudly, so the build fails instead of rendering a fabricated counter`,
        );
        assert.ok(
          thrown.message.includes(sourceName),
          `the refusal must name the source ${JSON.stringify(sourceName)}; got: ${thrown.message}`,
        );
      }),
    );
  });
});

describe('reports threshold', () => {
  // Decision 19: thirty reports before this product will say anything about
  // how it did. One exported home, so the future write-path composer imports
  // it rather than retyping the number at a second site.
  it('has one exported home carrying the settled thirty', () => {
    assert.equal(REPORTS_REQUIRED, 30);
    assert.ok(Number.isInteger(REPORTS_REQUIRED) && REPORTS_REQUIRED > 0);
  });
});
