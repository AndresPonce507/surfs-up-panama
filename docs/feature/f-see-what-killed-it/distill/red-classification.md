# RED classification history

Feature: `f-see-what-killed-it`
Slices entered: slice-01 (2026-08-09)
Status: slice-01 authored and RED; slices 02 to 05 have not entered JIT DISTILL

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable exercised,
   the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import, fixture
   construction, step matching, browser startup or runner setup is BROKEN and blocks handoff
   until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. Slice-01 must additionally record, as a product fact, the verified pre-delivery state of the
   reading-surface gap: `weakest_link` present in the region bundle day summaries and receipts
   but absent from `data/published-surface.json` (0 occurrences at workspace creation). The RED
   for R1/R3 must fail because the surface lacks the field, not because the engine lacks the
   value; later slices read that distinction from here.
5. Slice-03 must record the exactness evidence of R11 at RED time: the fixture's published
   `damages`, the recomputed `round(100 * exp(-(D - d_w)))`, and the expected published field,
   so the oracle is arithmetic on record, never a snapshot number nobody can re-derive.
6. Slice-04 may not enter DISTILL while the windState null→"limpio" defect
   (`src/pipeline/build.ts` lines 290-294; Pre-requisite 2, BUGFIX lane) is unfixed; the entry
   recording slice-04's RED must cite the commit that fixed it.
7. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the default
   for this feature; the one recorded relaxation elsewhere (keystone slices 06 to 08 opened in
   parallel on instruction) was a deliberate call for that build and carries no precedent here.

## Entries

### slices 04 and 05 — breakdown and orientation diagram (2026-08-11)

Author: explicit DISTILL opening on `build/f2-deltas-distill-45`, base `20f40cf`.
Artefacts: the shared feature file; `steps/slice-04-05.steps.ts`; two producer-shaped fixtures;
two source-blind expectation charters; and `distill/slice-04-05-acceptance-bindings.md`.

**Commands observed.**

```
npm run typecheck
REAL_EXIT=0

npm run test:at -- --dry-run --tags "@feature-f-see-what-killed-it and (@slice-04 or @slice-05)"
REAL_EXIT=0
12 scenarios (12 skipped); 126 steps (126 skipped); 0 undefined, 0 ambiguous

npm run test:at -- --tags "@feature-f-see-what-killed-it and (@slice-04 or @slice-05)"
REAL_EXIT=1
12 scenarios (12 failed); 126 steps (114 passed, 12 failed)
```

The copied production input is advanced to Panama's current civil date before
`npm run build`; build verification passes, emitted files are served over real
local HTTP, and Chromium reads a 390 px spot page. The original sample is a
previous-day receipt, so this adjustment is fixture hygiene, not a production
or rendering change. No scenario failed in import, fixture construction, step
matching, build, server startup or browser startup.

| Steps | Visible behavior oracle reached | Honest classification |
|---|---|---|
| 04-01 to 04-04 | emitted page has no `[data-field="breakdown"]` or required selected-row marker | `BLOCKED_BY_DEPENDENCY: X9` |
| 04-05 to 04-06 | emitted 390 px page has no breakdown component | `BLOCKED_BY_DEPENDENCY: X10` (and X9 input) |
| 05-01 to 05-04 | emitted page has no `[data-field="orientation-diagram"]` | `MISSING_FUNCTIONALITY` after accepted X11; policy/asset/component are absent |
| 05-05 to 05-06 | emitted 390 px page has no lazy diagram or reserved frame | `BLOCKED_BY_DEPENDENCY: X12` for worker cache, plus missing host/component |

This is intentionally not called a passing RED. The exact selectors named in
the failure output are the public document contract that DELIVER must make
visible. A zero-selection Cucumber run was prevented by the dry run count of
12 scenarios and 126 matched steps.

### slice-03 — "Sin ese punto débil marcaría", day-aware counterfactual (2026-08-10)

Author: JIT DISTILL on `build/f2-deltas`, worktree `/Users/andres/psb-deltas`.
Artefacts: `tests/acceptance/f-see-what-killed-it/lo-que-lo-tumba.feature`,
`tests/acceptance/f-see-what-killed-it/steps/weakest-link-callout.steps.ts`,
`tests/acceptance/f-see-what-killed-it/fixtures/slice-03-counterfactual-profiles.json`,
and `docs/product/expectations/f-see-what-killed-it/a-surfer-lee-cuanto-marcaria-la-playa-sin-el-punto-que-la-tumbo.md`.

**Commands observed, exactly as run.**

```
npm run typecheck
REAL_EXIT=0

npm run test:at -- --dry-run --tags "@feature-f-see-what-killed-it and @slice-03"
REAL_EXIT=0
1 hook (1 skipped); 2 scenarios (2 skipped); 28 steps (28 skipped); 0 undefined, 0 ambiguous

npm run test:at -- --tags "@feature-f-see-what-killed-it and @slice-03"
REAL_EXIT=1
1 hook (1 passed); 2 scenarios (2 failed); 28 steps (18 passed, 8 skipped, 2 failed)
```

**Exactness witness for R11.** The fixture is producer-shaped evidence only;
the emitted page gets the already-published integers, never the damages. Today
has damages `{dir: 0, size: 0.1499, wind: 0.0681, tide: 0.0059}`, named
`size`, and `delta_q = 0`: `round(100 * exp(-(0.2239 - 0.1499))) = 93` while
`round(100 * exp(-0.2239)) = 80`. Tomorrow has damages `{dir: 0.04,
size: 0.07, wind: 0.228842, tide: 0.017833}`, named `wind`, and `delta_q = 0`:
`round(100 * exp(-(0.356675 - 0.228842))) = 88` while
`round(100 * exp(-0.356675)) = 70`. The Given recomputes both before browser
navigation so a dishonest fixture cannot make the page test pass.

**Classification.** Both light and dark/reduced-motion examples reach the
real production build, emitted `dist/`, HTTP server, and Chromium at 390 px.
They fail at the same user-visible assertion, not at imports, fixture setup,
step matching, build, HTTP, or browser startup:

| Scenario | Observable exercised | Behavior oracle reached | Classification |
|---|---|---|---|
| El surfista lee cuánto marcaría la playa sin ese punto débil, tema claro | Today’s visible counterfactual clause on the emitted spot page | `Then la sección de hoy dice cuánto marcaría sin su causa publicada` — the page does not show the published `93` | MISSING_FUNCTIONALITY |
| El surfista lee cuánto marcaría la playa sin ese punto débil, tema oscuro y movimiento reducido | Same day-aware clause under the alternate shipped visual state | Same visible `93` oracle | MISSING_FUNCTIONALITY |

The scaffold also specifies the post-GREEN integrity boundary: the production
build emits exactly two JSON-lines events for the two named legacy spot-days,
each with `event`, `spot_id`, `day`, and `published_at`; a rounded equality and
a clean day emit none. It is not reached while the missing visible clause is
correctly RED, and will become the next assertion when the first oracle is
GREEN.

**Review amendment.** Independent review separated the original surfer journey
from three explicit suppression journeys (rounded equality, named legacy
absence, and perfect day) and one publisher journey for the JSON-lines health
event. The original RED snapshot above remains the truthful entry evidence for
the exact requested surfer scenario: it was taken before the clause existed.
The later scenarios are deliberately enabled after that first behavior under
the one-at-a-time sequence. Their current binding is `6 scenarios, 67 steps,
0 undefined, 0 ambiguous`; they are not retroactively represented as having
failed in the earlier snapshot.

### slice-01 — "Lo que la tumbó", named per day section (2026-08-09)

Author: JIT DISTILL on `build/f2-deltas`, worktree `/Users/andres/psb-deltas`, base `6037fc1`.
Artefacts: `tests/acceptance/f-see-what-killed-it/lo-que-lo-tumba.feature`,
`tests/acceptance/f-see-what-killed-it/steps/weakest-link-callout.steps.ts`,
`tests/acceptance/f-see-what-killed-it/fixtures/slice-01-weakest-link-profiles.json`.

**Commands observed, exactly as run.** The gate is redirected to a file and `$?` captured on its
own line; nothing is piped into `tail`, `head` or `grep` (project rule: a pipeline returns the last
command's status, and this repo has committed over a red gate that way).

```
npm run typecheck
REAL_EXIT=0

npm run test:at -- --dry-run --tags "@feature-f-see-what-killed-it and @slice-01" > /tmp/deltas-dry.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
11 scenarios (11 skipped); 122 steps (122 skipped); 0 undefined, 0 ambiguous

npm run test:at -- --tags "@feature-f-see-what-killed-it and @slice-01" > /tmp/deltas-red.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=1
1 hook (1 passed); 11 scenarios (11 failed); 122 steps (108 passed, 3 skipped, 11 failed); 0m 3.689s

npm run test:at -- --tags "not @feature-f-see-what-killed-it" > /tmp/deltas-rest.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
78 scenarios (78 passed); 898 steps (898 passed)
```

The last run is the regression proof that this lane's step file, which every acceptance run
imports, did not collide with an existing step string or replace the shared cucumber World.

All eleven failures are `AssertionError [ERR_ASSERTION]: WHAT: ...` raised by this file's own
`assertBehavior`. A grep of the run for `test fixture error`, import errors, `TypeError`,
`ReferenceError`, undefined steps and ambiguous steps returns nothing.

The dry run is recorded on purpose. Cucumber exits 0 when a tag expression selects nothing, so a
typo in the tag reads as success; the authored scenario count (11: nine scenarios plus a two-row
Scenario Outline) is the evidence that the filter actually bound. 122 steps matched and zero were
undefined, so no scenario could fail on step matching.

**Pre-delivery product fact (contract item 4), verified before the run.**

| Where the value lives today | Observed |
|---|---|
| `src/scoring/engine.ts` line 234 | the engine computes `weakest_link` (`argmax(damage)`, null when every damage is 0) |
| `src/pipeline/build.ts` line 231 | every receipt row carries it |
| `src/pipeline/build.ts` line 251 (`daySummary`) → `src/publish/region-bundle.ts` line 53 | the bundle day summary carries it |
| `src/pipeline/build.ts` `surfaceCall()` | **drops it** — the reading-surface half of the same bundle has no such field |
| `src/publish/static-surface.ts` `SurfaceCall` | no field |
| `src/data/forecast.ts` `DaySummary` | no field |
| `data/published-surface.json` | `grep -c weakest_link` → **0** |
| `src/components/SpotDetail.astro` | renders nothing of it |

Scenario 5 below observes that split live, in one build, through the pipeline's own driving ports:
the receipt says `"size"` for `playa-venao` on 2026-08-08 and `"wind"` on 2026-08-09, and the
reading surface published in the same object does not carry the field at all. The RED for R1 and R3
is therefore a **surface gap, not an engine gap** — exactly the distinction later slices read from
here.

**How the scenarios reach production.** Every browser scenario copies the project to a temp root,
plants only pipeline-shaped input on `data/published-surface.json` (one `weakest_link` per
spot-day), runs the real `npm run build` (`publish:surface --verify` then `astro build`, exit 0,
83 documents, page-weight gate green), serves the emitted `dist/` over real HTTP from a server in
the test process, and reads it in Chromium at 390 px. Not `astro preview` and not `vite preview`:
vite's SPA fallback serves `index.html` for any unmatched route, which would turn a missing spot
page into a passing test. The server resolves `/x` → `dist/x` → `dist/x.html` → `dist/x/index.html`
and `/x/` → `dist/x/index.html` → `dist/x.html`, then returns a real 404 with the emitted 404
document. The trailing-slash rule mirrors the rewrite the deploy owes (`build.format: 'file'` emits
`dist/spots/<id>.html`, `paths.spot()` links to `/spots/<id>/`) — that is Pre-requisite 6, a
keystone/deploy concern, and resolving it in the harness is what keeps these scenarios failing on
the callout rather than on hosting. Every navigation asserts HTTP 200 before any oracle runs, so a
routing regression would surface as a setup failure and be classified BROKEN, never as a silent pass.

Ten of the eleven reach production that way. Scenario 5 is the exception and is tagged
`@in-memory` for it: its observable is a producer-side one the built surface does not owe, so it
drives `runIngestOnce` / `runBuildOnce` in-process through the same ports the keystone lane uses,
with in-memory doubles for the forecast source, the clock and the object store. Contract item 3
permits that because no fixture-only wiring is satisfying an oracle the built surface owes — the
built-surface half of R3 is scenario 6, over the emitted `dist/`.

**Classification. The only acceptable RED is `MISSING_FUNCTIONALITY`, and all eleven are it.**

| # | Scenario | Observable exercised | Behavior oracle reached | Classification |
|---|---|---|---|---|
| 1 | El surfista abre su playa y lee qué la tumbó hoy y qué la tumba mañana (`@walking_skeleton`, R1, R6) | the culprit sentence in each day section of the emitted spot page over HTTP | `Then la sección de hoy nombra en palabras el punto débil publicado para hoy` — "la mañana publicó un culpable y la página no lo nombra" | MISSING_FUNCTIONALITY |
| 2 | Un día perfecto no tiene culpable, y la página no parece rota por eso (R2, R25) | absence of the sentence for a `weakest_link: null` beach, against a sibling beach in the same build | `And en esa misma mañana la playa de al lado sí nombra el suyo` — the sibling names nothing either | MISSING_FUNCTIONALITY |
| 3 | Una playa cuya mañana se publicó sin ese dato calla en vez de inventar (R2) | absence of the sentence when the field is absent entirely, against the same sibling | `And en esa misma mañana la playa de al lado sí nombra el suyo` | MISSING_FUNCTIONALITY |
| 4 | La página nombra el culpable publicado, nunca uno que deduzca ella sola (R1, R5) | the sentence for a beach published with tide as culprit and no wind observation | `Then la sección de hoy nombra la marea` | MISSING_FUNCTIONALITY |
| 5 | El punto débil llega a la superficie que leen las páginas, no solo al recibo (R3) | receipt half vs reading-surface half of one published bundle, through `runIngestOnce`/`runBuildOnce` | `Then el recibo del día y la superficie de lectura nombran el mismo punto débil...` — `playa-venao (2026-08-08): el recibo dice "size" y la superficie de lectura no lleva el campo` | MISSING_FUNCTIONALITY |
| 6 | Ninguna playa se queda callada mientras las demás sí lo dicen (R3) | all 20 emitted spot pages, both day sections | `Then cada playa cuya mañana trae culpable lo nombra...` — `0 de 36 días con culpable publicado lo nombran` | MISSING_FUNCTIONALITY |
| 7 | La frase está en español y no filtra nada del código (R28) | the text of every culprit sentence across the 20 pages | `Then cada frase del punto débil está en español...` — "no hay ni una frase de punto débil en toda la lista de playas que revisar" | MISSING_FUNCTIONALITY |
| 8 | El culpable aparece en la página de la playa y no cambia la lista de hoy (R4) | today's list page and then the spot page | `And la página de esa playa sí nombra el suyo` | MISSING_FUNCTIONALITY |
| 9 | Quien no distingue colores recibe la misma información (R21, R28) | the sentence after every colour signal is flattened to one ink on one paper | `Then el punto débil se sigue leyendo en palabras, sin que el color cargue el aviso` | MISSING_FUNCTIONALITY |
| 10 | La frase se lee en el teléfono ... tema claro, movimiento normal (R21 to R27) | contrast against the real backdrop, 390 px overflow, tap sizes, motion, tokens | `Then la frase ... cumple las siete comprobaciones visuales sobre el fondo real` — "se esperaban 2 frases ... y hay 0; no hay nada que medir contra el fondo real" | MISSING_FUNCTIONALITY |
| 11 | La frase se lee en el teléfono ... tema oscuro, movimiento reducido (R21 to R27) | same, dark theme with `prefers-reduced-motion` | same oracle | MISSING_FUNCTIONALITY |

Zero scenarios failed on import, fixture construction, step matching, browser startup or runner
setup. Zero passed. Nothing was skipped except the 3 steps after the failing step in each of the
three scenarios whose failure lands mid-scenario, which is cucumber's normal behaviour.

**Every text read is `innerText`, never `textContent`, and that is load-bearing.** `textContent`
returns the words of an element that is `display:none`, `visibility:hidden` or zero-sized, so a
DELIVER implementation that emitted the markup and never rendered it visibly would satisfy
scenarios 1, 2, 3, 4, 6, 8 and 9 — and scenarios 10 and 11 would not catch it either, because
`getComputedStyle` returns a colour for a hidden element and the contrast maths would pass on
something nobody can see. With `innerText` an invisible callout reads as `''`, which the assertion
already reports as an empty box. This repo's worst shipped bug passed all ten CI jobs; that shape
is closed here on purpose.

**Two guards against a vacuous RED, both deliberate.** Scenarios 2 and 3 assert an *absence*, which
is trivially true against a page that renders nothing at all; each therefore closes on a sibling
beach from the same published morning that MUST name its culprit, so neither can pass before the
feature exists. Scenario 7 counts the sentences it inspected and fails when that count is zero
rather than passing over an empty set. Scenarios 10 and 11 fail on the count of measurable
sentences before any contrast maths runs, so "nothing to measure" can never read as "AA is fine".

**Markup contract this slice fixes, for DELIVER.** One element per day section,
`section[data-day="today"] [data-field="weakest-link"]` and the tomorrow twin, following the house
`data-field` convention already used by score, size and window. A day with no published culprit
renders **no such element**, not an empty one. Selectors live only in the step file.

**Flagged, not fixed here.**

- **Pre-requisite 3 (copy) is still open**, so no scenario pins the unsettled sentence. The
  assertions require the Spanish factor noun (`viento` / `tamaño` / `dirección` / `marea`) to appear
  inside the callout, and nothing more. Whatever wording Andres settles will pass unchanged, which
  is what keeps DELIVER from having to edit an AT during GREEN.
- **R28's shared factor-name vocabulary module does not exist.** `src/data/report-vocab.ts` carries
  wind states and quality tokens only. The Spanish factor nouns are a new vocabulary that
  F-KNOW-HOW-MUCH-TO-TRUST-IT also needs (the named seam in the feature's out-of-scope table);
  DELIVER owes one module, not two copies.
- **R4's "exactly one mount line into `SpotDetail.astro`" is not observable through the built
  surface.** Scenario 8 proves the observable half (the sentence reaches the spot page and today's
  list is untouched). The one-line constraint stays a DELIVER code-review check. That file and
  `RankedList.astro` are owned by the concurrent BUGFIX lane and were not touched by this DISTILL.
- **This lane's steps import the keystone lane's cucumber World and Venao seed** (read-only,
  `tests/acceptance/daily-call-with-permanent-receipts/steps/support/`). The World is registered
  globally exactly once; a second `setWorldConstructor` would replace it for every other feature in
  the run, so this file must never register one. If the keystone lane moves those files, this
  lane's imports move with them.
- **This worktree predates two sibling-branch fixes** (null wind sub-score no longer collapsing to
  `clean`, and `best_window` deriving per spot). Nothing here depends on either behaviour; the
  scenarios drive the built surface as it exists on `build/f2-deltas`.
