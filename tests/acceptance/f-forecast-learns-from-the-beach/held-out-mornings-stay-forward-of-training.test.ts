// Accepted roadmap 05-03: "Shuffled time refused structurally".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: a rule over source text whose entire output is a violations
// list; nothing executes, nothing renders. The examination's report is the
// observable universe.
//
// Scratch-universe pattern per tests/unit/learning-declarations.test.ts: tiny
// source universes are written to a temp root as real files, and the
// examination reads them from disk -- it never imports what it examines, so a
// universe that would crash if executed still gets judged. Random k-fold must
// be STRUCTURALLY ABSENT, not merely unused (06 s7 G7): consecutive hours of
// one swell are near-duplicates, so a shuffled split leaks the very thing it
// claims to hold out and flatters whatever it judges.
//
// SUPERSESSION NOTE: slice-01's pin "only the two named rules may produce a
// violation" is superseded by this third rule (recorded in
// distill/red-classification-slice-05.md). The cross-talk audit below keeps
// the two slice-01 rules silent over both CV universes.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, it } from "vitest";

import {
  RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
  RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
  evaluateLearningDeclarations,
} from "../../../src/learning/declarations";

/** Rule three, pinned by the accepted roadmap 05-03 criteria. */
const RULE_HELD_OUT_STAYS_FORWARD =
  "held-out-mornings-must-stay-forward-of-training";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "learning-cv-declarations-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeUniverse(files: Record<string, string>): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, contents, "utf8");
  }
}

/** A cross-validation whose folds shuffle time: the one shape G7 bans outright. */
const SHUFFLED_UNIVERSE: Record<string, string> = {
  "evaluation.ts": [
    "export const CV_SCHEME = {",
    "  kind: 'shuffled_k_fold',",
    "  folds: 10,",
    "  shuffle: true,",
    "} as const;",
  ].join("\n"),
};

/** The one legal shape: rolling-origin blocked time splits, held-out block strictly forward. */
const FORWARD_UNIVERSE: Record<string, string> = {
  "evaluation.ts": [
    "export const CV_SCHEME = {",
    "  kind: 'rolling_origin_blocked',",
    "  train_weeks: [1, 8],",
    "  test_weeks: [9, 10],",
    "} as const;",
  ].join("\n"),
};

describe("05-03 acceptance: held-out mornings stay forward of training, never shuffled with it", () => {
  it("refuses a declared CV scheme whose folds shuffle time, naming the rule and the file", async () => {
    await writeUniverse(SHUFFLED_UNIVERSE);

    const report = await evaluateLearningDeclarations({ root });

    const fired = report.violations.filter(
      (violation) => violation.rule === RULE_HELD_OUT_STAYS_FORWARD,
    );
    assert.ok(
      fired.length > 0,
      `this universe shuffles time and the examination let it through: a shuffled split flatters every correction it judges, so the kill switch built on it would be blind (06 s7 G7). Violations reported: ${
        report.violations.map((violation) => violation.rule).join(", ") ||
        "none"
      }`,
    );
    assert.ok(
      fired.some((violation) =>
        (violation.detail ?? "").includes(join(root, "evaluation.ts")),
      ),
      `the refusal must name the file that declared the shuffled scheme, or nobody can fix it: ${JSON.stringify(fired)}`,
    );

    // Cross-talk audit (roadmap 05-03 notes): this universe declares no
    // residual forms and no applied literal, so neither slice-01 rule may fire.
    assert.deepEqual(
      report.violations.filter(
        (violation) => violation.rule === RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
      ),
      [],
      "the CV universes must not trip the gate-marking rule: each rule watches its own shape",
    );
    assert.deepEqual(
      report.violations.filter(
        (violation) =>
          violation.rule === RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
      ),
      [],
      "the CV universes must not trip the wind-floor rule: each rule watches its own shape",
    );
  });

  it("accepts the rolling-origin blocked scheme, firing no rule at all", async () => {
    await writeUniverse(FORWARD_UNIVERSE);

    const report = await evaluateLearningDeclarations({ root });

    // The accepting half: a rule never seen accepting proves nothing. Zero
    // violations of ANY rule also covers the cross-talk audit for this
    // universe -- the slice-01 rules have nothing to say here either.
    assert.deepEqual(
      report.violations,
      [],
      `this universe splits time forward only (train weeks one to eight, held-out nine and ten) and the examination refused it anyway: ${JSON.stringify(report.violations)}`,
    );
  });
});
