// Accepted roadmap 04-02: "Winsorize the wild claim at the day fence".
//
// 06-learning-layer.md section 6.2 step 2: per (spot, day), once three or more
// device-samples exist, residuals are winsorized at two band widths either
// side of the spot-day median. Research 09 section 13.5c's fix for gaming,
// trolling and localism: the median is robust to a single outlier by
// construction, and a claim past the fence is pulled back to it rather than
// thrown away. Below three device-samples there is nothing to be robust
// against and no same-day robustification applies; shrinkage and the clamp
// are the backstop.
//
// THE FENCE IS TWO WIDTHS OF THE DAY-MEDIAN'S BAND, measured from the spot-day
// median residual. Here the median morning is a chest-to-head report, 1.1 m to
// 1.6 m, so the fence is 2 x 0.5 = 1.0 m either side.
//
// THE ORACLE IS A TWIN RUN, not hand arithmetic over the whole fixture. A run
// where somebody makes a wild claim on a well-watched morning must store
// exactly what a run where they claimed the fence itself stores -- same band,
// so the same precision weight, and after clipping the same value. That is
// criterion 2 read literally: no further than a claim pinned at the fence
// could move it. The same trick proves the absence below three witnesses: a
// wild claim on a two-witness morning must store exactly what the same claim
// stores on a morning nobody else reported, which is only true if no fence
// touched either.
//
// THE WILD CLAIM IS ANKLE-TO-KNEE, "it was tiny, do not bother driving out" --
// research 09 section 13.5c's documented localism, under-reporting a spot to
// keep it empty -- and NOT the open top band the roadmap sketched. The open
// band has no upper edge and therefore no width, so on a two-report morning it
// is the median that carries no fence at all, and the run comes out identical
// whether the fence fires at two device-samples or at three. A fixture that
// cannot tell those two apart cannot prove criterion 3. Found by mutation, not
// by reading: fencing at two instead of three passed this file until the claim
// moved to a band with two edges.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";

/** The band the honest mornings report, and the one the fence is measured in (1.1 m to 1.6 m). */
const CHEST_HEAD_MID_M = 1.35;
const CHEST_HEAD_WIDTH_M = 0.5;
/** The band the wild claim names: ankle to knee, 0.1 m to 0.4 m. */
const ANKLE_KNEE_MID_M = 0.25;
/** 06 section 6.2 step 2: two band widths of the day median's band. */
const FENCE_M = 2 * CHEST_HEAD_WIDTH_M;

const MORNINGS = 22;
const REPORTERS = 7;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
/** The watched morning is index 0, whose own residual is the number the fence is centred on. */
const WATCHED_MORNING_RESIDUAL_M = RAW_DIFFERENCE_M + SAMPLE_SPREAD_M;
const TOLERANCE = 1e-12;

/** What claiming ankle to knee on the watched morning works out to, unfenced. */
const WILD_RESIDUAL_M =
  CHEST_HEAD_MID_M + WATCHED_MORNING_RESIDUAL_M - ANKLE_KNEE_MID_M;
/** The furthest the fence lets that claim reach. */
const FENCED_RESIDUAL_M = WATCHED_MORNING_RESIDUAL_M + FENCE_M;

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

function dayOf(index: number): string {
  return `2026-07-${String(index + 1).padStart(2, "0")}`;
}

function residualOf(index: number): number {
  return RAW_DIFFERENCE_M + (index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M);
}

type WildClaim =
  /** The extra reporter saw what everyone else saw. */
  | "honest"
  /** Ankle to knee, on the same morning everyone else reported chest to head. */
  | "as_reported"
  /** The same tiny claim, on its own hour of that morning, sized to land exactly on the fence. */
  | "pinned_at_the_fence"
  /** The same tiny claim, moved to a morning nobody else reported. */
  | "on_a_morning_of_its_own";

type Fixture = {
  /** Whether a second honest reporter watched the wild morning, which is what makes it three-deep. */
  readonly watchedByAThirdReporter: boolean;
  readonly wildClaim: WildClaim;
  /** How many times the wild reporter pressed send. */
  readonly wildSubmissions?: number;
};

/**
 * Twenty-two mornings at one spot. Every ordinary morning is one chest-to-head
 * report against that morning's forecast. The wild reporter always exists;
 * what they claimed, on which hour and with how many witnesses is the knob.
 */
function reportedMornings(fixture: Fixture): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < MORNINGS; index += 1) {
    const day = dayOf(index);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_win_${index % REPORTERS}`,
      observed_at: `${day}T18:41:00Z`,
      size_band: "chest_head",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${day}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: CHEST_HEAD_MID_M + residualOf(index),
      swell_t_s: 10,
      land_masked: false,
    });
  }

  const watchedDay = dayOf(0);
  if (fixture.watchedByAThirdReporter) {
    observations.push({
      spot_id: SPOT_ID,
      device_id: "d_win_witness",
      observed_at: `${watchedDay}T18:41:00Z`,
      size_band: "chest_head",
    });
  }

  const wild = wildReport(fixture.wildClaim);
  for (let submission = 0; submission < (fixture.wildSubmissions ?? 1); submission += 1) {
    observations.push({
      spot_id: SPOT_ID,
      device_id: "d_win_wild",
      observed_at: `${wild.day}T${wild.hour}:${String(41 + submission * 2).padStart(2, "0")}:00Z`,
      size_band: wild.band,
    });
  }
  if (wild.prediction !== null) predictions.push(wild.prediction);

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

/**
 * Where the wild reporter reported, what they claimed, and the forecast row
 * their claim is measured against. The two variants that need an exact
 * residual get an hour of their own so the forecast can be sized for them; the
 * others ride the morning's shared 18:00 row.
 */
function wildReport(claim: WildClaim): {
  day: string;
  hour: string;
  band: string;
  prediction: object | null;
} {
  if (claim === "honest") {
    return { day: dayOf(0), hour: "18", band: "chest_head", prediction: null };
  }
  if (claim === "as_reported") {
    return { day: dayOf(0), hour: "18", band: "ankle_knee", prediction: null };
  }
  const [day, residual] =
    claim === "pinned_at_the_fence"
      ? [dayOf(0), FENCED_RESIDUAL_M]
      : [dayOf(MORNINGS), WILD_RESIDUAL_M];
  const hour = claim === "pinned_at_the_fence" ? "19" : "18";
  return {
    day,
    hour,
    band: "ankle_knee",
    prediction: {
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${day}T${hour}:00:00Z`,
      lead_h: 36,
      swell_h_m: ANKLE_KNEE_MID_M + residual,
      swell_t_s: 10,
      land_masked: false,
    },
  };
}

type StoredHeightKey = { b: number; n: number; reporters: number; applied: boolean };

async function storedFor(fixture: Fixture): Promise<{ body: string; key: StoredHeightKey }> {
  const store = new MemoryLearningStore();
  const logs = reportedMornings(fixture);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock() });

  const body = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(body, "the run must have stored a correction record for the spot");
  const record = JSON.parse(body) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to its source and lead bucket");
  return { body, key };
}

describe("04-02 acceptance: a wild claim on a well-watched morning is pulled to the day's fence", () => {
  it("moves the stored difference exactly as far as a claim pinned at the fence, and no further", async () => {
    const wild = await storedFor({ watchedByAThirdReporter: true, wildClaim: "as_reported" });
    const pinned = await storedFor({
      watchedByAThirdReporter: true,
      wildClaim: "pinned_at_the_fence",
    });
    const honest = await storedFor({ watchedByAThirdReporter: true, wildClaim: "honest" });

    assert.equal(
      wild.key.n,
      pinned.key.n,
      "test bug: the two runs must weigh the same number of mornings",
    );
    assert.ok(
      Math.abs(wild.key.b - pinned.key.b) < TOLERANCE,
      `a double-overhead claim moved the stored difference to ${wild.key.b}, past the ${pinned.key.b} a claim pinned at the day's fence reaches: the claim was believed instead of fenced`,
    );
    assert.ok(
      Math.abs(wild.key.b - honest.key.b) > TOLERANCE,
      `the wild claim left the stored difference at ${honest.key.b}, exactly where an honest morning leaves it: a fenced claim must still be heard, never silenced`,
    );
  });

  it("leaves a claim nobody else watched entirely unfenced", async () => {
    const twoWitnesses = await storedFor({
      watchedByAThirdReporter: false,
      wildClaim: "as_reported",
    });
    const alone = await storedFor({
      watchedByAThirdReporter: false,
      wildClaim: "on_a_morning_of_its_own",
    });

    assert.equal(
      twoWitnesses.key.n,
      alone.key.n,
      "test bug: the two runs must weigh the same number of mornings",
    );
    assert.ok(
      Math.abs(twoWitnesses.key.b - alone.key.b) < TOLERANCE,
      `two device-samples on one morning stored ${twoWitnesses.key.b} where the same claim standing alone stored ${alone.key.b}: something robustified a morning that had nothing to be robust against`,
    );
  });

  it("collapses the session before it fences the morning, never the other way round", async () => {
    const submittedOnce = await storedFor({
      watchedByAThirdReporter: true,
      wildClaim: "as_reported",
    });
    const submittedThreeTimes = await storedFor({
      watchedByAThirdReporter: true,
      wildClaim: "as_reported",
      wildSubmissions: 3,
    });

    assert.equal(
      submittedThreeTimes.body,
      submittedOnce.body,
      "a wild claim submitted three times must store the bytes it stores submitted once: fencing before collapsing would let the repeats become the morning's median and fence the honest reporters instead",
    );
  });
});
