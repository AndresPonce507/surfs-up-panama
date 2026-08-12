# RED classification — slice-05 "the monthly conscience", JIT DISTILL 2026-08-12

Feature: `f-forecast-learns-from-the-beach`. Base: `build/f2-learning-slice05` (the ruled-in
world). Authored under `deliver/wave-decisions.md` D-2026-08-12-1 (metrics-only monthly job)
and D-2026-08-12-2 (vitest port-to-port `.test.ts`, house style of slices 01–04, parked
`describe.skip`). The recover branch's slice-05 scenarios were mined as material only; its
mechanism (the monthly job rewriting `learned/corrections/v1/current/` in place,
`recover/learning-build:src/learning/evaluate.ts:36-38`) is dead and none of it was ported.

Classification vocabulary per the convention on
`recover/learning-build:docs/feature/f-forecast-learns-from-the-beach/distill/red-classification.md`:

- `MISSING_FUNCTIONALITY` (honest RED): the oracle reaches an existing production driving seam
  and fails at its own behaviour assertion.
- `BLOCKED_BY_UNSCAFFOLDED_SEAM`: the failure is the dynamically captured absence of
  `src/learning/evaluate.ts` (the shared harness
  `tests/acceptance/f-forecast-learns-from-the-beach/support/monthly-port.ts` turns the missing
  module into an assertion, never a collection error). Not an honest RED until the crafter
  scaffolds the seam; each such file reds again at its own behaviour oracle the moment
  `runMonthlyEvaluationOnce` exists.
- `GUARD-ALREADY-GREEN`: the accepting/sparing half that today's shipped code already satisfies,
  kept as the regression rail. A rule or switch watched in only one direction proves nothing.

## Commands observed

Unskipped RED runs (each file transiently on plain `describe`, then parked back):

```
npx vitest run tests/acceptance/f-forecast-learns-from-the-beach/<file>.test.ts
EXIT=1 for every one of the six files
```

Parked verification, whole feature acceptance directory:

```
npx vitest run tests/acceptance/f-forecast-learns-from-the-beach
EXIT=0
Test Files  24 passed | 6 skipped (30)
Tests       53 passed | 8 skipped (61)
```

Baseline before this authoring, same command: `Test Files 24 passed (24)`, `Tests 53 passed
(53)`. The 24 pre-existing files and 53 pre-existing tests are untouched; the 6 new files park
8 scenarios. (The repo's 5 pre-existing failures in `tests/unit/staleness-*` and report-island
were not run and not touched, per the lane boundary.)

## One row per file

| File | Step | Classification | Exact failure line captured |
|---|---|---|---|
| `the-monthly-file-watches-every-hazard-the-design-names.test.ts` | 05-01 | BLOCKED_BY_UNSCAFFOLDED_SEAM | `AssertionError: the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)` |
| `a-losing-month-switches-the-corrections-off-until-a-human-looks.test.ts` | 05-02 (the kill) | BLOCKED_BY_UNSCAFFOLDED_SEAM | `AssertionError: the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)` |
| `a-winning-month-leaves-the-corrections-standing.test.ts` | 05-02 (the spare) | BLOCKED_BY_UNSCAFFOLDED_SEAM | `AssertionError: the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)` |
| `held-out-mornings-stay-forward-of-training.test.ts` — refusing half | 05-03 | MISSING_FUNCTIONALITY | `AssertionError: this universe shuffles time and the examination let it through: a shuffled split flatters every correction it judges, so the kill switch built on it would be blind (06 s7 G7). Violations reported: none` |
| `held-out-mornings-stay-forward-of-training.test.ts` — accepting half | 05-03 | GUARD-ALREADY-GREEN | (passed: the shipped examination has no CV rule, so nothing refuses the rolling-origin universe; this half is the rail the new rule must keep green) |
| `a-confidence-level-that-does-not-predict-correctness-is-named.test.ts` (both scenarios) | 05-04 | BLOCKED_BY_UNSCAFFOLDED_SEAM | `AssertionError: the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)` |
| `a-spot-still-mostly-pooled-after-eighty-mornings-is-flagged.test.ts` | 05-05 | BLOCKED_BY_UNSCAFFOLDED_SEAM | `AssertionError: the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)` |

## The kill/spare oracles were re-anchored to the apply seam (D-2026-08-12-1)

The recover branch's kill scenario asserted `applied: false` flipped onto the stored records —
the ruled-out mechanism. Under the ruling the same product truth (a bad month degrades to day
zero, loudly, until a human looks) is pinned at three seams instead:

1. `cv.verdict: "corrections-killed"` in the metrics file AND in the outcome (which agree);
2. every byte under `learned/corrections/v1/` byte-identical before and after the run — pinned
   by full-store snapshot compare in EVERY file that runs the monthly port
   (`assertWritesConfinedToMetrics`), so the in-place rewrite can never come back;
3. the apply lane obeys the verdict: `loadStoredCorrections`, handed the same store and the same
   clock, maps `playa-venao` to `null` — the day-zero cost, exactly what an absent or corrupt
   file costs. The kill file writes this call the way the amended 05-02 criteria describe
   (a `clock` input the loader does not take today, cast past the current
   `{ store, spotIds }` signature); once the port exists that assertion is the right-reason RED
   for the loader widening. The spare file pins the mirror image: `corrections-stay` recorded,
   the record still loaded, `applied: true` and `b` untouched.

The kill month's outcome events must be distinguishable (D-2026-08-12-1 pin 3; the reference
branch emitted only `metrics_written` on every path).

## Supersession note

Slice-01's pin "only the two named rules may produce a violation" is **superseded** by 05-03's
third rule `held-out-mornings-must-stay-forward-of-training`. The cross-talk audit stands in
both directions: neither CV universe may trip the two slice-01 rules (asserted in the 05-03
file), and the CV rule fires nowhere in the shipped source until 05-02 declares the rolling
scheme, which the rule accepts (roadmap 05-03 criteria).
