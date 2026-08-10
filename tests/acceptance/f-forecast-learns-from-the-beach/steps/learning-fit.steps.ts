// Step methods for the nightly fit. Domain language only: no step name here
// says learned, accurate or improved, because nothing synthetic earns those
// words (feature-delta Definition of Done row 13).
//
// Layer: in-memory acceptance. The builder half is the real shipped composition
// over in-memory port fakes; the fit half is its own driving port. Property
// scenarios use fast-check, which this layer permits, and every one of them
// asserts a declared law rather than re-deriving the estimator it is testing.

import assert from 'node:assert/strict';

import { Given, Then, When } from '@cucumber/cucumber';
import fc from 'fast-check';

import { assertStateDelta } from './support/state-delta';
import {
  BIGGER_REPORTED_BAND,
  SIGMA_EFF_HEIGHT_M,
  bandMidM,
  heightNoiseFloor,
  rawDifferenceM,
  syntheticMornings,
  REPORTED_BAND,
  type Morning,
} from './support/synthetic-mornings';
import {
  PUBLISHED_PREFIX,
  SHIPPED_TRUST_GATE,
  fitOver,
  heightKeyOf,
  learning,
  publishSeedMorning,
  republishMorning,
  requireFitOutcome,
  requireStoredCorrection,
  runNightlyFit,
  scoreDeltaOf,
  storedCorrection,
} from './support/learning-world';

/** Property runs drive a whole fit each time, so the budget is modest by design. */
const PROPERTY_RUNS = 20;
const METRE_TOLERANCE = 1e-9;

// ---------- Given: the world before anyone reported anything ----------

Given('Playa Venao, its scoring constants and this morning\'s model opinions', function () {
  learning.mornings = [];
});

Given('the shipped trust settings, which exclude nobody', function () {
  learning.trustGate = { ...SHIPPED_TRUST_GATE };
});

Given('the morning call that was published before anyone had reported anything', async function () {
  await publishSeedMorning();
});

Given('nobody has reported a session at Playa Venao', function () {
  assert.equal(
    learning.mornings.length,
    0,
    'this scenario starts from a spot nobody has reported',
  );
});

// ---------- Given: mornings people reported ----------

Given(
  '{int} mornings at Playa Venao were reported by {int} people who saw the waves come in {float} m bigger than forecast',
  function (count: number, reporters: number, bigger: number) {
    learning.mornings = syntheticMornings({
      count,
      reporters,
      biggerThanForecastM: bigger,
      spreadM: 0.42,
    });
  },
);

Given(
  '{int} mornings at Playa Venao were reported by {int} people who all say the waves came in exactly {float} m bigger than forecast, with no disagreement at all',
  function (count: number, reporters: number, bigger: number) {
    learning.mornings = syntheticMornings({
      count,
      reporters,
      biggerThanForecastM: bigger,
      spreadM: 0,
    });
  },
);

Given(
  '{int} mornings at Playa Venao were reported by {int} people, one of whom got their credential the same morning they reported',
  function (count: number, reporters: number) {
    learning.mornings = syntheticMornings({
      count,
      reporters,
      biggerThanForecastM: 0.22,
      spreadM: 0.42,
      freshCredentialForFirstReporter: true,
    });
  },
);

Given('the trust settings are changed to ask for {int} days of standing', function (days: number) {
  learning.trustGate = { ...learning.trustGate, min_credential_age_days: days };
});

// ---------- Given: a run that already happened, reused from the scenario above ----------

Given('the nightly fit already ran with nothing reported', async function () {
  await runNightlyFit('the first nightly fit, with nothing reported');
});

Given('the nightly fit already ran on those mornings', async function () {
  await runNightlyFit('the nightly fit over those mornings');
});

// ---------- When ----------

When('the nightly fit runs', async function () {
  await runNightlyFit();
});

When('the correction stored for Playa Venao is read back', function () {
  // The reading itself is the Then steps below; this step names the action a
  // reader of the file performs, which is all this scenario is about.
});

// ---------- Then: what the fit reported ----------

Then('the fit finishes and reports that it wrote no correction for any spot', function () {
  const outcome = requireFitOutcome();
  assert.equal(
    outcome.completed,
    true,
    'the nightly fit must finish and say so, because a job that dies silently looks exactly like a job that found nothing',
  );
  assert.equal(
    outcome.corrections_written,
    0,
    'with nothing reported the fit must write no correction at all, not an empty one and not a default one',
  );
});

Then('no correction is stored for Playa Venao', async function () {
  const record = await storedCorrection();
  assert.equal(
    record,
    null,
    'with nothing reported there must be no correction to read for the spot; an empty correction would still be a correction',
  );
});

Then(
  'Playa Venao gets no correction applied, on {int} mornings from {int} people',
  async function (count: number, reporters: number) {
    const outcome = requireFitOutcome();
    assert.equal(
      outcome.corrections_written,
      1,
      'the fit must record what it examined and why it refused, so a refusal is auditable rather than invisible',
    );
    const key = heightKeyOf(await requireStoredCorrection());
    assert.equal(key.applied, false, 'the evidence is below the publication gates, so nothing may be applied');
    assert.equal(key.n, count, 'the refusal must record how many mornings it weighed');
    assert.equal(key.reporters, reporters, 'the refusal must record how many different people it counted');
  },
);

Then(
  'Playa Venao earns an applied correction, on {int} mornings from {int} people',
  async function (count: number, reporters: number) {
    const key = heightKeyOf(await requireStoredCorrection());
    assert.equal(key.n, count, 'the applied correction must record how many mornings it weighed');
    assert.equal(key.reporters, reporters, 'the applied correction must record how many different people it counted');
    assert.equal(
      key.applied,
      true,
      'ten mornings from five different people clearing significance is exactly the condition the gates exist to admit; a gate never seen passing proves nothing',
    );
  },
);

Then('the difference it measured never cleared twice its own standard error', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  assert.ok(
    Math.abs(key.b) <= 2 * key.se + METRE_TOLERANCE,
    `a difference of ${key.b} m against a standard error of ${key.se} m was refused, but it clears twice that error, so the refusal reason recorded is not the one the numbers give`,
  );
});

Then('the difference it measured cleared twice its own standard error', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  assert.ok(
    Math.abs(key.b) > 2 * key.se,
    `a difference of ${key.b} m was applied against a standard error of ${key.se} m, which does not clear twice that error`,
  );
});

Then('the standard error it stored for the height is the mornings\' own spread, above the physical noise floor', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  const floor = heightNoiseFloor(key.n);
  assert.ok(
    key.se > floor,
    `the stored standard error ${key.se} m must be the mornings' own, which for honest spread sits above the ${floor} m physical floor; the floor is a floor, not a replacement`,
  );
});

Then('the standard error it stored for the height is the physical noise floor, not the agreement of the reports', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  const floor = heightNoiseFloor(key.n);
  assert.ok(
    Math.abs(key.se - floor) < 1e-6,
    `reports that agree perfectly have almost no spread of their own, so the stored standard error must be the ${floor} m physical floor; ${key.se} m means agreement bought precision, which is exactly what a coordinated lie buys`,
  );
  assert.ok(
    Math.abs(key.b) <= 2 * key.se,
    'and with the floor in place that agreement must not clear significance',
  );
});

Then('the correction it stored is no larger than the raw difference, because it is pulled toward its parent', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  const raw = rawDifferenceM({ biggerThanForecastM: 0.22 });
  assert.ok(
    Math.abs(key.b) <= Math.abs(raw) + METRE_TOLERANCE,
    `the stored difference ${key.b} m exceeds the raw ${raw} m, so the raw estimate reached the file instead of the shrunken one`,
  );
  assert.ok(
    key.b * raw > 0,
    `the stored difference ${key.b} m disagrees in sign with the raw ${raw} m, which no amount of pooling toward a parent may cause at launch`,
  );
});

// ---------- Then: what the stored correction says ----------

Then('its score move is stated in the points a surfer sees, and no other unit is legal', async function () {
  const record = await requireStoredCorrection();
  assert.equal(record.schema, 'spot-correction/1', 'the stored correction must name the schema its reader expects');
  assert.equal(
    scoreDeltaOf(record).units,
    'display_points',
    'the score move must be stated in the points a surfer sees; the pin exists so a hundredfold misread fails at read time instead of printing',
  );
});

Then('it carries the height and score limits its reader must honour', async function () {
  const record = await requireStoredCorrection();
  assert.equal(
    record.clamp?.max_abs_h_frac,
    0.4,
    'the file must carry the height limit its reader enforces, so the limit travels with the number',
  );
  assert.equal(
    record.clamp?.max_abs_score,
    12,
    'the file must carry the score limit its reader enforces, so the limit travels with the number',
  );
});

Then('the height difference it records is keyed to the model and the lead time it was measured on', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  assert.equal(typeof key.b, 'number', 'the height difference must be a number keyed to one model and one lead time, never a spot-wide average');
});

// ---------- Then: the trust gate, watched in both directions ----------

Then('all {int} mornings and all {int} people counted, exactly as they would with no trust settings at all', async function (count: number, reporters: number) {
  const key = heightKeyOf(await requireStoredCorrection());
  assert.equal(key.n, count, 'at the shipped settings every morning is eligible, so the count must equal the full count');
  assert.equal(key.reporters, reporters, 'at the shipped settings every person is eligible, so the distinct count must equal the full one');
});

Then('the mornings reported on that same-day credential are gone from the count', async function () {
  const key = heightKeyOf(await requireStoredCorrection());
  const total = learning.mornings.length;
  const droppedByFirstReporter = learning.mornings.filter((morning) => morning.observation.device_id === 'd_learn_0').length;
  assert.equal(
    key.n,
    total - droppedByFirstReporter,
    `a credential too young for the configured standing must drop its mornings out of the fit and out of the count, leaving ${total - droppedByFirstReporter} of ${total}`,
  );
});

Then('only {int} people counted toward the five that publication requires', async function (reporters: number) {
  const key = heightKeyOf(await requireStoredCorrection());
  assert.equal(
    key.reporters,
    reporters,
    'the ineligible reporter must disappear from the distinct count too, not only from the sample count',
  );
});

// ---------- Then: nothing a surfer reads moved ----------

Then('the morning call a surfer reads is byte-identical to the one published before any report existed', async function () {
  await assertPublishedMorningUnmoved();
});

Then('the morning call a surfer reads is byte-identical to the one published before any report existed, because the builder does not read corrections yet', async function () {
  await assertPublishedMorningUnmoved();
});

async function assertPublishedMorningUnmoved(): Promise<void> {
  const after = await republishMorning();
  assertStateDelta({
    before: learning.seedPublished,
    after,
    universe: PUBLISHED_PREFIX,
    expected: 'identical',
    context: 'nothing this slice writes may move a number a surfer reads',
  });
}

// ---------- properties: declared laws over generated mornings ----------
//
// Each Given/When below names the quantification in the domain's words; the law
// itself is asserted in the Then, which is where fast-check reports its shrunken
// counterexample.

Given('any number of mornings from at least five people whose measured difference sits under the noise floor for that many mornings', function () {
  // Quantification only; the generator lives in the Then.
});

Given('any set of reported mornings at Playa Venao', function () {
  // Quantification only.
});

Given('any set of reported mornings at Playa Venao from at least five people', function () {
  // Quantification only.
});

Given('any set of reported mornings at Playa Venao, and the same set with extra mornings reported without a forecast to compare against', function () {
  // Quantification only.
});

When('the nightly fit runs on each of those sets of mornings', function () {
  // The runs happen inside the law being asserted, so each generated case is
  // driven through the same driving port the example scenarios use.
});

When('the nightly fit runs on both', function () {
  // As above.
});

When('the same mornings are reported again with the forecast raised, then with the reported size raised, then with the reporters shuffled', function () {
  // As above.
});

When('the wind word on every one of those mornings is changed and the nightly fit runs again', function () {
  // As above.
});

Then('no correction is ever applied, however tightly those reports agree', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 40 }),
      fc.integer({ min: 5, max: 9 }),
      fc.double({ min: 0.01, max: 0.95, noNaN: true, noDefaultInfinity: true }),
      async (count, reporters, fractionOfFloor) => {
        // Twice the floor is sigma_eff / sqrt(n); anything under it is refused.
        const bigger = fractionOfFloor * SIGMA_EFF_HEIGHT_M / Math.sqrt(count);
        const { correction } = await fitOver(
          syntheticMornings({ count, reporters, biggerThanForecastM: bigger, spreadM: 0 }),
        );
        assert.ok(correction, 'the fit must record what it examined even when it refuses');
        assert.equal(
          heightKeyOf(correction).applied,
          false,
          `a difference of ${bigger} m over ${count} mornings sits under the physical noise floor, so no amount of agreement between ${reporters} reporters may publish it`,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('raising the forecast raises the difference the fit stores', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 30 }),
      fc.double({ min: 0.05, max: 0.5, noNaN: true, noDefaultInfinity: true }),
      async (count, raiseM) => {
        const base = { count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 };
        const before = await fitOver(syntheticMornings(base));
        const after = await fitOver(syntheticMornings({ ...base, forecastShiftM: raiseM }));
        assert.ok(before.correction && after.correction, 'both runs must record what they examined');
        assert.ok(
          heightKeyOf(after.correction).b > heightKeyOf(before.correction).b,
          `raising every forecast by ${raiseM} m must raise the difference the fit measures, because the difference is the forecast minus what the person saw and not the other way round`,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('reporting a bigger size lowers the difference the fit stores', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 30 }),
      async (count) => {
        const base = { count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 };
        const smaller = await fitOver(syntheticMornings({ ...base, band: REPORTED_BAND }));
        const bigger = await fitOver(syntheticMornings({ ...base, band: BIGGER_REPORTED_BAND }));
        assert.ok(smaller.correction && bigger.correction, 'both runs must record what they examined');
        assert.ok(
          heightKeyOf(bigger.correction).b < heightKeyOf(smaller.correction).b,
          `reporting ${BIGGER_REPORTED_BAND} instead of ${REPORTED_BAND} moves the middle of the reported size up by ${bandMidM(BIGGER_REPORTED_BAND) - bandMidM(REPORTED_BAND)} m, which must lower the difference the fit measures`,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('shuffling which person reported which morning changes nothing, because nobody has any history yet', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 30 }),
      fc.integer({ min: 1, max: 5 }),
      async (count, rotation) => {
        const base = { count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 };
        const before = await fitOver(syntheticMornings(base));
        const after = await fitOver(syntheticMornings({ ...base, reporterRotation: rotation }));
        assertStateDelta({
          before: before.storedUniverse,
          after: after.storedUniverse,
          universe: 'learned/corrections/v1/',
          expected: 'identical',
          context: 'nobody has any reporting history yet, so every personal habit is exactly zero and who reported which morning cannot move a number',
        });
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('the extra mornings change neither the score delta nor how many mornings it counted', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 24 }),
      fc.integer({ min: 2, max: 8 }),
      async (count, extras) => {
        const base: Morning[] = syntheticMornings({ count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 });
        const withoutForecast: Morning[] = syntheticMornings({
          count: extras,
          reporters: 6,
          biggerThanForecastM: 0.2,
          spreadM: 0.3,
          dayOffset: count,
          withoutCapturedForecastEvery: 1,
        });
        const before = await fitOver(base);
        const after = await fitOver([...base, ...withoutForecast]);
        assert.ok(before.correction && after.correction, 'both runs must record what they examined');
        const scoreBefore = scoreDeltaOf(before.correction);
        const scoreAfter = scoreDeltaOf(after.correction);
        assert.equal(
          scoreAfter.n,
          scoreBefore.n,
          'a morning reported without any forecast to compare against has no score difference to contribute, so it may not enter the count',
        );
        assert.equal(
          scoreAfter.b,
          scoreBefore.b,
          'and it may not move the score delta either, because skipping is not the same as contributing zero',
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('those same extra mornings do count toward the height difference', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 24 }),
      fc.integer({ min: 2, max: 8 }),
      async (count, extras) => {
        const base: Morning[] = syntheticMornings({ count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 });
        const withoutForecast: Morning[] = syntheticMornings({
          count: extras,
          reporters: 6,
          biggerThanForecastM: 0.2,
          spreadM: 0.3,
          dayOffset: count,
          withoutCapturedForecastEvery: 1,
        });
        const before = await fitOver(base);
        const after = await fitOver([...base, ...withoutForecast]);
        assert.ok(before.correction && after.correction, 'both runs must record what they examined');
        assert.equal(
          heightKeyOf(after.correction).n,
          heightKeyOf(before.correction).n + extras,
          'the missing forecast only kills the score difference; the size someone reported is still a height difference and must still count',
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('everything the fit stored is byte-identical to what it stored before', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 12, max: 30 }),
      fc.integer({ min: 1, max: 2 }),
      async (count, windRotation) => {
        const base = { count, reporters: 6, biggerThanForecastM: 0.2, spreadM: 0.3 };
        const before = await fitOver(syntheticMornings(base));
        const after = await fitOver(syntheticMornings({ ...base, windRotation }));
        assertStateDelta({
          before: before.storedUniverse,
          after: after.storedUniverse,
          universe: 'learned/corrections/v1/',
          expected: 'identical',
          context: 'wind makes no numeric claim anywhere in this product, so it forms no difference, carries no standard error and gives no gate anything to weigh',
        });
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('the difference it stores never exceeds the raw difference in size, and never flips its sign', async function () {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 40 }),
      fc.integer({ min: 5, max: 9 }),
      fc.double({ min: 0.05, max: 1.2, noNaN: true, noDefaultInfinity: true }),
      async (count, reporters, bigger) => {
        const { correction } = await fitOver(
          syntheticMornings({ count, reporters, biggerThanForecastM: bigger, spreadM: 0.3 }),
        );
        assert.ok(correction, 'the fit must record what it examined');
        const raw = rawDifferenceM({ biggerThanForecastM: bigger });
        const stored = heightKeyOf(correction).b;
        assert.ok(
          Math.abs(stored) <= Math.abs(raw) + METRE_TOLERANCE,
          `the stored ${stored} m exceeds the raw ${raw} m, so the raw estimate reached the file; only the shrunken one may`,
        );
        assert.ok(
          stored * raw >= 0,
          `the stored ${stored} m disagrees in sign with the raw ${raw} m, which pooling toward a parent may never cause`,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});
