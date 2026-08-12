// Accepted roadmap 04-05: "Backfit the per-reporter offset; subtract the
// habit".
//
// 06-learning-layer.md section 5.2, the priced cost of decision 28. Cold
// capture removed the comparative field whose per-person size-inflation
// constant cancels for free, so the constant is ESTIMATED instead: backfitting,
// three fixed passes, key means and reporter offsets alternately, u_hat shrunk
// toward zero with tau_u = 4. Research 09 section 13.5c is why it matters --
// "per-user offset estimation catches persistent liars automatically" -- and
// 06 section 5.1 is where it enters: r_height = H_eff_pred - (mid - u_hat),
// subtracted before the residual is formed.
//
// HOW MUCH ACTUALLY COMES OUT, derived rather than assumed. The first version
// of this file read the 9 / (9 + 4) = 0.692 shrink weight straight off 06
// section 5.2's table and asserted that a little over two thirds of the habit
// would leave the stored difference. That arithmetic is wrong twice over, and
// both errors are the same one the five oracles this step repaired were making:
// it assumed the estimator re-centres, and it never did.
//
//   1. u_raw IS NOT THE HABIT. It is measured as (the key's own difference)
//      minus (the sample's residual), and the key's own difference ALREADY
//      carries the habit's pull -- at Pacific the big-caller is 5 of 17
//      mornings, so b sits near -0.19 before any correction and u_raw comes out
//      near 0.46 rather than the 0.65 they actually inflate by. Only then is
//      the 0.692 shrink applied, landing u near 0.354 after three passes.
//
//   2. EVERY REPORTER CARRIES AN OFFSET, the six honest ones included (the
//      model is report = truth + u_r + eps for everybody, and the unit laws
//      defend this directly: a fit that decided in advance who has no habit
//      would drain the beach's own difference into the people). Their u_raw is
//      (b - their own residual), and because b is negative those six do NOT
//      cancel -- three sit near -0.22 and three near +0.08, summing to about
//      -0.41 across 24 samples. That pushes b back DOWN and eats most of what
//      step 1 took out. Offsets shrunk toward ZERO do not sum to zero over a
//      key; that is exactly what makes this step subtract anything at all, and
//      it is also why it subtracts less than the table's weight suggests.
//
// Net at Pacific: the stored difference moves from -0.1912 (the big-caller
// believed outright) to -0.1361, so 29 per cent of their pull comes out and 71
// per cent still stands. Never zero and never all of it, which is the shape the
// shrink guarantees; the SIZE is what the two corrections above fix.
//
// THE FIXTURE ISOLATES THE OFFSET FROM EVERY OTHER WEIGHT. The habitual
// reporter reports on mornings nobody else reported, so nobody ever
// co-observes them and 04-03's rule gives them a flat full voice; there is no
// call log, so no rarity bonus exists; every report names the same band, so
// the precision weights cancel out of a weighted mean entirely. The two spots
// sit on DIFFERENT COASTS, which is a hard partition in the pooling ladder, so
// each spot's parent is itself and the stored difference is exactly that
// spot's own weighted mean. That is what lets this file compute the
// counterfactual by hand.
//
// THE ORACLE'S OWN CORRECTNESS IS CHECKED AT RED. With no estimator in the
// code, the measured share of full trust must come out at 1.0 to within a
// billionth. It did (see the contract's red_evidence), which is what proves
// the hand-computed counterfactual, the two-coast partition and the
// shrink-is-the-identity assumption all at once.
//
// AND THE PINNED SHARE HAS TEETH OF ITS OWN, because a lone pinned number
// cannot tell a working estimator from a differently-broken one. The second
// example below runs the SAME nine mornings, the same residuals and the same
// share of the evidence through three identities instead of one. Nothing about
// the beach changes; only n_r does, from 9 to 4/3/2. Less of the habit comes
// out, which is 06 section 5.2's table read as a claim about the world rather
// than as a formula -- and it is the anti-Sybil direction stated in the ADR's
// identifiability rider: fragmenting an identity buys a persistent big-caller
// LESS correction of their reports, never more.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;

const PACIFIC_SPOT = "playa-venao";
const CARIBBEAN_SPOT = "isla-grande";

/** How much bigger than the forecast the habitual reporter calls every single morning. */
const HABIT_M = 0.65;
/** Nine mornings TOTAL across the two beaches, which is what makes the habit identifiable. */
const HABIT_MORNINGS_PACIFIC = 5;
const HABIT_MORNINGS_CARIBBEAN = 4;

const HONEST_MORNINGS = 12;
const HONEST_REPORTERS = 6;
/** The honest mornings disagree with the forecast either way in equal measure, so their own mean is zero. */
const HONEST_SPREAD_M = 0.3;

const HABIT_DEVICE = "d_calls_it_big";
/** The same nine mornings, reported under three names instead of one. */
const SPLIT_IDENTITIES = 3;

/**
 * How much of the big-caller's pull on the stored difference is still standing
 * once their habit has been measured and taken out, per beach. Derived in this
 * file's header; Caribbean keeps more than Pacific because the big-caller is a
 * smaller share of its mornings (4 of 16 against 5 of 17), so less of the
 * habit is identifiable there.
 */
const STILL_STANDING: Record<string, number> = {
  [PACIFIC_SPOT]: 0.7120355894422012,
  [CARIBBEAN_SPOT]: 0.776043727247013,
};
const PINNED_TOLERANCE = 1e-9;

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

const SEEDS: SpotSeed[] = [
  { spot_id: PACIFIC_SPOT, region_id: "pa-pacific", coast: "pacific", break_type: "beach" },
  { spot_id: CARIBBEAN_SPOT, region_id: "pa-caribbean", coast: "caribbean", break_type: "beach" },
];

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

function habitMorningsAt(spotId: string): number {
  return spotId === PACIFIC_SPOT ? HABIT_MORNINGS_PACIFIC : HABIT_MORNINGS_CARIBBEAN;
}

/**
 * Who reported the big-caller's mornings. The mornings themselves, their
 * forecasts and their residuals are identical in all three: only the NAME on
 * them changes, which is the only thing n_r can see.
 */
type BigCaller = "nobody" | "one person" | "three names";

function logsFor(reportedBy: BigCaller): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (const spotId of [PACIFIC_SPOT, CARIBBEAN_SPOT]) {
    for (let index = 0; index < HONEST_MORNINGS; index += 1) {
      const day = dayOf(index);
      observations.push({
        spot_id: spotId,
        device_id: `d_honest_${index % HONEST_REPORTERS}`,
        observed_at: `${day}T18:41:00Z`,
        size_band: "chest_head",
      });
      predictions.push({
        spot_id: spotId,
        source: SOURCE,
        valid_ts: `${day}T18:00:00Z`,
        lead_h: 36,
        swell_h_m:
          CHEST_HEAD_MID_M + (index % 2 === 0 ? HONEST_SPREAD_M : -HONEST_SPREAD_M),
        swell_t_s: 10,
        land_masked: false,
      });
    }

    // The habitual reporter's own mornings: nobody else was out those days, so
    // nothing but their own habit can explain the difference they leave.
    for (let index = 0; index < habitMorningsAt(spotId); index += 1) {
      const day = dayOf(HONEST_MORNINGS + index);
      if (reportedBy !== "nobody") {
        observations.push({
          spot_id: spotId,
          device_id:
            reportedBy === "one person"
              ? HABIT_DEVICE
              : `${HABIT_DEVICE}_${index % SPLIT_IDENTITIES}`,
          observed_at: `${day}T18:41:00Z`,
          size_band: "chest_head",
        });
      }
      predictions.push({
        spot_id: spotId,
        source: SOURCE,
        valid_ts: `${day}T18:00:00Z`,
        lead_h: 36,
        // The forecast said this much; they called it chest-to-head anyway.
        swell_h_m: CHEST_HEAD_MID_M - HABIT_M,
        swell_t_s: 10,
        land_masked: false,
      });
    }
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

type StoredHeightKey = { b: number; n: number; reporters: number };

async function storedFor(
  reportedBy: BigCaller,
): Promise<Map<string, { key: StoredHeightKey; body: string }>> {
  const store = new MemoryLearningStore();
  const logs = logsFor(reportedBy);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );
  await runLearningFitOnce({ store, clock: new FixedClock(), spots: SEEDS });

  const stored = new Map<string, { key: StoredHeightKey; body: string }>();
  for (const spotId of [PACIFIC_SPOT, CARIBBEAN_SPOT]) {
    const body = await store.get(`learned/corrections/v1/current/${spotId}.json`);
    assert.ok(body, `the run must have stored a correction record for ${spotId}`);
    const record = JSON.parse(body) as {
      bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
    };
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key, `${spotId}'s difference must stay keyed to its source and lead bucket`);
    stored.set(spotId, { key, body });
  }
  return stored;
}

/**
 * What the spot would store if the habit were believed outright. Every report
 * names the same band, so the precision weights cancel and the stored
 * difference is the plain mean of the residuals; the honest mornings average
 * to exactly zero by construction, so all that is left is the habit's share.
 */
function differenceIfTheHabitWereBelieved(spotId: string): number {
  const habitMornings = habitMorningsAt(spotId);
  return (habitMornings * -HABIT_M) / (HONEST_MORNINGS + habitMornings);
}

/** How much of the big-caller's full pull on the stored difference survives the correction. */
function shareStillStanding(heard: number, absent: number, believed: number): number {
  return Math.abs(heard - absent) / Math.abs(believed - absent);
}

describe("04-05 acceptance: a habit of calling it big, seen at two beaches, is measured and part of it taken out", () => {
  it("moves the stored difference back up by the share the estimator can actually identify", async () => {
    const withTheHabit = await storedFor("one person");
    const withoutThem = await storedFor("nobody");

    for (const spotId of [PACIFIC_SPOT, CARIBBEAN_SPOT]) {
      const heard = withTheHabit.get(spotId)!.key;
      const absent = withoutThem.get(spotId)!.key;
      const believed = differenceIfTheHabitWereBelieved(spotId);

      assert.equal(
        heard.n,
        HONEST_MORNINGS + habitMorningsAt(spotId),
        `test bug: ${spotId} must weigh every morning the fixture wrote`,
      );

      const stillStanding = shareStillStanding(heard.b, absent.b, believed);

      // The direction, which a share cannot say on its own. Somebody who calls
      // it bigger than the forecast drags the stored difference down; taking
      // their habit out has to bring it back UP, toward where the mornings
      // nobody doubted already sit.
      assert.ok(
        heard.b > believed,
        `${spotId} stored ${heard.b}, at or below the ${believed} believing the big-caller outright would leave: the habit was added rather than subtracted`,
      );
      assert.ok(
        stillStanding > 0,
        `${spotId} carries none of the habit at all: an offset shrunk toward zero can never be trusted completely, and subtracting all of a nine-morning habit would be exactly that`,
      );
      assert.ok(
        stillStanding < 1,
        `${spotId} still carries ${stillStanding} of the habit a believed reporter leaves, which is all of it: nine mornings across two beaches is past 06 section 5.2's half-weight row and some of the habit has to have been identified`,
      );

      // The size, derived in this file's header rather than read off the
      // shrink table: u_raw is measured against a difference that already
      // carries the habit, and every honest reporter carries an offset of
      // their own that does not cancel.
      assert.ok(
        Math.abs(stillStanding - STILL_STANDING[spotId]!) < PINNED_TOLERANCE,
        `${spotId} left ${stillStanding} of the big-caller's pull standing, not the derived ${STILL_STANDING[spotId]}`,
      );
    }
  });

  it("takes less of the same habit out when the same mornings are reported under three names", async () => {
    // Identical mornings, identical forecasts, identical residuals, identical
    // share of every key's evidence. The ONLY difference is how many reports
    // each identity carries: nine for one person, four and three and two for
    // three of them. 06 section 5.2's table says the second case earns less
    // trust, so less of the habit may be subtracted -- and that direction is
    // the anti-Sybil one, since it means splitting an identity can never buy a
    // persistent big-caller MORE correction than owning their record.
    const onePerson = await storedFor("one person");
    const threeNames = await storedFor("three names");
    const withoutThem = await storedFor("nobody");

    for (const spotId of [PACIFIC_SPOT, CARIBBEAN_SPOT]) {
      const absent = withoutThem.get(spotId)!.key.b;
      const believed = differenceIfTheHabitWereBelieved(spotId);
      const asOnePerson = shareStillStanding(onePerson.get(spotId)!.key.b, absent, believed);
      const asThreeNames = shareStillStanding(threeNames.get(spotId)!.key.b, absent, believed);

      assert.equal(
        threeNames.get(spotId)!.key.n,
        onePerson.get(spotId)!.key.n,
        `test bug: ${spotId} must weigh the same mornings either way, or this compares two different fixtures rather than two identity shapes`,
      );
      assert.ok(
        asOnePerson < asThreeNames,
        `${spotId} left ${asOnePerson} of the habit standing when one person owned all nine mornings and ${asThreeNames} when three names split them. Owning the record has to buy MORE correction, not less: n_r counts a person's reports, and a habit spread thin across identities is one nobody has enough evidence about`,
      );
    }
  });

  it("names no reporter and carries no offset anywhere in what it stores", async () => {
    const withTheHabit = await storedFor("one person");

    for (const spotId of [PACIFIC_SPOT, CARIBBEAN_SPOT]) {
      const body = withTheHabit.get(spotId)!.body;
      for (const forbidden of [HABIT_DEVICE, "d_honest_", "u_hat", "u_raw", "offset", "reporter_key"]) {
        assert.ok(
          !body.includes(forbidden),
          `${spotId}'s stored correction contains "${forbidden}". Nothing under learned/ may name a reporter or carry a per-person offset: the estimate exists to correct a beach, not to keep a file on anybody.`,
        );
      }
    }
  });
});
