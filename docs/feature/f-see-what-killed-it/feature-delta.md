<!-- des-feature-context-bootstrap: {"feature_id":"f-see-what-killed-it","intent":"A surfer taps a spot and sees the one thing that ruined it named outright, for example wind at 0.18, with the size in body-height words and a small map showing which way the break faces.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-see-what-killed-it

Intent: A surfer taps a spot and sees the one thing that ruined it named outright, for example
wind at 0.18, with the size in body-height words and a small map showing which way the break
faces.

Workspace opened 2026-08-09 on `build/f2-deltas` (base `82be859`). This is the DOCS-ONLY
workspace creation: no acceptance test, no step definition, and no production code for this
feature exists yet. Each slice's tests are written Just In Time when that slice legally enters
DISTILL, per the project rule in `HANDOFF.md` §1.

**Identity provenance, stated because this workspace had none.** Before this file the feature
existed in exactly three committed places: the epic row
(`docs/epic/surfs-up-panama/epic-delta.md` line 46, status `pending`, citing
`docs/DISCUSS-decisions.md` 17, 18, 20), the keystone's out-of-scope row
(`docs/feature/daily-call-with-permanent-receipts/feature-delta.md` line 49: "Weakest-link
callout, breakdown bars, static break map on the spot page" → F-SEE-WHAT-KILLED-IT), and the
keystone slice-06 charter's explicit deferral
(`docs/product/expectations/daily-call-with-permanent-receipts/a-surfer-taps-any-spot-and-gets-that-spots-own-page-todays-and-tomorrows-numbers-size-in-body.md`
line 28: "Deferred, not this slice: the breakdown bars, the weakest-link callout and the static
break map (F-SEE-WHAT-KILLED-IT) ... Their absence is not a failure here."). Verified across
all 38 refs 2026-08-09: no `docs/feature/f-see-what-killed-it/` or
`docs/product/expectations/f-see-what-killed-it/` ever existed; `BUILD-ORDER.md` and
`plan-cluster-*.md` are cited by two other feature-deltas but are tracked on no ref, and none of
their quoted decision ids mention this feature; the Spanish coinage "tumba" appears in zero
files. The workspace id follows the established `f-` convention. The feature is unplanned but
not undesigned: the engine output is shipped and law-tested, the render contract is settled in
three architecture documents, and what is missing is the carry to the reading surface, the
sentence, and the pixels.

## Wave: DISCUSS / [REF] The counterfactual honesty determination

The promise shape "Lo que lo tumba: el viento. Sin él este spot marcaría 79" contains a
counterfactual score. **Determination: the counterfactual is honestly computable, exactly, from
the accepted scoring model. It is not an estimate and not an invention.** Evidence chain:

1. `05-scoring-engine.md` §4 defines per-factor log-damage with the identity
   `Q = exp(-(damage_dir + damage_size + damage_wind + damage_tide))`, declared as law L10
   (§10), shipped at `src/scoring/engine.ts` lines 214-234 and property-tested in
   `tests/unit/scoring-laws.test.ts` (L10 block).
2. `adr-scoring-weakest-link-damage.md` (accepted decision, "Alternatives considered" row 3)
   states it outright: "For this multiplicative form the counterfactual gain IS the log-damage
   (setting S_i = 1 removes exactly damage_i from the exponent); the two definitions coincide."
   The counterfactual is therefore not new physics; it is the same number the ADR already ships,
   read in its other direction.
3. The exact formula: with D = sum of all damages and d_w = the weakest link's damage,
   `score_without = round(100 * clip(exp(-(D - d_w)) + delta_q, 0, 1))`. At launch
   `delta_q = 0` on every row (`src/pipeline/build.ts` line 173 calls
   `applyCorrection(spot, null)`; law L8: gate `no_file` implies `q_final = q` exactly), so the
   published counterfactual is `round(100 * exp(-(D - d_w)))`, bit-exact against the same
   damages that produced the score beside it.
4. Worked check against the settled §11 example (Venao, score 80, damages size 0.1499, wind
   0.0681, tide 0.0059, dir 0, weakest = size): without size,
   `exp(-(0.0681 + 0.0059)) = 0.9287`, so "sin eso marcaría 93". Every intermediate is already
   in the accepted document.

Honesty edge cases, all designed rather than discovered later:

- **weakest_link null** (perfect day): no callout at all, settled degrade
  (`application-architecture.md` §7 line 294; `src/publish/region-bundle.ts` line 52: "never a
  fabricated culprit").
- **Rounding collision**: when `round(100 * exp(-(D - d_w)))` equals the displayed `score_q`
  (tiny damage), the counterfactual clause is suppressed. "Sin él marcaría 82" beside an 82 is
  a true sentence that reads like a bug; suppression is a designed state (U5), not an if-branch
  found in DELIVER.
- **Monotonicity**: the counterfactual is always ≥ the displayed score (removing a non-negative
  damage never lowers Q). A published counterfactual below the score is a build-refusing defect;
  DISTILL owns the property test.
- **Correction era**: when a learned correction file first appears, `delta_q` joins the formula
  above (it is in scope in the builder as `bias_applied`, `build.ts` line 226), keeping the
  counterfactual exact in the model's own terms. One flag for the learning lane, non-blocking at
  launch: `delta_q` is fitted on residuals of the full-factor score, so carrying it unchanged
  into the counterfactual is a statement about the model's score, not about physics without
  wind. Recorded here so nobody rediscovers it.
- **Who computes**: the pipeline computes, the surface carries, the page renders verbatim. The
  ADR already rejected frontend derivation of the label ("splits one rule across two lanes");
  the same reasoning binds the number, and the P1 precedent is explicit (`best_window`: "client
  renders, never computes", §7 line 296). The settled P1 day-summary table carries
  `weakest_link` + `damages` but no counterfactual field, so the field addition is owed to the
  domain lane (Pre-requisite 4).

If any of the above had failed, the fallback plan was to ship the naming without a number. It
did not fail: the number is available, exact, and already implied by an accepted ADR. The
slices below therefore promise it, in dependency order, with the naming shipping first so no
slice waits on the schema addition.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer taps a spot and, on both day sections, sees the one factor that ruined it named in plain Spanish: "Lo que lo tumba: el viento." On a perfect day no culprit is shown and nothing looks missing. | pending | @walking_skeleton; render insertion is ONE LINE into `SpotDetail.astro`, which a concurrent BUGFIX lane owns — everything else lives in a new self-contained component this feature owns | Thinnest end-to-end vertical proving the risky part, which is the carry, not the maths. Verified 2026-08-09: the engine computes `weakest_link` (`src/scoring/engine.ts` lines 214-234), `CallRow` carries it (`src/pipeline/build.ts` line 106), it lands in every receipt row (line 121 via line 231) and in the bundle day summary (line 251; `src/publish/region-bundle.ts` line 53) — but `surfaceCall()` (`build.ts` lines 255-266) drops it, `SurfaceCall` (`src/publish/static-surface.ts` lines 29-40) has no field for it, `data/published-surface.json` carries zero occurrences, `src/data/forecast.ts` `DaySummary` (lines 26-46) has no field, and `SpotDetail.astro` renders nothing of it. The value exists in the published bundle and the receipts; it does NOT exist on the reading surface the pages actually render from. This slice closes exactly that seam: `surfaceCall` gains `weakest_link`, `DaySummary` carries it, and a new component renders the sentence per day section, mounted by one line in `SpotDetail.astro` (whose own header, lines 2-6, says the breakdown "arrives with its data contract; not scaffolded" — this is that arrival). The label is already honest by law: L10 fixes `argmax(damage)` and L16 guarantees the label never names a factor whose observation was null (`05-scoring-engine.md` §10; `adr-scoring-weakest-link-damage.md`), both property-tested in `tests/unit/scoring-laws.test.ts`. Null → no callout is the settled degrade (`application-architecture.md` §7 line 294). `09-design-system.md` line 237 requires the callout be carried by "the arrow + words — colour never carries the callout alone"; the words half ships here. Copy is gated on Pre-requisite 3 (the sentence is unsettled: "tumba" appears nowhere in the repo; the settled wireframe carries "← el punto débil"). Decision source: `docs/DISCUSS-decisions.md` 17 ("weakest link called out"). |
| slice-02 | The named factor carries its number: "Lo que lo tumba: el viento, a 0.18." The number is the factor's real sub-score from the same computation that produced the label, never a re-derivation. | pending | depends-on slice-01 | The pairing rule is settled: `05-scoring-engine.md` §4 — "The UI string pairs the label with the raw sub-score value ('wind at 0.18'): label from damage, displayed number from `sub`. Both are in `ScoreResult`; the frontend derives nothing." The day's `sub` already exists per published row: the ranked day summary IS the 18:00Z `CallRow` (`build.ts` line 123 filter), and that row stores `sub` (line 220) into the receipts — the delta is carrying the named factor's value onto the reading surface beside the label. The bare number is settled product language, not technical leakage: the epic row promises "wind at 0.18" verbatim, research 09 line 533 words the product as "Wind 0.18 — that's what killed it", and decision 17 mandates every sub-score exposed; the zero-technical-text copy rule is therefore not violated by this one number, recorded here so DISTILL does not trip on it. Formatting goes through the house display discipline (`SpotDetail.astro` header lines 8-12: never format inline). |
| slice-03 | The sentence completes with the honest counterfactual: "Sin él, hoy marcaría 79." The number is the model's own exact arithmetic, published by the pipeline; when it cannot be shown honestly (perfect day, rounding collision, absent field) the clause disappears rather than lying. | pending | depends-on slice-02, depends-on Pre-requisite 4 (schema field owed to the domain lane) | The epic-level promise and the whole point of the feature's phrasing. The full honesty determination, formula, worked example and edge cases are the [REF] section above; in one line: `score_without = round(100 * clip(exp(-(D - d_w)) + delta_q, 0, 1))`, exact at launch because `delta_q = 0` on every row (`build.ts` line 173; law L8), and coincident with the ADR's own statement that the counterfactual gain IS the log-damage (`adr-scoring-weakest-link-damage.md`, alternatives row 3). The pipeline computes it where `delta_q` is in scope, the surface carries it, the page renders it verbatim — the ADR rejected frontend derivation for the label and the same reasoning binds here; P1's `best_window` precedent says "client renders, never computes" (§7 line 296). Designed suppressions: `weakest_link` null → no callout at all (settled degrade); `round` collision (counterfactual equals displayed score) → clause suppressed, a U5 designed state; field absent from the payload → clause omitted and the defect logged, mirroring the `damages` degrade row (§7 line 295). DISTILL owes the property tests: counterfactual ≥ score always; equality implies suppression; `delta_q = 0` path bit-exact against L10's identity. The one-rule of the project (`CLAUDE.md`: "If a number cannot be computed honestly, the surface says so instead of inventing one") is satisfied in the strong direction — the number CAN be computed honestly, and every path where it cannot be shown honestly is enumerated and suppressed. |
| slice-04 | The full breakdown: four bars, every sub-score exposed, the arrow anchoring the weak one, and a factor with no data today reading as a stated absence instead of a lie. | pending | depends-on slice-01, depends-on Pre-requisite 2 (windState null bug, BUGFIX lane) | Decision 17's other half ("Every sub-score exposed") and the settled §14 wireframe ("El desglose", four bars, "← el punto débil"). The render contract is fully specified and this slice invents none of it: bars for day `d` render the `sub{dir, size, wind, tide}` of the single hourly point in the hour containing that day's `best_window.start` — "derive, don't ask", one array lookup, no averaging (`application-architecture.md` §7 lines 313-319); `best_window` absent → bars omitted (declared degrade, line 296); and the callout arrow anchors on the day summary's `weakest_link`, never on the visually lowest bar, "so the two surfaces cannot disagree about which factor killed the day" (lines 320-323). The data carry follows the settled contract (`spot_detail[].hourly[]` with `t` + `sub`, line 307; today `spot_detail` holds only `name`, `build.ts` line 140). Visual spec is settled: `09-design-system.md` line 237 (8 px tracks on `--sunken`, weakest fill `--danger` at 6.75/6.02, colour never carries the callout alone), and the CSS recipe already shipped (`src/styles/recipes.css` line 105, `.bar.weakest .fill`). Honesty on missing factors: L16 says a null factor gets no damage entry and never becomes the weakest link; the bar for it must render a stated absence ("sin dato de viento hoy"), never a zero-height bar and never a fabricated value — which is why Pre-requisite 2 gates this slice: `build.ts` lines 290-294 currently map a NULL wind sub-score to `'clean'`/"limpio", a live flagged bug (HANDOFF verified-live list) owned by the BUGFIX lane; shipping bars over it would print "limpio" beside a stated absence. The per-bar plain-language annotations in the wireframe ("bien en la ventana", "un poco chico") are copy not present in §10's copy list — gated on Pre-requisite 3; bars ship honestly without them (factor name + bar + value). Zero new JS; ~0.5 KB gz of document. |
| slice-05 | A small static map on the spot page shows the break and which way it faces, loading lazily, reserving its space, and costing nothing monthly. | pending | depends-on Pre-requisite 5 (imagery source and attribution, Andres/DESIGN); otherwise parallel-safe once slice-01 has landed | Decision 20 verbatim ("Small static map on the spot page only. Shows the break and its orientation"). The architecture has already made every structural call: one static WebP ~12 KB, lazy (`application-architecture.md` §5 line 188); NO tile or JS map library — "A tile library is 40-150 KB before the first tile. Decision 20 needs one small static image per spot, pre-rendered at build" (§5 cut table line 198); cache-first LRU capped ~5 MB with the offline degrade "alt text renders, layout reserves space (no CLS)" (§12 line 475). Orientation data exists in the settled seed contract: `shore_normal_deg` per spot (`05-scoring-engine.md` §2). What is NOT settled anywhere — verified against every ADR and architecture file — is the imagery source: what renders the base map at build time, under what license, with what attribution, at $0.00 forever. That is a product/DESIGN decision recorded as Pre-requisite 5 with a recommendation, not made here. Held last because it shares no mechanism with the callout vertical and blocks nothing above it. |

Notes on the plan:

- Row order is dependency order, backward only. An empty Annotation cell is parallel-safe once
  the rows above it have landed. Same convention as the keystone.
- **No slice ships a sentence that is not true at the moment it ships.** slice-01's label is
  honest from the first render (L10/L16 already law-tested in production code); slice-03's
  counterfactual ships only with its suppression states designed; slice-04's bars cannot ship
  over the windState null bug (Pre-requisite 2) because they would print "limpio" for a factor
  that was never observed.
- **The host surface is contended, and the plan is shaped around that.** Keystone slice-06 (per-
  spot page, `daily-call-with-permanent-receipts/feature-delta.md` line 15, in flight per
  HANDOFF §10) owns upgrading `SpotDetail.astro`, and a concurrent BUGFIX lane
  (`build/f2-bugfix`, worktree `/Users/andres/psb-bugfix`) owns `SpotDetail.astro` and
  `RankedList.astro` right now. Every slice here builds inside a new self-contained component
  plus the pipeline carry; the only edit to a contended file is one mount line in
  `SpotDetail.astro`, landed last within each slice. `RankedList.astro` is not touched at all
  (the settled home wireframe carries no weakest-link element).
- **The producer seam is also shared.** `src/pipeline/build.ts` and `src/publish/*` belong to
  the keystone/producer lane by precedent (`f-tell-us-what-you-saw-cold` Pre-requisite 6 calls
  the builder "keystone-owned"). The carry edits here (surfaceCall + schema) are small and
  additive; sequencing with that lane is Pre-requisite 1's second half.
- **Byte discipline.** Spot route budget is 14 KB gz document + lazy images, ~3.5 KB JS
  (`application-architecture.md` §4 route table line 111). Estimated adds: callout sentence
  ~150 B gz per day section (slices 01-03), bars ~500 B gz (slice-04), map image 12 KB but lazy
  and off-document (slice-05). Zero new JavaScript in the entire feature: every element renders
  at publish time (`adr-publish-time-html-rendering.md`).
- **Already satisfied by the host page, not re-shipped**: "size in body-height words" (decision
  18) renders today via `formatSizeEs` (`SpotDetail.astro` lines 37-42); this feature adds
  nothing to it and must not duplicate it.
- **Strings land in `src/i18n/strings.ts`**, never inline, so F-READ-IT-IN-YOUR-LANGUAGE
  translates one surface later. No em dashes in any UI string (project copy rule).

## Wave: DISCUSS / [REF] Slice classification

Recorded now so it is not invented at DISTILL open. Charters are owed under
`docs/product/expectations/f-see-what-killed-it/` (outside this lane's file boundary at
workspace creation; created per slice at DISTILL open, filenames = slugified promise sentence
per house convention).

| Slice | Classification | U8 observation (seals into the charter) |
|---|---|---|
| slice-01 | user-visible | The culprit line reads as a quiet, finished part of the page, not a debug annotation; on a perfect day no culprit shows and the page does not look broken. |
| slice-02 | user-visible | The number sits inside one Spanish sentence a non-technical surfer can read aloud; it never reads as telemetry. |
| slice-03 | user-visible | The counterfactual reads as one honest sentence; where it is suppressed, nothing looks missing or half-rendered. |
| slice-04 | user-visible | The four bars read at a glance in sunlight at 390 px; the arrow and words, not colour alone, name the weak one; a missing factor reads as a stated absence, never an empty bar. |
| slice-05 | user-visible | The map looks intentional at 390 px, reserves its space while lazy-loading, and the break orientation is legible without a legend. |

All five slices ship pixels; no slice is infrastructure-only, so the slice-composition hard gate
is satisfied by construction. U1-U7 requirement rows are R21 to R27 in
`distill/requirement-checklist.md`, executed through the built surface per slice.

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | On every spot page, both day sections name that day's weakest link in plain Spanish with its raw sub-score, exactly the factor and value the pipeline published: label from `weakest_link`, number from `sub`, nothing derived in the page (decision 17; `adr-scoring-weakest-link-damage.md`). |
| 2 | The counterfactual sentence renders the pipeline-published exact number per the [REF] determination; it is always ≥ the displayed score; on a perfect day, a rounding collision, or an absent field the clause is suppressed and the page reads complete. No path can print an invented number. |
| 3 | Two-surface consistency holds: the callout arrow anchors on `weakest_link`, never the visually lowest bar (`application-architecture.md` §7 lines 320-323), and the bars' values are the best_window-hour `sub` per the settled derive-don't-ask rule. |
| 4 | Missing observations are stated absences everywhere on this feature's surface: a null factor never shows a value, a word, or a bar height, and the windState null→"limpio" defect is not inherited (L16; Pre-requisite 2). |
| 5 | Every sub-score is exposed (decision 17) and the static map shows the break and its orientation (decision 20) with alt text, reserved space, no CLS, and zero monthly cost. |
| 6 | Byte gates green: spot document ≤ 14 KB gz, zero new JS on the route, map lazy and off-document (§4 route table; §5). |
| 7 | U1-U7 checks green per slice through the built surface, and a sealed source-blind Vera PASS against each slice charter's U8 observation: 390 px, WCAG-AA on the real backdrop in both themes, reduced motion honoured, colour never sole carrier of the callout (`09-design-system.md` line 237). |
| 8 | Zero technical text beyond the two settled numbers (the sub-score and the counterfactual integer): no factor enum tokens, no JSON, no English on the Spanish surface; all strings in `src/i18n/strings.ts`, no em dashes. |
| 9 | Every Slice Plan row above is flipped `shipped`, and the epic row for F-SEE-WHAT-KILLED-IT is flipped `in-flight` → `shipped` with its workspace link (the flip to `in-flight` is owed now, Pre-requisite 8). |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Accuracy scorecard section ("¿Cómo nos ha ido aquí?", the §14 wireframe's second box) | F-SHOW-OUR-TRACK-RECORD (keystone out-of-scope table already routes it there) |
| Confidence display, the "por qué" reason tap, and `confidence_reason` copy naming missing factors | F-KNOW-HOW-MUCH-TO-TRUST-IT. **Named seam**: both features render Spanish factor names (its reason copy says "no wind data today; score is swell and tide only", `05-scoring-engine.md` §3.6); the factor-name vocabulary must have one source module, following the `src/data/report-vocab.ts` precedent, so the two lanes cannot drift on the same words. That lane runs DISCUSS concurrently; this row is the seam declaration, not its plan. |
| Report photo thumbnails on the spot page | Report-flow features / epic open question 4 |
| English callout, bar and map-alt strings (`/en/` tree) | F-READ-IT-IN-YOUR-LANGUAGE (this feature keeps every string in `strings.ts` so that pass is one surface) |
| Weakest-link line on the home or mañana ranked rows | Nowhere yet. The settled §14 home wireframe carries no such element; adding one is a new DISCUSS decision, not scope creep here. `RankedList.astro` stays untouched. |
| Fixing the windState null→"limpio" defect (`build.ts` lines 290-294) | BUGFIX lane (`build/f2-bugfix`), flagged not fixed here (Pre-requisite 2); this feature only refuses to ship bars over it |
| The wireframe's narrative explanation line ("La marea sube a media mañana y lo tapa") | Gated behind Pre-requisite 3's copy settlement; v1 ships the structured sentence only. Whether that line is templated copy or generated narration is an open product question this plan does not decide. |
| Per-hour breakdown, or any horizon past tomorrow | Nowhere; decision 10 refuses it |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **Contended host and producer files.** A concurrent BUGFIX lane owns `src/components/SpotDetail.astro` and `src/components/RankedList.astro` (worktree `/Users/andres/psb-bugfix`, branch `build/f2-bugfix`, diverged at worktree level with its own `Confidence.astro`); keystone slice-06 (in flight, HANDOFF §10, base `63d5b1e`) owns upgrading the spot page itself; `src/pipeline/build.ts` and `src/publish/*` are keystone/producer-lane by precedent. This plan confines itself to a new self-contained component plus additive carry fields, with exactly one mount line into `SpotDetail.astro` per the Annotation column; that line lands only after coordination with (or landing of) those lanes. | The mount line of every slice; nothing else | integration coordinator | open |
| 2 | **windState null→"limpio" live bug**: `build.ts` lines 290-294 return `'clean'` for a NULL wind sub-score, so missing wind data displays "limpio" (HANDOFF verified-live list; contradicts the spirit of L16 and the project's one rule). Owned by the BUGFIX lane; flagged, not fixed here. | slice-04 (bars would print "limpio" beside a stated absence); slices 01-03 are safe because L16 already guarantees the weakest link never names a null factor | BUGFIX lane | open |
| 3 | **Callout and bar Spanish copy is unsettled.** "Lo que lo tumba" appears nowhere in the repo; the settled §14 wireframe carries "← el punto débil" plus per-bar annotations that are absent from §10's copy list. House precedent (f-tell-us Pre-requisite 8): inventing product copy is out of scope; route through the cousin's-crew channel the keystone opened. Recommendation: callout "Lo que lo tumba: el viento, a 0.18." and counterfactual "Sin él, hoy marcaría 79." — plain Spanish, no em dashes, factor names dirección/tamaño/viento/marea from the shared vocabulary module. | slice-01 ships whichever sentence is settled; slice-04's annotations only | Andres via the cousin's crew | open |
| 4 | **Counterfactual field addition to the settled P1 day-summary table.** `application-architecture.md` §7 carries `weakest_link` and `damages` but no counterfactual field; publishing the exact number as pipeline data (rather than deriving it at render) needs one field added to the settled contract, plus the same carry on `SurfaceCall`. Additive, not contradictory; the [REF] determination is the rationale. | slice-03 DISTILL | domain lane paperwork + producer lane | open |
| 5 | **Map imagery source, license, attribution, at $0.00.** Decision 20 and §5 settle the form (one static image per spot, pre-rendered at build, ~12 KB WebP, no tile library) but no document names what renders the base image or under what license. Recommendation: a build-time render from an openly licensed source with its attribution baked into the image or caption, chosen in DESIGN; a bare orientation diagram from seed `shore_normal_deg` alone is the honest fallback if licensing stalls. | slice-05 | Andres / DESIGN | open |
| 6 | **Hosted-preview spot pages all 403** (directory URLs vs `build.format: 'file'`, HANDOFF verified-live list) and no 404 page existed; both are keystone slice-06 deploy concerns. | Source-blind Vera examination of every slice on the hosted preview; not the build | keystone / deploy | open |
| 7 | **No BUILD-ORDER entry exists for this feature.** `BUILD-ORDER.md` and `plan-cluster-*.md` are untracked on every ref and none of their citations elsewhere mention F-SEE-WHAT-KILLED-IT; this workspace was opened from the epic row and the architecture directly. A scheduling row is owed by whoever owns BUILD-ORDER. | nothing in this plan; cross-lane scheduling visibility only | BUILD-ORDER owner | open |
| 8 | **Epic row flip.** `docs/epic/surfs-up-panama/epic-delta.md` line 46 must flip `pending` → `in-flight` with the Feature cell linked to `docs/feature/f-see-what-killed-it/`. The epic file is outside this lane's declared file boundary, so the one-line atomic edit is owed, not performed here. | house bookkeeping only | epic-delta owner / integration coordinator | open |
| 9 | **Per-slice charters** under `docs/product/expectations/f-see-what-killed-it/` (same boundary reason as row 8 at workspace creation). U8 observations are pre-named in the classification table above; each charter is created when its slice enters DISTILL. | each slice's DISTILL open | slice DISTILL owner | open |

## Reuse Analysis

| Existing Component | File | Overlap | Decision | Justification |
|---|---|---|---|---|
| Weakest-link + damages computation | `src/scoring/engine.ts` lines 214-234 | none: shipped, ADR'd, law-tested (L10, L16) | REUSE | The feature renders this output; it never re-derives, per the ADR's rejected alternative 2 |
| Receipt + bundle carry | `src/pipeline/build.ts` lines 106, 231, 251; `src/publish/region-bundle.ts` line 53 | **bounded-change**: `surfaceCall()` (lines 255-266) gains `weakest_link`, the named factor's `sub` value, and the counterfactual field; `daySummary` already carries the label | EXTEND | The gap is precisely the reading-surface carry; the bundle side is done |
| Reading-surface schema | `src/publish/static-surface.ts` (`SurfaceCall`), `src/data/forecast.ts` (`DaySummary`) | **bounded-change**: additive optional fields with the declared degrades | EXTEND | Optional-field lesson learned: the 19-of-20 missing-fields failure (green gates, broken pages) means every added field gets a populated-per-build check in DISTILL, not trust |
| Spot page | `src/components/SpotDetail.astro` | **one mount line only** — contended file (Pre-requisite 1) | EXTEND | Header comment lines 2-6 explicitly reserves this arrival |
| Ranked list | `src/components/RankedList.astro` | none | DO NOT TOUCH | No weakest-link element exists in the settled home wireframe; the file is BUGFIX-lane contended |
| Bar visual recipe | `src/styles/recipes.css` line 105 (`.bar.weakest .fill`) + `09-design-system.md` line 237 tokens | none: consumed as-is | REUSE | The design system already specified the bars before this workspace existed |
| Display formatting | `src/publish/display-format.ts` | **bounded-change**: sub-score and counterfactual formatting joins the house formatters | EXTEND | "Never format inline" discipline, `SpotDetail.astro` header lines 8-12 |
| Strings | `src/i18n/strings.ts` | **bounded-change**: callout/bar/map-alt strings after Pre-requisite 3 | EXTEND | Keeps the READ-06 translation seam one surface |
| Callout + bars + map component | none, does not exist | n/a | CREATE_NEW | The one new render component this feature ships; self-contained so the contended-file edit stays one line |

## Wave: DISTILL / [REF] JIT status

No acceptance test exists for this feature. That is correct, not a gap: the project's JIT rule
(`HANDOFF.md` §1) requires each slice's tests to remain absent until that slice enters DISTILL.
slice-01 is the first legal entrant, gated on Pre-requisite 3 (copy) and Pre-requisite 1 (the
mount-line coordination). The requirement checklist and the RED-classification contract live
under `docs/feature/f-see-what-killed-it/distill/`.
