// Property laws for the offline report queue and its Earned Trust probe.
//
// application-architecture.md section 12 states the rule these laws exist to
// enforce: no silent queue that drops labels. The happy path is the cheap part
// and the least interesting. The cases that actually happen to a surfer are
// private mode, where IndexedDB refuses at open, and storage pressure, where
// it refuses mid session. The worst case of all is a store that accepts a
// write and then hands back something else, because that one looks like
// success and loses the label anyway. So the refusal paths get a property over
// every way storage can fail, not an example or two.
//
// The unit driving port is the function signature itself. Storage arrives as
// an injected factory, so the fake below is a plain in memory store with a
// fault switch, written here rather than pulled in as a dependency. Real
// IndexedDB is exercised by the acceptance suite in Chromium.
//
// domain-model.md section 10 gives SurfReport no edit command, so the row this
// queue stores is the final one. The commit law therefore asserts the stored
// row parses back equal to the composed record, field for field, and that a
// retry replays it byte identical instead of forking a second row.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../../src/data/report-vocab';
import { sizeBands } from '../../src/data/size-bands';
import { composeReportRecord, type ReportRecord } from '../../src/report/report-record';
import {
  SENTINEL_KEY_PREFIX,
  openReportQueue,
  probe,
  type QueueDependencies,
  type QueueStore,
  type RefusalReason,
} from '../../src/report/queue';

// ---------------------------------------------------------------------------
// The fake store: three verbs, one fault switch, one call log.
// ---------------------------------------------------------------------------

type StoreVerb = 'open' | 'put' | 'get' | 'remove';

type Fault =
  | { readonly kind: 'none' }
  | { readonly kind: 'throws'; readonly verb: StoreVerb }
  | { readonly kind: 'rejects'; readonly verb: StoreVerb }
  | { readonly kind: 'wrong_read_back'; readonly drift: string }
  | { readonly kind: 'empty_read_back' };

interface FakeStorage extends QueueDependencies {
  /** Every verb and key the module asked for, in order. */
  readonly calls: readonly string[];
  /** The surviving rows, so residue and untouched seed rows are observable. */
  readonly rows: ReadonlyMap<string, string>;
  /** Turn a fault on after the probe has already passed. */
  readonly arm: (next: Fault) => void;
}

function fakeStorage(seed: ReadonlyMap<string, string>, initial: Fault, token: string): FakeStorage {
  const rows = new Map(seed);
  const calls: string[] = [];
  let fault = initial;

  // Returns a rejected promise for an async refusal, throws for a synchronous
  // one, and null when this verb is not the faulty one. Synchronous throws are
  // the private mode case and are not the same test as a rejected promise.
  const refusal = (verb: StoreVerb): Promise<never> | null => {
    if (fault.kind === 'throws' && fault.verb === verb) {
      throw new Error(`${verb} refused synchronously`);
    }
    if (fault.kind === 'rejects' && fault.verb === verb) {
      return Promise.reject(new Error(`${verb} refused`));
    }
    return null;
  };

  const store: QueueStore = {
    put: (key: string, value: string): Promise<void> => {
      calls.push(`put ${key}`);
      const refused = refusal('put');
      if (refused !== null) return refused;
      rows.set(key, value);
      return Promise.resolve();
    },
    get: (key: string): Promise<string | undefined> => {
      calls.push(`get ${key}`);
      const refused = refusal('get');
      if (refused !== null) return refused;
      const stored = rows.get(key);
      // The two silent losses. drift is always non empty, so the drifted value
      // provably differs from what was written.
      if (fault.kind === 'wrong_read_back') return Promise.resolve(`${stored ?? ''}${fault.drift}`);
      if (fault.kind === 'empty_read_back') return Promise.resolve(undefined);
      return Promise.resolve(stored);
    },
    remove: (key: string): Promise<void> => {
      calls.push(`remove ${key}`);
      const refused = refusal('remove');
      if (refused !== null) return refused;
      rows.delete(key);
      return Promise.resolve();
    },
    entries: (): Promise<readonly { readonly key: string; readonly value: string }[]> =>
      Promise.resolve([...rows.entries()].map(([key, value]) => ({ key, value }))),
  };

  return {
    openStore: (): Promise<QueueStore> => {
      calls.push('open');
      const refused = refusal('open');
      if (refused !== null) return refused;
      return Promise.resolve(store);
    },
    newSentinel: () => token,
    calls,
    rows,
    arm: (next: Fault) => {
      fault = next;
    },
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Rows already queued from an earlier offline session. Never sentinel keys. */
const seedRows = fc
  .dictionary(
    fc.string({ minLength: 1, maxLength: 10 }).map((key) => `row-${key}`),
    fc.string({ maxLength: 30 }),
    { maxKeys: 4 },
  )
  .map((entries) => new Map(Object.entries(entries)));

const sentinelToken = fc.string({ minLength: 1, maxLength: 12 }).map((raw) => `probe-${raw}`);

const reportRecord: fc.Arbitrary<ReportRecord> = fc
  .record({
    spot_id: fc.string({ minLength: 1, maxLength: 24 }),
    epoch_ms: fc.integer({ min: 0, max: 4_000_000_000_000 }),
    seed: fc.double({ min: 0, max: 0.999_999, noNaN: true }),
    size_band: fc.constantFrom(...sizeBands.map((band) => band.value)),
    wind: fc.constantFrom(...WIND_STATE_TOKENS),
    quality: fc.constantFrom(...QUALITY_TOKENS),
  })
  .map((draw) =>
    composeReportRecord(
      () => new Date(draw.epoch_ms),
      () => draw.seed,
      draw.spot_id,
      { size_band: draw.size_band, wind: draw.wind, quality: draw.quality },
    ),
  );

const REFUSAL_BY_VERB: Readonly<Record<StoreVerb, RefusalReason>> = {
  open: 'open_refused',
  put: 'write_refused',
  get: 'read_back_refused',
  remove: 'delete_refused',
};

interface FaultCase {
  readonly fault: Fault;
  readonly reason: RefusalReason;
}

/** Storage that refuses a verb outright, synchronously or asynchronously. */
const refusingFault: fc.Arbitrary<FaultCase> = fc
  .record({
    verb: fc.constantFrom<StoreVerb>('open', 'put', 'get', 'remove'),
    style: fc.constantFrom<'throws' | 'rejects'>('throws', 'rejects'),
  })
  .map(({ verb, style }) => ({
    fault: { kind: style, verb } as Fault,
    reason: REFUSAL_BY_VERB[verb],
  }));

/** Storage that accepts the write and then loses or mangles it silently. */
const silentLossFault: fc.Arbitrary<FaultCase> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 8 }).map((drift) => ({
    fault: { kind: 'wrong_read_back', drift } as Fault,
    reason: 'read_back_mismatch' as RefusalReason,
  })),
  fc.constant({
    fault: { kind: 'empty_read_back' } as Fault,
    reason: 'read_back_mismatch' as RefusalReason,
  }),
);

const anyFault = fc.oneof(refusingFault, silentLossFault);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRowsSurvived(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): void {
  for (const [key, value] of before) {
    assert.equal(after.get(key), value, `probe or commit disturbed the queued row ${key}`);
  }
}

function sentinelResidue(rows: ReadonlyMap<string, string>): readonly string[] {
  return [...rows.keys()].filter((key) => key.startsWith(SENTINEL_KEY_PREFIX));
}

// ---------------------------------------------------------------------------
// Laws
// ---------------------------------------------------------------------------

describe('the Earned Trust probe', () => {
  it('writes, reads back and deletes a sentinel through the injected factory, then reports ready', async () => {
    await fc.assert(
      fc.asyncProperty(seedRows, sentinelToken, async (seed, token) => {
        const storage = fakeStorage(seed, { kind: 'none' }, token);

        const outcome = await probe(storage);

        assert.equal(outcome.kind, 'ready', 'a working store must produce a ready probe');
        const key = `${SENTINEL_KEY_PREFIX}${token}`;
        assert.deepEqual(
          storage.calls,
          ['open', `put ${key}`, `get ${key}`, `remove ${key}`],
          'the probe must write, read back and delete the sentinel, in that order',
        );
        assert.deepEqual(sentinelResidue(storage.rows), [], 'the probe must leave no sentinel behind');
        seedRowsSurvived(seed, storage.rows);
      }),
    );
  });

  it('refuses every way storage can fail, never throws, and hands back no way to commit', async () => {
    await fc.assert(
      fc.asyncProperty(seedRows, sentinelToken, anyFault, async (seed, token, testCase) => {
        const storage = fakeStorage(seed, testCase.fault, token);

        let outcome;
        try {
          outcome = await openReportQueue(storage);
        } catch (thrown) {
          assert.fail(`storage fault ${testCase.fault.kind} escaped as a throw: ${String(thrown)}`);
        }

        assert.equal(outcome.kind, 'refused', `fault ${JSON.stringify(testCase.fault)} must be refused`);
        assert.equal(
          outcome.kind === 'refused' ? outcome.reason : null,
          testCase.reason,
          'the refusal must name the verb that actually refused',
        );
        assert.equal(
          Object.hasOwn(outcome, 'queue'),
          false,
          'a refusal must carry no queue, so nothing can commit after it',
        );

        // Commit never ran: no row was written under a report_id.
        const written = storage.calls.filter((call) => call.startsWith('put '));
        for (const call of written) {
          assert.ok(
            call.startsWith(`put ${SENTINEL_KEY_PREFIX}`),
            `a refused probe wrote a non sentinel row: ${call}`,
          );
        }
        seedRowsSurvived(seed, storage.rows);

        // A store that can still delete gets swept clean, even on refusal.
        const removeRefused =
          (testCase.fault.kind === 'throws' || testCase.fault.kind === 'rejects') &&
          testCase.fault.verb === 'remove';
        if (!removeRefused) {
          assert.deepEqual(
            sentinelResidue(storage.rows),
            [],
            'a refused probe must still sweep its own sentinel',
          );
        }
      }),
    );
  });
});

describe('committing a report to the queue', () => {
  it('appends the record keyed by report_id and replays it byte identical on retry', async () => {
    await fc.assert(
      fc.asyncProperty(seedRows, sentinelToken, reportRecord, async (seed, token, record) => {
        const storage = fakeStorage(seed, { kind: 'none' }, token);
        const opened = await openReportQueue(storage);
        assert.equal(opened.kind, 'ready', 'a working store must open the queue');
        if (opened.kind !== 'ready') return;

        const first = await opened.queue.commit(record);
        assert.equal(first.kind, 'queued', 'a working store must queue the record');
        assert.equal(
          first.kind === 'queued' ? first.report_id : null,
          record.report_id,
          'the commit outcome must name the record it queued',
        );

        const row = storage.rows.get(record.report_id);
        assert.equal(typeof row, 'string', 'the record must be stored under its own report_id');
        assert.deepEqual(
          JSON.parse(row as string),
          JSON.parse(JSON.stringify(record)),
          'the stored row must replay as the record, field for field',
        );

        // A retry of the same record replays byte identical and forks no row.
        const rowCountAfterFirst = storage.rows.size;
        const second = await opened.queue.commit(record);
        assert.equal(second.kind, 'queued', 'a retry of the same record must queue');
        assert.equal(storage.rows.size, rowCountAfterFirst, 'a retry must not fork a second row');
        assert.equal(
          storage.rows.get(record.report_id),
          row,
          'a retry must replay the row byte identical',
        );
        seedRowsSurvived(seed, storage.rows);
      }),
    );
  });

  it('refuses when storage fails mid session, never throws, and leaves no half queued row', async () => {
    const midSessionFault = fc.oneof(
      fc
        .record({
          verb: fc.constantFrom<StoreVerb>('put', 'get'),
          style: fc.constantFrom<'throws' | 'rejects'>('throws', 'rejects'),
        })
        .map(({ verb, style }) => ({
          fault: { kind: style, verb } as Fault,
          reason: REFUSAL_BY_VERB[verb],
        })),
      silentLossFault,
    );

    await fc.assert(
      fc.asyncProperty(seedRows, sentinelToken, reportRecord, midSessionFault, async (seed, token, record, testCase) => {
        const storage = fakeStorage(seed, { kind: 'none' }, token);
        const opened = await openReportQueue(storage);
        assert.equal(opened.kind, 'ready', 'the probe must pass before the fault is armed');
        if (opened.kind !== 'ready') return;

        storage.arm(testCase.fault);

        let outcome;
        try {
          outcome = await opened.queue.commit(record);
        } catch (thrown) {
          assert.fail(`storage fault ${testCase.fault.kind} escaped commit as a throw: ${String(thrown)}`);
        }

        assert.equal(outcome.kind, 'refused', `commit under fault ${JSON.stringify(testCase.fault)} must refuse`);
        assert.equal(
          outcome.kind === 'refused' ? outcome.reason : null,
          testCase.reason,
          'the commit refusal must name the verb that actually refused',
        );
        assert.equal(
          storage.rows.has(record.report_id),
          false,
          'a refused commit must leave no row claiming to be queued',
        );
        seedRowsSurvived(seed, storage.rows);
      }),
    );
  });
});
