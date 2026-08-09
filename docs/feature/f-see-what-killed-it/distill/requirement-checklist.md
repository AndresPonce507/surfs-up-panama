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
visible here from day one so no requirement is silently dropped. No acceptance test exists yet:
this feature has not entered JIT DISTILL.

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

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| none | No slice of this feature has entered JIT DISTILL. Acceptance tests are written per slice, one slice at a time, when the slice legally opens (`HANDOFF.md` §1 workflow). | expected-uncovered by design |
