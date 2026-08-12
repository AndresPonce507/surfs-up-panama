// Accepted roadmap 04-04: "Selection weights: rare mornings count more,
// capped, asked plain", and its guard "A morning the site asked for counts
// plainly, wherever it lands".
//
// 06-learning-layer.md section 6.3, answering research 09 section 13.5a's
// selection bias -- the most serious hazard in the whole feedback loop. People
// post when it is good, so the labels are conditioned on the very thing the
// forecast is trying to predict, and a bias fitted only on good days corrects
// only good days. The standard fix, needing no extra collection: bucket days
// by the published score decile that was live that morning, read from
// log/calls/, and weight each report by the inverse of how often that kind of
// day gets reported at all. w_select = min(3, P_bar / P_hat(decile)).
//
// Solicited reports are exempt: `trigger = push_solicited` gets w_select = 1
// exactly. The site asked, so the morning is already close to a random sample
// of pushed days and has no rarity to correct for (09 section 13.5a fix 1).
//
// THE FIXTURE ISOLATES SELECTION FROM EVERY OTHER WEIGHT. The extra morning
// each run adds always agrees exactly with the report already standing on that
// day, so nobody disagrees with anybody and concordance is a flat 1 for every
// reporter; and it always lands on a day that already carried a report, so the
// propensity table it is weighed against is identical in every run. The only
// thing that differs between these runs is w_select.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const REGION_ID = "pa-pacific";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;

/** A quiet, flat kind of morning: published in the second decile, hardly ever reported. */
const RARELY_REPORTED_SCORE_Q = 25;
/** The kind of morning everybody posts about: eighth decile. */
const OFTEN_REPORTED_SCORE_Q = 85;

const RARE_DAYS = 20;
const RARE_DAYS_REPORTED = 4;
const COMMON_DAYS = 20;
const COMMON_DAYS_REPORTED = 16;
const REPORTERS = 6;

const ORDINARY_DIFFERENCE_M = -0.22;
const ORDINARY_SPREAD_M = 0.42;
/** The residual the three comparison mornings carry, far from the ordinary run of days. */
const STANDOUT_DIFFERENCE_M = 1.5;

/** The three days the extra morning can land on: one rare, one common, one nobody published a call for. */
const RARE_DAY = 1;
const COMMON_DAY = 21;
const UNPUBLISHED_DAY = 45;

const TOLERANCE = 1e-12;

class FixedClock {
  now(): Date {
    return new Date("2026-08-09T07:00:00.000Z");
  }
}

class MemoryLearningStore {
  private readonly values = new Map<string, string>();

  async list(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, body: string): Promise<void> {
    this.values.set(key, body);
  }
}

/** Days run backwards from the run's own morning so every one of them is inside the trailing ninety. */
function dayOf(index: number): string {
  const day = new Date("2026-08-08T12:00:00Z");
  day.setUTCDate(day.getUTCDate() - index);
  return day.toISOString().slice(0, 10);
}

function residualOf(index: number): number {
  if (index === RARE_DAY || index === COMMON_DAY || index === UNPUBLISHED_DAY) {
    return STANDOUT_DIFFERENCE_M;
  }
  return ORDINARY_DIFFERENCE_M + (index % 2 === 0 ? ORDINARY_SPREAD_M : -ORDINARY_SPREAD_M);
}

/** Which days the site published a call for, and how good it said they would be. */
function publishedCallDays(): { index: number; scoreQ: number }[] {
  const days: { index: number; scoreQ: number }[] = [];
  for (let index = 1; index <= RARE_DAYS; index += 1) {
    days.push({ index, scoreQ: RARELY_REPORTED_SCORE_Q });
  }
  for (let index = COMMON_DAY; index < COMMON_DAY + COMMON_DAYS; index += 1) {
    days.push({ index, scoreQ: OFTEN_REPORTED_SCORE_Q });
  }
  return days;
}

/** The mornings somebody actually reported: four of the twenty quiet ones, sixteen of the twenty good ones. */
function reportedDayIndexes(): number[] {
  const days: number[] = [];
  for (let index = RARE_DAY; index < RARE_DAY + RARE_DAYS_REPORTED; index += 1) days.push(index);
  for (let index = COMMON_DAY; index < COMMON_DAY + COMMON_DAYS_REPORTED; index += 1) {
    days.push(index);
  }
  days.push(UNPUBLISHED_DAY);
  return days;
}

type ExtraMorning = { onDay: number; solicited: boolean } | null;

function logsFor(extra: ExtraMorning): {
  observations: string;
  predictions: string;
  calls: { key: string; body: string }[];
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  const reported = reportedDayIndexes();

  for (const [order, index] of reported.entries()) {
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_sel_${order % REPORTERS}`,
      observed_at: `${dayOf(index)}T18:41:00Z`,
      size_band: "chest_head",
      trigger: "organic",
    });
  }

  if (extra !== null) {
    observations.push({
      spot_id: SPOT_ID,
      device_id: "d_sel_extra",
      observed_at: `${dayOf(extra.onDay)}T18:41:00Z`,
      size_band: "chest_head",
      trigger: extra.solicited ? "push_solicited" : "organic",
    });
  }

  // Every day the run could possibly pair against, published or not.
  for (let index = 0; index <= UNPUBLISHED_DAY; index += 1) {
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${dayOf(index)}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: CHEST_HEAD_MID_M + residualOf(index),
      swell_t_s: 10,
      land_masked: false,
    });
  }

  const calls = publishedCallDays().map(({ index, scoreQ }) => ({
    key: `log/calls/v1/dt=${dayOf(index)}/build=18Z/${REGION_ID}.jsonl.gz`,
    body: JSON.stringify({
      spot_id: SPOT_ID,
      valid_ts: `${dayOf(index)}T18:00:00Z`,
      score_q: scoreQ,
    }),
  }));

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
    calls,
  };
}

type StoredHeightKey = { b: number; n: number; reporters: number };

async function storedKeyFor(extra: ExtraMorning): Promise<StoredHeightKey> {
  const store = new MemoryLearningStore();
  const logs = logsFor(extra);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );
  for (const call of logs.calls) await store.put(call.key, call.body);

  await runLearningFitOnce({ store, clock: new FixedClock() });

  const body = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(body, "the run must have stored a correction record for the spot");
  const record = JSON.parse(body) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to its source and lead bucket");
  return key;
}

describe("04-04 acceptance: a morning of a kind nobody usually reports counts for more", () => {
  it("moves the stored difference further for a quiet morning than for the kind everybody posts about", async () => {
    const withoutIt = await storedKeyFor(null);
    const onAQuietMorning = await storedKeyFor({ onDay: RARE_DAY, solicited: false });
    const onTheKindEverybodyPosts = await storedKeyFor({
      onDay: COMMON_DAY,
      solicited: false,
    });

    assert.equal(
      onAQuietMorning.n,
      onTheKindEverybodyPosts.n,
      "test bug: the two runs must weigh the same number of mornings",
    );

    const quietMoved = Math.abs(onAQuietMorning.b - withoutIt.b);
    const popularMoved = Math.abs(onTheKindEverybodyPosts.b - withoutIt.b);
    assert.ok(
      quietMoved > popularMoved + TOLERANCE,
      `one more report on a kind of morning reported four times in twenty moved the stored difference ${quietMoved}, no further than the ${popularMoved} the same report moves it on a kind reported sixteen times in twenty: the fit is still learning only from the days people feel like posting about`,
    );
  });
});

describe("04-04 acceptance: a morning the site asked for counts plainly, wherever it lands", () => {
  it("gives an asked-for morning the same plain weight it gives a morning no call was ever published for", async () => {
    const askedFor = await storedKeyFor({ onDay: RARE_DAY, solicited: true });
    const volunteered = await storedKeyFor({ onDay: RARE_DAY, solicited: false });
    const noCallEverPublished = await storedKeyFor({
      onDay: UNPUBLISHED_DAY,
      solicited: false,
    });

    assert.ok(
      Math.abs(askedFor.b - noCallEverPublished.b) < TOLERANCE,
      `the morning the site asked for stored ${askedFor.b} where a morning carrying no rarity bonus at all stores ${noCallEverPublished.b}: an asked-for morning is being paid a bonus it did not earn`,
    );
    assert.ok(
      Math.abs(askedFor.b - volunteered.b) > TOLERANCE,
      `the same quiet morning stored ${askedFor.b} whether the site asked for it or somebody volunteered it: the trigger is not being read at all`,
    );
  });
});
