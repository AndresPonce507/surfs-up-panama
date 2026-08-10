// Property laws for the nightly fit's driving port and the outcome it reports.
//
// This file exists because every launch-day claim about the learning layer is
// an absence, and an absence is the easiest thing in software to fake. "No
// correction was stored" is true of an empty store, of a job that crashed on
// its first line, and of a job that never existed. So these laws never read the
// absence off the store alone. They read the report the fit makes, and they tie
// each number in it to something that was actually read or actually written.
//
// The store double is the acceptance suite's own InMemoryStore, not a second
// fake, so list and get cannot drift from the store the fit is really handed.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runLearningFitOnce } from '../../src/learning/fit';
import { OBSERVATION_LOG_PREFIX } from '../../src/learning/inputs';
import { FixedClock, InMemoryStore } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fakes';

const CORRECTIONS_PREFIX = 'learned/corrections/v1/';
const RUNS = 50;

type ReportedSession = { dt: string; spot_id: string; device_id: string };

const reportedSession = fc.record({
  dt: fc.constantFrom('2026-07-01', '2026-07-02', '2026-07-03', '2026-08-03'),
  spot_id: fc.constantFrom('playa-venao', 'santa-catalina', 'el-palmar', 'morro-negrito'),
  device_id: fc.constantFrom('d_learn_0', 'd_learn_1', 'd_learn_2'),
});

/** Zero mornings is a legal draw: it is the morning this whole slice is about. */
const reportedLog = fc.array(reportedSession, { maxLength: 14 });

/**
 * Objects the fit must read past. The published morning and the prediction
 * receipts are what the shipped builder leaves behind before any fit runs, and
 * the .gz key is named .gz while holding plain text, exactly as the acceptance
 * world writes it.
 */
const otherObjects = fc.array(
  fc.tuple(
    fc.constantFrom(
      'pub/v1/pa-pacific/2026-08-08/playa-venao.json',
      'predictions/v1/dt=2026-08-07/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz',
      'data/config/trust-gate.json',
      `${CORRECTIONS_PREFIX}current/playa-venao.json`,
    ),
    fc.string(),
  ),
  { maxLength: 4 },
);

async function storeHolding(
  sessions: readonly ReportedSession[],
  others: readonly (readonly [string, string])[],
): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  const linesByDate = new Map<string, string[]>();
  for (const session of sessions) {
    const line = JSON.stringify({ spot_id: session.spot_id, device_id: session.device_id });
    linesByDate.set(session.dt, [...(linesByDate.get(session.dt) ?? []), line]);
  }
  for (const [dt, lines] of linesByDate) {
    await store.put(`${OBSERVATION_LOG_PREFIX}dt=${dt}/reports.jsonl`, lines.join('\n'));
  }
  for (const [key, body] of others) {
    await store.put(key, body);
  }
  return store;
}

function distinctSpots(sessions: readonly ReportedSession[]): string[] {
  return [...new Set(sessions.map((session) => session.spot_id))].sort();
}

function countUnder(store: InMemoryStore, prefix: string): number {
  return [...store.objects.keys()].filter((key) => key.startsWith(prefix)).length;
}

const clock = (): FixedClock => new FixedClock('2026-08-09T07:00:00Z');

describe('the nightly fit reports what it did', () => {
  it('finishes and says so, for any store it is handed, including one nobody has reported into', async () => {
    await fc.assert(
      fc.asyncProperty(reportedLog, otherObjects, async (sessions, others) => {
        const store = await storeHolding(sessions, others);

        const outcome = await runLearningFitOnce({ store, clock: clock() });

        assert.equal(
          outcome.completed,
          true,
          'the fit must reach its end and report so; a run that throws or reports nothing is indistinguishable from a run that honestly found nothing',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('counts the spots the observation log actually named, never a constant', async () => {
    await fc.assert(
      fc.asyncProperty(reportedLog, otherObjects, async (sessions, others) => {
        const store = await storeHolding(sessions, others);

        const outcome = await runLearningFitOnce({ store, clock: clock() });

        assert.equal(
          outcome.spots_examined,
          distinctSpots(sessions).length,
          'spots_examined must be the spots read from the observation log; a fixed number is a claim about the world the fit never checked',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('stores nothing at all: no correction, and no other object either', async () => {
    await fc.assert(
      fc.asyncProperty(reportedLog, otherObjects, async (sessions, others) => {
        const store = await storeHolding(sessions, others);
        const before = new Map(store.objects);

        await runLearningFitOnce({ store, clock: clock() });

        assert.deepEqual(
          [...store.objects.entries()].sort(),
          [...before.entries()].sort(),
          'no spot can earn a correction before the gate exists, so this run must leave every object exactly as it found it, the published morning included',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('reports as written exactly the corrections that appeared in the store', async () => {
    await fc.assert(
      fc.asyncProperty(reportedLog, otherObjects, async (sessions, others) => {
        const store = await storeHolding(sessions, others);
        const before = countUnder(store, CORRECTIONS_PREFIX);

        const outcome = await runLearningFitOnce({ store, clock: clock() });

        assert.equal(
          outcome.corrections_written,
          countUnder(store, CORRECTIONS_PREFIX) - before,
          'corrections_written must equal the corrections this run put in the store, so the report can never claim a write that did not happen nor hide one that did',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('names every spot it examined in its events, each one once', async () => {
    await fc.assert(
      fc.asyncProperty(reportedLog, otherObjects, async (sessions, others) => {
        const store = await storeHolding(sessions, others);

        const outcome = await runLearningFitOnce({ store, clock: clock() });

        const examined = outcome.events
          .filter((event) => event.type === 'spot_examined')
          .map((event) => event.detail);
        assert.deepEqual(
          [...examined].sort(),
          distinctSpots(sessions),
          'the events are the audit trail of the refusal; a spot the fit looked at and never named cannot be checked by anyone',
        );
      }),
      { numRuns: RUNS },
    );
  });
});
