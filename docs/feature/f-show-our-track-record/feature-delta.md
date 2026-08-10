<!-- des-feature-context-bootstrap: {"feature_id":"f-show-our-track-record","intent":"A surfer reads, right under the forecast, how often we have actually been right at this spot lately, and where there are not enough reports yet the site shows the count instead of inventing a number.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-show-our-track-record

Intent: A surfer reads, right under the forecast, how often we have actually been right at this
spot lately, and where there are not enough reports yet the site shows the count instead of
inventing a number.

Workspace opened 2026-08-09 on lane `build/f2-record`. This is the DOCS-ONLY workspace creation:
no acceptance test, no step definition, and no production code exists for this feature yet. Each
slice's tests are written Just In Time when that slice legally enters DISTILL, per the project
rule in `HANDOFF.md` §1 (DISTILL row).

Identity, found not authored: the canonical id is `F-SHOW-OUR-TRACK-RECORD`, epic row 8 of 11 in
`docs/epic/surfs-up-panama/epic-delta.md` (status `pending`, annotation
`depends-on F-TELL-US-WHAT-YOU-SAW-COLD`, justification citing `docs/DISCUSS-decisions.md` 13 and
19). The row is byte-identical on `design-round-1` and on this branch. The workspace id follows
the three-of-four house convention (`f-` prefix, lowercased label). `BUILD-ORDER.md` and
`plan-cluster-*.md`, which the two sibling workspaces cite, exist in NO commit on any branch and
were not found on disk in this worktree or in `/Users/andres/panama-surf` (verified 2026-08-09 by
git object search plus filesystem glob); no plan-cluster file for this feature could be located,
so no prior slice thinking exists for it anywhere. Everything below the epic row and the settled
DESIGN corpus is authored here.

**The fact this whole plan is built around: ZERO surf reports have ever been filed.** No write
path is deployed, no observation store exists (`src/` has no observation module; `infra/lib/` has
no write stack; F-TELL-US-WHAT-YOU-SAW-COLD is opened but "Not building yet" with its deploy
slices blocked). The scorecard is the prediction log joined to the observation record
(epic row 50), so this feature's input does not exist and will not exist until the report path
ships and real surfers use it. `06-learning-layer.md` §10 states the consequence outright: "At
launch both gates fail everywhere, by construction. What may be claimed on day 1: better
organised, better explained, more honest about uncertainty." A slice that seeded, fabricated or
demo-filled an accuracy number would be the most damaging thing this product could ship, because
its entire premise is never claiming more certainty than the data earns (project CLAUDE.md, "The
one rule the whole product rests on"; research 09 §14.4). The honest day-one deliverable is the
settled empty state, and it is real, user-visible, and shippable now.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer on any spot page reads, in the scorecard box right under the forecast, the honest day-one answer, verbatim settled copy: "Todavía no podemos decirte si acertamos aquí. Van 0 reportes de los 30 que hacen falta." The zero is computed from the real report store, which provably holds nothing, never asserted as copy. | pending | @walking_skeleton, buildable-today | Decision 13 puts the track record inline on every spot; decision 19 says say it plainly and show the counter. The Spanish is settled word for word: `application-architecture.md` §10 "Day-one empty state" (es and en both exist there), rendered in the §14 spot-detail wireframe as the boxed card. The wire shape is settled: P5 `scorecard{n_obs, n_reporters, counter, claim_ok, headline}` inside `spot_detail` (`application-architecture.md` §7), with `threshold` as an integer beside the `counter` display string precisely so this sentence's `{n}` and `{threshold}` are the block's own two numbers, never parsed out of a display string (`domain-model.md` §13, added for exactly this empty state). `06-learning-layer.md` §11 Day 0 row is this slice: "No correction file... scorecard shows 0 / 30". Honesty of the zero: the write store does not exist, so a producer that derives the block from the store's real state emits 0 truthfully today; the emission rule is "count what is there", and what is there is nothing. The frontend renders and never computes statistics (P5, stated in those words). Already real on disk: `.scorecard` and `.state-empty` recipes with tabular-nums counter (`src/styles/recipes.css` 61-116); the P5 degrade row naming the day-one empty state; the verbatim string pattern in `src/i18n/strings.ts`. Absent on disk: `BundleSpotDetail` carries `name` only (`src/publish/region-bundle.ts` 63-66; `domain-model.md` §13 records scorecard as "deliberately absent rather than fabricated" because it had no producer); `SpotDetail.astro` renders no scorecard (its own header comment defers it to this data contract); the empty-state string is not yet in `strings.ts`. This slice ships the producer and the render together, closing the consumer-known-before-produced loop. Two constraints carried: (a) the zero-from-absence emission is legal ONLY while no write store is deployed, and slice-03 owns replacing the source with the real read plus the read-failure behaviour, so the counter can never silently lie later; (b) `src/pipeline/build.ts`, `src/publish/region-bundle.ts` and `src/components/SpotDetail.astro` are keystone-lane files with keystone slices 06-08 in flight (`HANDOFF.md` §10), a contended seam settled before dispatch per HANDOFF §7, so this slice runs serial behind or coordinated with that lane. Box header copy is Pre-requisite 1a. |
| slice-02 | The scorecard arithmetic exists as law-proven pure functions: pairing a report against the prediction log, the daily aggregate, the 30 and 90 day windows, and the claim gate that refuses to publish any number below 10 pairs, 5 distinct trust-eligible reporters, and twice the floored standard error. The k >= 5 rule is executable code that the tests demonstrate refusing, not a comment. | pending | depends-on slice-01, buildable-today | The metrics design is settled and this slice implements it without inventing any of it. Grain `(spot_id, source, lead_bucket, variable)`, `variable in {swell_h, score}`, wind DROPPED from the grain in the 2026-08-08 coherence round because a categorical wind label has no signed error (`domain-model.md` §9, `adr-scorecard-incremental.md` decision 1); wind must not come back, and its return path is bound to a precondition this slice does not meet (06 §8, binding precondition). Daily aggregate `{n, sum_err, sum_abs_err, sum_sq_err, device_ids[]}` with raw device ids resolved through C5 at read time (ADR decisions 2 and 4); windowed derivation `bias = mean(forecast - observed)`, `mae`, `bias_se`, sign convention forecast-minus-observed stated once (06 §4). The gate, all three clauses in code: `n >= 10 AND distinct trust-eligible reporter_key >= 5 AND |bias| > 2 * se_gate` with `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))`; the floor exists because fabricated reports agree with each other and the unfloored test rewards exactly the coordinated lying it should stop (`domain-model.md` §9, 06 §7 G2/G3, research 15 §15.1). Trust eligibility evaluates the G2 predicate over `data/config/trust-gate.json`, shipped all-zero, a proven launch no-op that must still be demonstrated firing against a nonzero fixture config, because a gate never seen firing proves nothing (06 §7, clause check:unfired-is-not-evidence). `q_obs` anchors come from the one shipped constants home `src/data/report-vocab.ts` (Bad 20 / OK 45 / Good 70 / Epic 90) and carry that file's own caveat: unfit priors per 06 §14, the score residual inherits their arbitrariness, and `sigma_eff_score = 25` points is one anchor step. House paradigm applies directly: functional, pure transformations, `fast-check` properties in the `tests/unit/scoring-laws.test.ts` style (project CLAUDE.md); the laws to prove are the refusal laws (below k=5 or n=10 nothing publishes, ever), the floor law (zero-variance samples never tighten the gate), aggregate additivity (report order never changes window stats), the complement invariant (appending a pair mutates no prior day's item), and counter shape (`"N / 30"`). Zero AWS, fixture-fed, renders nothing, so every sentence it ships is true. |
| slice-03 | From the first real report onward the spot-page counter tells the truth about how many have arrived: the hourly updater pairs each new report exactly once against the prediction log, the site builder reads the real aggregates, and "Van 3 reportes de los 30" renders because three reports actually exist. | blocked | depends-on slice-02, HARD BLOCKED: needs the deployed write path and real reports | First slice that cannot exist without report data and deployed write infrastructure, so it is the boundary line of this plan. Mechanism is settled: hourly scorecard updater, cursor-tracked exactly-once, one atomic `ADD` per residual sample onto the daily aggregate item, exactly one updater instance at a time (`adr-scorecard-incremental.md` decisions 2-3, `domain-model.md` §9 deployment constraint); access patterns AP10/AP11/AP15 with reports and scorecard sharing `PK=SPOT#` so the builder issues one query per spot (`domain-model.md` §12); recovery is full recompute from `predictions/` plus `log/observations/`, the projection property this design bought on purpose (ADR decision 6). Blocked by, precisely: F-TELL-US-WHAT-YOU-SAW-COLD slice-03 must be shipped and receiving reports (its own plan marks it deploy-blocked on the Lambda concurrency quota, still AccessDenied for andres-cli, and on the missing write stack, its Pre-requisites 2 and 5); the updater's stack home and reserved-concurrency budget are unassigned (Pre-requisites 5 and 6 here). Two honesty obligations land here rather than later: (a) the moment the store exists, the slice-01 zero-from-absence emission becomes illegal, and an unreadable scorecard source must fail the publish LOUD like a load-bearing P1 field instead of degrading to a fabricated zero, because from that day a silent 0 understates real reports (recommendation recorded as Pre-requisite 7; the P1 degrade row as written predates the store existing); (b) sequencing with the reveal counter: F-TELL slice-04 renders "Reporte {n} de {threshold}" from the write path's own counter item, and this slice must land with or before that release so the spot page and the reveal cannot contradict each other about the same spot in the same week; the exact semantics pin (stored reports vs verified pairs at spot grain) is Pre-requisite 4, a DESIGN call this plan does not invent. |
| slice-04 | The first morning a spot has earned it, the same box stops counting and starts claiming: a plain-Spanish sentence in the shape of "corre chico aquí: 0.18 m de menos (n=22, 7 personas, ±0.09)" renders because 22 verified pairs from 7 different people cleared every gate, and the ± printed is the floored standard error that coordinated liars cannot shrink. | blocked | depends-on slice-03, HARD BLOCKED: no spot can pass the gate for months, and the claim copy is not settled | The decision-13 differentiator made real, and the reason it cannot be rushed is structural: the gate that makes the claim honest also makes it unearnable at launch (06 §10: both claim ladders fail everywhere at launch by construction; research 09 §13.3 bars any bias claim smaller than twice its standard error; epic row 50 carries the same bar). Organic accumulation to `n >= 10` pairs and 5 distinct trust-eligible reporters at one `(spot, source, lead)` key is a matter of months at launch volumes, and solicited reports, the main volume lever, belong to F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE. What this slice ships when it unblocks: `claim_ok: true` flips on real data, `headline` (display-ready, composed producer-side, P5) renders in the box in place of the counter, the printed `se` is `se_gate` and never raw `se_sample` (field semantics pinned in 06 §7: the stored `se` field carries the floored value so no surface can print a precision the physical noise floor says is impossible), and no sub-gate number renders anywhere, ever. Two open items gate its DISTILL beyond data: the Spanish claim copy has never been settled (the 06 §11 sentence is a worked example inside a design doc, not §10 copy; 06 §14 item 6 additionally records that the fitted-on-good-days caveat copy "nobody has designed"; both route through the cousin's crew channel, Pre-requisite 1b); and the key-to-spot selection rule (which `(source, lead_bucket)` key's claim a spot page shows when several are gated) is pinned nowhere in the corpus, Pre-requisite 4b, a domain-lane call. Charter honesty: this slice's real-surface examination cannot happen before a real spot passes the gate; fixture-proven at DISTILL, with the real-data examination recorded as deferred rather than pretended. |
| slice-05 | Once a month the product grades itself in writing where Andres can read it: pairwise ranking accuracy against the raw-model baseline with progress toward the 400 pairs a public claim needs, the Brier and calibration table per confidence level, and the kill-switch verdict that removes a confidence term the day the data shows high-confidence mornings are not more often right. C_spread is the first candidate to die. | blocked | depends-on slice-03, parallel-safe with slice-04, HARD BLOCKED: meaningless without report data, and its observation-log input has no producer slice anywhere | THE metric is pairwise ranking accuracy: same `reporter_key`, same local day, 2 or more spots rated, did our ranking order the pair the way their quality labels did, ties under one quality step excluded, benchmarked against B1 raw-model ranking via `baseline_rank_raw` vs `our_rank` (06 §10; research 09 §10.2). It is within-person by construction, so personal constants cancel, which is also why the anti-anchoring cost of decision 28 never lands on this headline evaluation (06 §5.2). Beside it: Brier score plus calibration curve with `quality in {good, epic}` as the event and `score_q / 100` as the naive v1 probability, stated as naive, binned by `conf_level`, baseline B0 climatology; MAE per key (tracks convergence, never the headline); the sigma_human ceiling; selection imbalance per score decile; the shrinkage report (06 §10 table, all six rows). The confidence kill switch lives in this slice and its rule is removal, not reweighting: if high-confidence days are not more often right, the offending confidence term is REMOVED, C_spread first (09 §3.6 consequence 3, four cited studies; 06 §10 owns the switch; 05's S4 clause "scoring must not couple anything else to its existence" exists precisely so this switch can fire without collateral). The two claim ladders stay separate forever: the per-spot scorecard claim (slice-04's gate) and the product-level "better than the raw model" claim, which needs about 400 same-day multi-spot pairs with positive lift and which NO slice in this plan may claim early; this slice only counts progress toward it. Blocked by, precisely: report data (zero pairs exist, and a metrics file of zeros is not a verdict Andres can act on); the nightly observation export (07 §7.4 export fn, AP13, 00:30Z), which writes `log/observations/v1` and appears in NO slice plan of any opened workspace, an ownership gap recorded as Pre-requisite 8; and the B1 baseline fields, which the shipped PublishedCall writer does not emit, Pre-requisite 3, flagged loudly because the log is append-only. |

Notes on the plan:

- **The split is the plan.** Slices 01 and 02 are the entire surface of this feature that is
  buildable today, and they are the whole honest day-one product: the settled empty state
  computed from a provably empty store, and the projection arithmetic proven by property tests
  against fixtures. Slices 03, 04 and 05, which is to say the counter moving, the headline
  claim, and the self-grading, are HARD BLOCKED on report data that does not exist, cannot be
  seeded, and only arrives after F-TELL-US-WHAT-YOU-SAW-COLD ships its write path and real
  surfers use it. Most of this feature is blocked, and that is stated here in the plan, not
  only in a status report. Anyone who "unblocks" slices 03-05 by fabricating, seeding or
  demo-filling reports has shipped the one thing this product exists to never do.
- No slice ships a sentence that is not true at the moment it ships. The empty state is true at
  n=0 because n really is 0 and is computed, not hardcoded. The counter renders real counts
  only. The headline renders only behind the triple gate. The metrics file renders verdicts
  only from real pairs.
- Row order is dependency order, backward only. `blocked` in the Status column marks the hard
  data/infra blocks the dispatch demanded be explicit; those rows flip to `pending` when their
  named pre-requisites clear, then follow the normal pending -> shipped lifecycle.
- The k >= 5 publish gate is a Definition of Done row and an executable law (slice-02), never a
  comment. Same for n >= 10 and the se_gate floor.
- Wind stays out of the scorecard grain (dropped 2026-08-08 coherence round, `domain-model.md`
  §9, `adr-scorecard-incremental.md` decision 1). A slice or test that reintroduces a wind row,
  a wind residual, or a wind sigma_eff is a defect. The stage-2 return path carries its own
  binding precondition (06 §8) and is not this feature's to open.
- Cross-lane seams, settled in writing before any parallel dispatch (HANDOFF §7 lesson):
  `src/pipeline/build.ts`, `src/publish/region-bundle.ts` and `src/components/SpotDetail.astro`
  belong to the keystone lane with slices 06-08 in flight; this feature's slice-01 edits land
  serial behind or explicitly coordinated with that lane. The reveal counter and the write-path
  COUNTER item belong to F-TELL slice-03/04. The confidence terms and their display belong to
  F-KNOW-HOW-MUCH-TO-TRUST-IT; this feature delivers the calibration verdict that can kill a
  term, and the scorecard `mae`/`mae_climatology` fields that C_track consumes (05 S4), never
  the terms themselves.
- File discipline of this lane: this workspace touches `docs/feature/f-show-our-track-record/`
  only. Two owed edits are recorded rather than made: the epic-delta row flip to `in-flight`
  with the workspace link (one atomic edit, integrator's), and the slice charters under
  `docs/product/expectations/f-show-our-track-record/` (owed at each slice's DISTILL open, per
  the classification table below).

## Wave: DISCUSS / [REF] Slice classification

Required at DISTILL open per `HANDOFF.md` §4 (classify every slice as user-visible or
non-visual), recorded now so it is not invented later. Charters are owed under
`docs/product/expectations/f-show-our-track-record/` at each slice's DISTILL open; they are not
created in this DOCS-ONLY pass because that path is outside this lane's declared file boundary.

| Slice | Classification | Note |
|---|---|---|
| slice-01 | user-visible | The scorecard box with the day-one empty state is the whole slice. U1 to U7 checks plus a U8 observation apply, at 390 px, both themes, reduced motion aware, contrast measured on the real card backdrop; the counter digits render tabular-nums per the shipped recipe. U8 observation seed: a person opens any spot page and reads, under the forecast, that we cannot say yet whether we get this spot right, with a count of 0 of 30, and finds no invented number anywhere on the page |
| slice-02 | non-visual | Creates no rendered surface. UI N/A rationale: this slice is pure functions and property tests over fixtures; it emits no HTML and changes no page. Fabricating pixel checks here would be dishonest. Its charter examines the test run refusing sub-gate claims, including the nonzero trust-gate fixture demonstration |
| slice-03 | user-visible | The counter incrementing from real reports is a rendered spot-page state; blocked until real reports exist |
| slice-04 | user-visible | The gated headline replacing the counter is the most consequential surface this feature produces; blocked until a real spot passes the gate and the claim copy is settled |
| slice-05 | non-visual | Operator-facing. UI N/A rationale: the deliverable is `learned/metrics/v1/dt=<month>/metrics.json` and the kill-switch verdict inside it; no page renders it at launch (a public accuracy page is out-of-scope below). Its charter examines the emitted metrics file and job output |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | Every spot page shows exactly one of: the honest counter state, or a gated claim; never both, never neither, never any number below the gate (decisions 13, 19; `domain-model.md` §9). |
| 2 | The day-one sentence is computed, not asserted: `{n}` and `{threshold}` render from the P5 scorecard block's own integers, the Spanish is the `application-architecture.md` §10 verbatim string unreworded, no em dashes, zero technical text on the surface. |
| 3 | The claim gate is enforced in code with all three clauses, `n >= 10 AND distinct trust-eligible reporters >= 5 AND |bias| > 2 * se_gate`, and the k >= 5 clause is demonstrated refusing in property tests; the trust-eligibility clause is additionally demonstrated firing against a nonzero fixture config, because an unfired gate is not evidence (06 §7 G2/G3). |
| 4 | The displayed and stored `se` is `se_gate`, never raw `se_sample`, so no surface can print a precision below the physical noise floor (06 §7, field semantics pinned). |
| 5 | Wind appears nowhere in the grain, the aggregates, the residuals or the payload; a wind row is a loud failure, not a silent extra (`domain-model.md` §9, 2026-08-08 amendment). |
| 6 | Pairing is exactly-once under the cursor with a single updater instance; appending a pair never mutates a prior day's item; and the whole scorecard is demonstrated rebuildable from `predictions/` plus `log/observations/` in a recompute test (`adr-scorecard-incremental.md` decisions 3, 6). |
| 7 | From the day the write store exists, an unreadable scorecard source fails the publish LOUD and the prior page stands; the counter can never silently render a fabricated zero over real reports (Pre-requisite 7 resolution honored). |
| 8 | The spot-page counter and the reveal counter cannot contradict each other: the semantics pin of Pre-requisite 4a is settled before slice-03 DISTILL and the F-TELL slice-04 sequencing note is honored. |
| 9 | The monthly metrics file carries all six settled rows (pairwise ranking accuracy vs B1 with progress toward 400 pairs, Brier plus calibration by conf_level vs B0, MAE per key, sigma_human, selection imbalance, shrinkage report) and the kill-switch verdict; a failing calibration check produces a recorded removal of the offending confidence term, removal not reweighting, C_spread first candidate (06 §10; 09 §3.6). |
| 10 | No product-level accuracy claim ("better than the raw model") is made anywhere until about 400 same-day pairs show positive lift; until then the only claims are organised, explained, honest about uncertainty (06 §10; 09 §10.4). |
| 11 | U1-U7 checks green per visible slice through the built surface plus a sealed U8 examination; non-visual slices carry their honest N/A rationale. |
| 12 | Every Slice Plan row above is flipped `shipped`. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Correction fitting: per-key bias, per-reporter offsets `u_r`, pooling hierarchy, the corrections file, the nightly learning job | F-FORECAST-LEARNS-FROM-THE-BEACH (06 §5-§7 is its spec; this feature only measures) |
| Confidence terms and their display: C_spread, C_track, C_fresh computation and the conf_level surface | F-KNOW-HOW-MUCH-TO-TRUST-IT. This feature delivers the calibration verdict that can remove a term, and the `mae`/`mae_climatology` scorecard fields C_track consumes (05 S4), never the terms |
| The reveal counter "Reporte {n} de {threshold}" and the write-path COUNTER item | F-TELL-US-WHAT-YOU-SAW-COLD slice-04 (shipped there per its plan; coherence seam recorded in Pre-requisite 4a) |
| Report capture, write path, credential mint, observation store | F-TELL-US-WHAT-YOU-SAW-COLD |
| The nightly observation export fn itself (07 §7.4, AP13) | Ownership gap, no feature owns it anywhere; recorded as Pre-requisite 8, NOT claimed here |
| Solicited reports, push follow-up, the volume lever for reaching the gate faster | F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE |
| A public accuracy page rendering the monthly metrics | Later, unplanned; 06 §2 names it a possible future consumer of `learned/metrics/v1` |
| The product-level "better than the raw model" public claim | No feature until ~400 pairs with positive lift exist (06 §10); this plan only counts progress |
| English surface for the scorecard box and empty state | F-READ-IT-IN-YOUR-LANGUAGE (the en verbatim string exists in §10 and may sit in `strings.ts` unused) |
| Stage-2 conditional bias, categorical wind verification model | Not built anywhere (research 09 §13.4; 06 §1); wind return path carries its own binding precondition (06 §8) |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **Copy, two gaps, neither invented here.** (a) The scorecard box header "¿Cómo nos ha ido aquí?" exists only in the §14 wireframe, not in §10's copy list, the exact shape of F-TELL's Pre-requisite 8b; fallback if unanswered: render the box without a header, the settled sentence carries the meaning. (b) The gated claim headline has NO settled Spanish anywhere: the 06 §11 "corre chico aqui..." sentence is a worked example inside a design document, and 06 §14 item 6 separately records that the fitted-mostly-on-good-days caveat copy "nobody has designed". Route both through the cousin's crew channel the keystone opened. | (a) slice-01's header line only; (b) slice-04 DISTILL entirely | Andres via the cousin's crew | open |
| 2 | **Keystone lane seam.** `src/pipeline/build.ts`, `src/publish/region-bundle.ts`, `src/components/SpotDetail.astro` are in-flight keystone files (slices 06-08 building, `HANDOFF.md` §10). Slice-01 edits all three. Settle serial order or explicit coordination before dispatch (HANDOFF §7 rule). | slice-01 start timing, not its design | integrator / keystone lane | open |
| 3 | **Shipped PublishedCall rows are missing THE metric's baseline fields.** `domain-model.md` §6 (line 200) puts `baseline_rank_raw` and `our_rank` on every row and assigns them to the scoring lane (05 §L15); the shipped writer's `CallRow` (`src/pipeline/build.ts` 88-107) carries neither, verified 2026-08-09, and the log is append-only. Not permanently lost: both are recomputable from the immutable `predictions/` archive plus the blend rule, and `our_rank` from the rows' own `score_q`. But every month of drift grows the recompute debt, and schema-vs-shipped drift is this repo's known worst bug class (project CLAUDE.md, published-surface incident). **Flagged to the keystone/scoring lane to add the two fields; not fixed here, out of this lane's scope.** | slice-05's cheap path; nothing else | keystone/scoring lane | open, flagged 2026-08-09 |
| 4 | **Two DESIGN pins this plan needs and does not invent.** (a) Counter semantics at spot grain: P5's `n_obs` against P3's `n_reports`; a report with no matching prediction row (builder-down hour) increments the write-path counter but forms no pair, so the two public sentences about "reportes" at one spot will drift unless the domain lane pins one meaning (recommendation: the spot-page counter counts stored reports, because decision 19's sentence says "reportes" and a surfer counts reports, not statistical pairs). (b) Key-to-spot headline selection: which `(source, lead_bucket)` key's claim a spot shows when several gate keys pass is pinned nowhere. Both are `domain-model.md` §9/§13 territory, round-3 domain lane. | (a) slice-03 DISTILL; (b) slice-04 DISTILL | domain lane / Andres | open |
| 5 | **Everything F-TELL slice-03 is blocked on, inherited transitively**: Lambda concurrency quota still unverifiable (AccessDenied for andres-cli), write stack absent from `infra/lib/`, stack ownership unassigned (that plan's Pre-requisites 2 and 5). Plus this feature's own updater needs a stack home among the four named stacks (`system-architecture.md` §11) and it is named in none. | slice-03 deploy onward, so slices 04 and 05 too | Andres names owners | open, ownership gap |
| 6 | **Reserved-concurrency budget for the updater.** The infra guardrails budget reserved concurrency tightly; 06 §12 books the nightly learning job inside "the reserved-2 budget", and the hourly scorecard updater is a separate function booked nowhere. | slice-03 deploy | DESIGN / infra lane | open |
| 7 | **The P1 degrade rule for the scorecard block becomes dishonest the day the store exists.** P1 says scorecard absent -> "degrade: day-one empty state"; once reports exist, rendering the empty state's 0 from an unreadable source understates reality. Recommendation, recorded not decided: from slice-03 on, an unreadable scorecard source fails the publish LOUD like a load-bearing field, and the prior build's page stands (the keystone's refused-build behaviour). Needs domain and frontend lane sign-off since it amends a P1 row. | slice-03 | domain + frontend lanes | open |
| 8 | **The nightly observation export has no owner slice anywhere.** 07 §7.4 defines the export fn (AP13, RC 1, 00:30Z) writing `log/observations/v1` plus abuse signals; it appears in no slice of F-TELL, no slice here, no slice anywhere. Slice-05 reads `log/observations/v1` and F-FORECAST-LEARNS depends on it entirely. | slice-05; F-FORECAST-LEARNS later | unassigned; Andres routes it | open, ownership gap |
| 9 | **`adr-scorecard-incremental.md` Status is Proposed, not Accepted.** Same paperwork residual F-TELL flagged for its credential ADR: slice-02 DISTILL leans on the ADR's decisions 1-6 and the status should flip first. | slice-02 DISTILL leans on it; flag, not a build blocker | Andres or DESIGN owner | open |
| 10 | **Stale and dangling references, named so nobody trips.** (a) The epic row cites "HANDOFF.md section 6 item 12" for no-accuracy-claim-at-launch; this worktree's HANDOFF §6 has 9 items and no such text; the substance survives verbatim in 06 §7/§10, cite those. (b) F-TELL's Pre-requisite 10 says the worktree HANDOFF is a stale 21143-byte copy; the copy here is now 35492 bytes through §10 and is NEWER than the authority that note names; every HANDOFF citation in this file was checked against the worktree copy dated 2026-08-09. (c) `BUILD-ORDER.md` and `plan-cluster-*.md` exist in no commit and were not found on disk in either worktree; if a scorecard/verification cluster plan exists somewhere else it must be reconciled with this plan before build dispatch. | nothing; carried so the next agent does not rediscover them | doc corrections owed | open, low priority |

### Scaffold audit: what is real and what is absent (verified on disk 2026-08-09)

Real:

| Thing | Evidence |
|---|---|
| The scorecard card and empty-state recipes, tabular-nums counter | `src/styles/recipes.css` 61-74 (`.scorecard`, `.scorecard .counter`) and 109-116 (`.state-empty`), each commented to decisions 13 and 19 |
| The canonical quality tokens and q_obs anchors, one home | `src/data/report-vocab.ts`: `QUALITY_TOKENS`, `QUALITY_OBSERVED_SCORE` {bad 20, ok 45, good 70, epic 90}, with the unfit-prior caveat in the header |
| The PublishedCall log, written hourly | `src/pipeline/build.ts` 120-122 writes `log/calls/v1/dt=<date>/build=<HH>Z/` via `putCallIfAbsent`; the keystone shipped it |
| The immutable prediction log | keystone slices shipped; `predictions/v1` per `domain-model.md` §5 |
| The settled empty-state copy, es and en | `application-architecture.md` §10 line "Day-one empty state", verbatim, matching the §14 wireframe box |
| The settled wire contracts | P5 scorecard block (`application-architecture.md` §7), `spot_detail.scorecard` with `threshold` int + `counter` string (`domain-model.md` §13), claim gate as domain invariant (`domain-model.md` §9) |
| The verbatim-string discipline to extend | `src/i18n/strings.ts` header rule + existing `// verbatim` rows |

Absent:

| Thing | Evidence |
|---|---|
| Any scorecard code | grep over `src/` finds the word only in comments and CSS; no module computes, stores or renders any scorecard value |
| The scorecard block in the bundle | `src/publish/region-bundle.ts` 63-66: `BundleSpotDetail = { name }` only; `domain-model.md` §13 records the omission as deliberate, "absent rather than fabricated", pending a producer |
| The scorecard box on the spot page | `src/components/SpotDetail.astro` header comment defers it; the rendered page has score, size, window, CTA and nothing else |
| The empty-state string in strings.ts | not present in either locale block |
| `baseline_rank_raw` / `our_rank` in the shipped log rows | `CallRow`, `src/pipeline/build.ts` 88-107; Pre-requisite 3 |
| Updater, cursor, aggregates, metrics job, export fn, write store | no such module under `src/`, no write stack under `infra/lib/` |
| Any surf report, anywhere | no observation store exists to hold one; the count is zero by construction |

## Wave: DISTILL / [REF] Acceptance design

### [REF] Inherited commitments

| Origin | Commitment | DDD | Impact |
| --- | --- | --- | --- |
| DISCUSS decisions 13, 19 | Track record inline on every spot; below the gate say it plainly and show the counter, "7 / 30" shape. | n/a | Every visible slice's oracle is the box on the real built spot page; the counter shape `"N / 30"` is contractual (P5), a shape change fails the build LOUD. |
| `domain-model.md` §9 + `adr-scorecard-incremental.md` | Claim renders only when `n >= 10 AND distinct trust-eligible reporters >= 5 AND |bias| > 2 * se_gate`; grain excludes wind; incremental daily items, cursor exactly-once, rebuildable from the two logs. | n/a | slice-02 scenarios are refusal laws and invariants as fast-check properties, not example triples; a recompute test proves the projection property. |
| 06 §7 G2/G3 (mirrored in domain §9) | Trust eligibility over `trust-gate.json`, all-zero launch no-op; `se_gate` floor `0.5 * sigma_eff / sqrt(n)`; the stored `se` field carries `se_gate`. | n/a | One AT runs the gate with a nonzero fixture config and watches a young credential's samples drop out (clause check:unfired-is-not-evidence); one property proves zero-variance samples never pass early. |
| `application-architecture.md` §7 P5 + P1 | Frontend renders, never computes; `claim_ok: false` -> empty state from the block's own integers; block absent -> day-one empty state (amend per Pre-requisite 7 once the store exists). | n/a | slice-01 scenarios drive the built page against a bundle carrying the zero block; no scenario computes a statistic client-side. |
| `application-architecture.md` §10 + copy rules | The empty-state sentence is verbatim; zero technical text, no em dashes on the Spanish surface. | n/a | String equality against §10, not paraphrase; a `dist/` grep may assert absence of placeholder tokens and English on the es surface. |
| 06 §10 | Two claim ladders, never conflated; monthly metrics rows fixed; kill switch: calibration failure removes the offending confidence term, C_spread first. | n/a | slice-05 oracles come from the metrics table verbatim; one scenario proves the pairwise tie-exclusion rule (ties under one quality step excluded); the product-level claim appears in no copy. |
| Project CLAUDE.md (functional paradigm, PBT default; green-is-not-working) | Laws proven as properties; after GREEN inspect `dist/`; negative tests proven falsifiable by breaking the code once. | n/a | The claim-gate refusal properties must each be shown failing against a deliberately broken gate before they count. |
| `HANDOFF.md` §4 + nw-ui-quality-mandates | Slice classification at DISTILL open; visible slices carry U1-U7 rows and a U8 charter observation; non-visual slices an honest N/A. | n/a | Classification table above; charters owed under `docs/product/expectations/f-show-our-track-record/` at DISTILL open. |
| `HANDOFF.md` §1 DISTILL row (JIT rule) | Each slice's acceptance tests are written when that slice legally enters DISTILL, never earlier. | n/a | slice-01 entered 2026-08-09; slices 02-05 entered 2026-08-10 under an explicit dispatch from Andres overriding the JIT default for the blocked slices (recorded in `distill/red-classification.md`). Slices 03-05 stay skip-gated behind `@blocked-on-real-reports` until their blocks clear; DELIVER still owes the keystone seam order (Pre-requisite 2) before touching the contended files. |

### [REF] JIT status

slice-01 entered DISTILL 2026-08-09 on lane `build/f2-record` (8 scenarios at
`tests/acceptance/f-show-our-track-record/honest-track-record-box.feature`). Its DELIVER is in
flight on this lane: steps 01-01 through 01-04 are committed through DES and all 8 scenarios
already run GREEN in the untagged suite; steps 01-05 through 01-08 remain to close the slice.

Slices 02-05 entered DISTILL 2026-08-10 on the same lane, by explicit dispatch from Andres that
consciously overrides the JIT default for the blocked slices, so every Slice Plan row now has
executable scenarios and a step-level roadmap phase, ready the moment its blocks clear. The
override changes WHEN tests were written, never what may run:

- **slice-02** (`scorecard-refusal-laws.feature`, 12 scenarios, 5 of them refusal/negative):
  runnable RED now — all 12 fail as `MISSING_FUNCTIONALITY` at one existence oracle, the
  `projectScorecard`/`applyReport` driving port in `src/scorecard/projection` that DELIVER
  builds. Roadmap phase 02, steps 02-01 through 02-07.
- **slices 03-05** (`counter-counts-real-reports.feature` 7, `earned-claim-headline.feature` 8,
  `monthly-self-grading.feature` 6): AUTHORED-BLOCKED. Every scenario carries
  `@blocked-on-real-reports` and is skipped whole by the gate hook
  (`steps/blocked-gate.steps.ts`); unskipping early fails loudly naming the open pre-requisite.
  Unblock = DISTILL re-entry: remove the tag, complete the marked step bodies, record the RED
  run, then DELIVER. Roadmap phases 03-05.

Untagged suite after this pass: 119 scenarios — 86 passing (all siblings plus slice-01), 21
skipped (the blocked slices), 12 failing (slice-02's correct RED until its DELIVER). Runs,
classifications, refusals and the skip-gate protocol are recorded in
`distill/red-classification.md`; coverage rows in `distill/requirement-checklist.md`.

Charters for all four slices are authored under
`docs/product/expectations/f-show-our-track-record/` (slice-02 and slice-05 as operator-facing
non-visual charters; slice-03 and slice-04 with single-line U8 observations matching the roadmap
verbatim — the examine gate matches exact substrings, so U8 lines must never be re-wrapped).
The blocked slices' charters state their blocks plainly and defer every verdict to real data.

## Reuse Analysis

| Existing Component | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Scorecard + empty-state recipes | `src/styles/recipes.css` 61-116 | none to change: the classes are shipped and named for this feature | REUSE | Slice-01 consumes `.scorecard`, `.scorecard .counter`, `.state-empty` as-is; inventing parallel styles would fork the design system |
| Spot page | `src/components/SpotDetail.astro` | **bounded-change**: add the scorecard box between the day sections and the CTA, per the §14 wireframe position | EXTEND | The page is real and shipped; its own header comment defers the scorecard to this data contract. Keystone-contended, Pre-requisite 2 |
| Bundle contract + producer | `src/publish/region-bundle.ts`, `src/pipeline/build.ts` | **bounded-change**: `BundleSpotDetail` gains the P5 `scorecard` member; the producer emits the honest zero block (slice-01) then the real read (slice-03) | EXTEND | `domain-model.md` §13 is the schema authority and the omission was recorded as pending-producer, not as a decision against |
| Verbatim strings | `src/i18n/strings.ts` | **bounded-change**: add the §10 empty-state string, both locales, `// verbatim` | EXTEND | The file's own header states the rule; the en string ships unused until F-READ |
| Quality tokens + q_obs anchors | `src/data/report-vocab.ts` | none: consume as-is | REUSE | One constants home, two consumers by design; slice-02's score residuals import it |
| Threshold constant (30) | none: today it exists only as prose in decision 19 and 06 §8 | n/a | CREATE_NEW | One exported constant with two future consumers (P5 producer here, P3 composer in the write path); creating it here and having 07's composer import it later prevents the two-counters drift Pre-requisite 4a describes |
| Scorecard projection core | none, does not exist | n/a | CREATE_NEW | Pure functions per the settled grain, aggregates, windows and gates; the one genuinely new domain module this feature ships (slice-02) |
| Updater + metrics job + their stacks | none, do not exist | n/a | CREATE_NEW (blocked) | slice-03/05 territory; blocked per Pre-requisites 5, 6, 8 |

## Prefactoring Assessment

**NONE, justified.** The shipped recipes, tokens file and strings file take their deltas in
place; the projection core, updater and metrics job are new modules, not reshapes of existing
behavior. No existing component needs a flag, a second execution path or a special case to
receive this work. The one seam that could argue for preparatory work, the bundle's
`spot_detail` shape, is an additive optional member on a type whose authority (`domain-model.md`
§13) already declares it, so adding it is the contract catching up, not a reshape.

## Test Reuse & Consolidation Analysis

| Existing Test/DSL-Step | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Scoring-laws property style | `tests/unit/scoring-laws.test.ts` | pattern only | PATTERN REUSE | The house style for law-proving; slice-02's refusal laws, floor law, additivity and complement invariant follow it against the new projection module |
| Keystone browser journey | `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | reading routes only | DO NOT EXTEND | Slice-01's journey opens a spot page and reads the box; folding it into the keystone journey would couple two features' RED states |
| UI quality gate | `scripts/check-ui-quality.mjs` | U1 to U7 mechanics | REUSE | Feature-level fixture reuse per HANDOFF §4; slice-01 proves its own box states, viewport, contrast and motion against the real backdrop |
| Poisoned-fixture gate pattern | keystone / F-TELL anti-leak gates | negative-proof discipline only | PATTERN REUSE | The same unfired-is-not-evidence discipline applies to the claim gate: break the gate once, watch the refusal property fail, revert |
