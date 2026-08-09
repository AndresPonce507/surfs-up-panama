# Requirement checklist: f-show-our-track-record

Extracted at workspace open (2026-08-09) from `feature-delta.md` (Slice Plan + Definition of Done
+ Pre-requisites), `domain-model.md` §9, §10 (ScorecardDay), §12 (AP10/AP11/AP15) and §13,
`adr-scorecard-incremental.md`, `06-learning-layer.md` §4, §7 (G2/G3), §8, §10 and §14,
`application-architecture.md` §7 (P1, P5), §10 and §14, `docs/DISCUSS-decisions.md` 13 and 19,
`src/data/report-vocab.ts`, and the U1-U7 UI mandates (`nw-ui-quality-mandates`). One row per
requirement. Category from the closed set {ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows whose
slice has not entered DISTILL yet are expected-uncovered (per-slice JIT); they are visible here
from day one so no requirement is silently dropped. NO test exists for this feature yet; that is
the correct JIT state, not a gap. Rows for slices 03-05 sit behind hard data/infra blocks named
in the feature-delta; no test may satisfy them by fabricating report data into a public surface.

| # | Requirement | Category |
|---|---|---|
| R1 | The spot page renders the scorecard box under the forecast sections with the verbatim §10 empty-state sentence; `{n}` and `{threshold}` are the P5 block's own integers, never hardcoded copy and never parsed from the counter display string (slice-01) | functional |
| R2 | The producer emits `scorecard{n_obs, n_reporters, threshold, counter, claim_ok, headline}` into `spot_detail` for every spot; at workspace state (no write store exists) the block is the honest zero: `n_obs 0, n_reporters 0, threshold 30, counter "0 / 30", claim_ok false, headline null` (slice-01) | functional |
| R3 | The zero is computed from the real store state, not asserted: the producer derives the block by counting what exists, and the zero-from-absence emission is structurally tied to the absence of a deployed write store (slice-01) | validation |
| R4 | The frontend renders and never computes statistics: no client or template code derives n, bias, se or claim_ok from raw data (P5, stated in those words) (slice-01) | validation |
| R5 | Counter shape is contractual: `counter` matches `"N / 30"` with `N = n_obs` and `30 = threshold`; a shape mismatch fails the build LOUD, never a silent page (P5; domain §13) (slice-01) | validation |
| R6 | The threshold constant 30 has one code home with the P5 producer consuming it; the constant is exported so the write path's P3 composer can import the same value later (decision 19; feature-delta Reuse row) (slice-01) | validation |
| R7 | Zero technical text and no em dashes on the rendered Spanish surface of the box; the sentence is not reworded (project copy rules; strings.ts verbatim discipline) (slice-01) | validation |
| R8 | The whole slice-01 journey works from a local build with zero AWS and zero network: build, open spot page, read the honest empty state (slice-01, walking skeleton) | e2e |
| R9 | Byte discipline: the box adds no island and no JS; the spot document stays within the keystone byte gate ceilings (application-architecture §5) (slice-01) | nfr |
| R10 | The claim gate is one pure function enforcing all three clauses: `n >= 10 AND distinct trust-eligible reporters >= 5 AND |bias| > 2 * se_gate`; property: for ALL inputs with fewer than 5 distinct trust-eligible reporters, `claim_ok` is false and `headline` is null (slice-02) | functional |
| R11 | Property: for ALL inputs with `n < 10`, `claim_ok` is false, regardless of every other value (slice-02) | functional |
| R12 | `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))`; property: zero-variance (coordinated) samples never produce a passing claim earlier than honest-variance samples of the same n and bias; the stored `se` field carries `se_gate`, never raw `se_sample` (06 §7 G3) (slice-02) | functional |
| R13 | Trust eligibility implements the G2 predicate over `trust-gate.json` (age at receipt, prior reports spanning prior spots); at the all-zero shipped config the eligible set equals the full set bit-identically; one AT runs a NONZERO fixture config and watches a young credential's samples drop out of every gated count (06 §7 G2, clause check:unfired-is-not-evidence) (slice-02) | validation |
| R14 | Pairing forms residuals only at `(spot_id, floor_utc_hour(observed_at))` against prediction rows per source and lead bucket, `land_masked` rows excluded; sign convention forecast-minus-observed throughout (06 §4, §5.1; domain §5) (slice-02) | functional |
| R15 | Daily aggregate items are additive and order-free: property, any permutation of the same report set yields identical window stats; appending a pair never mutates a prior day's item (ScorecardDay complement invariant, domain §10) (slice-02) | functional |
| R16 | Windowed derivation: 30d/90d sums over <= 90 daily items produce `bias = sum_err/n`, `mae = sum_abs_err/n`, `bias_se` from `sum_sq_err`; `distinct_reporters` resolves raw `device_ids[]` through C5 at read time, never stored resolved (adr-scorecard-incremental decisions 2, 4) (slice-02) | functional |
| R17 | Wind appears nowhere: no wind variable key is accepted in the grain, no wind residual is formed, and a fixture attempting a wind row is rejected loudly (domain §9 amendment 2026-08-08) (slice-02) | validation |
| R18 | `q_obs` anchors come only from `src/data/report-vocab.ts` (QUALITY_OBSERVED_SCORE); score residuals are display-point scaled with `sigma_eff_score = 25` carried as an unfit prior, cited not invented (06 §8, §14) (slice-02) | validation |
| R19 | Each refusal property is proven falsifiable: break the gate deliberately once, watch the property fail for the right reason, revert, verify the revert (project CLAUDE.md negative-test rule) (slice-02) | build |
| R20 | The scorecard is rebuildable: a recompute from prediction-log plus observation-log fixtures reproduces the incremental aggregates exactly (adr decision 6 recovery path) (slice-02) | functional |
| R21 | The hourly updater is exactly-once under the cursor: replaying the same report never double-ADDs; exactly one updater instance is declared (adr decisions 3; domain §9 deployment constraint) (slice-03, blocked) | functional |
| R22 | The builder reads reports plus scorecard rows in one query per spot (AP2+AP10 shared PK) and the bundle block switches from the slice-01 zero source to the real read (domain §12) (slice-03, blocked) | functional |
| R23 | From the day the write store exists, an unreadable scorecard source fails the publish LOUD and the prior page stands; no fabricated zero ever renders over real reports (feature-delta Pre-requisite 7 resolution) (slice-03, blocked) | validation |
| R24 | Counter coherence: the spot-page counter and the reveal counter obey the Pre-requisite 4a semantics pin; a report accepted in a builder-down hour cannot make the two surfaces contradict (slice-03, blocked) | validation |
| R25 | The headline renders only when `claim_ok` is true, replaces the counter state, prints the settled copy with `se_gate` as its ± value, and no sub-gate number renders anywhere on any page (P5; 06 §7) (slice-04, blocked) | functional |
| R26 | The key-to-spot headline selection follows the Pre-requisite 4b pin; no test may invent the rule (slice-04, blocked) | validation |
| R27 | The monthly metrics file carries the six settled rows: pairwise ranking accuracy (same reporter_key, same local day, 2+ spots, ties under one quality step excluded, vs B1 `baseline_rank_raw`), Brier + calibration binned by conf_level vs B0, MAE per key, sigma_human, selection imbalance, shrinkage report (06 §10) (slice-05, blocked) | functional |
| R28 | Pair-counting toward the 400-pair product-claim ladder is tracked in the file and claimed nowhere in any copy until the threshold and positive lift are real (06 §10; 09 §10.4) (slice-05, blocked) | validation |
| R29 | The kill switch is executable: a calibration result where high-confidence days are not more often right produces a recorded removal verdict for the offending confidence term, removal not reweighting, with C_spread named first candidate (06 §10; 09 §3.6 consequence 3) (slice-05, blocked) | functional |
| R30 | The evaluation reads only `predictions/`, `log/observations/`, `log/calls/` and the C5 resolution; it never reads the write store directly (06 §2 boundary) (slice-05, blocked) | security |
| R31 | U1: text on the scorecard card clears its declared WCAG ratio computed against the real card backdrop in both themes (visible slices) | ui |
| R32 | U2: no horizontal scroll, clipping or overlap at 390 px with the box present, in counter state and (later) headline state, including the longest settled Spanish strings (visible slices) | ui |
| R33 | U3: any tappable element the box gains measures at least 44 px; at slice-01 the box is static and this row records that fact rather than fabricating a target check (visible slices) | ui |
| R34 | U4: reduced-motion honoured; the box adds no animation that delays first meaningful content (visible slices) | ui |
| R35 | U5: the designed states are real and honestly distinct: empty-counter state, counting state, claim state; a claim never reads as a counter and a counter never reads as an error (visible slices) | ui |
| R36 | U6: the counter digits render tabular-nums per the shipped recipe; type survives the verbatim sentence at 390 px without truncation (visible slices) | ui |
| R37 | U7: the box uses the shipped `.scorecard`/`.state-empty` tokens and recipes; no raw hex outside src/styles (visible slices) | ui |

## Current DISTILL coverage

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| All rows R1 to R37 | none: no `.feature` file, step definition, scaffold or test module exists for this feature | Expected-uncovered under the JIT rule (HANDOFF §1). slice-01 rows R1-R9 and the applicable U-rows become coverable at slice-01 JIT DISTILL, gated on the keystone seam (feature-delta Pre-requisite 2) and the header-copy answer (Pre-requisite 1a, fallback declared). slice-02 rows R10-R20 are coverable immediately after, zero AWS, fixture-fed. Rows R21-R30 sit behind the HARD blocks: deployed write path with real reports (Pre-requisite 5), the loud-failure amendment (7), the semantics pins (4), the export-fn ownership gap (8), the claim copy (1b), and months of organic data for R25-R26. No fixture may stand in for real data on a public surface: fixtures prove arithmetic, never the honesty state of a shipped page. |
