// Step methods for the apply seam (slice-02): the shipped builder consuming a
// stored correction, re-checking the gates at read time, clamping the worst
// move, degrading an unreadable file to an absent one out loud, and reverting
// to day zero when the file is deleted.
//
// Layer: in-memory acceptance. The builder is the real shipped composition
// over in-memory port fakes; the correction records are hand-built test
// inputs in the exact spot-correction/1 shape. Example-only by design
// (Mandate 11): every fence here is a named sad path, not a generated one.

import assert from 'node:assert/strict';

import { Before, Given, Then, When } from '@cucumber/cucumber';

import {
  archivedRankedCallAt,
  assertReadsExactlyWhatDayZeroPublished,
  baselineArchivedCall,
  correctionInForeignUnits,
  correctionTheGatesRefused,
  correctionThatPassedEveryGate,
  deleteEveryCorrection,
  forgedInsideItsOwnNoise,
  forgedOnTooFewMornings,
  newestArchivedCall,
  passingButOversizedHeightMove,
  passingButOversizedScoreMove,
  PASSING_SCORE_B,
  publishAtAFreshHour,
  readCorrectionAsTheBuilderDoes,
  requireReadReport,
  resetApplyWorld,
  storeCorrection,
} from './support/apply-world';
import { failureContext } from './support/learning-world';

const SCORE_TOLERANCE = 1e-9;

let middleBuildHour: string | null = null;

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, function () {
  resetApplyWorld();
  middleBuildHour = null;
});

// ---------- Given: stored correction records, hand-built ----------

Given('a stored correction that passed every gate, earned when the waves kept coming in bigger than forecast', async function () {
  await storeCorrection(correctionThatPassedEveryGate());
});

Given('a stored correction the gates refused, on {int} mornings from {int} people', async function (n: number, reporters: number) {
  await storeCorrection(correctionTheGatesRefused(n, reporters));
});

Given('a hand-forged correction claiming to be applied on {int} mornings from {int} people', async function (n: number, reporters: number) {
  await storeCorrection(forgedOnTooFewMornings(n, reporters));
});

Given('a hand-forged correction claiming to be applied though its difference is buried in its own noise', async function () {
  await storeCorrection(forgedInsideItsOwnNoise());
});

Given('a stored correction that passed every gate but orders a height move far beyond its own limit', async function () {
  await storeCorrection(passingButOversizedHeightMove());
});

Given('a stored correction that passed every gate but orders a score move far beyond its own limit', async function () {
  await storeCorrection(passingButOversizedScoreMove());
});

Given('the stored correction for Playa Venao is replaced by unreadable bytes', async function () {
  await storeCorrection('this was never JSON {{{');
});

Given('a stored correction whose score move is stated in {string}', async function (units: string) {
  await storeCorrection(correctionInForeignUnits(units));
});

Given('the morning was already published again with that correction in place', async function () {
  middleBuildHour = await publishAtAFreshHour();
});

// ---------- When ----------

When('the morning is published again with that correction in place', async function () {
  await publishAtAFreshHour();
});

When('the stored correction is read the way the builder reads it', async function () {
  await readCorrectionAsTheBuilderDoes();
});

When('every correction is deleted and the morning is published once more', async function () {
  deleteEveryCorrection();
  await publishAtAFreshHour();
});

// ---------- Then: what a surfer reads ----------

Then('the waves a surfer reads for Playa Venao are bigger than day zero published', function () {
  const newest = newestArchivedCall();
  const baseline = baselineArchivedCall();
  assert.ok(
    newest.h_eff_m > baseline.h_eff_m,
    `the mornings said the waves kept coming in bigger than forecast, so an admitted correction must raise the published height; day zero said ${baseline.h_eff_m} m and the newest build still says ${newest.h_eff_m} m.${failureContext()}`,
  );
});

Then('the score a surfer reads is humbler than day zero published, because the mornings said it ran generous', function () {
  const newest = newestArchivedCall();
  const baseline = baselineArchivedCall();
  assert.ok(
    newest.score_q < baseline.score_q,
    `the mornings said the shown score ran generous, so an admitted correction must lower it; day zero said ${baseline.score_q} and the newest build still says ${newest.score_q}.${failureContext()}`,
  );
});

Then('the newest archived call records the exact score move that was live and the gate that admitted it', function () {
  const newest = newestArchivedCall();
  assert.equal(
    newest.bias_gate,
    'applied',
    `the archive must record that the gate admitted this correction; it says "${newest.bias_gate}".${failureContext()}`,
  );
  // Sign SSOT is 06 section 4: the applied move is MINUS the stored score
  // difference, converted from display points to the 0-1 score.
  assert.ok(
    Math.abs(newest.bias_applied - -PASSING_SCORE_B / 100) < SCORE_TOLERANCE,
    `the archive must record exactly the score move that was live, ${-PASSING_SCORE_B / 100}; it records ${newest.bias_applied}.${failureContext()}`,
  );
});

Then('the waves and score a surfer reads are exactly what day zero published', function () {
  assertReadsExactlyWhatDayZeroPublished(newestArchivedCall());
});

Then('the newest archived call records no move at all and names too few mornings as the reason', function () {
  assertRefusalArchived('n_lt_10', 'too few mornings');
});

Then('the newest archived call records no move at all and names a difference too small to tell from noise', function () {
  assertRefusalArchived('not_significant', 'a difference too small to tell from noise');
});

Then('the newest archived call records no move at all and says no correction file existed', function () {
  assertRefusalArchived('no_file', 'no correction file existing');
});

function assertRefusalArchived(gate: string, reason: string): void {
  const newest = newestArchivedCall();
  assert.equal(
    newest.bias_applied,
    0,
    `nothing below the gates may move a number, so the archived move must be exactly zero; it records ${newest.bias_applied}.${failureContext()}`,
  );
  assert.equal(
    newest.bias_gate,
    gate,
    `the archive must name ${reason} as what kept the correction out; it says "${newest.bias_gate}".${failureContext()}`,
  );
}

Then('the height a surfer reads moved by no more than forty percent of what day zero published', function () {
  const newest = newestArchivedCall();
  const baseline = baselineArchivedCall();
  assert.ok(
    newest.h_eff_m <= baseline.h_eff_m * 1.4 + SCORE_TOLERANCE,
    `whatever a file orders, the published height may move at most forty percent past the forecast; day zero said ${baseline.h_eff_m} m and this build says ${newest.h_eff_m} m.${failureContext()}`,
  );
});

Then('the score a surfer reads moved, and by no more than twelve points', function () {
  const newest = newestArchivedCall();
  const baseline = baselineArchivedCall();
  assert.notEqual(
    newest.score_q,
    baseline.score_q,
    `an admitted score correction must move the published score; it still says ${newest.score_q}.${failureContext()}`,
  );
  assert.ok(
    Math.abs(newest.score_q - baseline.score_q) <= 12,
    `whatever a file orders, the published score may move at most twelve points; it moved from ${baseline.score_q} to ${newest.score_q}.${failureContext()}`,
  );
});

Then('the build that had the correction in place had moved the number', function () {
  assert.ok(middleBuildHour, 'test bug: no build ran with the correction in place');
  const withCorrection = archivedRankedCallAt(middleBuildHour);
  const baseline = baselineArchivedCall();
  assert.ok(
    withCorrection.h_eff_m !== baseline.h_eff_m || withCorrection.score_q !== baseline.score_q,
    `reverting proves nothing unless the correction had first moved the number; the build that had it in place still published day zero's ${baseline.h_eff_m} m and ${baseline.score_q}.${failureContext()}`,
  );
});

// ---------- Then: how a reader treats the file itself ----------

Then('the reader treats the file as absent and says why', function () {
  const report = requireReadReport();
  assert.equal(
    report.outcome,
    'rejected-as-absent',
    `an unreadable file must be treated as an absent one, never as a partial or default correction; the reader says "${report.outcome}".${failureContext()}`,
  );
  assert.ok(
    report.events.length > 0,
    'treating a file as absent in silence hides corruption; the reader must say why',
  );
});

Then('reading it yields no correction at all, so nothing a surfer reads can move on it', function () {
  const report = requireReadReport();
  assert.equal(
    report.record,
    null,
    'an unreadable file must yield no correction at all; anything else is a default correction invented from garbage',
  );
});

Then('the reader refuses the foreign unit by name and yields no correction at all', function () {
  const report = requireReadReport();
  assert.equal(
    report.record,
    null,
    `a score move in a foreign unit read as display points would be a hundredfold misread; the reader must yield nothing.${failureContext()}`,
  );
  const namesTheUnit = report.events.some(
    (event) => `${event.type} ${event.detail ?? ''}`.includes('q_units'),
  );
  assert.ok(
    namesTheUnit,
    `the refusal must name the foreign unit it found, so the misread is debuggable from the log alone; events: ${JSON.stringify(report.events)}.${failureContext()}`,
  );
});
