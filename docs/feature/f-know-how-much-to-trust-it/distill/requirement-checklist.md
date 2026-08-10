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
and its rows are marked below; slices 02 to 05 have not opened.

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
`distill/red-classification.md`. Slices 02 to 05 have not opened, so their rows stay
expected-uncovered by design.

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
| R15 to R29 | slices 02, 03, 04 and 05 | expected-uncovered by design |
| R30 | no scenario of its own. R14 is its slice-01 instance; the feature-wide constant-identity check belongs with slice-02, where a threshold change would first be tempting | expected-uncovered by design |
| R31 | no scenario. Law L9 is already property-tested at the engine (`tests/unit/scoring-laws.test.ts`) and this slice adds nothing `combine()` could read; a page-level oracle would be theatre | expected-uncovered by design |
| R32 | no scenario of its own. The isolated build runs the repository page-weight gate as part of `npm run build`, so a slice-01 regression past 14 KB gz fails every reading-half scenario at setup, but the budget is not asserted as its own oracle here | expected-uncovered by design |
| R33 to R38 | `@covers-R33` to `@covers-R38`: the two-row visual outline (tema claro / movimiento normal, tema oscuro / movimiento reducido) measures contrast against the real rendered backdrop by walking to the nearest painting ancestor, 390 px overflow, 44 px targets, motion under the reduced preference, the designed open state, the declared type scale and line rhythm, and raw hex in inline styles. It counts the measurable blocks FIRST and fails at zero, so "nothing to measure" can never read as "AA is fine". **Scoped to the spot page**, whose confidence block does not exist yet; the ranked-row half of U1-U7 is already proven green by the keystone's slice-07 scenarios and re-asserting it here would pass vacuously | covered for the spot page, RED |
| R39 | `@covers-R39`: "Quien no distingue colores lee la confianza igual" asserts that no colour distinguishes one level from another (this PASSES today and is the guard against DELIVER introducing a green/amber confidence) and that each level is carried by a shape beside its word (this is the RED: the shipped trigger is the bare phrase, with no glyph dots). **Flagged: the shape half comes from `09-design-system.md` §9's confidence-indicator recipe, not from the Baseline gap table.** Strike this row if it is judged outside slice-01 | covered, RED |
