// The nightly fit's declared trailing 90-day fit window (D-2026-08-12-3,
// docs/feature/f-forecast-learns-from-the-beach/deliver/wave-decisions.md):
// adr-per-reporter-offset-estimator ("over the trailing 90-day sample
// window"), 06-learning-layer.md section 5.2 ("Per nightly run, over the
// trailing 90-day window of samples") and section 8's parameter table
// ("Fit window | trailing 90 d").
//
// This file never imports the window's production constant: at RED it does
// not exist yet, and the point of this suite is to pin the LAW the constant
// will carry, not to trust the number back to itself. WINDOW_DAYS below is
// this test's own restatement of the same citations, not a re-export.
//
// Driven the same way learning-fit-outcome.test.ts is: entirely through the
// driving port `runLearningFitOnce`, against the acceptance suite's own
// InMemoryStore and FixedClock, so the store double the fit reads cannot
// drift from the one production really gets.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runLearningFitOnce } from '../../src/learning/fit';
import { OBSERVATION_LOG_PREFIX } from '../../src/learning/inputs';
import { FixedClock, InMemoryStore } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fakes';

const RUNS = 50;

/** Fixed "tonight" for every run in this file, matching learning-fit-outcome.test.ts's convention. */
const NOW_ISO = '2026-08-09T00:00:00Z';

/** 06 section 5.2 / section 8's declared window, restated here rather than imported (see file header). */
const WINDOW_DAYS = 90;

/** A day comfortably inside the window: 8 days before NOW_ISO. */
const IN_WINDOW_DT = '2026-08-01';
/** A day nobody would call recent: far more than 90 days before NOW_ISO. */
const FAR_OUTSIDE_DT = '2025-01-01';
/** Exactly `WINDOW_DAYS` before NOW_ISO -- the boundary day itself, computed the same way fit.ts's own `publishedCallsWithin` computes its `oldest`, so this pin cannot drift from that convention. */
const BOUNDARY_DT = (() => {
  const oldest = new Date(NOW_ISO);
  oldest.setUTCDate(oldest.getUTCDate() - WINDOW_DAYS);
  return oldest.toISOString().slice(0, 10);
})();
/** One calendar day older than the boundary: the first day the window must exclude. */
const ONE_DAY_PAST_BOUNDARY_DT = (() => {
  const oneDayOlder = new Date(`${BOUNDARY_DT}T00:00:00Z`);
  oneDayOlder.setUTCDate(oneDayOlder.getUTCDate() - 1);
  return oneDayOlder.toISOString().slice(0, 10);
})();

type Placement = 'in_window' | 'outside_window';

type Session = { spot_id: string; device_id: string; placement: Placement };

function dtFor(placement: Placement): string {
  return placement === 'in_window' ? IN_WINDOW_DT : FAR_OUTSIDE_DT;
}

async function storeHoldingSessions(sessions: readonly Session[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  const linesByDt = new Map<string, string[]>();
  for (const session of sessions) {
    const dt = dtFor(session.placement);
    const line = JSON.stringify({ spot_id: session.spot_id, device_id: session.device_id });
    linesByDt.set(dt, [...(linesByDt.get(dt) ?? []), line]);
  }
  for (const [dt, lines] of linesByDt) {
    await store.put(`${OBSERVATION_LOG_PREFIX}dt=${dt}/reports.jsonl`, lines.join('\n'));
  }
  return store;
}

function examinedSpots(outcome: { events: { type: string; detail?: string }[] }): string[] {
  return [
    ...new Set(
      outcome.events.filter((event) => event.type === 'spot_examined').map((event) => event.detail as string),
    ),
  ].sort();
}

const spotId = fc.constantFrom('playa-venao', 'santa-catalina', 'el-palmar', 'morro-negrito');
const deviceId = fc.constantFrom('d_learn_0', 'd_learn_1', 'd_learn_2');
const placement = fc.constantFrom<Placement>('in_window', 'outside_window');
const sessionLog = fc.array(fc.record({ spot_id: spotId, device_id: deviceId, placement }), { maxLength: 12 });

describe('the nightly fit bounds its observation read to the trailing 90-day window', () => {
  it('examines a spot only if the log names it inside the window; a spot reported on solely outside it is never named, though the raw log still carries the key', async () => {
    await fc.assert(
      fc.asyncProperty(sessionLog, async (sessions) => {
        const store = await storeHoldingSessions(sessions);

        const outcome = await runLearningFitOnce({ store, clock: new FixedClock(NOW_ISO) });

        const expectedSpots = [
          ...new Set(
            sessions.filter((session) => session.placement === 'in_window').map((session) => session.spot_id),
          ),
        ].sort();

        assert.deepEqual(
          examinedSpots(outcome),
          expectedSpots,
          'spots_examined must be the spots the WINDOW names, not the spots the whole unbounded log names; a spot with only outside-window reports must vanish from the report the moment the bound is real',
        );
        assert.equal(
          outcome.corrections_written,
          0,
          'this fixture never carries the ten paired mornings G1 requires, so nothing here earns a correction on either side of the fix -- the bound changes what is examined, not this',
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps the day exactly 90 days back and drops the day one calendar day older, mirroring the strictly-older-than-oldest rule fit.ts already applies to the call log', async () => {
    const store = new InMemoryStore();
    await store.put(
      `${OBSERVATION_LOG_PREFIX}dt=${BOUNDARY_DT}/reports.jsonl`,
      JSON.stringify({ spot_id: 'playa-venao', device_id: 'd_learn_0' }),
    );
    await store.put(
      `${OBSERVATION_LOG_PREFIX}dt=${ONE_DAY_PAST_BOUNDARY_DT}/reports.jsonl`,
      JSON.stringify({ spot_id: 'santa-catalina', device_id: 'd_learn_1' }),
    );

    const outcome = await runLearningFitOnce({ store, clock: new FixedClock(NOW_ISO) });

    assert.deepEqual(
      examinedSpots(outcome),
      ['playa-venao'],
      `the boundary day (${BOUNDARY_DT}) is inside the trailing ${WINDOW_DAYS}-day window; one day older (${ONE_DAY_PAST_BOUNDARY_DT}) is not`,
    );
  });
});
