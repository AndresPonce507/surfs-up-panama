// Step methods for the weighing room (slice-04): robustness, selection and
// the per-reporter offset, all multiplicative on samples (06 section 6).
//
// Layer: in-memory acceptance through the nightly fit's own driving port,
// two isolated runs per oracle so the law is a relation between stored
// numbers, never a re-implementation of the estimator. Where a bound is
// asserted, it is computed from the declared constants (band table, sigma_eff,
// the 2-band-width fence) exactly the way 01-11 computes the noise floor.

import assert from 'node:assert/strict';

import { Before, Given, Then, When } from '@cucumber/cucumber';

import {
  bandValueM,
  bandWidthM,
  callsHistory,
  datesFrom,
  shared,
  fitAcrossSpots,
  morningsAt,
  pacificBeach,
  precisionWeight,
  requireCorrectionIn,
  requireHeightKeyIn,
  withSessionRepeats,
  type IsolatedRunResult,
  type SpotMornings,
} from './support/many-spots';
import {
  failureContext,
  learning,
} from './support/learning-world';
import {
  syntheticMornings,
  SPOT_ID,
  type Morning,
} from './support/synthetic-mornings';
import { assertStateDelta } from './support/state-delta';

const HABIT_SPOT_A = 'costa-larga';
const HABIT_SPOT_B = 'punta-brava';
const HONEST_BAND = 'chest_head';
const WILD_BAND = 'double_overhead_plus';
const HABIT_BAND = 'head_overhead';
/** Fresh days no base morning uses, so a probe never collides with an existing prediction row. */
const GOOD_PROBE_OFFSET = 25;
const GOOD_PROBE_DATE = '2026-07-26';
const BAD_PROBE_OFFSET = -14;

type PairedRuns = { withIt: IsolatedRunResult; withoutIt: IsolatedRunResult };

let clusterMornings: Morning[] = [];
let chronicDays: { honest: Morning[]; chronic: Morning[] } | null = null;
let habitSpots: { honest: SpotMornings[]; habit: Morning[] } | null = null;
let overrideTarget: string | null = null;
let paired: PairedRuns | null = null;
let probeRuns: { base: IsolatedRunResult; onGood: IsolatedRunResult; onBad: IsolatedRunResult } | null = null;
let askedRuns: { base: IsolatedRunResult; volunteered: IsolatedRunResult; asked: IsolatedRunResult } | null = null;
let newcomerRuns: { familiar: IsolatedRunResult; newcomer: IsolatedRunResult } | null = null;

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, function () {
  clusterMornings = [];
  chronicDays = null;
  shared.calls = [];
  habitSpots = null;
  overrideTarget = null;
  paired = null;
  probeRuns = null;
  askedRuns = null;
  newcomerRuns = null;
});

function venao(mornings: Morning[]): SpotMornings {
  return { seed: pacificBeach(SPOT_ID), mornings };
}

function cloneReport(morning: Morning, deviceId: string, idTag: string, band?: Morning['observation']['size_band'], trigger?: 'organic' | 'push_solicited'): Morning {
  return {
    observation: {
      ...morning.observation,
      report_id: `${morning.observation.report_id.slice(0, -4)}${idTag.padStart(4, '0').slice(0, 4)}`,
      device_id: deviceId,
      ...(band === undefined ? {} : { size_band: band }),
      ...(trigger === undefined ? {} : { trigger }),
    },
    prediction: morning.prediction,
  };
}

function movement(run: IsolatedRunResult, reference: IsolatedRunResult): number {
  const b = requireHeightKeyIn(run.corrections, SPOT_ID).b;
  const referenceB = requireHeightKeyIn(reference.corrections, SPOT_ID).b;
  return Math.abs(b - referenceB);
}

// ---------- Given ----------

Given('one of those mornings was also confirmed by {int} more people, while a fifth device called it double overhead or more', function (confirmations: number) {
  const template = learning.mornings[0];
  assert.ok(template, 'test bug: no base mornings were given');
  clusterMornings = [
    ...Array.from({ length: confirmations }, (_unused, index) => cloneReport(template, `d_conf_${index}`, `C${index}`)),
    cloneReport(template, 'd_wild', 'W0', WILD_BAND),
  ];
});

Given('{int} mornings at Playa Venao each reported by three people who agreed the waves came in {float} m bigger than forecast', function (days: number, bigger: number) {
  const templates = Array.from({ length: days }, (_unused, day) => {
    const built = syntheticMornings({ count: 1, reporters: 1, biggerThanForecastM: bigger, spreadM: 0, dayOffset: day });
    const morning = built[0];
    assert.ok(morning, 'test bug: the fixture builder produced no morning');
    return morning;
  });
  chronicDays = {
    honest: templates.flatMap((morning, day) =>
      [0, 1, 2].map((index) => cloneReport(morning, `d_agree_${index}`, `A${day}${index}`))),
    chronic: [],
  };
});

Given('a fourth device that reported every one of those mornings as double overhead or more', function () {
  assert.ok(chronicDays, 'test bug: the agreed mornings were never given');
  const byDay = new Map<string, Morning>();
  for (const morning of chronicDays.honest) {
    byDay.set(morning.observation.observed_at, morning);
  }
  chronicDays.chronic = [...byDay.values()].map((morning, day) =>
    cloneReport(morning, 'd_chronic', `X${day}`, WILD_BAND));
});

Given('ninety days of published calls where mornings like the reported ones looked good and the unreported kind looked bad', function () {
  const reportedDates = [...new Set(learning.mornings.map((morning) => morning.observation.observed_at.slice(0, 10)))];
  shared.calls = [
    ...reportedDates.map((date) => ({ date, score_q: 82 })),
    // The two probe days: one more good-looking day and a bad-looking one,
    // both unreported until a scenario drops its extra morning there.
    { date: GOOD_PROBE_DATE, score_q: 82 },
    ...datesFrom('2026-06-01', 10).map((date) => ({ date, score_q: 78 })),
    ...datesFrom('2026-06-11', 20).map((date) => ({ date, score_q: 12 })),
  ];
});

Given('honest mornings at two Pacific beach spots', function () {
  habitSpots = {
    honest: [
      morningsAt(pacificBeach(HABIT_SPOT_A), 'ha', { count: 22, reporters: 7, biggerThanForecastM: 0.22, spreadM: 0 }),
      morningsAt(pacificBeach(HABIT_SPOT_B), 'hb', { count: 12, reporters: 5, biggerThanForecastM: 0.22, spreadM: 0 }),
    ],
    habit: [],
  };
});

Given('one reporter who called every one of their nine mornings a full band bigger, across both beaches', function () {
  assert.ok(habitSpots, 'test bug: the two beaches were never given');
  const habitAt = (spotId: string, count: number, dayOffset: number, tag: string): Morning[] =>
    syntheticMornings({ count, reporters: 1, biggerThanForecastM: 0.22, spreadM: 0, dayOffset })
      .map((morning, index) => {
        const cloned = cloneReport(morning, 'd_habit', `${tag}${index}`, HABIT_BAND);
        return {
          observation: { ...cloned.observation, spot_id: spotId },
          prediction: { ...cloned.prediction, spot_id: spotId },
        };
      });
  habitSpots.habit = [
    ...habitAt(HABIT_SPOT_A, 5, 22, 'HA'),
    ...habitAt(HABIT_SPOT_B, 4, 30, 'HB'),
  ];
});

Given('the incident file records one of those reporters at no weight after a discovered campaign', function () {
  overrideTarget = 'd_learn_0';
});

// ---------- When ----------

When('the nightly fit runs on those mornings, and again with one person\'s every report repeated five times in the same session', async function () {
  const base = venao(learning.mornings);
  paired = {
    withoutIt: await fitAcrossSpots({ spots: [base], label: 'nightly fit, one report per session' }),
    withIt: await fitAcrossSpots({ spots: [withSessionRepeats(base, 'd_learn_0', 5)], label: 'nightly fit, one session repeated five times' }),
  };
});

When('the nightly fit runs on those mornings, with and without the wild claim', async function () {
  const honest = [...learning.mornings, ...clusterMornings.filter((morning) => morning.observation.device_id !== 'd_wild')];
  const all = [...learning.mornings, ...clusterMornings];
  paired = {
    withoutIt: await fitAcrossSpots({ spots: [venao(honest)], label: 'nightly fit without the wild claim' }),
    withIt: await fitAcrossSpots({ spots: [venao(all)], label: 'nightly fit with the wild claim' }),
  };
});

When('the nightly fit runs on those mornings, with and without that device\'s reports', async function () {
  assert.ok(chronicDays, 'test bug: the chronic device was never given');
  paired = {
    withoutIt: await fitAcrossSpots({ spots: [venao(chronicDays.honest)], label: 'nightly fit without the chronic device' }),
    withIt: await fitAcrossSpots({ spots: [venao([...chronicDays.honest, ...chronicDays.chronic])], label: 'nightly fit with the chronic device' }),
  };
});

When('the nightly fit runs on those mornings, once with one more morning from a familiar reporter and once with the same morning from a brand-new device', async function () {
  const extra = syntheticMornings({ count: 1, reporters: 1, biggerThanForecastM: 0.22, spreadM: 0, dayOffset: 22 })[0];
  assert.ok(extra, 'test bug: the fixture builder produced no extra morning');
  newcomerRuns = {
    familiar: await fitAcrossSpots({ spots: [venao([...learning.mornings, cloneReport(extra, 'd_learn_1', 'F0')])], label: 'nightly fit with a familiar reporter\'s extra morning' }),
    newcomer: await fitAcrossSpots({ spots: [venao([...learning.mornings, cloneReport(extra, 'd_new_9', 'N0')])], label: 'nightly fit with a newcomer\'s extra morning' }),
  };
});

When('the nightly fit runs twice, with one extra volunteered morning landing first on a good-looking day and then on a bad-looking one', async function () {
  probeRuns = {
    base: await fitAcrossSpots({ spots: [venao(learning.mornings)], calls: callsHistory(shared.calls), label: 'nightly fit with no extra morning' }),
    onGood: await fitAcrossSpots({ spots: [venao([...learning.mornings, probeMorning(GOOD_PROBE_OFFSET, 'organic')])], calls: callsHistory(shared.calls), label: 'nightly fit with the extra morning on a good-looking day' }),
    onBad: await fitAcrossSpots({ spots: [venao([...learning.mornings, probeMorning(BAD_PROBE_OFFSET, 'organic')])], calls: callsHistory(shared.calls), label: 'nightly fit with the extra morning on a bad-looking day' }),
  };
});

When('the nightly fit runs twice more, with the same extra morning on the bad-looking day first volunteered and then asked for', async function () {
  askedRuns = {
    base: await fitAcrossSpots({ spots: [venao(learning.mornings)], calls: callsHistory(shared.calls), label: 'nightly fit with no extra morning' }),
    volunteered: await fitAcrossSpots({ spots: [venao([...learning.mornings, probeMorning(BAD_PROBE_OFFSET, 'organic')])], calls: callsHistory(shared.calls), label: 'nightly fit with the volunteered bad-day morning' }),
    asked: await fitAcrossSpots({ spots: [venao([...learning.mornings, probeMorning(BAD_PROBE_OFFSET, 'push_solicited')])], calls: callsHistory(shared.calls), label: 'nightly fit with the asked-for bad-day morning' }),
  };
});

function probeMorning(dayOffset: number, trigger: 'organic' | 'push_solicited'): Morning {
  const built = syntheticMornings({ count: 1, reporters: 1, biggerThanForecastM: 0.52, spreadM: 0, dayOffset });
  const morning = built[0];
  assert.ok(morning, 'test bug: the fixture builder produced no probe morning');
  return cloneReport(morning, 'd_probe', 'P0', undefined, trigger);
}

When('the nightly fit runs on those mornings, with and without that reporter\'s mornings', async function () {
  if (habitSpots !== null) {
    const { honest, habit } = habitSpots;
    const spotA = honest[0];
    const spotB = honest[1];
    assert.ok(spotA && spotB, 'test bug: the two beaches were never given');
    paired = {
      withoutIt: await fitAcrossSpots({ spots: [spotA, spotB], label: 'nightly fit without the habit reporter' }),
      withIt: await fitAcrossSpots({
        spots: [
          { seed: spotA.seed, mornings: [...spotA.mornings, ...habit.filter((morning) => morning.observation.spot_id === HABIT_SPOT_A)] },
          { seed: spotB.seed, mornings: [...spotB.mornings, ...habit.filter((morning) => morning.observation.spot_id === HABIT_SPOT_B)] },
        ],
        label: 'nightly fit with the habit reporter',
      }),
    };
    return;
  }
  assert.ok(overrideTarget, 'test bug: neither a habit reporter nor an incident file was given');
  paired = {
    withIt: await fitAcrossSpots({
      spots: [venao(learning.mornings)],
      overrides: { [overrideTarget]: 0 },
      label: 'nightly fit with the campaign present and the incident file in place',
    }),
    withoutIt: await fitAcrossSpots({
      spots: [venao(learning.mornings.filter((morning) => morning.observation.device_id !== overrideTarget))],
      label: 'nightly fit with the campaign\'s mornings absent',
    }),
  };
});

// ---------- Then ----------

function requirePaired(): PairedRuns {
  assert.ok(paired, 'test bug: the paired runs never happened');
  return paired;
}

Then('both runs stored byte-identical corrections, because a session counts once however loudly it repeats itself', function () {
  const runs = requirePaired();
  requireCorrectionIn(runs.withoutIt.corrections, SPOT_ID);
  assertStateDelta({
    before: runs.withoutIt.corrections,
    after: runs.withIt.corrections,
    universe: 'learned/corrections/v1/',
    expected: 'identical',
    context: 'five reports from one device in one session collapse to that session\'s one voice, so nothing stored may differ',
  });
});

Then('the wild claim moved the stored difference no further than a claim pinned at the day\'s fence could', function () {
  const runs = requirePaired();
  const moved = movement(runs.withIt, runs.withoutIt);
  const expected = expectedFencedMovement(runs);
  assert.ok(
    moved <= expected * 1.25,
    `a claim beyond the day's fence must be pulled to the fence before it is weighed (two band widths from the day's agreed middle, 06 section 6.2): the fence allows at most ${expected} m of movement and the wild claim moved the stored difference ${moved} m.${failureContext()}`,
  );
});

Then('it still moved it a little, because even an outlier keeps a voice', function () {
  const runs = requirePaired();
  const moved = movement(runs.withIt, runs.withoutIt);
  const expected = expectedFencedMovement(runs);
  assert.ok(
    moved >= expected * 0.4,
    `pulling a claim to the fence is not erasing it: the fenced claim should still move the stored difference about ${expected} m and it moved ${moved} m.${failureContext()}`,
  );
});

/** The declared fence: the wild sample enters at the day median minus two band widths. */
function expectedFencedMovement(runs: PairedRuns): number {
  const honestWeight = precisionWeight(HONEST_BAND);
  const wildWeight = precisionWeight(WILD_BAND);
  const honestCount = learning.mornings.length + clusterMornings.length - 1;
  const withoutB = requireHeightKeyIn(runs.withoutIt.corrections, SPOT_ID).b;
  const template = learning.mornings[0];
  assert.ok(template, 'test bug: no base mornings');
  // The day's agreed middle: every same-day sample reported the honest band,
  // so the median residual is that day's own residual.
  const forecastEff = template.prediction.swell_h_m;
  const dayMedian = forecastEff - bandValueM(HONEST_BAND);
  const fencedResidual = dayMedian - 2 * bandWidthM(HONEST_BAND);
  return (wildWeight * Math.abs(fencedResidual - withoutB)) / (honestCount * honestWeight + wildWeight);
}

Then('that device\'s habit moved the stored difference to less than six tenths of what full trust would allow', function () {
  const runs = requirePaired();
  const moved = movement(runs.withIt, runs.withoutIt);
  const full = fullTrustChronicMovement(runs);
  assert.ok(
    moved < full * 0.6,
    `a device that disagrees with its co-observers every single morning must be down-weighted: full trust would move the stored difference ${full} m and it moved ${moved} m.${failureContext()}`,
  );
});

Then('to more than nothing at all, because down-weighting is never a ban', function () {
  const runs = requirePaired();
  const moved = movement(runs.withIt, runs.withoutIt);
  const full = fullTrustChronicMovement(runs);
  assert.ok(
    moved > full * 0.05,
    `even a chronic outlier keeps a voice (decision 24: down-weight, never ban): its reports should still move the stored difference more than ${full * 0.05} m and they moved ${moved} m.${failureContext()}`,
  );
});

/** What the chronic device's reports would move the difference at full trust, unfenced. */
function fullTrustChronicMovement(runs: PairedRuns): number {
  assert.ok(chronicDays, 'test bug: the chronic device was never given');
  const honestWeight = precisionWeight(HONEST_BAND);
  const chronicWeight = precisionWeight(WILD_BAND);
  const withoutB = requireHeightKeyIn(runs.withoutIt.corrections, SPOT_ID).b;
  const template = chronicDays.chronic[0];
  assert.ok(template, 'test bug: the chronic device reported nothing');
  const chronicResidual = template.prediction.swell_h_m - bandValueM(WILD_BAND);
  const k = chronicDays.chronic.length;
  return (k * chronicWeight * Math.abs(chronicResidual - withoutB)) /
    (chronicDays.honest.length * honestWeight + k * chronicWeight);
}

Then('the stored difference and count are identical either way, because a newcomer starts at full voice', function () {
  assert.ok(newcomerRuns, 'test bug: the newcomer runs never happened');
  const familiar = requireHeightKeyIn(newcomerRuns.familiar.corrections, SPOT_ID);
  const newcomer = requireHeightKeyIn(newcomerRuns.newcomer.corrections, SPOT_ID);
  assert.equal(
    newcomer.b,
    familiar.b,
    `an identical morning must weigh the same from a brand-new device as from a familiar one (a newcomer discount would tax the honest early community, 06 section 6.2): familiar stored ${familiar.b} m, newcomer ${newcomer.b} m.${failureContext()}`,
  );
  assert.equal(newcomer.n, familiar.n, 'and the counted mornings must match too');
});

Then('the extra morning on the bad-looking day moved the stored difference more, because its kind is almost never heard from', function () {
  assert.ok(probeRuns, 'test bug: the probe runs never happened');
  const movedOnGood = movement(probeRuns.onGood, probeRuns.base);
  const movedOnBad = movement(probeRuns.onBad, probeRuns.base);
  assert.ok(
    movedOnBad > movedOnGood,
    `mornings nobody usually reports must stop being outvoted (06 section 6.3): the bad-looking day's morning moved the stored difference ${movedOnBad} m against the good-looking day's ${movedOnGood} m.${failureContext()}`,
  );
});

Then('the asked-for morning moved the stored difference less than the volunteered one, because being asked removes the rarity bonus', function () {
  assert.ok(askedRuns, 'test bug: the asked-for runs never happened');
  const volunteered = movement(askedRuns.volunteered, askedRuns.base);
  const asked = movement(askedRuns.asked, askedRuns.base);
  assert.ok(
    asked < volunteered,
    `a morning the site asked for is a near-random sample and counts plainly (09 section 13.5a fix 1): asked-for moved ${asked} m against the volunteered ${volunteered} m.${failureContext()}`,
  );
});

Then('the habit moved the stored differences by less than half of what full trust would allow', function () {
  const runs = requirePaired();
  assert.ok(habitSpots, 'test bug: the habit fixture was never given');
  const habitAtA = habitSpots.habit.filter((morning) => morning.observation.spot_id === HABIT_SPOT_A);
  const honestA = habitSpots.honest[0];
  assert.ok(honestA, 'test bug: no first beach');
  const withoutB = requireHeightKeyIn(runs.withoutIt.corrections, HABIT_SPOT_A).b;
  const withB = requireHeightKeyIn(runs.withIt.corrections, HABIT_SPOT_A).b;
  const habitTemplate = habitAtA[0];
  assert.ok(habitTemplate, 'test bug: the habit reporter reported nothing at the first beach');
  const habitResidual = habitTemplate.prediction.swell_h_m - bandValueM(HABIT_BAND);
  const honestWeight = precisionWeight(HONEST_BAND);
  const habitWeight = precisionWeight(HABIT_BAND);
  const full = (habitAtA.length * habitWeight * Math.abs(habitResidual - withoutB)) /
    (honestA.mornings.length * honestWeight + habitAtA.length * habitWeight);
  const moved = Math.abs(withB - withoutB);
  assert.ok(
    moved < full * 0.5,
    `a habit seen across two beaches is identifiable and must be mostly subtracted (06 section 5.2): full trust would move the first beach's stored difference ${full} m and it moved ${moved} m.${failureContext()}`,
  );
});

Then('the habit reporter\'s mornings still counted at both beaches', function () {
  const runs = requirePaired();
  assert.ok(habitSpots, 'test bug: the habit fixture was never given');
  const honestA = habitSpots.honest[0];
  const honestB = habitSpots.honest[1];
  assert.ok(honestA && honestB, 'test bug: the two beaches were never given');
  const habitAtA = habitSpots.habit.filter((morning) => morning.observation.spot_id === HABIT_SPOT_A).length;
  const habitAtB = habitSpots.habit.filter((morning) => morning.observation.spot_id === HABIT_SPOT_B).length;
  assert.equal(
    requireHeightKeyIn(runs.withIt.corrections, HABIT_SPOT_A).n,
    honestA.mornings.length + habitAtA,
    'subtracting a habit is not deleting its reports: they still count as mornings',
  );
  assert.equal(
    requireHeightKeyIn(runs.withIt.corrections, HABIT_SPOT_B).n,
    honestB.mornings.length + habitAtB,
    'and at the second beach too',
  );
});

Then('nothing the fit stores names any reporter or carries any personal habit', function () {
  const runs = requirePaired();
  for (const [key, body] of runs.withIt.corrections) {
    assert.ok(
      !body.includes('d_habit') && !body.includes('"u_r"') && !body.includes('"u_hat"'),
      `a personal offset may never be published, displayed or keyed to a visible identity (ADR decision 4): ${key} carries one.${failureContext()}`,
    );
  }
});

Then('both runs stored byte-identical corrections, because the incident file excised the campaign by recompute', function () {
  const runs = requirePaired();
  requireCorrectionIn(runs.withoutIt.corrections, SPOT_ID);
  assertStateDelta({
    before: runs.withoutIt.corrections,
    after: runs.withIt.corrections,
    universe: 'learned/corrections/v1/',
    expected: 'identical',
    context: 'a reporter at weight zero in the incident file must vanish from the fit exactly as if their mornings were never stored, and nobody else may move',
  });
});
