// Step methods for the end-to-end fixture proof (slice-07): reported
// mornings, through the nightly fit, through the shipped builder, to the
// number a surfer reads and the receipt the archive keeps.
//
// Layer: in-memory acceptance over the real shipped composition. The
// scenarios here reuse the slice-01 Givens (the mornings, the fit) and the
// slice-02 Thens (what a surfer reads); only the observations unique to the
// epic promise live in this module. Nothing here claims real learning: the
// slice ships only when real report volume exists (Pre-requisites 2 and 3).

import assert from 'node:assert/strict';

import { Before, Then, When } from '@cucumber/cucumber';

import {
  newestArchivedCall,
  publishAtAFreshHour,
} from './support/apply-world';
import { evaluateMonthInPlace } from './support/many-spots';
import {
  failureContext,
  learning,
  requireFitOutcome,
  requireStoredCorrection,
  runNightlyFit,
  scoreDeltaOf,
  writeLearningInputs,
} from './support/learning-world';
import { assertStateDelta, type UniverseSnapshot } from './support/state-delta';

const SCORE_TOLERANCE = 1e-9;
/** Everything the two jobs read but must never write: the complement of their shelves. */
const COMPLEMENT_PREFIXES = ['predictions/', 'log/', 'data/config/', 'pub/v1/'] as const;

let dayZeroArchive: UniverseSnapshot = new Map();
let complementBefore: Map<string, UniverseSnapshot> = new Map();
let monthlyOutcome: unknown | null = null;

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, function () {
  dayZeroArchive = new Map();
  complementBefore = new Map();
  monthlyOutcome = null;
});

// ---------- When ----------

When('the morning is published again after the fit', async function () {
  dayZeroArchive = learning.store.snapshot('log/calls/v1/');
  await publishAtAFreshHour();
});

When('the nightly fit and the monthly evaluation both run', async function () {
  // The fixture inputs are the test's own act; write them first so the
  // snapshot below captures the world the jobs were given, and any change
  // to it afterwards is a job's illegal write, never the fixture's.
  await writeLearningInputs();
  complementBefore = new Map(
    COMPLEMENT_PREFIXES.map((prefix) => [prefix, learning.store.snapshot(prefix)] as const),
  );
  await runNightlyFit('the nightly fit before the monthly evaluation');
  monthlyOutcome = await evaluateMonthInPlace();
});

// ---------- Then ----------

Then('the newest archived call carries the exact correction the fit stored and the gate that admitted it', async function () {
  const stored = await requireStoredCorrection();
  const scoreMove = scoreDeltaOf(stored);
  const newest = newestArchivedCall();
  assert.equal(
    newest.bias_gate,
    'applied',
    `the archive must record that the gate admitted the fit's correction; it says "${newest.bias_gate}".${failureContext()}`,
  );
  // Sign SSOT is 06 section 4: the applied move is MINUS the stored score
  // difference, converted from display points to the 0-1 score.
  assert.ok(
    Math.abs(newest.bias_applied - -scoreMove.b / 100) < SCORE_TOLERANCE,
    `the archive must record exactly the score move the fit stored (${-scoreMove.b / 100}); it records ${newest.bias_applied}.${failureContext()}`,
  );
});

Then('the day-zero archive still reads exactly as it was written, because receipts never change', function () {
  const after = learning.store.snapshot('log/calls/v1/');
  for (const [key, body] of dayZeroArchive) {
    assert.equal(
      after.get(key),
      body,
      `an archived call was rewritten: ${key}. Receipts are immutable; a build may only add its own.${failureContext()}`,
    );
  }
  assert.equal(
    after.size,
    dayZeroArchive.size + 1,
    `publishing once more must add exactly one build to the archive; it went from ${dayZeroArchive.size} to ${after.size} entries.${failureContext()}`,
  );
});

Then('both jobs finished and reported what they did', function () {
  requireFitOutcome();
  assert.ok(
    monthlyOutcome,
    `the monthly evaluation reported no outcome at all, so nothing can be said about what it touched.${failureContext()}`,
  );
  assert.equal(
    (monthlyOutcome as { completed?: boolean }).completed,
    true,
    'the monthly evaluation must finish and say so',
  );
});

Then('nothing outside the learning shelves changed: not the predictions, not the observations, not the published archive, not the trust settings', function () {
  assert.ok(complementBefore.size > 0, 'test bug: the complement was never snapshotted before the jobs ran');
  for (const [prefix, before] of complementBefore) {
    assertStateDelta({
      before,
      after: learning.store.snapshot(prefix),
      universe: prefix,
      expected: 'identical',
      context: 'the write boundary is the whole safety story: the jobs replace their own shelves and may not touch anything else (06 section 7\'s bounded-change clause)',
    });
  }
});
