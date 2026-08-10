// Step methods for the pooling hierarchy (slice-03). Domain language only:
// no step name says learned or accurate, because nothing synthetic earns
// those words (feature-delta Definition of Done row 13).
//
// Layer: in-memory acceptance through the nightly fit's own driving port,
// across several invented spots. The oracles below never re-derive the
// estimator: each one states a declared law of 06-learning-layer.md
// section 5.3 (cold start, hard basin partition, group activation, tau
// estimation with a permanent floor) as a relation between stored numbers.

import assert from 'node:assert/strict';

import { Before, Given, Then, When } from '@cucumber/cucumber';
import fc from 'fast-check';

import { TAU_SPOT_PRIOR } from '../../../../src/learning/constants';
import {
  caribbeanBeach,
  fitAcrossSpots,
  morningsAt,
  pacificBeach,
  pacificReef,
  requireHeightKeyIn,
  type IsolatedRunResult,
  type SpotMornings,
} from './support/many-spots';
import { failureContext } from './support/learning-world';
import { assertStateDelta } from './support/state-delta';

/** 06 section 8: the permanent floor under any estimated tau. */
const TAU_PERMANENT_FLOOR = 2;
const METRE_TOLERANCE = 1e-9;
const PROPERTY_RUNS = 15;

const ESTABLISHED_SPOT = 'costa-larga';
const NEW_SPOT = 'nueva-arena';
const CARIBBEAN_SPOT = 'caribe-escondido';

type RememberedSpot = { spot: SpotMornings; rawDifference: number };

let entries: RememberedSpot[] = [];
let mainRun: IsolatedRunResult | null = null;
let pairedRuns: { withAll: IsolatedRunResult; without: IsolatedRunResult } | null = null;

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, function () {
  entries = [];
  mainRun = null;
  pairedRuns = null;
});

function remember(spot: SpotMornings, biggerThanForecastM: number): void {
  entries.push({ spot, rawDifference: -biggerThanForecastM });
}

function requireMainRun(): IsolatedRunResult {
  assert.ok(mainRun, 'test bug: the nightly fit was never driven across those spots');
  return mainRun;
}

function byId(spotId: string): RememberedSpot {
  const found = entries.find((entry) => entry.spot.seed.spot_id === spotId);
  assert.ok(found, `test bug: no remembered spot ${spotId}`);
  return found;
}

// ---------- Given: invented spots and their mornings ----------

Given('a Pacific beach spot where {int} mornings from {int} people came in {float} m bigger than forecast', function (count: number, reporters: number, bigger: number) {
  remember(morningsAt(pacificBeach(ESTABLISHED_SPOT), 'pa', { count, reporters, biggerThanForecastM: bigger, spreadM: 0.42 }), bigger);
});

Given('a brand-new Pacific beach spot where {int} mornings from {int} people came in {float} m bigger than forecast', function (count: number, reporters: number, bigger: number) {
  remember(morningsAt(pacificBeach(NEW_SPOT), 'na', { count, reporters, biggerThanForecastM: bigger, spreadM: 0.42 }), bigger);
});

Given('a Caribbean beach spot where {int} mornings from {int} people saw exactly what was forecast', function (count: number, reporters: number) {
  remember(morningsAt(caribbeanBeach(CARIBBEAN_SPOT), 'cb', { count, reporters, biggerThanForecastM: 0, spreadM: 0.42 }), 0);
});

Given('a quiet Pacific beach spot whose {int} mornings from {int} people saw exactly what was forecast', function (count: number, reporters: number) {
  remember(morningsAt(pacificBeach(ESTABLISHED_SPOT), 'pa', { count, reporters, biggerThanForecastM: 0, spreadM: 0.42 }), 0);
});

Given('any single loud morning at a brand-new spot in the same region', function () {
  // Quantification only; the generator lives in the Then.
});

Given('eight Pacific beach spots that each earned an applied correction, with wildly different differences', function () {
  const biggers = [0.6, 0.45, 0.3, 0.25, -0.25, -0.3, -0.45, -0.6];
  biggers.forEach((bigger, index) => {
    remember(
      morningsAt(pacificBeach(`spot-ocho-${index + 1}`), `h${index + 1}`, { count: 22, reporters: 7, biggerThanForecastM: bigger, spreadM: 0.42 }),
      bigger,
    );
  });
});

Given('three Pacific beach spots that each earned an applied correction near {float} m under forecast', function (underM: number) {
  addGatedGroup('beach', 3, -underM);
});

Given('two Pacific beach spots that each earned an applied correction near {float} m under forecast', function (underM: number) {
  addGatedGroup('beach', 2, -underM);
});

Given('three Pacific reef spots that each earned an applied correction near {float} m over forecast', function (overM: number) {
  addGatedGroup('reef', 3, overM);
});

function addGatedGroup(breakType: 'beach' | 'reef', spots: number, biggerThanForecastM: number): void {
  for (let index = 1; index <= spots; index += 1) {
    const seed = breakType === 'beach' ? pacificBeach(`playa-${breakType}-${index}`) : pacificReef(`bajo-${breakType}-${index}`);
    remember(
      morningsAt(seed, `${breakType[0]}${index}`, { count: 22, reporters: 7, biggerThanForecastM, spreadM: 0.42 }),
      biggerThanForecastM,
    );
  }
}

Given('a brand-new Pacific beach spot with {int} mornings whose people saw exactly what was forecast', function (count: number) {
  remember(morningsAt(pacificBeach(NEW_SPOT), 'na', { count, reporters: count, biggerThanForecastM: 0, spreadM: 0.42 }), 0);
});

// ---------- When ----------

When('the nightly fit runs across those spots', async function () {
  mainRun = await fitAcrossSpots({ spots: entries.map((entry) => entry.spot) });
});

When('the nightly fit runs across those spots, once with the Pacific mornings present and once without them', async function () {
  pairedRuns = {
    withAll: await fitAcrossSpots({ spots: entries.map((entry) => entry.spot), label: 'nightly fit with the Pacific mornings' }),
    without: await fitAcrossSpots({
      spots: entries.filter((entry) => entry.spot.seed.coast !== 'pacific').map((entry) => entry.spot),
      label: 'nightly fit without the Pacific mornings',
    }),
  };
});

When('the nightly fit runs across those spots for each loud morning', function () {
  // The runs happen inside the law being asserted, each through the same
  // driving port, each in its own isolated store.
});

// ---------- Then ----------

Then('the brand-new spot gets no correction applied, recording its {int} mornings from {int} people', function (count: number, reporters: number) {
  const key = requireHeightKeyIn(requireMainRun().corrections, NEW_SPOT);
  assert.equal(key.applied, false, 'two mornings are far below the publication gates, so nothing may be applied');
  assert.equal(key.n, count, 'the refusal must record how many mornings it weighed');
  assert.equal(key.reporters, reporters, 'the refusal must record how many different people it counted');
});

Then('the difference stored for the brand-new spot sits closer to its neighbours\' than to its own two mornings', function () {
  const run = requireMainRun();
  const stored = requireHeightKeyIn(run.corrections, NEW_SPOT).b;
  const neighbours = requireHeightKeyIn(run.corrections, ESTABLISHED_SPOT).b;
  const ownRaw = byId(NEW_SPOT).rawDifference;
  assert.ok(
    Math.abs(stored - neighbours) < Math.abs(stored - ownRaw),
    `a spot with two mornings must lean on its neighbours, not invent its own number: it stored ${stored} m, which sits nearer its own two mornings (${ownRaw} m) than its neighbours' ${neighbours} m.${failureContext()}`,
  );
});

Then('everything stored for the Caribbean spot is byte-identical between the two runs', function () {
  assert.ok(pairedRuns, 'test bug: the paired runs never happened');
  const caribbeanKey = `learned/corrections/v1/current/${CARIBBEAN_SPOT}.json`;
  const withAll = pairedRuns.withAll.corrections.get(caribbeanKey);
  const without = pairedRuns.without.corrections.get(caribbeanKey);
  assert.ok(
    withAll !== undefined && without !== undefined,
    `both runs must store what they examined for ${CARIBBEAN_SPOT}, or the partition cannot be audited.${failureContext()}`,
  );
  assertStateDelta({
    before: new Map([[caribbeanKey, without]]),
    after: new Map([[caribbeanKey, withAll]]),
    universe: caribbeanKey,
    expected: 'identical',
    context: 'the basin is a hard wall: a Caribbean spot may never borrow a Pacific bias at any weight, so the Pacific mornings must change nothing it stores',
  });
});

Then('the brand-new spot\'s stored difference never moves by more than a third of what the loud morning claims', async function () {
  const quiet = entries[0];
  assert.ok(quiet, 'test bug: no quiet neighbourhood spot was given');
  await fc.assert(
    fc.asyncProperty(
      fc.double({ min: 0.3, max: 1.2, noNaN: true, noDefaultInfinity: true }),
      async (loudBigger) => {
        const loudSpot = morningsAt(pacificBeach(NEW_SPOT), 'na', {
          count: 1,
          reporters: 1,
          biggerThanForecastM: loudBigger,
          spreadM: 0,
        });
        const run = await fitAcrossSpots({
          spots: [quiet.spot, loudSpot],
          label: 'nightly fit with one loud morning',
        });
        const stored = requireHeightKeyIn(run.corrections, NEW_SPOT).b;
        assert.ok(
          Math.abs(stored) <= loudBigger / (1 + TAU_PERMANENT_FLOOR) + METRE_TOLERANCE,
          `one loud morning claiming ${loudBigger} m may move a brand-new spot by at most a third of itself (06 section 5.3, tau floor ${TAU_PERMANENT_FLOOR}); it stored ${stored} m`,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
});

Then('each of the eight spots keeps its applied correction', function () {
  const run = requireMainRun();
  for (const entry of entries) {
    const key = requireHeightKeyIn(run.corrections, entry.spot.seed.spot_id);
    assert.equal(
      key.applied,
      true,
      `${entry.spot.seed.spot_id} earned its correction on 22 mornings from 7 people at a clear difference, and pooling stepping aside must not un-earn it`,
    );
  }
});

Then('each spot\'s stored difference sits nearer its own mornings than the hand-set prior would have left it', function () {
  const run = requireMainRun();
  const parentMean = entries.reduce((sum, entry) => sum + entry.rawDifference, 0) / entries.length;
  for (const entry of entries) {
    const stored = requireHeightKeyIn(run.corrections, entry.spot.seed.spot_id).b;
    const gapStored = Math.abs(stored - entry.rawDifference);
    const gapPrior = (TAU_SPOT_PRIOR / (22 + TAU_SPOT_PRIOR)) * Math.abs(entry.rawDifference - parentMean);
    assert.ok(
      gapStored < gapPrior * 0.999,
      `eight spots that wildly disagree prove the spots really differ, so the estimated pooling must be weaker than the hand-set prior: ${entry.spot.seed.spot_id} still sits ${gapStored} m from its own mornings, where the prior alone leaves ${gapPrior} m.${failureContext()}`,
    );
  }
});

Then('no spot\'s stored difference reaches its own mornings exactly, because a permanent floor keeps some pooling', function () {
  const run = requireMainRun();
  const parentMean = entries.reduce((sum, entry) => sum + entry.rawDifference, 0) / entries.length;
  for (const entry of entries) {
    const stored = requireHeightKeyIn(run.corrections, entry.spot.seed.spot_id).b;
    const gapStored = Math.abs(stored - entry.rawDifference);
    const gapFloor = (TAU_PERMANENT_FLOOR / (22 + TAU_PERMANENT_FLOOR)) * Math.abs(entry.rawDifference - parentMean);
    assert.ok(
      gapStored >= gapFloor - 1e-6,
      `however different the spots prove themselves, tau never drops under its permanent floor of ${TAU_PERMANENT_FLOOR}: ${entry.spot.seed.spot_id} sits only ${gapStored} m from its own mornings, under the ${gapFloor} m the floor guarantees`,
    );
  }
});

Then('the brand-new beach spot\'s stored difference sits with the beach spots, not with the region-wide average', function () {
  const { stored, beachMean, regionMean } = groupOracle();
  assert.ok(
    Math.abs(stored - beachMean) < Math.abs(stored - regionMean),
    `three proven beach spots are a family, so a new beach spot's parent is theirs: it stored ${stored} m, nearer the region-wide ${regionMean} m than the beach spots' ${beachMean} m.${failureContext()}`,
  );
});

Then('the brand-new beach spot\'s stored difference sits with the region-wide average, not with the beach spots alone', function () {
  const { stored, beachMean, regionMean } = groupOracle();
  assert.ok(
    Math.abs(stored - regionMean) < Math.abs(stored - beachMean),
    `two proven beach spots are not yet a family (activation needs three), so the region still carries a new beach spot: it stored ${stored} m, nearer the beach pair's ${beachMean} m than the region-wide ${regionMean} m.${failureContext()}`,
  );
});

function groupOracle(): { stored: number; beachMean: number; regionMean: number } {
  const run = requireMainRun();
  const stored = requireHeightKeyIn(run.corrections, NEW_SPOT).b;
  const gated = entries.filter((entry) => entry.spot.seed.spot_id !== NEW_SPOT);
  const beach = gated.filter((entry) => entry.spot.seed.break_type === 'beach');
  const beachMean = beach.reduce((sum, entry) => sum + entry.rawDifference, 0) / beach.length;
  const regionMean = gated.reduce((sum, entry) => sum + entry.rawDifference, 0) / gated.length;
  return { stored, beachMean, regionMean };
}
