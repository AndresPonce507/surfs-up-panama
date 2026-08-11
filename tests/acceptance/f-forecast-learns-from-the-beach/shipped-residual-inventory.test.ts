// Accepted roadmap 01-10: “Shipped source declares two residual forms only”.
// The declaration examiner is the driving port. It reads the real source tree
// as text and returns its inventory without importing the examined modules.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import {
  evaluateLearningDeclarations,
  type LearningDeclarationsReport,
} from "../../../src/learning/declarations";

const SHIPPED_SOURCE_ROOT = fileURLToPath(
  new URL("../../../src/", import.meta.url),
);

function assertShippedResidualInventory(
  report: LearningDeclarationsReport,
): void {
  assert.deepEqual(
    [...report.residual_forms].sort(),
    ["r_height", "r_score"],
    "the shipped source must declare exactly the two residual forms it actually computes",
  );
  assert.equal(
    report.noise_floors.wind,
    undefined,
    "wind is claim-exempt, so shipped source must declare no wind noise floor",
  );
  assert.equal(report.noise_floors.height?.value, 0.48);
  assert.match(
    report.noise_floors.height?.derived_from ?? "",
    /height-error-decomposition/,
    "the height floor must carry its stated decomposition",
  );
  assert.equal(report.noise_floors.score?.value, 25);
  assert.match(
    report.noise_floors.score?.derived_from ?? "",
    /q_obs anchor step/,
    "the score floor must carry its stated anchor-step derivation",
  );
  assert.deepEqual(report.violations, []);
}

describe("01-10 acceptance: shipped source declares two residual forms only", () => {
  it("reports the two legal forms, their explained floors, and no wind claim", async () => {
    const report = await evaluateLearningDeclarations({
      root: SHIPPED_SOURCE_ROOT,
    });

    assertShippedResidualInventory(report);
    assert.throws(
      () =>
        assertShippedResidualInventory({
          ...report,
          residual_forms: [...report.residual_forms, "r_wind"],
        }),
      /exactly the two residual forms/,
      "the acceptance oracle must reject a controlled third-residual mutation",
    );
    assert.throws(
      () =>
        assertShippedResidualInventory({
          ...report,
          noise_floors: {
            ...report.noise_floors,
            wind: { value: 1, derived_from: "wind-label-confusion-structure" },
          },
        }),
      /no wind noise floor/,
      "the acceptance oracle must reject a controlled wind-floor mutation",
    );
  });
});
