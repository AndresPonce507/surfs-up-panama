// Step methods for the monthly evaluation (slice-05): the system-level kill
// switch (G7) and the metrics file that watches every named hazard.
//
// Layer: in-memory acceptance through the monthly evaluation's own driving
// port, an isolated store per run. The metrics file is operator-facing only;
// these steps read it directly because the operator is its only reader.
//
// The counterfactual score the evaluation needs (what WOULD have been
// published without the correction) is exactly recomposable from each
// archived call's own decomposition, law L10 of 05-scoring-engine.md:
// Q = exp(-(damage_dir + damage_size + damage_wind + damage_tide)); the
// roadmap's 05-02 notes carry the formulas verbatim.

import assert from 'node:assert/strict';

import { Before, Given, Then, When } from '@cucumber/cucumber';

import {
  callsHistory,
  evaluateMonth,
  mapMornings,
  pacificBeach,
  requireHeightKeyIn,
  requireMetricsIn,
  shared,
  type IsolatedRunResult,
  type SpotMornings,
} from './support/many-spots';
import {
  correctionThatPassedEveryGate,
} from './support/apply-world';
import { failureContext, learning, CURRENT_CORRECTION_KEY } from './support/learning-world';
import { syntheticMornings, SPOT_ID } from './support/synthetic-mornings';
import { assertCvRuleVerdict } from './support/cv-rule';

const SHRUNK_SPOT = 'playa-empozada';

let correctionOnFile: { key: string; body: string }[] = [];
let monthSpot: SpotMornings | null = null;
let monthRun: IsolatedRunResult | null = null;

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, function () {
  correctionOnFile = [];
  monthSpot = null;
  monthRun = null;
});

function tenWeeks(lastTwoWeeksBigger: number): SpotMornings {
  // Weeks one to eight: forty mornings that kept coming in 0.22 m bigger than
  // forecast. Weeks nine and ten: fourteen held-out mornings, agreeing or
  // turning per the scenario. Dates run 2026-06-06 to 2026-07-29, inside the
  // trailing window and before the evaluation instant.
  const trained = syntheticMornings({ count: 40, reporters: 7, biggerThanForecastM: 0.22, spreadM: 0.42, dayOffset: -25 });
  const heldOut = syntheticMornings({ count: 14, reporters: 7, biggerThanForecastM: lastTwoWeeksBigger, spreadM: 0.42, dayOffset: 15 });
  return { seed: pacificBeach(SPOT_ID), mornings: [...trained, ...heldOut] };
}

// ---------- Given ----------

Given('a correction that once passed every gate is on file for Playa Venao', function () {
  correctionOnFile = [{ key: CURRENT_CORRECTION_KEY, body: JSON.stringify(correctionThatPassedEveryGate()) }];
});

Given('ten weeks of mornings whose last two weeks turned against the correction', function () {
  monthSpot = tenWeeks(-0.22);
  learning.mornings = monthSpot.mornings;
});

Given('ten weeks of mornings that kept agreeing with the correction', function () {
  monthSpot = tenWeeks(0.22);
  learning.mornings = monthSpot.mornings;
});

Given('ten weeks of mornings where the confident calls kept being wrong and the hesitant ones kept being right', function () {
  monthSpot = mapMornings(tenWeeks(0.22), (morning, index) => ({
    observation: {
      ...morning.observation,
      quality: index % 2 === 0 ? 'bad' : 'good',
      predicted: morning.observation.predicted === null
        ? null
        : {
            ...morning.observation.predicted,
            conf_level: index % 2 === 0 ? 'high' : 'low',
            score_q: index % 2 === 0 ? 85 : 40,
          },
    },
    prediction: morning.prediction,
  }));
  learning.mornings = monthSpot.mornings;
});

Given('a correction on file whose eighty mornings are still mostly pooled away', function () {
  correctionOnFile = [{
    key: `learned/corrections/v1/current/${SHRUNK_SPOT}.json`,
    body: JSON.stringify({
      spot_id: SHRUNK_SPOT,
      schema: 'spot-correction/1',
      computed_at: '2026-08-08T09:10:00Z',
      bias: {
        swell_h_m: {
          per_source: {
            ncep_gfswave016: {
              lead_24_48: { b: -0.09, se: 0.05, n: 80, reporters: 12, applied: true, shrunk_from_global: 0.6 },
            },
          },
        },
      },
      clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
    }),
  }];
});

// ---------- When ----------

When('the monthly evaluation runs', async function () {
  monthRun = await evaluateMonth({
    spots: monthSpot === null ? [] : [monthSpot],
    correction: correctionOnFile,
    calls: callsHistory(shared.calls),
    label: 'monthly evaluation',
  });
});

// ---------- Then ----------

function requireMonthRun(): IsolatedRunResult {
  assert.ok(monthRun, 'test bug: the monthly evaluation was never driven');
  return monthRun;
}

function metricAt(path: string): unknown {
  const metrics = requireMetricsIn(requireMonthRun());
  let value: unknown = metrics;
  for (const part of path.split('.')) {
    assert.ok(
      typeof value === 'object' && value !== null && part in (value as Record<string, unknown>),
      `the monthly file is missing "${path}" (stopped at "${part}"): every hazard the design names must be watched, not assumed away.${failureContext()}`,
    );
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

Then('the evaluation finishes and reports the check it made', function () {
  const outcome = requireMonthRun().monthlyOutcome;
  assert.ok(
    outcome,
    `the monthly evaluation reported no outcome at all, so nothing can be said about what it judged.${failureContext()}`,
  );
  assert.equal(
    (outcome as { completed?: boolean }).completed,
    true,
    'the evaluation must finish and say so; a judge that dies silently looks exactly like one that found nothing to judge',
  );
});

Then('every correction on file now says applied false, until a human looks', function () {
  const run = requireMonthRun();
  assert.ok(run.corrections.size > 0, `no correction is on file after the evaluation, so the kill left no auditable trace.${failureContext()}`);
  for (const [key, body] of run.corrections) {
    if (!key.includes('/current/')) continue;
    const record = JSON.parse(body) as { bias?: { swell_h_m?: { per_source?: Record<string, Record<string, { applied: boolean }>> } }; score_delta?: { applied: boolean } };
    for (const bySource of Object.values(record.bias?.swell_h_m?.per_source ?? {})) {
      for (const [bucket, values] of Object.entries(bySource)) {
        assert.equal(
          values.applied,
          false,
          `a month the corrections lost must switch every key off until a human looks (06 section 7 G7): ${key} still says applied at ${bucket}.${failureContext()}`,
        );
      }
    }
    if (record.score_delta !== undefined) {
      assert.equal(record.score_delta.applied, false, `${key} still applies its score move after a losing month.${failureContext()}`);
    }
  }
});

Then('the monthly file records that the corrections lost on the held-out mornings', function () {
  assert.equal(
    metricAt('cv.verdict'),
    'corrections-killed',
    `the monthly file must record the verdict that switched everything off, so the human who looks knows why.${failureContext()}`,
  );
});

Then('the correction on file still says applied, because the held-out mornings sided with it', function () {
  const key = requireHeightKeyIn(requireMonthRun().corrections, SPOT_ID);
  assert.equal(
    key.applied,
    true,
    `a month the corrections won must leave them standing; the kill switch exists for losing months only.${failureContext()}`,
  );
});

Then('the monthly file records that the corrections earned their keep', function () {
  assert.equal(
    metricAt('cv.verdict'),
    'corrections-stay',
    `the monthly file must record the winning verdict too; a check only ever seen killing proves nothing about its judgment.${failureContext()}`,
  );
});

Then('the monthly file counts the mornings heard from at every kind of day, and how many were asked for', function () {
  const perDecile = metricAt('selection.per_decile');
  assert.ok(Array.isArray(perDecile) && perDecile.length > 0, `the selection-imbalance histogram is hazard (a)'s tripwire and must not be empty.${failureContext()}`);
  assert.equal(typeof metricAt('selection.solicited_share'), 'number', 'the solicited-versus-volunteered split must be a number');
});

Then('it states the ranking record within one person\'s own mornings and its distance from the pair target', function () {
  assert.equal(typeof metricAt('pairwise.pairs'), 'number', 'the pair count is the progress meter toward the claim target');
  assert.equal(metricAt('pairwise.target_pairs'), 400, 'the target is the ~400 same-day pairs of 09 section 10.2, stated in the file');
});

Then('it states the height error beside its two humble baselines, never as a headline', function () {
  const baselines = metricAt('mae.baselines');
  assert.ok(
    typeof baselines === 'object' && baselines !== null && 'climatology' in baselines && 'persistence' in baselines,
    `height error means nothing without B0 climatology and B2 persistence beside it.${failureContext()}`,
  );
});

Then('it states the floor human agreement puts under any model', function () {
  assert.equal(
    typeof metricAt('sigma_human.co_observer_pairs'), 'number',
    'the sigma_human ceiling needs its co-observer pair count',
  );
});

Then('the monthly file names the confidence term that failed its own check, the spread term first in line', function () {
  assert.equal(
    metricAt('calibration.offending_term'),
    'c_spread',
    `when high-confidence mornings are not more often right, the offending term is REMOVED, and the spread term is the first candidate to die (09 section 3.6 consequence 3).${failureContext()}`,
  );
});

Then('the monthly file flags that spot\'s pooling as a misconfiguration alarm', function () {
  const rows = metricAt('shrinkage');
  assert.ok(Array.isArray(rows), `the shrinkage report must exist (09 section 17.4 guardrail 2).${failureContext()}`);
  const flagged = (rows as { spot_id?: string; flagged?: boolean }[]).find((row) => row.spot_id === SHRUNK_SPOT);
  assert.ok(
    flagged && flagged.flagged === true,
    `a spot with eighty mornings still sixty percent pooled away is a misconfiguration, and the file must flag it: ${JSON.stringify(rows)}.${failureContext()}`,
  );
});

// ---------- the third source rule (structural absence of shuffled folds) ----------

Then('the examination {word} it over the rule that held-out mornings must stay forward of training', function (verdict: string) {
  assertCvRuleVerdict(verdict);
});
