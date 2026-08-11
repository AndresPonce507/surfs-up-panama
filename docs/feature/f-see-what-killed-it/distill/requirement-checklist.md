# Requirement checklist: f-see-what-killed-it

Extracted at workspace creation (2026-08-09) from `feature-delta.md` (Slice Plan + honesty
determination + Definition of Done), `docs/DISCUSS-decisions.md` 17, 18, 20,
`adr-scoring-weakest-link-damage.md`, `05-scoring-engine.md` §4/§10 (laws L8, L10, L16) and §11
(worked example), `application-architecture.md` §4 (route budget), §7 (P1 day-summary and
spot_detail contracts, derive-don't-ask, degrade rows), §12 (map cache row), §14 (spot-detail
wireframe), `09-design-system.md` line 237 (bar tokens, colour-never-alone), and the U1-U7 UI
mandates (`nw-ui-quality-mandates`). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body.
Rows whose slice has not entered DELIVER yet are expected-uncovered (per-slice JIT); they are
visible here from day one so no requirement is silently dropped. slice-01 entered JIT DISTILL on
2026-08-09 and its rows are marked covered below; slices 02 to 05 have not opened.

| # | Requirement | Category |
|---|---|---|
| R1 | Both day sections of every spot page name that day's weakest link in plain Spanish; the label is the published `weakest_link` value rendered verbatim, never re-derived from sub-scores or bars (decision 17; scoring ADR) (slice-01) | functional |
| R2 | `weakest_link: null` (perfect day) renders no callout at all; never a fabricated culprit, and the page reads complete without it (§7 line 294 degrade; `region-bundle.ts` line 52) (slice-01) | validation |
| R3 | The reading surface carries the value: `surfaceCall()` and `SurfaceCall` gain `weakest_link`, and the committed `data/published-surface.json` is verified populated per build for every spot-day (the 19-of-20 missing-optional-fields failure must be impossible to repeat silently) (slice-01) | validation |
| R4 | The render insertion into `SpotDetail.astro` is exactly one mount line; all callout markup, logic and styling live in the new self-contained component (contended-file discipline, Pre-requisite 1) (slice-01) | build |
| R5 | The callout never names a factor whose observation was null, asserted through the built surface on a fixture with wind/tide null (L16 inherited from the engine, proven at the page too) (slice-01) | validation |
| R6 | Each day section renders its own day's values: today's culprit is never tomorrow's, verified on a fixture where the two days differ (slice-01) | functional |
| R7 | The label pairs with the raw sub-score of the named factor from the same published row: "el viento, a 0.18"; label from damage, number from `sub`, formatted through `display-format.ts`, never inline (scoring ADR pairing rule) (slice-02) | functional |
| R8 | The displayed number equals the published `sub` value of the named factor exactly (no rescaling, no rounding beyond the settled display format); it is the one sanctioned numeric on the Spanish surface besides scores (epic row: "wind at 0.18") (slice-02) | validation |
| R9 | The counterfactual score is computed in the pipeline as `round(100 * clip(exp(-(D - d_w)) + delta_q, 0, 1))`, published as data, and rendered verbatim; the page performs no arithmetic (honesty determination; Pre-requisite 4 field) (slice-03) | functional |
| R10 | Counterfactual ≥ displayed score always; property-tested over the L10 generator domains; a published counterfactual below its score refuses the publish LOUD (slice-03) | validation |
| R11 | At `bias_gate: "no_file"` (`delta_q = 0`) the counterfactual is bit-exact against the L10 identity: recomputing `round(100 * exp(-(D - d_w)))` from the published `damages` reproduces the published field; §11 worked example (score 80, weakest size) yields 93 (slice-03) | validation |
| R12 | Suppression states are designed and exercised: rounding collision (counterfactual equals score) suppresses the clause; `weakest_link` null shows no callout; counterfactual field absent omits the clause and logs the gap; no path prints an invented or contradictory number (slice-03) | validation |
| R13 | Four breakdown bars render every sub-score for each day (decision 17), valued from the single hourly point in the hour containing that day's `best_window.start` — derive-don't-ask, one lookup, no averaging (§7 lines 313-319) (slice-04) | functional |
| R14 | The callout arrow anchors on the `weakest_link` factor, never on the visually lowest bar; verified on a fixture where the two differ (§7 lines 320-323) (slice-04) | validation |
| R15 | A null factor renders a stated absence in Spanish, never a zero-height bar, never a value, and never "limpio"; the windState null→"limpio" defect is verified fixed before this slice ships (L16; Pre-requisite 2) (slice-04) | validation |
| R16 | `best_window` absent omits the bars for that day (declared degrade, §7 line 296) while the callout, which reads from the day summary alone, still renders (slice-04) | validation |
| R17 | Bars are publish-time static markup with zero new JS; tokens per `09-design-system.md` line 237: 8 px tracks on `--sunken`, weakest fill `--danger`, and the callout is carried by arrow + words, never colour alone (slice-04) | ui |
| R18 | The spot page shows one static map image per spot with the break and its orientation (from seed `shore_normal_deg`), pre-rendered at build, ~12 KB WebP, lazy (decision 20; §5 line 188) (slice-05) | functional |
| R19 | The map has meaningful Spanish alt text and reserved layout space: no CLS on load, and offline the alt text renders in the reserved box (§12 line 475) (slice-05) | ui |
| R20 | No tile service call, no JS map library, no runtime map fetch beyond the one static image; imagery license and attribution per the Pre-requisite 5 decision are visibly satisfied (§5 cut table line 198) (slice-05) | nfr |
| R21 | U1: callout, bars, map caption and all new text clear WCAG AA (4.5:1 or better) against the real rendered backdrop in both themes; the `--danger` fill pairing holds its documented 6.75/6.02 | ui |
| R22 | U2: no horizontal scroll, clipping or overlap at 390 px with callout, bars and map present, including the longest settled Spanish strings | ui |
| R23 | U3: any interactive element this feature adds measures at least 44 px; the existing thumb-zone report CTA is not displaced or occluded | ui |
| R24 | U4: reduced-motion honoured; no bar-fill or map animation delays first meaningful content or plays under `prefers-reduced-motion` | ui |
| R25 | U5: the designed states exist and are honest: perfect-day no-callout, rounding-collision suppression, null-factor stated absence, bars-omitted degrade, map offline alt-text | ui |
| R26 | U6: type comes from the declared scale and survives the longest Spanish factor sentence at 390 px without truncation | ui |
| R27 | U7: colour, spacing, radius, elevation and motion use named tokens; no raw hex outside `src/styles` | ui |
| R28 | Zero technical text beyond the two settled numbers: no factor enum tokens (`dir`/`size`/`wind`/`tide`) ever reach the surface, no JSON, no English; all strings live in `src/i18n/strings.ts` with no em dashes; Spanish factor names come from the one shared vocabulary module (seam with F-KNOW-HOW-MUCH-TO-TRUST-IT) | validation |
| R29 | No server surface is added: the feature is pipeline + publish-time render only; no endpoint, Lambda, island or write path (route JS budget unchanged) | security |
| R30 | Byte gates: spot document stays ≤ 14 KB gz with callout and bars; the map adds zero document bytes (lazy image); zero new JS on the route (§4 route table line 111) | nfr |

## Current DISTILL coverage

slice-01 entered JIT DISTILL on 2026-08-09. Its eleven scenarios live in
`tests/acceptance/f-see-what-killed-it/lo-que-lo-tumba.feature`, all RED as
`MISSING_FUNCTIONALITY`; the run, the commands and the per-scenario oracles are in
`distill/red-classification.md`. Slices 02 to 05 have not opened, so their rows stay
expected-uncovered by design.

| # | Active acceptance evidence | Status |
|---|---|---|
| R1 | `@covers-R1`: "El surfista abre su playa y lee qué la tumbó hoy y qué la tumba mañana" (walking skeleton) and "La página nombra el culpable publicado, nunca uno que deduzca ella sola" | covered, RED |
| R2 | `@covers-R2`: "Un día perfecto no tiene culpable, y la página no parece rota por eso" (explicit `null`) and "Una playa cuya mañana se publicó sin ese dato calla en vez de inventar" (field absent). Both close on a sibling beach that must name its culprit, so neither can pass vacuously | covered, RED |
| R3 | `@covers-R3`: "El punto débil llega a la superficie que leen las páginas, no solo al recibo" proves `surfaceCall()` drops the field (one beach, pipeline ports, in-process) and "Ninguna playa se queda callada mientras las demás sí lo dicen" proves the render reaches all 20 emitted spot pages on both days. **Not covered: that a real pipeline run populates every committed row.** The 40 spot-days in the sweep are planted by this lane's fixture, so a builder that populated 1 row of 20 would still leave this suite green. R3's "impossible to repeat silently" half needs a populated-per-build check over a real pipeline run, owed alongside the slice-03 schema work (Pre-requisite 4) | partially covered, RED |
| R4 | `@covers-R4`: "El culpable aparece en la página de la playa y no cambia la lista de hoy" covers the observable half. **The "exactly one mount line into `SpotDetail.astro`" half is not observable through the built surface and stays a DELIVER code-review constraint** | partially covered, RED |
| R5 | `@covers-R5`: "La página nombra el culpable publicado, nunca uno que deduzca ella sola" — the beach published with tide as culprit and no wind observation must name marea and must not name viento | covered, RED |
| R6 | `@covers-R6`: the walking skeleton asserts today's culprit and tomorrow's differ on the same page and that neither section borrows the other day's | covered, RED |
| R7 to R16 | slice-02, slice-03 and slice-04 | expected-uncovered by design |
| R17 | slice-04 (bars). The "colour never carries the callout alone" half is already proven for the sentence by "Quien no distingue colores recibe la misma información" | expected-uncovered by design (bars) |
| R18 to R20 | slice-05 (map) | expected-uncovered by design |
| R21 | `@covers-R21`: the seven visual checks scenario measures the sentence against the **real rendered backdrop** (nearest non-transparent ancestor), in tema claro and tema oscuro; plus the flattened-colour scenario | covered for the callout, RED |
| R22 | `@covers-R22`: no horizontal overflow at 390 px on the longest Spanish spot name, "Santa Catalina - La Punta" | covered for the callout, RED |
| R23 | `@covers-R23`: any control the callout adds must measure 44 px, and the existing thumb-zone report CTA must still measure 44 px and not be displaced | covered for the callout, RED |
| R24 | `@covers-R24`: under `prefers-reduced-motion` the callout carries no transition and no animation | covered for the callout, RED |
| R25 | `@covers-R25`: the perfect-day no-callout state is a designed state (no empty box, no stray word), and no artificial loading appears inside the callout | covered for the callout, RED |
| R26 | `@covers-R26`: the callout's computed type size and line height come from the declared scale and survive the longest Spanish name at 390 px | covered for the callout, RED |
| R27 | `@covers-R27`: no raw colour in the callout's own style attribute, plus the repository UI gate (`scripts/check-ui-quality.mjs`, which owns the no-raw-hex-outside-`src/styles` rule) must exit 0 for the built surface | covered for the callout, RED |
| R28 | `@covers-R28`: every callout sentence across the 20 pages must be Spanish, free of engine tokens (`dir`/`size`/`wind`/`tide`), free of data punctuation and free of em dashes. **The shared Spanish factor-name vocabulary module this row requires does not exist yet** — `src/data/report-vocab.ts` carries wind states and quality tokens only. DELIVER owes one module, shared with F-KNOW-HOW-MUCH-TO-TRUST-IT | covered for the callout, RED |
| R29 | no scenario yet. Slice-01 adds no server surface by construction (publish-time render only); the guard belongs with the later slices' byte and route work | expected-uncovered by design |
| R30 | no scenario yet. The isolated build runs the repository page-weight gate as part of `npm run build`, so a slice-01 regression past 14 KB gz would fail every browser scenario at setup, but the budget is not asserted as its own oracle here | expected-uncovered by design |

### Slice-03 JIT acceptance evidence

`@slice-03` now has one two-theme emitted-dist HTTP/Chromium scenario, `El
surfista lee cuánto marcaría la playa sin ese punto débil`, plus three explicit
browser suppression scenarios and a separate publisher-event scenario. The
entry scenario is RED at the visible `93` counterfactual oracle, with the same
behavior checked under dark theme and reduced motion. Tags `@covers-R9
@covers-R11 @covers-R12` bind the published per-day number, its exactness
witness, and honest suppressions;
`@covers-R21` through `@covers-R27` bind U1 through U7 for the longer sentence.
Its U8 observation is in
`docs/product/expectations/f-see-what-killed-it/a-surfer-lee-cuanto-marcaria-la-playa-sin-el-punto-que-la-tumbo.md`.
The fixture plants only published row fields and retains a separate producer
damage witness. The test asserts the built-surface health-event envelope for
two named legacy days, while rounded equality and a clean day must not emit an
event. R10's lower-value producer refusal remains outside step 03-05 and is
still owed by 03-06.
