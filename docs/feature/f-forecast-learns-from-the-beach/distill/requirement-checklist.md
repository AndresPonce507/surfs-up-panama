# Requirement checklist: f-forecast-learns-from-the-beach

Extracted at slice-01 JIT DISTILL open (2026-08-09) from `feature-delta.md` (Slice Plan,
Definition of Done, Pre-requisites, Reuse Analysis), `06-learning-layer.md` in full
(§2 input universe, §4 conventions, §5.1 residual forms, §5.2 reporter offset, §5.3 pooling,
§6 weights, §7 gates and clamps, §8 parameter table and the wind claim-exemption paragraph,
§10 metrics, §11 worked example, §14 items 2 and 5), `adr-correction-gates-and-clamps.md`,
`adr-per-reporter-offset-estimator.md`, `adr-pooling-hierarchy-activation.md`,
`domain-model.md` §7 (observation record), §9 (scorecard grain, wind dropped), §10 (SpotDefinition
invariant), §11 (`spot-correction/1` schema and the read-time gates), `docs/DISCUSS-decisions.md`
22, 24, 28, and `nw-ui-quality-mandates`. One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body.
Rows whose slice has not entered DISTILL yet are expected-uncovered (per-slice JIT); they are
visible here from day one so no requirement is silently dropped.

`docs/product/architecture/brief.md` does not exist in this repository. The Architecture SSOT for
this feature is `06-learning-layer.md` plus its three ADRs; driving ports were derived from there
and from the shipped seams named in the feature-delta's seam audit.

| # | Requirement | Category |
|---|---|---|
| R1 | Fed nothing at all, the nightly fit completes and writes no correction for any spot: zero reports produce zero correction files, not an empty or default one (slice-01) | functional |
| R2 | Exactly two residual forms exist, `r_height[i,m,l] = H_eff_pred - (mid(band_i) - u_hat[r(i)])` and `r_score[i] = score_q_shown[i] - q_obs(quality_i)`, per 06 §5.1. No third form exists anywhere and no output implies one (slice-01) | functional |
| R3 | A report whose captured prediction is absent contributes no score residual at all; it is skipped, never defaulted, and never changes the score delta's count (slice-01) | validation |
| R4 | `u_hat` enters at exactly 0 while no reporter has any history, which is the literal truth at ship time; the residual is formed against that zero, not against an implicit prior (slice-01) | functional |
| R5 | G1: below ten paired mornings at a key, the fit refuses to apply and records the count it refused on (slice-01) | validation |
| R6 | G2: below five distinct trust-eligible reporters at a key, the fit refuses to apply and records the reporter count it refused on (slice-01) | validation |
| R7 | G2 trust eligibility is a proven no-op at the shipped zero config (`{min_credential_age_days: 0, min_prior_reports: 0, min_prior_spots: 2}`): every sample counts and every gated count equals the ungated one (slice-01) | validation |
| R8 | G2 fires under a nonzero config: a credential too young for the configured standing drops its samples out of the fit AND out of every gated count, `n` and distinct reporters both. Clause `check:unfired-is-not-evidence` (slice-01) | validation |
| R9 | G3: a key is applied only when `abs(b_shrunk) > 2 * se_gate`, `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))`, with `sigma_eff` height 0.48 m and score 25 points, one home each (slice-01) | validation |
| R10 | The emitted `se` field carries `se_gate`, never raw `se_sample`, so no reader can print a precision the physical noise floor says is impossible (06 §7, pinned) (slice-01) | validation |
| R11 | Anti-coordination: perfectly agreeing samples never pass the significance gate more easily than honest spread. Fabricated zero-variance evidence is refused categorically at any magnitude the floor covers (research 15 §15.1) (slice-01) | security |
| R12 | G4: only the shrunken estimate reaches the file. The raw weighted mean is never emitted, and the emitted value never exceeds it in magnitude nor flips its sign (slice-01) | validation |
| R13 | The gate is watched PASSING, not only refusing: twenty-two mornings from seven distinct trust-eligible reporters at one key clear G1-G4 and the key is marked applied, on the 06 §11 worked example (slice-01) | functional |
| R14 | Emission is schema `spot-correction/1` exactly as `domain-model.md` §11 pins it: `score_delta.units` is `display_points` and nothing else is legal; the clamp bounds 0.40 and 12 are written for the reader; `bias.swell_h_m.per_source.<source>.<lead_bucket>` carries `b`, `se`, `n`, `reporters`, `applied` (slice-01) | functional |
| R15 | No code path can mark a correction applied except the gate itself. A source universe that constructs the applied state anywhere else is refused by a declaration examination, and the shipped source has no such construction site at all (slice-01) | security |
| R16 | BINDING WIND PRECONDITION, mechanically enforced: wind is claim-exempt and no categorical-wind residual model exists today; if one ever ships it must declare its own `sigma_eff`, in that residual's units, derived from the label's confusion structure and bound to its own significance gate. A source universe declaring a wind residual without that floor is refused (06 §8; DoD row 4) (slice-01) | security |
| R17 | Which wind a reporter named never changes a single number the fit writes: wind carries no residual, no bias, no standard error and nothing for a gate to evaluate (06 §8; domain-model §9 amended) (slice-01) | validation |
| R18 | The published morning call is byte-identical whether no correction file exists or a refusing one does: the shipped builder's output universe is unchanged by anything this slice writes (slice-01) | functional |
| R19 | Nothing overstates: no emitted field, event, scenario title or step name claims accuracy, learning or a moved forecast on synthetic fixtures. What is proven on fixtures is stated as machinery (DoD row 13; decision 19) (slice-01) | validation |
| R20 | The builder loads `learned/corrections/v1/current/<spot_id>.json` through the already-shipped `getCorrection` seam and parses it with this feature's loader (slice-02, needs Pre-requisite 1) | functional |
| R21 | The builder re-checks G1-G3 at read time before applying anything, so a hand-forged or stale file cannot move a number past the same gates the emitter enforced. One rule, two enforcement sites, never drifting (slice-02) | security |
| R22 | G5 clamp at apply time: the applied height correction never exceeds 40% of the forecast height (slice-02) | validation |
| R23 | G6 clamp at apply time: the applied score delta never exceeds 12 display points (slice-02) | validation |
| R24 | A malformed correction file is treated as absent and says so with an event; it never becomes a partial or default correction (slice-02) | validation |
| R25 | Any `score_delta.units` other than `display_points` is rejected loudly at read time, so a hundredfold misread fails instead of printing (slice-02) | validation |
| R26 | Deleting every correction file reverts the product to day-zero seed physics on the next build (slice-02) | functional |
| R27 | The shipped launch identity survives the real body: `applyCorrection(seed, null)` still returns gate `no_file`, zero score delta and zero member height bias, and `combine` keeps arity 3 (slice-02, PRESERVE) | validation |
| R28 | Five levels keyed only on seed data; basin is a hard partition and a Caribbean spot can never borrow a Pacific bias at any weight (slice-03) | functional |
| R29 | Cold start is the `n = 0` limit: a two-report spot rides its parents, and one loud rating moves a new spot by `1/(1+tau)` of itself (slice-03) | functional |
| R30 | Similarity groups ship collapsed and activate per group at >= 3 gated spots with no code change; tau prior 6, permanent floor 2, method-of-moments switchover at >= 8 gated spots (slice-03) | functional |
| R31 | Robustness exactly 06 §6.2: per (spot, day, device) median collapse, winsorization at +/- 2 band widths when >= 3 device-samples, concordance clipped to [0.2, 1.0], newcomers at weight 1, never a ban (slice-04) | functional |
| R32 | Selection exactly 06 §6.3: inverse-propensity by published-score decile, trailing 90 days, pooled, capped at 3; `trigger = push_solicited` weighted exactly 1; overrides default absent = 1 and adjudicate reporters, never reports (slice-04) | functional |
| R33 | Per-reporter offset exactly the ADR: backfitting, 3 iterations, shrink toward zero with `tau_u = 4`, half weight at 4 reports, trust at ~8 across >= 2 spots, and `u_r` never published, displayed or keyed to a visible identity (slice-04) | security |
| R34 | G7 exists and is watched killing: monthly rolling-origin blocked CV (train weeks 1-8, test 9-10); corrected losing at the majority of gated keys flips `applied: false` everywhere until a human looks; random k-fold is structurally absent, not merely unused (slice-05) | functional |
| R35 | The monthly metrics file carries every 06 §10 row, including the calibration check that can REMOVE a failing confidence term and the shrinkage report that flags a misconfigured pooling (slice-05) | functional |
| R36 | The nightly job writes exactly `current/<spot_id>.json` plus one `history/dt=` copy and holds no credential for any other prefix; the IAM complement is asserted credential-free before any deploy (slice-06) | security |
| R37 | The human seed values are never overwritten: seed is human-PR-only, correction is machine-only, and no code path writes a seed file (decision 22; domain-model §10) (slice-06, slice-07) | security |
| R38 | A spot with >= 10 real pairs from >= 5 distinct trust-eligible reporters clearing significance publishes a corrected number, and every thinner-evidence spot publishes exactly what it would have published with no learning layer at all (slice-07) | e2e |
| R39 | The archived call records which correction was live: `bias_applied` and `bias_gate` carried in the immutable PublishedCall for that build (slice-07) | functional |
| R40 | UI disposition, recorded honestly: slices 01 to 06 are non-visual and carry the N/A rationales in the feature-delta classification table rather than fabricated pixel checks; slice-07 renders on existing keystone-owned surfaces, adds zero new styles, tokens or states, so U1-U7 hold by inheritance and are not re-fabricated, and its U8 observation is public-surface only | ui |

## Current DISTILL coverage

| Requirement | Active acceptance evidence | Status |
|---|---|---|
| R1 | `the-fit-refuses-until-the-evidence-earns-it.feature`: "Nobody has reported a session yet, so the nightly fit writes nothing at all" | covered, RED |
| R2 | same file: "Every residual the fit forms is the forecast against what a person actually saw"; and `no-correction-can-be-applied-without-the-gate.feature`: "The shipped source forms no residual for wind at all" | covered, RED |
| R3 | same file: "A morning nobody had a forecast for contributes nothing to the score delta" | covered, RED |
| R4 | same file: "Every residual the fit forms is the forecast against what a person actually saw" (the personal habit enters at zero while nobody has history) | covered, RED |
| R5 | same file: "Nine mornings from three people are too few to correct anything" | covered, RED |
| R6 | same file: "Twelve mornings still buy nothing, because five different people are required" | covered, RED |
| R7 | same file: "The shipped trust settings drop nobody" | covered, RED |
| R8 | same file: "A trust setting that asks for a month of standing drops this morning's credential" | covered, RED |
| R9 | same file: "Enough people, but the difference is too small to tell from noise" and "Twenty-two mornings from seven people finally earn a correction" | covered, RED |
| R10 | same file: "Twenty-two reports that agree perfectly buy nothing honest disagreement could not" | covered, RED |
| R11 | same file: same scenario plus the property "No amount of agreement makes a small difference publishable" | covered, RED |
| R12 | same file: property "The stored correction never leaves the corridor between the raw difference and its parent" | covered, RED |
| R13 | same file: "Twenty-two mornings from seven people finally earn a correction" | covered, RED |
| R14 | same file: "The correction states its score move in the points a surfer sees" | covered, RED |
| R15 | `no-correction-can-be-applied-without-the-gate.feature`: "Nothing in the shipped source can mark a correction applied" and the outline "Only the gate may mark a correction applied" | covered, RED |
| R16 | same file: outline "A wind residual may not ship without its own noise floor" and "The shipped source forms no residual for wind at all" | covered, RED |
| R17 | `the-fit-refuses-until-the-evidence-earns-it.feature`: property "Which wind a reporter named changes no number the fit writes" | covered, RED |
| R18 | same file: the seed-identity assertion carried by the refusal scenarios and by "Twenty-two mornings from seven people finally earn a correction" | covered, RED |
| R19 | `the-fit-refuses-until-the-evidence-earns-it.feature`: the walking skeleton bears `@covers-R19`; the feature prose and the recovery review prohibit learning or accuracy language for fixture evidence | covered by direct tag + naming review |
| R20 | `a-correction-file-can-never-move-a-number-past-the-gates.feature`: "A stored correction that passed every gate finally moves the number a surfer reads" and "A correction the gates refused is carried in silence and changes nothing" | authored, scaffold-parked (slice-02) |
| R21 | same file: both hand-forged scenarios plus the refused-carried one | authored, scaffold-parked (slice-02) |
| R22 | same file: "However big the stored move, the published height never moves past forty percent of the forecast" | authored, scaffold-parked (slice-02) |
| R23 | same file: "However big the stored move, the published score never moves more than twelve points" | authored, scaffold-parked (slice-02) |
| R24 | same file: "An unreadable correction file is read as absent, and the reader says why" | authored, scaffold-parked (slice-02) |
| R25 | same file: "A score move stated in any unit but the points a surfer sees is refused by name" | authored, scaffold-parked (slice-02) |
| R26 | same file: "Deleting every correction file returns the product to day zero on the next build" | authored, scaffold-parked (slice-02) |
| R27 | `a-correction-file-can-never-move-a-number-past-the-gates.feature`: the deletion/revert scenario bears `@covers-R27`; shipped `scoring-laws.test.ts` no-file property and keystone launch-identity scenario remain the PRESERVE regression net | covered by direct tag + shipped tests |
| R28 | `a-new-spot-rides-its-parents-not-its-own-noise.feature`: "A Caribbean spot can never borrow a Pacific bias, at any weight" and the rides-its-parents scenario | authored, scaffold-parked (slice-03) |
| R29 | same file: rides-its-parents plus the property "One loud rating moves a brand-new spot by only a sliver of itself" | authored, scaffold-parked (slice-03) |
| R30 | same file: the group-activation pair and "Once eight spots have proven themselves different, pooling steps aside on its own" | authored, scaffold-parked (slice-03) |
| R31 | `one-voice-counts-once-and-a-habit-is-subtracted.feature`: session collapse, the wild-claim fence, chronic disagreement, the newcomer guard | authored, scaffold-parked (slice-04) |
| R32 | same file: the rarely-reported-day pair plus the incident-file scenario | authored, scaffold-parked (slice-04) |
| R33 | same file: "A habit of calling it big, seen at two beaches, is measured and mostly subtracted" (including the never-published scan) | authored, scaffold-parked (slice-04) |
| R34 | `a-bad-month-degrades-to-day-zero-not-to-silently-wrong-numbers.feature`: the kill/spare pair plus the shuffled-time outline | authored, scaffold-parked (slice-05) |
| R35 | same file: the hazards scenario, the calibration-removal scenario, the shrinkage-alarm scenario | authored, scaffold-parked (slice-05) |
| R36 | `the-learning-jobs-can-write-only-their-own-shelves.feature`: all four declaration scenarios | authored, scaffold-parked (slice-06) |
| R37 | same file's widened-fence scenario plus `the-published-number-finally-moves-and-the-archive-says-why.feature`: "Neither learning job can touch anything but its own shelves" | authored, scaffold-parked (slice-06, slice-07) |
| R38 | `the-published-number-finally-moves-and-the-archive-says-why.feature`: the number-moves scenario and the below-the-gate scenario | authored, scaffold-parked (slice-07); the REAL half stays blocked on Pre-requisites 2 and 3 |
| R39 | same two scenarios' archived-call oracles (`bias_applied`, `bias_gate`) | authored, scaffold-parked (slice-07) |
| R40 | One representative scenario in every slice bears `@covers-R40`; charters 01-06 record non-visual N/A boundaries, and slice-07's roadmap 07-04 carries the executable U1-U7 inheritance guard, U8 public-surface observation, and charter | covered by direct tags + classification contract; slice-07 examination BLOCKED |

Coverage note, 2026-08-10: slices 02-07 were authored ahead of their JIT turn on the owner's
explicit instruction. They are PARKED behind the feature-scoped skip marker in
`tests/acceptance/f-forecast-learns-from-the-beach/steps/support/pending-slices.ts`; the
authoring-time RED/guard observations in `red-classification.md` are diagnostic only. A later
slice is not entered, ready, or passing until its own marker is removed and a fresh RED run is
recorded against the then-current seams and prerequisites.
