# RED classification history

Feature: `f-forecast-learns-from-the-beach`
Slices entered: slice-01 (2026-08-09)

## Contract for every entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable
   exercised, the classification, and the behaviour oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behaviour oracle. A failure during import,
   fixture construction, step matching or runner setup is BROKEN and blocks handoff until
   the test is fixed.
3. Scenarios drive production entry points only. For this feature those are the nightly
   fit's own driving port, the shipped builder (`runIngestOnce` then `runBuildOnce`, the real
   composition over in-memory port fakes), and the source-universe examination. No fixture-only
   wiring may satisfy an oracle that a production surface owes.
4. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the default
   for this feature (`HANDOFF.md` §1 DISTILL row).

## Entry: slice-01, 2026-08-09

### Commands observed

Selection, to prove the tag pair binds (cucumber exits 0 on a tag that selects nothing, so the
count is the evidence, not the exit code):

```
npm run test:at -- --dry-run --tags "@feature-f-forecast-learns-from-the-beach and @slice-01"
REAL_EXIT=0
20 scenarios (20 skipped)
264 steps (264 skipped)
```

The RED run:

```
npm run test:at -- --tags "@feature-f-forecast-learns-from-the-beach and @slice-01" > /tmp/learn-red.log 2>&1; echo "REAL_EXIT=$?"; tail -50 /tmp/learn-red.log
REAL_EXIT=1
20 scenarios (20 failed)
264 steps (225 passed, 19 skipped, 20 failed)
```

The shared-suite check, because `cucumber.mjs` loads every step file in `tests/**/steps/**` into
one registry and a mistake here takes four other features down with it:

```
npm run test:at
REAL_EXIT=1
98 scenarios (78 passed, 20 failed)
1162 steps (1123 passed, 19 skipped, 20 failed)
```

The 78 passing scenarios are the keystone's and `f-bill-stays-zero-and-stays-up`'s, unchanged.
The 20 failures are exactly this slice's. No step name collided, no World was replaced (this
feature registers no `setWorldConstructor`; its state is module-scoped and reset by a Before hook
scoped to `@feature-f-forecast-learns-from-the-beach`), and no missing module crashed the registry
at load, because both new seams are reached through a dynamic import with a non-literal specifier.

```
npm run typecheck
REAL_EXIT=0
```

### Classification, one row per scenario

Every one of the 20 failed at a `Then` step. Zero failed at a `Given`, a `When`, the Background,
step matching or module load. Every Background step passed, which means the shipped builder really
did publish the baseline morning each scenario measures against.

| # | Scenario | Observable exercised | Behaviour oracle reached | Classification |
|---|---|---|---|---|
| 1 | Nothing in the shipped source can mark a correction applied | the source-universe examination over `src` | the examination reports no violation | MISSING_FUNCTIONALITY |
| 2 | Only the gate may mark a correction applied (refuses) | examination over `applied-marked-outside-the-gate` | the rule refuses that universe | MISSING_FUNCTIONALITY |
| 3 | Only the gate may mark a correction applied (accepts) | examination over `applied-marked-only-inside-the-gate` | the rule accepts that universe | MISSING_FUNCTIONALITY |
| 4 | The shipped source forms no residual for wind at all | examination over `src` | exactly two residual forms are declared | MISSING_FUNCTIONALITY |
| 5 | A wind residual may not ship without its own noise floor (refuses) | examination over `wind-residual-without-a-noise-floor` | the rule refuses that universe | MISSING_FUNCTIONALITY |
| 6 | A wind residual may not ship without its own noise floor (accepts) | examination over `wind-residual-with-its-own-noise-floor` | the rule accepts that universe | MISSING_FUNCTIONALITY |
| 7 | Nobody has reported a session yet, so the nightly fit writes nothing at all | the nightly fit's reported outcome | the fit finishes and reports zero corrections written | MISSING_FUNCTIONALITY |
| 8 | Nine mornings from three people are too few to correct anything | the stored correction's height key | refused, recording 9 mornings from 3 people | MISSING_FUNCTIONALITY |
| 9 | Twelve mornings still buy nothing, because five different people are required | the stored correction's height key | refused, recording 12 mornings from 3 people | MISSING_FUNCTIONALITY |
| 10 | Enough people, but the difference is too small to tell from noise | the stored correction's height key | refused, recording 22 mornings from 7 people | MISSING_FUNCTIONALITY |
| 11 | Twenty-two mornings from seven people finally earn a correction | the stored correction's height key | applied, recording 22 mornings from 7 people | MISSING_FUNCTIONALITY |
| 12 | The correction states its score move in the points a surfer sees | the stored correction's schema and units | the score move is in `display_points` and nothing else is legal | MISSING_FUNCTIONALITY |
| 13 | Twenty-two reports that agree perfectly buy nothing honest disagreement could not | the stored standard error | refused, and the stored error is the physical floor | MISSING_FUNCTIONALITY |
| 14 | No amount of agreement makes a small difference publishable | the fit over generated mornings | nothing under the floor is ever applied | MISSING_FUNCTIONALITY |
| 15 | Every difference the fit measures is the forecast against what a person actually saw | the fit over generated mornings | raising the forecast raises the stored difference | MISSING_FUNCTIONALITY |
| 16 | A morning nobody had a forecast for contributes nothing to the score delta | the fit over generated mornings | the score delta's count is unchanged by forecast-less mornings | MISSING_FUNCTIONALITY |
| 17 | Which wind a reporter named changes no number the fit writes | the stored corrections universe | byte-identical across a wind-word rotation | MISSING_FUNCTIONALITY |
| 18 | The stored difference never leaves the corridor between the raw difference and its parent | the fit over generated mornings | the stored value never exceeds the raw one, nor flips its sign | MISSING_FUNCTIONALITY |
| 19 | The shipped trust settings drop nobody | the stored correction's counts | 22 mornings and 7 people counted, the ungated result | MISSING_FUNCTIONALITY |
| 20 | A trust setting that asks for a month of standing drops this morning's credential | the stored correction's counts | the same-day credential's mornings are gone from the count | MISSING_FUNCTIONALITY |

Verdict: **20/20 MISSING_FUNCTIONALITY, 0 BROKEN.** Handoff to DELIVER is not blocked by RED shape.

### Two honest qualifications on this RED

**It is a two-stage RED, deliberately.** Neither `src/learning/fit.ts` nor `src/learning/declarations.ts`
exists, and this lane's declared file ownership is `tests/acceptance/f-forecast-learns-from-the-beach/**`
plus `docs/feature/f-forecast-learns-from-the-beach/**`, so no scaffold was written into `src/`. The
absence is captured at the act boundary and reported inside every oracle's failure message, which is
the pattern the keystone's own World documents ("an unimplemented seam fails as active-RED with the
reason in the message"). What that buys today is that no oracle in this suite can be satisfied by an
empty store: every absence claim, including "the fit wrote nothing", is a positive report from a
surface that has to exist. What it does not buy is a second RED against a present-but-empty module.
DELIVER sees that RED the moment it creates either seam, and must confirm each scenario still fails
at the same oracle before writing any body.

**What slice-01 does not pin.** The 06 §11 worked example's exact `b_shrunk = -0.183` depends on the
region parent estimate of `-0.05`, which comes from other spots' data through the pooling hierarchy
that slice-03 owns. Slice-01 therefore pins what it can own honestly: the gate PASSING at n = 22 and
7 reporters, the recorded counts, significance clearing twice the stored error, and the shrink
corridor (the stored value never exceeds the raw one in size and never flips its sign). The exact
shrunken value becomes assertable when slice-03 lands the hierarchy.

### The seams this slice declares, owed by DELIVER

| Seam | Shape the acceptance tests drive |
|---|---|
| `src/learning/fit.ts` | `runLearningFitOnce({ store, clock })` returning `{ completed, spots_examined, corrections_written, events }`. Reads `log/observations/v1/`, `predictions/v1/`, `data/config/trust-gate.json` from the store; writes `learned/corrections/v1/current/<spot_id>.json`. Reporter identity is `reporter_key = device_id` at launch (Pre-requisite 8) |
| `src/learning/declarations.ts` | `evaluateLearningDeclarations({ root })` returning `{ residual_forms, noise_floors, applied_marking_sites, violations }`. Rules: `only-the-gate-may-mark-a-correction-applied`, `a-wind-residual-must-bring-its-own-noise-floor`. Four prepared universes under this feature's `fixtures/controlled-learning-declarations/` watch both rules refusing and accepting |

Two contract details that a reasonable implementer gets wrong silently, so they are pinned here:

- **Those two named rules are the only source of a violation.** A universe that declares no residual
  form at all is not itself a violation. This matters because scenario 1 and scenario 4 examine the
  same shipped `src` universe and read different fields of one report: scenario 1 requires
  `violations` to be empty on today's `src`, which declares nothing, while scenario 4 requires
  `residual_forms` to be exactly the two once slice-01 ships them. Adding a third rule of the shape
  "the universe must declare exactly two residual forms" would red scenario 1 against the shipped
  source permanently. The count of residual forms is an inventory the examination reports, never a
  rule it enforces.
- **`se_gate`'s floor is computed over the trust-eligible `n`, not the raw one.** 06 §7 says an
  ineligible sample leaves the fit and every gated count, and G3's `0.5 * sigma_eff / sqrt(n)` floor
  is one of those counts. The stored `n`, the stored `reporters` and the floor inside the stored `se`
  must all be the post-eligibility numbers, which is why scenario 13's floor oracle reads `n` back
  off the stored record rather than from the fixture that produced it.

### The `build.ts` seam, recorded not edited

`src/pipeline/build.ts` line 173 reads `const correction = applyCorrection(spot, null);`. The literal
`null` must become the record loaded via the already-wired
`deps.store.getCorrection('learned/corrections/v1/current/<spot_id>.json')` (port `ports.ts` 33-34,
adapter `filesystem-store.ts` 37, CLI wiring `run-build-cli.ts` 41) and parsed by slice-02's loader.
Optionally `CallRow.bias_gate` tightens from `string` to `CorrectionGate` (lines 101-102), the owner's
call. That file belongs to a concurrent BUGFIX lane and was not touched here; this is feature-delta
Pre-requisite 1, restated so the exact edit is on the record. Nothing in slice-01 needs it: this
slice's claim is that the published morning is byte-identical whether no correction file exists or a
refusing one does, and with the literal `null` still in place that identity holds trivially, which is
why every scenario asserting it also carries a fit oracle that fails without the fit.

### Stale tokens, named so nobody trips

- `06-learning-layer.md` §11's day-0 row writes `bias_gate: "no_correction"`. The shipped code and the
  shipped keystone acceptance test both say `'no_file'` (`src/scoring/engine.ts` line 54; keystone
  feature line 52). Code and test win. No slice-01 scenario asserts `bias_gate` at all, because the
  builder does not read corrections until slice-02; when slice-02 does assert it, it must assert
  `'no_file'`.
- `06 §2`'s input-universe table widens `domain-model.md` §17's "nothing else" sentence. Already
  flagged loudly by 06 itself to the round-3 domain lane; carried, not repaired here.

### Owed at slice-01 open, outside this lane's file ownership

| Owed | Path | Why not discharged here |
|---|---|---|
| Slice charter with its non-visual N/A rationale | `docs/product/expectations/f-forecast-learns-from-the-beach/` | Outside this lane's declared ownership; feature-delta Pre-requisite 10 |
| ATDD infrastructure policy rows for the fit's driving port, the learning store and the source-universe examination | `docs/architecture/atdd-infrastructure-policy.md` | Outside this lane's declared ownership, even though that file's own rule says rows are added as a port first enters DISTILL |
| RED scaffolds for both declared seams | `src/learning/` | This lane writes no production code |
| ADR status flips (all three learning ADRs read Status: Proposed) and the round-3 S1-S4 coherence record | `docs/product/architecture/` | Feature-delta Pre-requisite 9; a flag, not a build blocker, but slice-01's oracles lean on all three |

### UI disposition

slice-01 is classified non-visual in the feature-delta. It emits no HTML and changes no rendered
value: its entire output is a refusing correction file and a byte-identical published surface.
No U1-U7 check is fabricated, because a job whose success criterion is that nothing visible changes
has no pixels to measure. The honest visual evidence is exactly the assertion this slice already
makes twice over: the published universe under `pub/v1/` is byte-identical before and after the fit
runs.
