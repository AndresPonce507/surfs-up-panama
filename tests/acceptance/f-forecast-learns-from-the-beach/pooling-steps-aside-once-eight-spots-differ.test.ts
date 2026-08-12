// Accepted roadmap 03-04: "Tau estimated at eight gated spots, floored
// forever".
//
// Research 09 section 17.4 says never hand-set tau: estimate it, and a
// correctly fitted hierarchy then degrades gracefully to no pooling when spots
// genuinely differ. 06 section 5.3 answers honestly that at one region with a
// handful of gated spots sigma_between is unidentifiable, so the launch tau is
// a hand-set prior WITH a floor and a stated switchover: method of moments,
// adopted once eight spots have passed the gates, tau never below 2.
//
// The oracle READS TAU OFF THE RECORD. Every stored key carries
// `shrunk_from_global`, which is tau/(n+tau) for the tau that key was actually
// pooled at, so the switchover can be observed directly instead of inferred
// from how far a stored difference ended up sitting from its own mornings.
//
// The mornings at each spot deliberately disagree with each other. Identical
// residuals would drive se_sample to zero, the physical noise floor would bind
// on every key, and the estimated within-spot variance would be an artifact of
// that floor rather than a measurement.
//
// AMENDED 2026-08-12 BY 04-05, cross-slice by explicit authorisation (see that
// step's contract). This file belongs to 03-04.
//
// WHAT THE OLD ORACLE ASSUMED: that the fit's estimate at a spot is the mean
// of the mornings this fixture wrote, so the distance from `ownDifference` is
// exactly (tau / (mornings + tau)) x |own - parent| and tau can be read back
// out of it.
//
// WHY IT WAS WRONG: 06 section 5.2 measures a reporter's habit against
// `b_hat`, the key's SHRUNK estimate, not against its raw mean. So every
// reporter at a pooled spot carries an offset equal to a shrunken share of
// that spot's own pooling gap, which drags the spot's raw estimate toward its
// parent BEFORE the shrink runs. The distance from `ownDifference` is
// therefore no longer a function of tau alone, and here it comes out about 27
// per cent larger than the arithmetic predicts. Note this is not about the
// fixture's reporters being unbalanced: pairing each device across the two
// parities instead of within one moves spot-0's distance from 0.152802 to
// 0.152604, which is nothing. The feedback is structural and applies to every
// pooled spot however its mornings are handed out.
//
// AND THE OLD ORACLE'S SECOND HALF NOW PASSES FOR A FALSE REASON, which is the
// worse half of this finding and the reason the repair is a rewrite rather
// than a new constant. It asserted the stored difference sits FURTHER from its
// own mornings than the permanent floor allows, "or tau was clamped to its
// floor rather than estimated". With the offset stage in, tau at eight proven
// spots IS the floor: `shrunk_from_global` comes back as 0.142857, exactly
// 2/(12+2), where before this stage it was 0.250371. The assertion still
// passed only because the offset feedback inflated the distance past the
// hand-computed floor line. A test that passes while the sentence in its own
// failure message has become false is worth less than no test.
//
// The tau move itself is the design working, not a regression: taking each
// reporter's habit out removes observer noise from the within-spot spread, so
// eight genuinely different spots look more different against their own noise,
// the method-of-moments sigma_between grows, tau falls and pooling steps
// further aside. 09 section 17.4's "if spots truly differ, pooling
// self-cancels" is the sentence being obeyed. Landing on the floor is the
// floor doing its job.
//
// WHAT REPLACES THE FLOOR ASSERTION. Proving tau is MEASURED rather than
// clamped at eight spots now needs a comparison the data drives, so the second
// example runs the same eight spots half as far apart and asserts they pool
// MORE. Spots that differ wildly step aside to the floor; spots that differ
// half as much hold on hard (0.80 against 0.14). No implementation that clamps
// to the floor at eight spots can produce both.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { TAU_FLOOR, TAU_SPOT_PRIOR } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const TOLERANCE = 1e-6;

const MORNINGS = 12;
const REPORTERS = 6;

/**
 * Eight spots that all read the forecast running big, by wildly different
 * amounts. Centred well away from zero so every one of them clears the
 * significance gate, and spread far enough apart that the between-spot
 * variance is large against the within-spot noise -- which is the condition
 * under which a fitted tau is supposed to stop pooling.
 */
const CENTRE_M = 0.7;
const OFFSETS_M = [-0.36, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.36];
/** How far each spot's own mornings disagree with each other, alternating either side. */
const WITHIN_SPOT_SPREAD_M = 0.45;

class FixedClock {
  now(): Date {
    return new Date(CLOCK_ISO);
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

type Spot = {
  readonly spotId: string;
  readonly ownDifference: number;
  readonly reporters: number;
};

function eightSpots(reportersAtTheLastSpot = REPORTERS, spreadScale = 1): Spot[] {
  return OFFSETS_M.map((offset, index) => ({
    spotId: `spot-${index}`,
    ownDifference: CENTRE_M + offset * spreadScale,
    reporters: index === OFFSETS_M.length - 1 ? reportersAtTheLastSpot : REPORTERS,
  }));
}

/** The same eight spots, half as far apart from each other. Their own mornings disagree just as much. */
const HALF_AS_FAR_APART = 0.5;

function seedsFor(spots: readonly Spot[]): SpotSeed[] {
  return spots.map((spot) => ({
    spot_id: spot.spotId,
    region_id: "pa-pacific",
    coast: "pacific",
    break_type: "beach",
  }));
}

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

function logsFor(spots: readonly Spot[]): { observations: string; predictions: string } {
  const observations: string[] = [];
  const predictions: string[] = [];
  for (const spot of spots) {
    for (let index = 0; index < MORNINGS; index += 1) {
      const day = dayOf(index);
      const deviation = index % 2 === 0 ? -WITHIN_SPOT_SPREAD_M : WITHIN_SPOT_SPREAD_M;
      observations.push(
        JSON.stringify({
          spot_id: spot.spotId,
          device_id: `d_${spot.spotId}_${index % spot.reporters}`,
          observed_at: `${day}T18:41:00Z`,
          size_band: "chest_head",
        }),
      );
      predictions.push(
        JSON.stringify({
          spot_id: spot.spotId,
          source: SOURCE,
          valid_ts: `${day}T18:00:00Z`,
          lead_h: 36,
          swell_h_m: CHEST_HEAD_MID_M + spot.ownDifference + deviation,
          swell_t_s: 10,
          land_masked: false,
        }),
      );
    }
  }
  return { observations: observations.join("\n"), predictions: predictions.join("\n") };
}

type StoredHeightKey = {
  b: number;
  n: number;
  reporters: number;
  applied: boolean;
  /** tau / (n + tau) for the tau this key was pooled at: the switchover, observed rather than inferred. */
  shrunk_from_global: number;
};

/** What share of a spot's estimate its parent carries at a given pooling strength. */
function parentShareAt(tau: number): number {
  return tau / (MORNINGS + tau);
}

async function runOver(spots: readonly Spot[]): Promise<Map<string, StoredHeightKey>> {
  const store = new MemoryLearningStore();
  const logs = logsFor(spots);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock(), spots: seedsFor(spots) });

  const keys = new Map<string, StoredHeightKey>();
  for (const spot of spots) {
    const body = await store.get(`learned/corrections/v1/current/${spot.spotId}.json`);
    assert.ok(body, `the run must have stored a correction file for ${spot.spotId}`);
    const record = JSON.parse(body) as {
      bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
    };
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key, `${spot.spotId}'s difference must stay keyed to its source and lead bucket`);
    keys.set(spot.spotId, key);
  }
  return keys;
}

describe("03-04 acceptance: once eight spots have proven themselves different, pooling steps aside on its own", () => {
  it("pools every proven spot below the hand-set prior, and never below the permanent floor", async () => {
    const spots = eightSpots();
    const stored = await runOver(spots);

    for (const spot of spots) {
      const key = stored.get(spot.spotId)!;
      assert.equal(
        key.applied,
        true,
        `${spot.spotId} must pass the gates, or there are not eight proven spots and the estimator never runs`,
      );

      assert.ok(
        key.shrunk_from_global < parentShareAt(TAU_SPOT_PRIOR) - TOLERANCE,
        `${spot.spotId} was pooled at ${key.shrunk_from_global} of its parent, no less than the hand-set prior's ${parentShareAt(TAU_SPOT_PRIOR)}: with eight proven spots the method of moments must have taken over and pooling must have stepped aside`,
      );
      assert.ok(
        key.shrunk_from_global >= parentShareAt(TAU_FLOOR) - TOLERANCE,
        `${spot.spotId} was pooled at ${key.shrunk_from_global} of its parent, below the ${parentShareAt(TAU_FLOOR)} the permanent floor allows: tau may never go under ${TAU_FLOOR}, however different the spots look`,
      );
      assert.notEqual(
        key.b,
        spot.ownDifference,
        `${spot.spotId} reached its own mornings exactly, which no floored tau can ever permit`,
      );
    }
  });

  it("pools harder when the same eight spots differ half as much, so the estimator is measuring and not clamping", async () => {
    // The floor assertion this replaces used to carry the whole weight of
    // "the estimator is not decoration". It cannot any more: at this fixture's
    // spread tau LANDS on the floor, honestly, so "strictly above the floor"
    // is no longer a true sentence about a working implementation. What still
    // separates a measurement from a clamp is whether tau answers the data, so
    // here is the same fixture with the spots half as far apart -- same
    // mornings each, same within-spot disagreement, same gates, only the
    // between-spot spread halved. Pooling has to hold on harder. Nothing that
    // clamps to a constant at eight proven spots can produce both numbers.
    const wildlyDifferent = await runOver(eightSpots());
    const halfAsDifferent = await runOver(eightSpots(REPORTERS, HALF_AS_FAR_APART));

    for (const spot of eightSpots()) {
      const apart = wildlyDifferent.get(spot.spotId)!;
      const closer = halfAsDifferent.get(spot.spotId)!;
      assert.equal(
        closer.applied,
        true,
        `${spot.spotId} must still pass the gates when the spots are closer together, or the two runs are not comparable`,
      );
      assert.ok(
        closer.shrunk_from_global > apart.shrunk_from_global + TOLERANCE,
        `${spot.spotId} kept ${closer.shrunk_from_global} of its parent when the spots differ half as much and ${apart.shrunk_from_global} when they differ fully. Spots that are harder to tell apart must be pooled MORE, or tau is a constant wearing an estimator's name`,
      );
    }
  });

  it("leaves the hand-set prior standing while only seven spots have proven themselves", async () => {
    const spots = eightSpots(4);
    const stored = await runOver(spots);
    const eightProven = await runOver(eightSpots());
    const oneShort = spots[spots.length - 1]!;

    assert.equal(
      stored.get(oneShort.spotId)!.applied,
      false,
      "four reporters must leave the eighth spot below G2, or this run still has eight proven spots",
    );

    for (const spot of spots) {
      const key = stored.get(spot.spotId)!;
      // Read off the record rather than inferred from a distance. The distance
      // from `ownDifference` stopped being a function of tau alone once the
      // per-reporter offset began measuring habits against each key's SHRUNK
      // estimate; the weight the record stores never stopped being one.
      assert.ok(
        Math.abs(key.shrunk_from_global - parentShareAt(TAU_SPOT_PRIOR)) < TOLERANCE,
        `with only seven proven spots ${spot.spotId} must still be pooled at the hand-set prior's ${parentShareAt(TAU_SPOT_PRIOR)}, not at ${key.shrunk_from_global}`,
      );

      // And the consequence on the stored number itself, so the weight above is
      // tied to something a reader of the file would actually see: more pooling
      // means every spot is dragged further from its own mornings than the
      // eight-proven run leaves it.
      const pulledFromItsOwnMornings = Math.abs(key.b - spot.ownDifference);
      const onceEightHaveProven = Math.abs(
        eightProven.get(spot.spotId)!.b - spot.ownDifference,
      );
      assert.ok(
        pulledFromItsOwnMornings > onceEightHaveProven + TOLERANCE,
        `${spot.spotId} sits ${pulledFromItsOwnMornings} from its own mornings at the prior and ${onceEightHaveProven} once eight spots have proven themselves: the prior has to pool harder than the estimate that replaces it, or the switchover changes nothing a surfer would ever read`,
      );
    }
  });
});
