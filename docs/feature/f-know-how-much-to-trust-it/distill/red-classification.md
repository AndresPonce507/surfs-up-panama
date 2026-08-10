# RED classification history

Feature: `f-know-how-much-to-trust-it`
Slices entered: slice-01 (2026-08-09)
Status: slice-01 authored and RED; slices 02 to 05 have not entered JIT DISTILL

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed and their real exit codes, then one row per scenario with
   the observable exercised, the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import, fixture
   construction, step matching, browser startup or runner setup is BROKEN and blocks handoff
   until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over real HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. **No scenario of this feature may assert that `alta` renders, and no oracle may be satisfiable
   by moving a cap, a threshold or a level boundary.** The arithmetic is recorded in the slice-01
   entry below. Any future entry that makes `alta` observable must cite the real `tide_m` that
   made it reachable (slice-02, R15 to R18), never a constant change.
5. Any scenario that asserts an ABSENCE must close on a sibling row, in the same published
   morning, that must show the thing present. An absence assertion against a page that renders
   nothing at all is a vacuous pass.
6. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the default
   for this feature; the one recorded relaxation elsewhere (keystone slices 06 to 08 opened in
   parallel on instruction, `HANDOFF.md` §10 waiver 1) was a deliberate call for that build and
   carries no precedent here.

## Entries

### slice-01 — the per-`(spot, day)` confidence reason (2026-08-09)

Author: JIT DISTILL on `build/f2-trust`, worktree `/Users/andres/psb-trust`, base `b9ddff3`.
Artefacts:
`tests/acceptance/f-know-how-much-to-trust-it/la-razon-de-cada-playa.feature`,
`tests/acceptance/f-know-how-much-to-trust-it/steps/confidence-reason.steps.ts`,
`tests/acceptance/f-know-how-much-to-trust-it/fixtures/slice-01-confidence-reason-profiles.json`.

**Commands observed, exactly as run.** Each gate is redirected to a file and `$?` captured on its
own line; nothing is piped into `tail`, `head` or `grep` (project rule: a pipeline returns the last
command's status, and this repository has committed over a red gate that way).

```
npm run typecheck > /tmp/trust-tc.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0

npm run test:at -- --dry-run --tags "@feature-f-know-how-much-to-trust-it and @slice-01" > /tmp/trust-dry.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
13 scenarios (13 skipped); 145 steps (145 skipped); 0 undefined, 0 ambiguous

npm run test:at -- --dry-run --tags "@feature-f-know-how-much-to-trust-it and @slice-99" > /tmp/trust-dry0.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
0 scenarios; 0 steps

npm run test:at -- --tags "@feature-f-know-how-much-to-trust-it and @slice-01" > /tmp/trust-red.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=1
1 hook (1 passed); 13 scenarios (13 failed); 145 steps (119 passed, 13 skipped, 13 failed); 0m 6.790s

npm run test:at -- --tags "not @feature-f-know-how-much-to-trust-it" > /tmp/trust-rest.log 2>&1; echo "REAL_EXIT=$?"
REAL_EXIT=0
78 scenarios (78 passed); 898 steps (898 passed); 1m 3.156s
```

The two dry runs are recorded together on purpose. Cucumber exits 0 when a tag expression selects
nothing, so a typo in the filter reads as success; the `@slice-99` control returning **0 scenarios**
while `@slice-01` returns **13** is the evidence that the quoted expression survived npm's argument
handling and that both conjuncts actually bound. 145 steps matched and zero were undefined or
ambiguous, so no scenario could fail on step matching.

The last run is the regression proof that this lane's step file, which every acceptance run
imports, did not collide with an existing step string and did not replace the shared cucumber
World. It caught one real collision during authoring: `ninguna razón reclama ni sugiere una
confirmación desde la playa` is already registered by the keystone's slice-07 steps, and this
lane's producer-side twin was renamed to `ninguna razón publicada reclama ...` before the RED run.

All thirteen failures are `AssertionError [ERR_ASSERTION]: WHAT: ...` raised by this file's own
`assertBehavior`. A grep of the run for `test fixture error`, import errors, `TypeError`,
`ReferenceError`, module-resolution errors, step timeouts, undefined steps and ambiguous steps
returns nothing.

**Pre-delivery product fact (contract item 4), verified on disk before the run.** `alta` is
arithmetically unreachable today, not merely rare, and this slice may not make it reachable.

| Where | Observed |
|---|---|
| `src/scoring/confidence.ts` line 52 | `cap_missing_tide = 0.7` binds whenever `missing` contains `"tide"` |
| `src/scoring/confidence.ts` line 55 | `level = high` requires `c_total > 0.7` — the cap lands exactly on the boundary |
| `src/pipeline/adapters/open-meteo-source.ts` | tide returns `dark`; no per-spot tide station exists in the seed schema (`04-ingest-pipeline.md` §11, DELIVER BLOCKER) |
| live `data/published-surface.json` | 56 low, 4 medium, **0 high** across 60 rows |
| measured here, four genuinely agreeing members with tide dark | `c_spread = 0.9922`, `c_total = 0.7000` exactly, `level = medium` |
| same members with tide present | `c_total = 0.9922`, `level = high` — reachable, but only with a real tide number, which is slice-02 |

Scenario 3 is built directly on that arithmetic: its first oracle, "ninguna playa se publica con
confianza alta", **passes today** and is a standing guard, and its second oracle is the RED. A
DELIVER that reached `alta` by lowering `cap_missing_tide` or the 0.7 boundary would turn the first
oracle red. No scenario anywhere in this slice requires `alta` to render.

**Pre-delivery product fact, the gap itself.** The reason exists, but it is a pure function of the
three-way level.

| Where the value lives today | Observed |
|---|---|
| `src/scoring/confidence.ts` lines 56-61 | the engine computes `spread_terms`, `dominant`, `track_state` per row |
| `src/pipeline/build.ts` line 209 | the build calls `confidence(...)` and keeps only `c_total` and `level` |
| `src/pipeline/build.ts` `daySummary()` and `surfaceCall()` | **both drop everything else** — neither the bundle day summary nor the reading surface has any reason field |
| `data/published-surface.json` | `grep -c confidence_reason` → **0** |
| `src/scoring/confidence.ts` `confidenceReasonEs(level)` | one sentence per level, identical for all 20 spots, measured at **204 / 205 / 209 characters** against P1's ≤ 160 |
| `src/components/Confidence.astro` line 49 | derives the reason from `level` alone, so no caller can pass a per-row one |
| `src/components/SpotDetail.astro` | renders no confidence at all, in either day section |

So the RED for R1, R6, R7 and R11 is a **carriage and composition gap, not an engine gap**: the
inputs the reason needs are already computed and then thrown away. Later slices read that
distinction from here.

**How the scenarios reach production, and why in two halves.**

*Producer half, five scenarios tagged `@in-memory`.* Their observable is a producer-side one the
built surface does not owe: which sentence gets composed from which engine state. They drive
`runIngestOnce` / `runBuildOnce` in-process through the same ports the keystone lane uses, with
in-memory doubles for the forecast source, the clock and the object store, and then read the
published bundle — both the day summary and `publish_surface`. Contract item 3 permits this
because no fixture-only wiring is satisfying an oracle the built surface owes: the built-surface
half is the reading scenarios below. The three mornings are shaped, and each shape was measured
before authoring: four agreeing members with tide dark (the cap is what binds), the real
2026-08-08 Venao pull with tide present (`dominant = spread_period`, nothing missing), and three of
four sources dark (`members_used = 1`).

*Reading half, eight scenarios tagged `@real-io`.* Their observable is what a person sees. Each
copies the project to a temp root, plants only producer-shaped values on
`data/published-surface.json` (a `conf_level` and a per-row reason, or no reason for the degrade
profile), runs the real `npm run build` (`publish:surface --verify` then `astro build`, exit 0,
page-weight gate green), serves the emitted `dist/` over real HTTP from a server inside the test
process, and reads it in Chromium at 390 px. The build is performed once and shared; the shared,
committed `data/published-surface.json` is never written.

Not `astro preview` and not `vite preview`. Vite's SPA fallback serves `index.html` for any
unmatched route, which would turn a missing spot page into a passing test, and `astro preview`
resolves directory URLs the deploy itself does not. The server here performs exactly the
`build.format: 'file'` mapping (`/x` → `dist/x` → `dist/x.html`, `/x/` → `dist/x.html` →
`dist/x/index.html`) and otherwise returns a real 404. Every navigation asserts HTTP 200 before any
oracle runs, so a routing regression surfaces as a setup failure and is classified BROKEN, never as
a silent pass.

The planted surface is also **re-dated to Panama's today and tomorrow** at plant time.
`publish:surface --verify` refuses a surface whose first day is not today; without the re-date this
suite would go BROKEN the morning after the committed data was generated, and a setup failure is
not a RED.

**The planting is data, not answers.** Every content rule (which cause the sentence may name,
which it may not, the 160-character bound, the two binding copy rules) is asserted **producer-side
against composed output**. The reading half asserts **fidelity**: that the page shows THIS row's
published reason rather than deriving one from the level. No planted sentence can satisfy a
composition oracle, because the string under test there is the one the producer wrote.

**Classification. The only acceptable RED is `MISSING_FUNCTIONALITY`, and all thirteen are it.**

| # | Scenario | Observable exercised | Behavior oracle reached | Classification |
|---|---|---|---|---|
| 1 | La razón nombra la marea que falta, porque es la que topó el nivel (R3, R4, R6, R7, R12) | both halves of one published bundle, tide dark, models agreeing | `Then la superficie que leen las páginas trae la razón de cada playa y cada día` — `el resumen del día 0 publicó "playa-venao" sin razón` | MISSING_FUNCTIONALITY |
| 2 | La razón admite que nadie ha reportado y que no hay historial verificado (R8, R9) | the composed sentence against `c_fresh = null` and `track_state = unverified` | `Then cada razón dice que todavía nadie ha reportado desde la playa` — `ninguna de las 4 filas publicadas trae una razón: no hay ni una frase que revisar` | MISSING_FUNCTIONALITY |
| 3 | Sin el dato de la marea nadie ve confianza alta, y la razón dice por qué (R14) | every published `conf_level`, then every composed reason | first oracle `ninguna playa se publica con confianza alta` **passes** (the standing guard); RED at `And cada razón nombra la marea que falta` | MISSING_FUNCTIONALITY |
| 4 | Cuando el que manda es el desacuerdo de período, la razón lo dice y no culpa a la marea (R3, R4) | a morning with the tide complete and `dominant = spread_period` | `Then cada razón nombra el desacuerdo de período` — no reason exists to inspect | MISSING_FUNCTIONALITY |
| 5 | Un día en que solo respondió un modelo lo dice así, nunca como desacuerdo (R5) | a morning with three of four declared sources dark, `members_used = 1` | `Then cada razón dice que respondió un solo modelo` — no reason exists to inspect | MISSING_FUNCTIONALITY |
| 6 | El surfista abre la lista de hoy y lee la razón de su playa para ese día (`@walking_skeleton`, R1, R2) | every row of the emitted home page over HTTP | `Then cada fila abre la razón publicada para esa playa y ese día` — `la fila 1 (playa-guanico) abre "Los modelos no se ponen de acuerdo. ..." cuando su mañana publicó "Los modelos se parten en el período: ..."` | MISSING_FUNCTIONALITY |
| 7 | El surfista abre la lista de mañana y lee la razón de su playa para ese día (`@walking_skeleton`, R1, R2) | same, over `/manana/` and the second day's values | same oracle, `la fila 1 (playa-cambutal)` | MISSING_FUNCTIONALITY |
| 8 | La razón que se muestra es exactamente la publicada y cabe en el bolsillo (R7, R12) | the rendered length and byte-for-byte fidelity of every reason | `Then ninguna razón mostrada pasa de ciento sesenta caracteres` — `la fila 1 (playa-guanico) muestra 204 caracteres` | MISSING_FUNCTIONALITY |
| 9 | Una playa publicada sin razón muestra su nivel y calla, mientras la de al lado sí la trae (R10) | `punta-brava`, planted with no reason, against its neighbours in the same morning | `Then la playa publicada sin razón muestra su palabra de confianza y no ofrece nada que abrir` — `la fila 6 (punta-brava) se publicó sin razón y aun así abre un texto` | MISSING_FUNCTIONALITY |
| 10 | La página de la playa trae su nivel y su razón, hoy y mañana (R11) | both `section[data-day]` blocks of the emitted spot page | `Then cada sección de día muestra su palabra de confianza` — `la sección de hoy ... no muestra ninguna palabra de confianza (encontrado: "")` | MISSING_FUNCTIONALITY |
| 11 | Quien no distingue colores lee la confianza igual, por forma y palabra (R39) | computed colour across levels, then the trigger's own text | first oracle `ningún color distingue un nivel de confianza de otro` **passes** (the standing guard); RED at `And cada nivel se lee por su forma además de su palabra` — `la fila 1 no lleva la forma del nivel junto a la palabra: "Confianza baja"` | MISSING_FUNCTIONALITY |
| 12 | La confianza de la página de la playa se lee limpia en el teléfono, tema claro, movimiento normal (R33 to R38) | contrast against the real backdrop, 390 px overflow, 44 px, motion, states, scale, tokens | `Then la confianza de cada día cumple las siete comprobaciones visuales sobre el fondo real` — `se esperaban 2 bloques de confianza ... y hay 0: no hay nada que medir contra el fondo real` | MISSING_FUNCTIONALITY |
| 13 | La confianza de la página de la playa se lee limpia en el teléfono, tema oscuro, movimiento reducido (R33 to R38) | same, dark theme with `prefers-reduced-motion` | same oracle | MISSING_FUNCTIONALITY |

Zero scenarios failed on import, fixture construction, step matching, browser startup or runner
setup. Zero passed. Nothing was skipped except the steps after the failing step inside each
scenario, which is cucumber's normal behaviour.

**Guards against a vacuous RED, all deliberate.**

- Every producer-side content oracle counts the reasons it found and fails when that count is
  zero, rather than passing over an empty set. That is what makes rows 2, 4 and 5 above read
  "no hay ni una frase que revisar" instead of quietly succeeding.
- Scenario 9 asserts an ABSENCE, which is trivially true against a page that renders nothing at
  all, so it closes on the neighbouring beaches of the same morning, which must open THEIR
  published reason.
- Scenarios 12 and 13 count the measurable confidence blocks before any contrast arithmetic runs,
  so "nothing to measure" can never read as "AA is fine". They are scoped to the **spot page**,
  which carries no confidence markup at all today; the ranked-row half of U1-U7 is already proven
  green by the keystone's slice-07 scenarios and re-asserting it here would pass vacuously.
- Scenarios 3 and 11 each open with an oracle that PASSES today. Both are standing guards
  (no `alta`; no colour carrying the level) placed in front of an oracle that fails, so the
  scenario is RED while the guard is armed from the first day.
- **Every text read is `innerText`, never `textContent`,** and that is load-bearing. `textContent`
  returns the words of an element that is `display:none`, `visibility:hidden` or zero-sized, so an
  implementation that emitted the reason and never rendered it visibly would satisfy every text
  oracle, and the visual scenarios would not catch it either because `getComputedStyle` returns a
  colour for a hidden element. With `innerText` an invisible reason reads as `''`, which the
  assertions already report as an empty box. This repository's worst shipped bug passed all ten CI
  jobs; that shape is closed here on purpose.

**Contracts this slice fixes, for DELIVER.**

- **Field names.** The reading surface carries the reason as `confidence_reason_es` (the
  `call_es` precedent already in `surfaceCall()`); the bundle day summary carries it as
  `confidence_reason: { es }` (the `call: { es }` precedent, and P1's canonical name). The producer
  reader accepts either shape at either level, so picking the other one is not a test edit — but
  one of the two must appear on **both** halves of the bundle.
- **Markup.** The confidence disclosure stays `details.confidence` with its level word inside
  `<summary>` and its reason in the single non-summary child, on the ranked rows and on the spot
  page's two `section[data-day]` blocks alike. A row published without a reason renders **no
  reason block**, not an empty one. Selectors live only in the step file.
- **es-only.** The bundle ships `{es}` and no `{en}`: a named deviation from P1's `{es,en}` shape,
  already recorded in the feature's Out-of-scope table (F-READ-IT-IN-YOUR-LANGUAGE owns the other
  half). No oracle here requires an English reason.

**Flagged, not fixed here.**

- **Pre-requisite 1 is still open, and this run answers its feasibility half.** Scenarios 1, 2 and
  3 share one Given (`una mañana sin dato de marea, con los modelos pareciéndose entre ellos`), so
  they inspect **the same composed sentence**, and their oracles are therefore a union, not three
  separate shapes: that one sentence must name the missing tide (05 §3.6), say nobody has reported
  (§6.3), say there is no verified track record (§6.2), stay ≤ 160 characters (P1), claim no model
  disagreement, leak no code text and carry no em dash. **That union is satisfiable**, verified
  before this entry was written:

  > `Falta el dato de la marea, así que el nivel no pasa de media. Nadie ha reportado desde la playa y este spot no tiene historial verificado.`

  138 characters against the 160 bound, all six oracles green, 22 characters of headroom. So
  Pre-requisite 1 does **not** block DELIVER on feasibility; what DESIGN and Andres still owe is
  the wording, through the cousin's crew channel. Recorded here so nobody re-derives it, and so
  nobody loosens an oracle believing the three rules cannot coexist.

  No oracle pins any wording word for word; each requires only the domain noun that any settled
  phrasing must contain, singular or plural (`marea(s)`, `período(s)`, `historial(es)`,
  `nadie`/`playa`). Whatever Andres settles passes unchanged, which is what keeps DELIVER from
  having to edit an acceptance test at GREEN.
- **The slice-01 expectation charter is owed and was not created.**
  `docs/product/expectations/f-know-how-much-to-trust-it/` is outside this workspace's file
  ownership, so DISTILL could not write it, but DELIVER's COMMIT gate refuses a visible slice
  without a fresh source-blind Vera PASS against a charter carrying the exact U8 observation. The
  text is already settled in `feature-delta.md`'s Slice classification table and must be used
  verbatim: **"Cada razón se lee como una frase de surfista sobre este spot y este día, cabe sin
  cortarse a 390 px, y nunca reclama que alguien confirmó desde la playa."** Surface
  classification: `user-visible`. U1-U7 run through this feature's own visual outline plus the
  repository UI gate.
- **The shared Spanish factor-name vocabulary module does not exist.** `src/data/report-vocab.ts`
  carries wind states and quality tokens only. `f-see-what-killed-it` found the same gap from its
  own side (its R28) and needs `dirección`, `tamaño`, `viento`, `marea`; this feature needs
  `altura`, `período`, `dirección`, `viento`, `marea`. **DELIVER owes one module, not two copies.**
  Neither lane authored it. R12 here and R28 there are the same obligation seen twice.
- **Pre-requisite 4 is unresolved and this slice assumes the mount is ours.** `SpotDetail.astro`
  renders no confidence today and scenarios 10, 12 and 13 require it. If the keystone lane lands
  the mount first, those three scenarios go green on someone else's commit and slice-01 only
  upgrades the reason. Never both.
- **Pre-requisite 2: `RankedList.astro` and `SpotDetail.astro` are owned by a concurrent BUGFIX
  lane.** Neither file was touched by this DISTILL. The wiring edits are integration work, serial
  behind that lane.
- **Pre-requisite 3: the producer guard must grow a `confidence_reason` row.** The five-field
  guard created after the 19-of-20 missing-fields failure (`HANDOFF.md` §10) does not know about
  this field, so a builder that populated one row of twenty would leave this suite green: the
  reading half plants its own values and the producer half runs a single seeded spot. **Not
  covered: that a real pipeline run populates every committed row.** That belongs with the producer
  lane, alongside the guard row.
- **Adjacent defect, flagged not fixed (Pre-requisite 9): a null wind score renders `limpio`.**
  Nothing here depends on that behaviour and no scenario treats `limpio`-on-null as settled. When
  it is fixed, a wind-dark morning becomes a fourth honest shape for the composer and is worth a
  scenario then.
- **R39's shape half comes from `09-design-system.md` §9's confidence-indicator recipe** (glyph
  dots beside the level word), not from the feature's Baseline gap table. It was authored because
  the dispatch brief asked for shape-plus-word explicitly. If it is judged outside slice-01, strike
  R39's shape half and scenario 11's second oracle; the colour guard should stay either way.
- **This lane's steps import the keystone lane's cucumber World and Venao seed** (read-only,
  `tests/acceptance/daily-call-with-permanent-receipts/steps/support/`). The World is registered
  globally exactly once; a second `setWorldConstructor` would replace it for every other feature in
  the run, so this file must never register one. If the keystone lane moves those files, this
  lane's imports move with them.
