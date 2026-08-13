# Wave decisions — slice-05, the monthly conscience

## D-2026-08-12-1 — The monthly evaluation job is METRICS-ONLY (ruling by Andres, 2026-08-12)

**The ruling.** The monthly evaluation job may write ONLY under `learned/metrics/v1/`. On a
corrections-killed verdict it publishes the verdict INTO the metrics file
(`cv.verdict: "corrections-killed"`); the correction-APPLY lane consumes that verdict and stops
applying. No job gets write access to `learned/corrections/`.

**What was ruled out, exactly.** The alternative implementation on branch
`recover/learning-build` (`src/learning/evaluate.ts:36-38`) has the monthly job rewrite
`learned/corrections/v1/current/` in place:

```ts
if (verdict === 'corrections-killed') {
  await Promise.all(currentCorrections.map(({ key, record }) =>
    deps.store.put(key, serializeCorrection(disableCorrection(record)))));
}
```

That mechanism is dead. That branch stays minable for scenario and roadmap material only.

**Why the ruling is also the coherent reading of the design.** 06-learning-layer.md section 2's
data-flow diagram already shows the monthly evaluation producing exactly
`learned/metrics/v1/dt=<month>/` and nothing else, and section 7's aggregate/bounded-change
contract gives the NIGHTLY job's write universe as `learned/corrections/v1/` enforced by IAM
(infra guardrail 6). A monthly job that rewrites correction files needs a second writer on that
prefix, which the IAM fence design never granted. The in-place rewrite also cannot survive the
nightly fit, which replaces `current/<spot_id>.json` on every run: the kill would be silently
overwritten within a day. The verdict-in-metrics mechanism survives nightly rewrites by
construction.

**What "applied: false EVERYWHERE" means now (G7, 06 section 7; adr-correction-gates-and-clamps
decision 3).** The judgment is unchanged; the mechanism moves to the apply seam. When the latest
monthly metrics file carries `cv.verdict: "corrections-killed"`, the correction-apply lane
publishes day-zero numbers everywhere — byte-identical to every correction refusing — while
`learned/corrections/v1/` is left untouched. Stored corrections keep whatever `applied` verdict
the nightly gates marked; the kill overrides consumption, not storage.

**Verdict consumption semantics settled by this lane** (escalation not warranted; resolved from
the ruling + house rules, recorded here):

1. *Latest verdict wins.* The apply lane reads the newest `dt=<month>` metrics file under
   `learned/metrics/v1/`. A later month whose held-out verdict is `corrections-stay` lifts the
   kill; the operator has had a month of the alarm in the file 06 §10 says he reads. ("Until a
   human looks" in G7's letter: the human's levers are unchanged — fix the model, or delete
   correction files, the existing manual revert.)
2. *Only an affirmative kill kills.* An absent metrics file (launch state), an unreadable one, or
   an unknown verdict value leaves the per-correction gates as the authority. A corrupt byte must
   never flip system state — same rule as `readReporterOverrides` ("a file nobody can parse names
   nobody") and the correction reader's totality contract, applied in the direction that keeps
   G1–G6 (which are per-correction and still enforced) as the floor.

**Pins taken while porting the minable material (recover/learning-build is reference, not law):**

1. *MAE, not block-bias magnitude.* The recover branch's `judgeRollingOriginCorrections` compares
   `|mean(residuals)|` per key; 06 §7 G7, adr-correction-gates-and-clamps decision 3 and R34 all
   say "corrected MAE loses to raw". The design text wins: the ruled-in judge compares mean
   ABSOLUTE error on the held-out block, raw vs corrected, per gated key.
2. *`not_evaluated` stays.* Zero applied height keys (the launch state, and any month the fit
   never earned a correction) yields `cv.verdict: "not_evaluated"`; the apply lane treats it
   exactly like `corrections-stay` (only an affirmative kill kills).
3. *No history copy, no second prefix.* The recover branch's kill left no audit copy; under the
   ruling none is needed — the metrics file IS the durable record of the verdict, and the monthly
   job writes nothing anywhere else. The kill month also emits a distinguishing event in the
   outcome (the recover branch emitted only `metrics_written` on every path).
4. *The kill scenario's oracle moves to the apply seam.* The recover scenario "A month where the
   corrections lose on held-out mornings switches every one of them off until a human looks"
   asserted `applied: false` on the stored records. Re-anchored: stored corrections are
   byte-untouched by the monthly job; the verdict is in the metrics file; and the apply lane
   yields day-zero output while the latest verdict is corrections-killed. Same product truth
   (a bad month degrades to day zero, loudly), ruled-in mechanism.
5. *Recover's Pre-requisite 9 is resolved by this ruling.* That branch's feature-delta.md records
   this exact write-contract contradiction as open, with "the evaluator must emit a separate
   correction-control handoff" as one resolution arm. Andres picked that arm today, with the
   handoff being the metrics file itself.

**Upstream issues flagged (back-propagation owed, not performed by this lane):**
- 06 §7 G7 row and adr-correction-gates-and-clamps decision 3 say "`applied: false` everywhere";
  the letter should become "the apply lane stops consuming corrections while the latest monthly
  verdict is corrections-killed". Judgment identical, mechanism corrected.
- 06 §2 consumer table lists `learned/metrics/v1/` consumers as "Andres; later a public accuracy
  page". The ruling adds a machine consumer: the correction-apply lane (verdict field only). The
  `data:consumer-known-before-produced` clause wants that row widened.
- Slice-06 (not this lane) should fence the monthly job's IAM write scope to
  `learned/metrics/v1/` only, per the ruling.
- R34's text in the DISTILL requirement checklist (minable on recover/learning-build) itself
  encodes the ruled-out mechanism ("flips `applied: false` everywhere"); it needs the same
  amendment as G7's letter when back-propagation runs.
- Design-level question for the architecture owner, flag only: the CV split has no purge/embargo
  gap between training and the held-out fortnight, while the ban on random k-fold is justified by
  near-duplicate adjacency. The ADR specifies adjacent blocks (train weeks 1-8, test 9-10), so
  this lane builds what is written; whether an embargo day belongs in the scheme is a design
  decision nobody has taken.

## D-2026-08-12-2 — Slice-05 acceptance tests are vitest port-to-port files, not cucumber

The roadmap's slice-05 steps name a `.feature` file and a `PENDING_SLICES` parking that exist
only in the `recover/learning-build` world. On this base the learning feature's entire
acceptance layer is vitest `.test.ts` files (24 of them, slices 01–04), each driving the port
against an in-memory store, with a header comment naming the accepted roadmap step. Slice-05
follows the house style actually on this base: JIT-DISTILL authors
`tests/acceptance/f-forecast-learns-from-the-beach/*.test.ts` scaffolds (parked `describe.skip`,
proven RED at authoring), one per roadmap scenario, and each step's crafter activates its own.
The repo CLAUDE.md cucumber-tag rule is about `.feature` files and does not bind here; the
slice-to-scenario mapping lives in the roadmap, the file headers, and the per-step contract
JSONs, as it has for slices 01–04.

## D-2026-08-12-5 — Slice-05 sealed; DES tooling behaviour observed and recorded

All five steps sealed on build/f2-learning-slice05 with full TDD evidence: 05-01 (3a328e0 +
advisor round 3eb4ee1), 05-02 (a6563cf), 05-03 (69a6dad), 05-04 (5ff909c), 05-05 (4c309ff), each
with five EXECUTED phases in execution-log.json (legacy phase names — the shim rejects the
3-phase canon names), a 20-field contract JSON, red-first proof, and reverted falsifiability
mutations. Fast gate at seal: 11 passed / 0 failed / 0 skipped, exit 0, read from gate.log.

Tooling facts observed this lane, for the next orchestrator:
1. The DES stop hook validates execution-log.json in the SESSION's cwd, not the dispatched
   worktree. Here that was /Users/andres/psb-deliver-integration-20260812 (branch
   release/deliver-20260812, unrelated ancestry), so every crafter's stop reported missing
   entries that in fact exist in this worktree's committed log. Crafters were briefed to state
   the mismatch and never write into the foreign worktree; all five did exactly that. The fix is
   orchestrator-level: anchor the hook to the dispatched worktree.
2. Dispatch-time DES prompt validation works and was kept ON for every step (a proposal to run
   crafters DES-exempt was declined: the monitored path demonstrably seals work, and nw-deliver
   treats exempt roadmap steps as a delivery violation). The evidence contract JSONs are the
   accepted house fallback per HANDOFF section 10 waiver 2, and they exist for every step
   REGARDLESS of the hook's misanchoring — nothing here depends on the hook being fixed.
3. Vera/U1-U7 were N/A on every step: the slice is operator-JSON only; each roadmap step and
   contract carries its concrete non-visual rationale.

## D-2026-08-12-3 — Lane addendum: the trailing 90-day fit window becomes real

Flagged by today's ADR review: `readObservationLog` (src/learning/inputs.ts, consumed by
src/learning/fit.ts) reads the whole `log/observations/v1/` prefix unbounded, while
adr-per-reporter-offset-estimator ("trailing 90-day sample window") and 06 §5.2 ("per nightly
run, over the trailing 90-day window of samples"; §8 table "Fit window | trailing 90 d") declare
a bound. Launch-inert today (no 90 days of data exist), real gap the first morning after day 90.
Fixed in this lane as a separate commit with a regression test that fails on the pre-fix code.
Out of scope, flagged: `readPredictionLog` and `readCallLog` are also unbounded reads;
the call-log propensity window is already clipped downstream in fit.ts (`publishedCallsWithin`),
the prediction log has no declared clip at the read today.
