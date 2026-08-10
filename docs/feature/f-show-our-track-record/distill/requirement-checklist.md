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
from day one so no requirement is silently dropped. slice-01 entered DISTILL 2026-08-09 (now
GREEN); slices 02-05 entered 2026-08-10 by explicit dispatch (JIT override recorded in
`red-classification.md`): slice-02's rows are authored-pending behind per-scenario `@pending`
until its owning DELIVER step activates them, while slices 03-05's rows are
AUTHORED-BLOCKED — scenarios exist but are skip-gated behind `@blocked-on-real-reports` because
their hard data/infra blocks are real, and no test may satisfy them by fabricating report data
into a public surface. Three rows were deliberately REFUSED at slice-01 rather than covered
weakly (R3, R5, R33); R3 and R5 now have their honest homes recorded below, R33 stays N/A.

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

Updated 2026-08-09 at slice-01 JIT DISTILL. The acceptance file is
`tests/acceptance/f-show-our-track-record/honest-track-record-box.feature` (8 scenarios, all
`@slice-01`, all RED as `MISSING_FUNCTIONALITY`); the run is recorded in `red-classification.md`.

| Requirement | Active acceptance evidence | Status |
|---|---|---|
| R1 | Scenarios 1 and 2: the built page carries the section 10 sentence word for word with its own two integers, positioned after the tomorrow forecast and before the report call to action | COVERED (`@covers-R1`), RED |
| R2 | Scenarios 2 and 4 (`@covers-R2`): every emitted spot route carries the box, and inside the box the only digits are `0` and `30` with no percentage, margin, metre figure or claim wording, which is the user-visible projection of `claim_ok false` / `headline null` | **PARTIAL, not claimed as covered.** R2's producer clause names the same six payload fields R5 does, on the same absent wire, so it gets the same refusal: nothing here asserts that a producer emits `scorecard{...}` into `spot_detail`. What is covered is the consequence a surfer can see. The producer clause is unassertable until slice-03 builds the wire |
| R3 | Authored-blocked: `counter-counts-real-reports.feature` scenario "Una playa sin reportes sigue en cero, ahora contado desde el registro real" (`@covers-R3`, `@blocked-on-real-reports`, skip-gated) | **REFUSED at slice-01, HOME RECORDED at slice-03 (2026-08-10).** The slice-01 refusal stands: separating computed from hardcoded needs input variation and the only input is a store that does not exist. The scenario that will prove it now exists and stays skipped until the store is real; roadmap 03-02 carries the file-one-more-report falsifiability pass |
| R4 | Scenarios 3 and 7 (`@covers-R4`): the sentence is present in the bytes served over HTTP with no browser and no JS execution, and the emitted document ships no `<astro-island>` and no `client:` directive | COVERED for the client half, RED. The "no client code derives n, bias, se or claim_ok" clause is fully covered. The "no template code derives" clause is NOT: Astro templates run at build time, so static-HTML presence cannot distinguish a value that arrived computed from one the template computed. That half needs the wire, like R2 and R5 |
| R5 | Producer-shape half: `scorecard-refusal-laws.feature` scenario "El contador sale de los dos enteros del bloque y con su forma exacta" (`@covers-R5`, slice-02, `@pending`) | **SPLIT, honestly (updated 2026-08-10).** The slice-01 refusal stands for what it refused: no payload-field assertion without a producer. The shape law (`counter` composed from the block's own integers, any state) is contracted in slice-02 and keeps its controlled RED proof until that slice's DELIVER removes `@pending`. The build-LOUD half on the wire stays with slice-03 (roadmap 03-02), still blocked |
| R6 | Rendered half: slice-01 scenarios 1, 2 and 4 (threshold pinned at exactly 30). Producer half: slice-02 scenario "El contador sale de los dos enteros del bloque y con su forma exacta" (`@covers-R6`, `@pending`) asserts the block carries `REPORTS_REQUIRED` from its one exported home | COVERED across the two slices; the slice-02 scenario is pending until its DELIVER entry, with a controlled RED proof recorded in `red-classification.md`. The write-path P3 composer's import of the same constant remains F-TELL's obligation |
| R7 | Scenarios 4 and 5: verbatim section 10 string, no em dash, no unreplaced placeholder token, no English copy, no technical text, no percentage or margin | COVERED (`@covers-R7`), RED |
| R8 | Scenario 1, `@walking_skeleton`: isolated copy of the repository, real `npm run build` with a credential-free environment, `astro preview` over local HTTP, Chromium at 390 px. Zero AWS, zero network | COVERED (`@covers-R8`), RED |
| R9 | Scenario 7: no island and no hydration directive in the emitted spot document. The byte-ceiling half is enforced in production by the page-weight integration inside `npm run build`, which a build cannot finish past | COVERED (`@covers-R9`), RED (island half asserted, ceiling half enforced by the build) |
| R10 | `scorecard-refusal-laws.feature` scenario "Con menos de cinco personas de verdad nunca se publica una cifra" (`@covers-R10`, `@property`, `@pending`) | AUTHORED-PENDING. Its controlled activation reached the intended missing projection port; owning DELIVER removes `@pending` and records RED before implementation. |
| R11 | scenario "Con menos de diez observaciones emparejadas nunca se publica una cifra" (`@covers-R11`, `@property`, `@pending`) | AUTHORED-PENDING, controlled RED proof recorded. |
| R12 | scenario "Reportes coordinados que están demasiado de acuerdo nunca aflojan la reja" (`@covers-R12`, `@pending`): the floor law, the se-field-carries-se_gate pin, and coordinated-never-publishes-earlier | AUTHORED-PENDING, controlled RED proof recorded. |
| R13 | scenario "El filtro de confianza se ve disparar: una credencial joven pierde sus muestras" (`@covers-R13`, `@pending`): nonzero fixture config drops the young credential; zero config bit-identical to unfiltered | AUTHORED-PENDING, controlled RED proof recorded. |
| R14 | scenario "Cada reporte se empareja solo con la hora y la playa que el sitio de verdad pronosticó" (`@covers-R14`, `@pending`): join key, sign convention, land_masked exclusion, unpaired-never-guessed | AUTHORED-PENDING, controlled RED proof recorded. |
| R15 | scenarios "El orden en que lleguen los reportes jamás cambia la cuenta" and "Sumar un reporte nuevo no reescribe ningún día ya contado" (`@covers-R15`, `@property`, `@pending`) | AUTHORED-PENDING, controlled RED proof recorded. |
| R16 | scenario "Las ventanas de 30 y 90 días derivan el sesgo y el error con las fórmulas asentadas" (`@covers-R16`, `@pending`): formulas plus C5 resolution at read time | AUTHORED-PENDING, controlled RED proof recorded. |
| R17 | scenario "El viento no entra al historial por ninguna puerta" (`@covers-R17`, `@negative`, `@pending`): loud rejection naming wind; recompute path re-checked in roadmap 02-07 | AUTHORED-PENDING, controlled RED proof recorded. |
| R18 | scenario "Los anclajes de calidad tienen una sola casa y el puntaje los cita tal cual" (`@covers-R18`, `@pending`): anchors from report-vocab only, 25-point floor cited | AUTHORED-PENDING, controlled RED proof recorded. |
| R19 | none (deliberate) | **CRITERIA-OWNED, not Gherkin.** The break-watch-revert falsifiability proof is a DELIVER discipline recorded in roadmap steps 02-05 and 02-07's criteria, matching slice-01's handling. A scenario cannot honestly assert its own past failure |
| R20 | scenario "Todo el historial se reconstruye idéntico desde los dos registros inmutables" (`@covers-R20`, `@property`, `@pending`): incremental fold equals batch recompute | AUTHORED-PENDING, controlled RED proof recorded. |
| R21 to R24 | `counter-counts-real-reports.feature`, 7 scenarios, all `@blocked-on-real-reports` (R21 replay exactly-once; R22 real read + R2's producer clause; R3 computed-not-asserted; R23 loud publish failure; R24 counter coherence; the counting-state visual outline) | **AUTHORED-BLOCKED, skip-gated.** Scenarios exist and are skipped whole until the write path ships and real reports exist; the RED run is recorded at DISTILL re-entry. No fixture may stand in for real data on a public surface |
| R25 to R26 | `earned-claim-headline.feature`, 8 scenarios, all `@blocked-on-real-reports` (headline replaces counter; floored margin printed; settled-copy verbatim — blocked on Pre-requisite 1b, needs Andres; key selection — blocked on Pre-requisite 4b; exclusivity; no-leak sweep; claim-state visual outline) | **AUTHORED-BLOCKED, skip-gated.** Copy and pin steps fail loudly naming their pre-requisite if unskipped early |
| R27 to R30 | `monthly-self-grading.feature`, 6 scenarios, all `@blocked-on-real-reports` (six rows + baselines; tie exclusion; kill-switch removal verdict; 400-pair no-claim sweep; read boundary; zero-pairs honesty) | **AUTHORED-BLOCKED, skip-gated.** Also gated on the export-fn ownership gap (Pre-requisite 8) and the missing B1 baseline fields (Pre-requisite 3) |
| R31 (U1) | Scenario 6, both themes: box text contrast measured against the box's own resolved backdrop, threshold 4.5:1. The contrast function was checked against the canonical WCAG values first | COVERED (`@covers-R31`), RED |
| R32 (U2) | Scenario 6: document and box overflow at 390 px | COVERED (`@covers-R32`), RED |
| R33 (U3) | none | **N/A, recorded not fabricated.** The row itself says the slice-01 box is static and this should record the fact rather than invent a target check. Nothing in the day-one box is tappable |
| R34 (U4) | Scenario 6, `movimiento "reducido"` example: no element in the box animates or transitions | COVERED (`@covers-R34`), RED |
| R35 (U5) | Scenario 6: the box carries the shipped `.state-empty` dashed treatment so it reads as "not yet", and its text is not the danger colour so an honest counter never reads as an error | COVERED (`@covers-R35`), RED |
| R36 (U6) | Scenario 6: every element carrying the counter digits resolves `tabular-nums`, and nothing in the box truncates with an ellipsis at 390 px | COVERED (`@covers-R36`), RED |
| R37 (U7) | Scenario 6: the box is located by the shipped `.scorecard` / `.state-empty` recipes, and the shipped static gate `scripts/check-ui-quality.mjs` still exits 0 with the box on the page | COVERED (`@covers-R37`), RED |
