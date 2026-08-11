# Requirement checklist: f-know-how-much-to-trust-it

Extracted at slice-01 JIT DISTILL (2026-08-09) from `feature-delta.md` (Baseline audit, Slice
Plan, Definition of Done, Pre-requisites), `05-scoring-engine.md` §3.6 (null observations and the
cap-application row), §6 (the confidence contract, §6.1 removal clause and f(M) cap, §6.2 and §6.3
binding copy rules, §6.4 level projection and the zero-informative-factor guard),
`06-learning-layer.md` §10 (the calibration kill switch this feature does NOT own),
`application-architecture.md` §5 (byte budget) and §7 (P1 day-summary contract: `conf_level`
missing is FAIL, `confidence_reason` is one `{es,en}` object of ≤ 160 characters each, absent
degrades to the `<details>` reason omitted), `domain-model.md` §13 (canonical names; `conf_value`
stays log-only), `adr-tide-source-chain.md`, `adr-openmeteo-vs-raw-grib2.md`,
`09-design-system.md` §5, §6 and §9 (type scale, score never colour-coded, confidence indicator
recipe: glyph dots plus level word, no colour), `HANDOFF.md` §5 (zero beach reports, settled) and
§10 (producer guard, contended files), and the U1-U7 UI mandates (`nw-ui-quality-mandates`).
One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows whose
slice has not entered DELIVER yet are expected-uncovered (per-slice JIT); they are visible here
from day one so no requirement is silently dropped. slice-01 entered JIT DISTILL on 2026-08-09
and its rows are marked below; slices 02 to 05 entered on 2026-08-10 by dispatch instruction
(JIT relaxation recorded in `red-classification.md`, header).

Numbering is load-bearing where `feature-delta.md` already cites it: R14 and R30 are the two
negative requirements the Slice Plan notes name ("no threshold or cap changes anywhere in this
plan"), and R33 to R39 are the U1-U7 rows the Slice classification table names. **R28 in this file
is not the R28 the sibling lane refers to.** `f-see-what-killed-it` numbers the shared Spanish
factor-name vocabulary module `R28` in **its own** checklist; the same module is required here by
R12. There is one module, not two copies, and DELIVER owes it once.

| # | Requirement | Category |
|---|---|---|
| R1 | Every ranked row, Hoy and Mañana, opens that spot's own reason for that day: the published per-`(spot_id, day)` reason rendered as published, never a level-keyed string identical across the ranking (`domain-model.md` §13 worked example; `application-architecture.md` §7 line 137) (slice-01) | functional |
| R2 | The same spot's reason differs between Hoy and Mañana when the published values differ; neither day borrows the other's, exactly as neither borrows the other's score (P1 day-summary grain) (slice-01) | functional |
| R3 | The reason names the cause that actually bound: the missing input when a cap binds (05 §3.6 cap-application row), otherwise the dominant spread term in surfer words (05 §6.1, `spread_terms` and `dominant`) (slice-01) | validation |
| R4 | A row whose models agreed but whose level was capped never reads as model disagreement, and a row with no missing input never names one (Baseline gap 2, the live misattribution defect) (slice-01) | validation |
| R5 | A single-member day says one model answered, never that the models disagree; there is nothing to disagree with (05 §6.1 f(M) cap) (slice-01) | validation |
| R6 | The reading surface carries the value: `surfaceCall()` and `daySummary()` stop discarding what `confidence()` already computes, and the reason reaches both the bundle day summary and `data/published-surface.json` (Baseline gap 1) (slice-01) | validation |
| R7 | Each published reason is ≤ 160 characters (P1), and what renders is exactly what was published: nothing appended, nothing truncated, nothing reworded (slice-01) | validation |
| R8 | The unverified-track sentence renders from `track_state`, never hardcoded, so the copy flips itself the day a gated scorecard exists (05 §6.2 binding copy rule) (slice-01) | functional |
| R9 | The nobody-has-reported sentence renders from `c_fresh = null`, never hardcoded, and no reason claims or implies a beach confirmation while zero reports exist (05 §6.3; `HANDOFF.md` §5, not relitigated) (slice-01) | validation |
| R10 | A row published without a reason shows its level word and omits the reason block: never an empty box, never an invented reason. `conf_level` missing stays a publish FAIL (P1 degrade rows, decision 7) (slice-01) | validation |
| R11 | Every spot page carries the confidence word and that day's reason in both day sections (charter line 17; Baseline gap 4, subject to Pre-requisite 4) (slice-01) | functional |
| R12 | Zero technical text in any reason: no model names, no field names, no English on the Spanish surface, no em dashes. The Spanish factor nouns come from the one shared vocabulary module, the named seam with F-SEE-WHAT-KILLED-IT (its R28) (slice-01) | validation |
| R13 | The touches to the contended files are one wiring line each (`RankedList.astro` passes the row's reason, `SpotDetail.astro` gains the mount); all markup and all composition live in `Confidence.astro` and the composer module (Pre-requisites 2 and 4) (slice-01) | build |
| R14 | **Negative.** slice-01 changes no cap, no threshold and no level boundary. With the tide missing no spot publishes `alta`, and no reason is made true by moving a constant (DoD row 5; the one rule the product rests on) (slice-01) | validation |
| R15 | Per-spot `tide_station` seed references are populated only where the ingest lane states a defensible phase-error bound; unmapped spots keep `tide_m` null, keep the cap and keep saying so (`adr-tide-source-chain.md` decisions 1 and 2; Pre-requisite 5) (slice-02) | functional |
| R16 | NOAA CO-OPS harmonic predictions are fetched once daily per referenced station and cached; `tide_m` lands per `(spot, valid_ts)` on member rows (04 §11; ADR decision 2) (slice-02) | functional |
| R17 | With tide present, `"tide"` leaves `missing`, `cap_missing_tide` stops binding, and `S_tide` participates from the normalized day stage (05 §3.5) (slice-02) | functional |
| R18 | `alta` renders if and only if `c_total > 0.7` under the unchanged shipped constants, proved on fixture members that genuinely agree, and never demanded of a live day the data did not earn (slice-02) | validation |
| R19 | A dark CO-OPS beyond 7 days returns the series to null, the cap returns, and the reason names the absence again (04 §11, 05 §3.6) (slice-02) | validation |
| R20 | Microtidal neutrality (`range_class: micro` with tide present, a real `S_tide = 1.0`) stays distinguishable from absence in both the score and the reason (05 §3.5, §3.6) (slice-02) | validation |
| R21 | In one build, mapped spots' reasons stop naming the tide gap while unmapped spots keep naming it (slice-02) | functional |
| R22 | C_spread participation is a per-factor enable flag in the constants file; disabling it is a data change, not a code edit (05 §6.1 removal clause; Baseline gap 5) (slice-03) | functional |
| R23 | With the spread factor disabled the level re-renders from the surviving factors and every row still carries a level (decision 7 reconciled with research 09 §3.6) (slice-03) | functional |
| R24 | The reason never names a disabled factor: the composer consults the flags (slice-03) | validation |
| R25 | The zero-informative-factor guard holds: spread disabled AND `track_state: unverified` AND `c_fresh: null` forces `low` with `dominant: null`, and the reason says no usable confidence signal exists yet (05 §6.4) (slice-03) | validation |
| R26 | A second independent wave source (raw NOAA `gfswave` GRIB2) feeds the same member table through the registry seam: one adapter plus one registry entry, no core change (`adr-openmeteo-vs-raw-grib2.md`; `src/pipeline/ports.ts`) (slice-04) | functional |
| R27 | The prediction log records the new source per source from its first deployed hour, insert-only, never backfilled (`HANDOFF.md` §3 and §5) (slice-04) | validation |
| R28 | A dark source shrinks `members_used` honestly: no blanked row, no fabricated member; a single-member day caps `c_spread` at 0.4 and the reason says one model answered (05 §6.1) (slice-04) | validation |
| R29 | Once a spot's own spread history passes the activation threshold the percentile form replaces the absolute CVs and the reason compares the day against that spot's normal; spots below threshold keep the absolute form (05 §6.1; Pre-requisite 7) (slice-05) | functional |
| R30 | **Negative, feature-wide.** No cap, threshold or level boundary changes anywhere in this feature: `cap_missing_wind = 0.4`, `cap_missing_tide = 0.7` and the 0.4 / 0.7 level boundaries stay bit-identical to `82be859`'s `src/scoring/confidence.ts`. `alta` becomes reachable through real `tide_m` only (DoD row 5; 05 §6.3 rejected alternatives) | validation |
| R31 | Confidence stays beside the score, never in it: law L9 holds and `combine()` reads nothing this feature adds (05 §6.4 structural separation law) | validation |
| R32 | Byte ceilings hold with a per-row reason in every document: home and Mañana ≤ 14 KB gz, spot pages ≤ 14 KB gz, and the reason adds zero JavaScript to any route (§5; `adr-publish-time-html-rendering.md`) | nfr |
| R33 | U1: the confidence word and the opened reason clear WCAG AA against the real rendered backdrop in both themes, including the hero card's gradient extremes | ui |
| R34 | U2: no horizontal scroll, clipping or overlap at 390 px with the longest published reason open, on the ranked list and on the spot page | ui |
| R35 | U3: the confidence disclosure measures at least 44 px on every surface that carries it, the spot page included | ui |
| R36 | U4: reduced motion is honoured; the disclosure never depends on motion and nothing delays first meaningful content | ui |
| R37 | U5: the designed states exist and are honest: reason present, reason absent (block omitted, never an empty box), one-model day, capped-by-missing-input day | ui |
| R38 | U6: reason type comes from the declared scale with rhythm that survives 160 Spanish characters at 390 px without truncation (09 §5) | ui |
| R39 | U7: the confidence block uses named tokens for colour, spacing, radius, elevation and motion, no raw hex outside `src/styles`, and the level is carried by shape plus word, never by colour (09 §6 and §9) | ui |

## Current DISTILL coverage

slice-01 entered JIT DISTILL on 2026-08-09. Its thirteen scenarios live in
`tests/acceptance/f-know-how-much-to-trust-it/la-razon-de-cada-playa.feature`, all RED as
`MISSING_FUNCTIONALITY`; the commands, the real exit codes and the per-scenario oracles are in
`distill/red-classification.md`. Slices 02 to 05 opened on 2026-08-10 (dispatch instruction):
their twenty-four executed scenarios live in `la-marea-de-cada-playa.feature`,
`el-termino-que-se-puede-apagar.feature`, `la-segunda-fuente-independiente.feature` and
`lo-normal-de-este-spot.feature`, RED as `MISSING_FUNCTIONALITY` except the standing guards
recorded per scenario in the slices 02-05 entry of `red-classification.md`.

| # | Active acceptance evidence | Status |
|---|---|---|
| R1 | `@covers-R1`: the walking skeleton, both rows of its outline ("El surfista abre la lista de hoy / de mañana y lee la razón de su playa para ese día"), compares every row's opened text against the reason its own morning published | covered, RED |
| R2 | `@covers-R2`: the same outline runs over Hoy and Mañana, and the fixture gives `playa-venao` and `playa-guanico` different profiles on the two days, so a day that borrowed the other's text fails | covered, RED |
| R3 | `@covers-R3`: producer-side. "La razón nombra la marea que falta" (tide dark, models agreeing) requires the noun `marea`; "Cuando el que manda es el desacuerdo de período" (tide present, periods split 15.5 s against 10.05 s) requires the noun `período`. Both read real engine output, never a planted string | covered, RED |
| R4 | `@covers-R4`: the same two scenarios assert the inverse each time — no disagreement wording on the capped-but-agreeing morning, no mention of `marea` on the morning whose tide arrived complete | covered, RED |
| R5 | `@covers-R5`: "Un día en que solo respondió un modelo" darks three of the four declared sources and requires the reason to say one model answered and not to claim a disagreement | covered, RED |
| R6 | `@covers-R6`: "la superficie que leen las páginas trae la razón de cada playa y cada día" reads both halves of one published bundle — the day summary AND `publish_surface` — so a producer that fed only the bundle would still fail | covered, RED |
| R7 | `@covers-R7`: the 160-character bound is asserted twice on purpose — producer-side against the composed sentence, and reading-side against what the built page actually renders (204 characters today) | covered, RED |
| R8 | `@covers-R8`: "cada razón dice que este spot todavía no tiene historial verificado" requires the noun `historial` on a morning whose `track_state` is `unverified`. **Partially covered:** that the sentence is *derived from the input* rather than hardcoded is not observable while `unverified` is the only state the system can produce; the flip-side (a `measured` spot dropping the sentence) needs the gated scorecard and belongs with F-SHOW-OUR-TRACK-RECORD | partially covered, RED |
| R9 | `@covers-R9`: the same scenario requires the nobody-has-reported sentence and forbids any beach-confirmation claim, producer-side; the reading half re-checks the claim on every rendered reason. Same partial-coverage note as R8 for the derived-from-input half | partially covered, RED |
| R10 | `@covers-R10`: "Una playa publicada sin razón muestra su nivel y calla" plants `punta-brava` with no reason and requires its level word plus silence. It closes on a sibling beach in the same morning that must open ITS published reason, so the absence assertion can never pass against a page that shows nothing at all | covered, RED |
| R11 | `@covers-R11`: "La página de la playa trae su nivel y su razón, hoy y mañana" asserts a level word and that day's published reason in both `section[data-day]` blocks of the emitted spot page | covered, RED |
| R12 | `@covers-R12`: producer-side and reading-side, every reason is checked for model names, field names, `null`/`undefined`/`json` tokens and em dashes. **Not covered: that the Spanish factor nouns come from one shared module.** That is a DELIVER structural constraint and the module does not exist yet (see Flagged below) | partially covered, RED |
| R13 | no scenario. "One wiring line each into `RankedList.astro` and `SpotDetail.astro`" is not observable through the built surface; it stays a DELIVER code-review constraint. Its observable half (the reason reaches both surfaces) is R1 and R11 | expected-uncovered by design |
| R14 | `@covers-R14`: "Sin el dato de la marea nadie ve confianza alta, y la razón dice por qué" asserts no published row is `high` on a morning of genuinely agreeing models with the tide dark, and then that every reason names the gap. The first half PASSES today and is the guard; the second half is the RED. A DELIVER that reached `alta` by moving `cap_missing_tide` or the 0.7 boundary would turn the first half red | covered, RED |
| R15 | `@covers-R15`: "La playa que puede citar su estación… y la vecina…" injects one seed with `tide_station` and one without, the fake station answering for any spot asked, and requires the stationless spot's archived hours to stay null. **Partially covered:** the mapping-policy criterion itself (which spots MAY cite Balboa, Pre-requisite 5) is a data decision no scenario can pin until it is made | partially covered, RED |
| R16 | `@covers-R16`: the same scenario reads the prediction log per spot and hour: numbers for the mapped spot, nulls for the other. The once-daily-fetch-and-cache mechanics are the adapter's own DELIVER unit tests (roadmap 02-03) | covered, RED |
| R17 | `@covers-R17`: "La confianza alta llega sola…" — with tide served per station, `alta` publishes at c_total 0.9922 under bit-identical constants | covered (mapped half holds in-memory; production reachability rides 02-01/02-03) |
| R18 | `@covers-R18`: the same scenario plus the reading-half "El surfista ve confianza alta solo donde los datos la ganaron"; the iff-half is the vecina-stays-media oracle, red today on borrowed tide | covered, RED |
| R19 | `@covers-R19`: "Una estación muda por más de siete días…" drives the post-window port state and stands guard against a cache serving stale harmonics | covered, guard+RED (vacuity-guarded until carriage lands) |
| R20 | `@covers-R20`: "Una playa de mareas chicas…" pairs a mapped micro spot (real neutral, tide-silent reason) with an unmapped one (cap, tide-named reason) | covered, RED |
| R21 | `@covers-R21`: the mixed morning of the first slice-02 scenario plus the reading half: mapped reasons drop the tide gap while unmapped keep it, in one build | covered, RED |
| R22 | `@covers-R22`: "Apagar el término del desacuerdo es un cambio de datos…" plus the flags-on regression guard; the flag home is fixed as `confidence_factors` in the launch policy (contract 2, red-classification) | covered, RED |
| R23 | `@covers-R23`: same scenario: every row still carries a level with the flag off | covered, RED |
| R24 | `@covers-R24`: "ninguna razón nombra el término apagado" in both the split-period and missing-tide mornings | covered, RED |
| R25 | `@covers-R25`: "Sin ningún factor que informe…" — forced low plus the no-usable-signal admission (noun `señal`, wording open per Pre-requisite 1) | covered, RED |
| R26 | `@covers-R26`: "La fuente independiente queda archivada tal cual…" (registry walk, per-provider raw prefix) plus the adapter-integration scenario against a captured real grib_filter response. **Partially covered:** "no core change" is a DELIVER code-review constraint, not page-observable (same class as R13) | partially covered, RED |
| R27 | `@covers-R27`: per-provider raw archive from the first morning, natural-key dedupe, and the repeat-morning insert-only guard | covered, RED (dedupe and insert-only halves pass today as standing guards) |
| R28 | `@covers-R28`: vendor-dark, independent-dark and single-model mornings: honest `members_used`, no fabricated trace, one-model wording, f(M) low ceiling | covered, RED |
| R29 | `@covers-R29`: 60 honestly-published mornings then a worse-than-usual day (comparison against the spot's own normal, noun `normal`), the two-morning below-threshold guard, the cause-hierarchy guard, and the reading-half fidelity scenario. The production-contract half drives unavailable and malformed durable PublishedCall history through `runProductionBuild`, observes `health.startup.refused`, and proves no call, bundle, or manifest write. Threshold is the accepted policy value 30, with 60 above and 2 below. | covered, RED |
| R30 | `@covers-R30`: slice-02's alta scenario (the vecina-stays-media oracle goes red on any lowered bar) and the seven-day-staleness scenario; the bit-identity half is roadmap 02-02's extension of `tests/unit/confidence-constants-guard.test.ts`. R14 remains its slice-01 instance | covered, RED |
| R31 | no scenario. Law L9 is already property-tested at the engine (`tests/unit/scoring-laws.test.ts`) and this slice adds nothing `combine()` could read; a page-level oracle would be theatre | expected-uncovered by design |
| R32 | no scenario of its own. The isolated build runs the repository page-weight gate as part of `npm run build`, so a slice-01 regression past 14 KB gz fails every reading-half scenario at setup, but the budget is not asserted as its own oracle here | expected-uncovered by design |
| R33 to R38 | `@covers-R33` to `@covers-R38`: the two-row visual outline (tema claro / movimiento normal, tema oscuro / movimiento reducido) measures contrast against the real rendered backdrop by walking to the nearest painting ancestor, 390 px overflow, 44 px targets, motion under the reduced preference, the designed open state, the declared type scale and line rhythm, and raw hex in inline styles. It counts the measurable blocks FIRST and fails at zero, so "nothing to measure" can never read as "AA is fine". **Scoped to the spot page**, whose confidence block does not exist yet; the ranked-row half of U1-U7 is already proven green by the keystone's slice-07 scenarios and re-asserting it here would pass vacuously | covered for the spot page, RED |
| R39 | `@covers-R39`: "Quien no distingue colores lee la confianza igual" asserts that no colour distinguishes one level from another (this PASSES today and is the guard against DELIVER introducing a green/amber confidence) and that each level is carried by a shape beside its word (this is the RED: the shipped trigger is the bare phrase, with no glyph dots). **Flagged: the shape half comes from `09-design-system.md` §9's confidence-indicator recipe, not from the Baseline gap table.** Strike this row if it is judged outside slice-01 | covered, RED |
