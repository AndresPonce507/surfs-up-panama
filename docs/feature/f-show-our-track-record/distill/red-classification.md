# RED classification history

Feature: `f-show-our-track-record`
Slices entered: slice-01 (JIT DISTILL opened 2026-08-09 on lane `build/f2-record`)
Status: slice-01 authored and RED; slices 02 to 05 have not entered DISTILL

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable
   exercised, the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import,
   fixture construction, step matching, browser startup or runner setup is BROKEN and blocks
   handoff until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. **No scenario of this feature may assert that an accuracy number renders.** Zero surf reports
   have ever been filed and none can be seeded. A scenario satisfied by seeded or demo accuracy
   data is the most damaging thing this feature could ship, because the product's whole premise
   is never claiming more certainty than the data earns. Fixtures may exercise arithmetic; they
   may never stand in for the honesty state of a shipped page.
5. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule
   (`HANDOFF.md` section 1, DISTILL row) is the default for this feature.

## Entries

### slice-01, 2026-08-09, `build/f2-record`

Scope authored: slice-01 only, as dispatched. Slice-02 (the projection arithmetic, the k >= 5
refusal laws, the `se_gate` floor law, the recompute test, requirements R10 to R20) is
**buildable today and deliberately withheld**: it is a separate row of the Slice Plan and a
slice-01-only dispatch does not license writing it. Those rows stay expected-uncovered.

#### Commands observed

Selection gate, run first because cucumber exits 0 on a tag expression that selects nothing:

```
npm run test:at -- --dry-run --tags "@feature-f-show-our-track-record and @slice-01" > /tmp/record-dry.log 2>&1
DRY_EXIT=0
```

Observed: `8 scenarios (8 skipped)`, `95 steps (95 skipped)`, zero undefined, zero ambiguous.
The step count is 31 Gherkin steps plus 64 sibling-lane hook invocations (eight untagged global
hooks the daily-call and f-bill lanes register, times eight scenarios); the per-scenario JSON
confirms only this feature's file was selected. `strict: true` is on, so an undefined or
ambiguous step would have failed here.

Type gate: `npm run typecheck > /tmp/record-tc.log 2>&1` exit 0.

Every gate above and below was redirected to a file with its status captured on the next
statement. None was piped into `tail`, `head` or `grep`: a pipeline returns the last command's
status, and this repository has committed over a red gate exactly that way (project CLAUDE.md).

RED run:

```
npm run test:at -- --tags "@feature-f-show-our-track-record and @slice-01" > /tmp/record-red.log 2>&1
REAL_EXIT=1
```

`8 scenarios (8 failed)`, `95 steps (81 passed, 6 skipped, 8 failed)`. Failure-message counts across
the run: 5 scenarios stopped at oracle A, 1 at oracle C, 2 at oracle B.

Regression run, untagged, to prove the sibling lanes were not disturbed:

```
npm run test:at > /tmp/record-full.log 2>&1
FULL_EXIT=1
86 scenarios (78 passed, 8 failed)   993 steps (979 passed, 6 skipped, 8 failed)   1m 6.963s
```

The 78 pre-existing scenarios all still pass. The 8 failures are exactly the 8 authored here.
`pgrep -fl "astro preview"` after the tagged run and again after the untagged run: nothing, so the
`AfterAll` teardown reclaims the daemonised preview server it starts.

Note on what the run does and does not prove: scenarios 4 to 7 stop at the chained box-absent
oracle, so their own absence assertions and the U1-U7 aggregation have never executed their
bodies. That is the correct trap-3 defusal, not a gap, but it does mean those assertion bodies
are first exercised in DELIVER, on the commit that makes the box appear.

#### Scenario table

Three distinct behavior oracles were reached. `A` = no element carrying the shipped `.scorecard`
or `.state-empty` recipe exists in the rendered DOM. `B` = the settled day-one sentence is absent
from the bytes the build served or emitted. `C` = the sweep counted 20 of 20 emitted spot pages
without the sentence.

| # | Scenario | Observable exercised | Classification | Oracle reached |
|---|---|---|---|---|
| 1 | El surfista abre su playa y lee, debajo del pronóstico... (`@walking_skeleton`) | Real build, `astro preview` over HTTP, Chromium 390 px: the box under the forecast carrying the section 10 sentence word for word | MISSING_FUNCTIONALITY | A, on `/spots/hawaiisito/` |
| 2 | Ninguna playa se queda sin su recuadro, ni la última de la lista (`@sweep`) | Every spot route the build really emitted, fetched over HTTP, must carry the settled sentence | MISSING_FUNCTIONALITY | C: "20 of 20 spot pages do not carry the settled day-one sentence... inspected 20 page(s) in total" |
| 3 | La frase y sus números llegan en lo que se sirve... | `fetch()` only, no browser, no JS execution: the sentence must already be in the served bytes | MISSING_FUNCTIONALITY | B, served bytes for `/spots/hawaiisito/` |
| 4 | El recuadro no insinúa ninguna cifra de acierto ni ningún margen (`@negative`) | Inside the box: digits are exactly `0` and `30`, no `%`, no `±`, no metre figure, no claim wording | MISSING_FUNCTIONALITY | A (chained: the absence claim is only reached once the box exists) |
| 5 | La frase del recuadro es la asentada, sin raya larga, sin inglés... (`@negative`) | Verbatim section 10 string, no em dash, no placeholder token, no English, no technical text | MISSING_FUNCTIONALITY | A (chained) |
| 6 | El recuadro se lee bien... tema "claro", movimiento "normal" | U1 contrast on the box's own resolved backdrop, U2 overflow, U5 state treatment, U6 tabular numerals and truncation, U7 shipped recipes | MISSING_FUNCTIONALITY | A (chained) |
| 7 | El recuadro se lee bien... tema "oscuro", movimiento "reducido" | Same, dark theme, plus U4: no element in the box animates under reduced motion | MISSING_FUNCTIONALITY | A (chained) |
| 8 | El recuadro no le mete ni una isla ni un guion al teléfono | The emitted `dist/spots/hawaiisito.html` (10008 bytes) must already carry the sentence and must ship no `<astro-island>` and no `client:` directive | MISSING_FUNCTIONALITY | B, emitted document |

Zero BROKEN. No scenario failed at import, fixture construction, step matching, browser startup or
runner setup.

#### How each of the three known traps was defused, with evidence

1. **SPA fallback turning a missing page into a pass.** `astro preview`, never raw `vite preview`.
   Not trusted on a comment: `builtSurface()` fetches `/spots/no-existe-esta-playa-en-ningun-lado/`
   at startup and refuses the whole run unless it answers 404. The run proceeded, so the server
   answered 404 for a route the build does not emit.
2. **A planted fixture making a sweep pass vacuously.** The sweep plants nothing. It enumerates
   whatever `dist/spots/*.html` the real installed `data/` produced (20 pages, verified), fetches
   each over HTTP, reports the inspected count in its own failure message, and fails at zero
   inspected with an explicit reference to the 19-of-20 bug this repository already shipped. A
   builder that populated one page of twenty would leave this scenario red and name the other 19.
3. **Absence oracles passing vacuously.** Every absence claim (no invented number, no em dash, no
   English, no island, no animation under reduced motion) is chained behind a positive existence
   assertion on a surface that must exist. `requiredBox()` fails first when the box is missing, so
   none of those steps can go green against a page that simply has no box. Confirmed in the run:
   scenarios 4 to 7 all stopped at oracle A, never at their absence assertion.

#### Proof the observation machinery is live, not a silent no-op

A scenario that fails because its probe is broken looks identical to one that fails because the
feature is missing. Probed directly against the same harness, same page, same `page.evaluate`:

```
spotRoutes: 20  ['/spots/hawaiisito/', '/spots/las-lajas/', '/spots/mariatos/']
uiGate.status: 0
box observation: {"found":false, ..., "documentScrollWidth":390, "viewportWidth":390,
                  "tomorrowSectionPresent":true, "reportCtaPresent":true}
control probe (existing a.cta): {"text":"¿ESTUVISTE? CUÉNTANOS", "color":"rgb(16, 20, 26)",
                  "background":"rgb(87, 199, 133)", "w":358, "h":48, "vw":390, "docW":390}
```

The same evaluate call that reports `found: false` for the box reports real computed colours,
real geometry and a real 390 px viewport for an element that does exist today, and finds both DOM
anchors the position assertion needs. The absence is an observation, not a dead probe.

The U1 contrast function was checked against the canonical WCAG values before being trusted:
black on white `21.00`, white on white `1.00`, `#767676` on white `4.54`.

#### What was refused, and why

Refusing is part of the deliverable. Each of these could have been made to pass today, and each
would have been a lie.

| Requirement | Refused | Why |
|---|---|---|
| R3 (the zero is computed from real store state, not asserted) | Not authored, not tagged | Separating "computed" from "hardcoded" needs input variation, and the only input is a report store that does not exist. Any structural proxy (for instance "no write stack under `infra/lib/`") is green with zero production code today and green-and-wrong the day the store lands. Falsifiability for R3 arrives with slice-03, which owns replacing the source with the real read. The sweep is the closest honest approach and is not coverage of R3. |
| R5 (counter shape `"N / 30"` contractual; a shape mismatch fails the build LOUD) | Not authored, not tagged | R5 is entirely about the P5 payload field. `spot_detail` reaches nothing today: `src/pipeline/build.ts:140` emits `{name}` only and the page reads `data/published-surface.json`, so the producer-to-page wire for this block does not exist. Authoring against a payload field with no producer would put a design decision in a test. The settled section 14 wireframe box renders only the sentence, with no separate `"0 / 30"` element, so there is no rendered form of R5 to assert either. Both halves belong with the wire. |
| R2, producer clause | Not asserted; the user-visible consequence is | R2's first clause names the same six payload fields on the same absent wire as R5, so it takes the same refusal. Scenarios 2 and 4 cover only what a surfer can see: every emitted spot page carries the box, and no claim renders anywhere inside it. The checklist records R2 as PARTIAL, not covered. |
| R4, template-side clause | Not asserted; the client-side clause is | "The frontend renders and never computes statistics" splits in two. No client code derives anything: covered outright, since the sentence is in the served bytes with no JS and the document ships no island. No TEMPLATE code derives anything: not covered, because Astro templates run at build time and static-HTML presence cannot tell a value that arrived computed from one the template computed. That half needs the wire. |
| R6 (threshold 30 has one exported code home) | Not tagged; partially exercised | Scenarios 1, 2 and 4 pin the rendered threshold at exactly 30, which is the user-visible half. The "one code home, exported for the write path's P3 composer" half is source structure with no observable at a production entry point, and its named consumer (the P5 producer) is the wire this lane refuses to invent. |
| R33 (U3, 44 px touch targets) | Recorded N/A | The row itself says the slice-01 box is static and this should record the fact rather than fabricate a target check. There is nothing tappable in the day-one box. |
| R9, byte-ceiling half | Partially covered | The island half is asserted directly. The ceiling half is enforced by production: the page-weight integration runs inside `npm run build` and a build that breaks a ceiling cannot finish, so a build failure surfaces as a harness error rather than a silent pass. |
| R10 to R20 (slice-02) | Withheld | Buildable today, but a different Slice Plan row. A slice-01-only dispatch does not license authoring them. |
| R21 to R30 (slices 03 to 05) | Hard blocked | No report data exists, cannot be seeded, and only arrives after F-TELL-US-WHAT-YOU-SAW-COLD ships its write path and real surfers use it. |

#### Notes carried forward

- The lane touched `tests/acceptance/f-show-our-track-record/**` and
  `docs/feature/f-show-our-track-record/**` only. No production code was written, and no
  RED scaffold module was created: every scenario enters through a surface that already exists on
  disk, so nothing needed stubbing to avoid an import error.
- This file's steps deliberately do NOT call `setWorldConstructor`. The daily-call lane's
  `steps/support/world.ts` already sets one, cucumber loads every step file globally and last
  loaded wins, so a second constructor would have silently taken out 78 passing scenarios.
  Per-scenario state is module-level and reset by a hook scoped to
  `@feature-f-show-our-track-record and @slice-01`.
- Pre-requisite 1a (the box header "¿Cómo nos ha ido aquí?" exists only in the section 14
  wireframe, not in section 10's copy list) is still open. The scenarios assert the settled
  sentence and are silent about a header, which is the declared fallback: the box may ship without
  a header and the sentence carries the meaning. If a header lands later it must not add digits to
  the box, or scenario 4 will red.
- Pre-requisite 2 (the keystone lane owns `src/pipeline/build.ts`, `src/publish/region-bundle.ts`
  and `src/components/SpotDetail.astro`) is unchanged by this pass. Nothing here edits those files;
  DELIVER still has to settle the serial order before it does.
