# RED classification history

Feature: `f-forecast-learns-from-the-beach`
Slices entered: slice-01 (2026-08-09). Slices 02-07 pre-authored as parked scaffolds on the
owner's explicit 2026-08-10 instruction (JIT override; see that entry below) — they "enter"
DELIVER only when unskipped, each with a fresh RED confirmation.

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

### 01-18 fixture contract repair (2026-08-10)

The generated larger-report comparison had used the changed report band as the
forecast anchor too. Its forecast and observation therefore both rose by 0.65 m,
leaving the height residual unchanged and making the strict-lower oracle
impossible to satisfy. `syntheticMornings` now accepts an explicit
`forecastReferenceBand`, defaulting to the report band so every earlier scenario
retains its prior meaning. The R2 property pins that reference to `chest_head`
while changing only the observed band to `head_overhead`.

The property now proves each of its three input deltas before it drives the
nightly fit: every forecast rises while reports stay fixed, forecasts stay fixed
while observed bands rise, and the reporter rotation changes the device
assignment. A deliberate poison that anchored the larger report to
`head_overhead` failed the focused scenario with exit 1 because forecast inputs
were no longer fixed. After restoring `chest_head`, the focused R2 scenario,
the learning residual support tests, and all feature acceptance scenarios passed.

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

## Entry: slices 02-07 pre-authored, 2026-08-10

**JIT override, recorded.** The JIT rule (`HANDOFF.md` §1; contract item 4 above) says no
later-slice tag is authored ahead of its turn. On 2026-08-10 the owner explicitly instructed
the opposite: every slice of this feature gets executable acceptance scenarios and a
step-level roadmap now. This entry records that authoring, its RED proof per slice, and the
scaffold mechanism that keeps the shared suite honest meanwhile.

**Recovery status, 2026-08-10.** This is authoring-time diagnostic evidence, not a DELIVER-entry
approval for slices 02-07. Their skip markers remain active. A future slice may use its recorded
oracle as a comparison point, but it is not READY, PASSING, or executable until its own marker is
removed, its prerequisites are checked, and a new RED classification reaches that oracle against
the then-current production seams. `GUARD-ALREADY-GREEN` is a regression rail, never a completion
claim. Real-observation and deploy proof remains blocked where the feature delta says so.

**The scaffold skip-marker (ADR-025).** Every slice-02..07 scenario is fully step-defined and
was proven RED below, then parked: a tag-scoped Before hook in
`tests/acceptance/f-forecast-learns-from-the-beach/steps/support/pending-slices.ts` returns
`'skipped'` for a pending slice. Unskip permanently by deleting the slice's line there (the
first move of that slice's DELIVER), or transiently with `LEARNING_UNSKIP=slice-NN` in the
environment, which is how the runs below were produced. `strict: true` still fails the run on
any undefined step, so a scaffold can never rot into an unmatched scenario silently.

### Commands observed

Tag binding (the count is the evidence; cucumber exits 0 on a tag that selects nothing):

```
npm run test:at -- --dry-run --tags "@feature-f-forecast-learns-from-the-beach and @slice-NN"
slice-02: 9 scenarios   slice-03: 6   slice-04: 8   slice-05: 7   slice-06: 4   slice-07: 3
(pickle-level audit: 9 test cases, 64 steps for slice-02 — exactly the authored file)
```

The per-slice RED runs:

```
LEARNING_UNSKIP=slice-02 npm run test:at -- --tags "...and @slice-02"  REAL_EXIT=1  9 failed / 9
LEARNING_UNSKIP=slice-03 npm run test:at -- --tags "...and @slice-03"  REAL_EXIT=1  3 failed, 3 passed / 6
LEARNING_UNSKIP=slice-04 npm run test:at -- --tags "...and @slice-04"  REAL_EXIT=1  7 failed, 1 passed / 8
LEARNING_UNSKIP=slice-05 npm run test:at -- --tags "...and @slice-05"  REAL_EXIT=1  6 failed, 1 passed / 7
LEARNING_UNSKIP=slice-06 npm run test:at -- --tags "...and @slice-06"  REAL_EXIT=1  4 failed / 4
LEARNING_UNSKIP=slice-07 npm run test:at -- --tags "...and @slice-07"  REAL_EXIT=1  3 failed / 3
```

The shared-suite check, skip markers active (the state every other lane sees):

```
npm run test:at
REAL_EXIT=1
135 scenarios (95 passed, 37 skipped, 3 failed)
```

The 37 skipped are exactly these scaffolds. The 3 failures are slice-01's own not-yet-delivered
scenarios (its DELIVER stands at step 01-07 of 18 at the time of this entry) — unchanged by this
authoring. `npm run typecheck` REAL_EXIT=0.

### Classification, per slice

Every failure below reaches a `Then` step and no scenario has an undefined step, a failed Given,
or runner setup failure. Recovery reclassification distinguishes a behaviour oracle that reaches
an existing driving seam (`MISSING_FUNCTIONALITY`) from a `Then` that reports a dynamically
captured missing production module (`BLOCKED_BY_UNSCAFFOLDED_SEAM`). The latter is not an honest
Ponce RED yet: it needs the slice's JIT scaffold/entry seam before implementation may begin.

**slice-02 (7 MISSING_FUNCTIONALITY, 2 BLOCKED_BY_UNSCAFFOLDED_SEAM).** The builder scenarios fail because `build.ts` still
passes `applyCorrection(spot, null)` and the apply body is inert: moved-number, gate-naming
(`n_lt_10`, `not_significant`), both clamps, and the revert's had-moved guard all red at their
own oracles. The two reader scenarios fail with the captured absence of
`src/learning/load-correction.ts`.

**slice-03 (3 MISSING_FUNCTIONALITY, 3 GUARD-ALREADY-GREEN).** Red: the basin byte-identity
(flat pooling leaks Pacific mornings into a Caribbean file), tau estimation at eight gated
spots (hand-set prior still binding, gap 0.1286 vs required < 0.1285), and beach-group
activation (the new spot sits with the region-wide mean). Already green, deliberately kept:
rides-its-parents, the one-loud-morning sliver property, and the two-spots-are-not-a-family
half of the activation pair — the launch two-level collapse already satisfies those corridor
laws, and they are the regression rails the recursive ladder must not break. A pair watched
in only one direction proves nothing; both directions are on file.

**slice-04 (7 MISSING_FUNCTIONALITY, 1 GUARD-ALREADY-GREEN).** Red with the exact signature of
missing weights: byte-inequality where collapse must equalise (session repeats, incident
file), movements exactly equal where selection must differentiate (rare-day vs often-day,
asked-for vs volunteered), and movements at full-trust magnitude where the fence, concordance
and the habit subtraction must shrink them. Green guard: the newcomer-at-full-voice scenario,
which the shipped unweighted fit satisfies and any newcomer discount would red — kept as the
GDP-10 rail.

**slice-05 (1 MISSING_FUNCTIONALITY, 5 BLOCKED_BY_UNSCAFFOLDED_SEAM, 1 GUARD-ALREADY-GREEN).** Five scenarios report the
captured absence of `src/learning/evaluate.ts` and must not be treated as RED until the JIT seam
exists; the shuffled-folds outline row fails because the third declarations rule does not exist
yet. Green guard: the forward-time-blocks row
(no rule, so nothing refuses it) — the accepting half the rule must keep accepting.

**slice-06 (4/4 MISSING_FUNCTIONALITY).** The real-repo gate run is green but names none of
the learning lines; the three contained regressions are rejected for the wrong reason (bare
fixture reaches the vitest phase) and never by the learning witness name. One authoring-time
fix is on record: the widened-fence oracle originally passed vacuously on cross-talk (the
bill output contains `predictions/`), and was sharpened to require the exact witness token
`learning-nightly-write-scope` before this RED was recorded.

**slice-07 (2 MISSING_FUNCTIONALITY, 1 BLOCKED_BY_UNSCAFFOLDED_SEAM).** The end-to-end chain reds where slice-02's wiring is
missing (published height unchanged; archived gate says `no_file` where `n_lt_10` is owed). The
both-jobs oracle reports a missing monthly seam and remains blocked until slice-05 creates it.

### Recovery verification: 2026-08-10

The recovery reran every parked tag transiently with `LEARNING_UNSKIP=slice-NN`; no marker was
removed. Results: slice-02 `7 RED / 2 BLOCKED`; slice-03 `3 RED / 3 GUARD`; slice-04 `7 RED /
1 GUARD`; slice-05 `1 RED / 5 BLOCKED / 1 GUARD`; slice-06 `4 RED`; slice-07 `2 RED / 1
BLOCKED`. Total: **24 MISSING_FUNCTIONALITY, 5 GUARD-ALREADY-GREEN, 8
BLOCKED_BY_UNSCAFFOLDED_SEAM**. This is a recovery diagnosis, not permission to unpark a slice.

### Seams this authoring declares, owed by DELIVER

| Seam | Shape the acceptance tests drive |
|---|---|
| `src/learning/load-correction.ts` | `loadStoredCorrection({ store, key })` returning `{ record, outcome: 'loaded' \| 'absent' \| 'rejected-as-absent', events }`; refuses foreign units by name; never throws |
| `src/scoring/engine.ts` `applyCorrection` body | read-time G1-G3 re-check from the record's own fields, G5/G6 clamps, `corrected = raw - b`, `delta_q = -b/100`; null path byte-preserved (slice-02; scope edit recorded in roadmap 02-02) |
| `runLearningFitOnce` extension | optional `spots: [{ spot_id, region_id, coast, break_type }]`; omitted = today's behaviour (slice-03) |
| `src/learning/evaluate.ts` | `runMonthlyEvaluationOnce({ store, clock, spots? })` returning `{ completed, verdict, metrics_key, events }`; writes `learned/metrics/v1/dt=<month>/metrics.json`; flips `applied` on a losing month (slice-05) |
| declarations rule 3 | `held-out-mornings-must-stay-forward-of-training` over a declared `CV_SCHEME`; fixtures `cv-shuffled-folds` / `cv-forward-time-blocks` watch both directions (slice-05) |
| learning guardrail witnesses | `learning-nightly-schedule`, `learning-monthly-schedule`, `learning-function-memory-mb`, `learning-nightly-write-scope`, `learning-monthly-write-scope`, `learning-write-complement-denied` (slice-06; fixture under `fixtures/controlled-learning-infra/`) |

### Stale tokens and supersessions, named so nobody trips

- `05-scoring-engine.md` §5's `delta_q = clip(b, ...)/100` line OMITS the minus sign that
  06 §4 pins (`delta_s = -b_score`). 06 §4 is the sign SSOT and every slice-02/07 oracle
  asserts it: the applied score move is MINUS the stored score `b` over 100. A crafter
  following 05 verbatim reds the archive oracles. Doc correction owed to the scoring lane;
  flagged, not repaired here.
- Slice-01's pin "only the two named rules may produce a violation" is superseded by
  slice-05's third rule. The cross-talk audit is in roadmap 05-03: neither CV universe can
  fire the two old rules, the shipped src cannot fire the new one before or after 05-02, so
  every slice-01 declaration scenario stays green.
- The 01-18 fixture trap recorded in roadmap 01-18 was fixed by this lane on 2026-08-10, the
  one line it prescribed: `syntheticMornings` now anchors the forecast to the reference
  band's midpoint, so moving the reported band moves only what the person said they saw.
  With the fix, 01-18's scenario runs and passes on the shipped implementation; the full-suite
  failures above no longer include it.

### Owed at each later slice's DELIVER open, outside or beside this authoring

| Owed | Where |
|---|---|
| Delete the slice's line from `PENDING_SLICES` (the unskip) | `tests/.../steps/support/pending-slices.ts` |
| Re-run that slice's RED and confirm the same oracles before any body is written | this file, append-only |
| Slice charters for 02-06 (07's is on disk beside this entry's authoring) | `docs/product/expectations/f-forecast-learns-from-the-beach/` |
| The `src/scoring/**` scope edit for slice-02 only | roadmap 02-02 implementation_notes |
| Pre-requisite 1 (the `build.ts` one-liner, BUGFIX lane) before 02-03 can green | feature-delta Pre-requisites |
