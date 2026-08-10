# RED classification history

Feature: `f-paste-the-call-into-the-group`
Slices entered: `slice-01` (shipped 2026-08-10, PR #3), `slice-02`, `slice-03`, `slice-04`, `slice-05`
Status: slice-01 shipped; slices 02-05 entered DISTILL 2026-08-10 in one batch; REDs recorded below

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
4. Slice-01 must additionally record the observed branch of the `wa.me/?text=` live check
   (R5 in `requirement-checklist.md`): anchor verified working, or anchor struck and the
   clipboard island promoted to the floor. That record is a product fact, not test evidence,
   and later slices read it from here.
5. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the
   default for this feature; the one recorded relaxation (keystone slices 06 to 08 opened in
   parallel on instruction, HANDOFF §10 waiver 1) was a deliberate call for that build and
   carries no precedent here.

## Entries

### slice-01 — pre-delivery RED, observed 2026-08-09

Branch `build/f2-paste`, base `82be859`. Suite:
`tests/acceptance/f-paste-the-call-into-the-group/whatsapp-call-from-home.feature` (7 scenarios,
one a two-row Scenario Outline, so 8 runs) with steps in `steps/whatsapp-call-from-home.steps.ts`
and shared machinery in `steps/support/built-share-surface.ts` (shipped slice-04 precedent).

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-01" > /tmp/paste-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
```

Cucumber collected 8 scenario runs; all 8 failed. Summary line:
`8 scenarios (8 failed) / 89 steps (73 passed, 8 skipped, 8 failed) / 0m 12.98s`.
The 89 counts the file's 33 Gherkin steps plus the Before/After hooks the other suites register
globally; every hook passed. Every Given (isolated copy of the production project; `dist/` is
never copied, so it exists only if the build runs) and every When (the real `npm run build`,
which is `publish:surface --verify && astro build`, the emitted `dist/` served over real HTTP by
`vite preview`, Chromium at 390 px) passed. Every failure landed inside a Then at its individual
behavior oracle with the `WHAT/WHY/HOW` assertion message. Zero failures during import, fixture
construction, step matching, browser startup or runner setup: nothing BROKEN.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| Un toque abre WhatsApp con el llamado del día ya escrito | built home over HTTP, Chromium 390 px, light/normal | `MISSING_FUNCTIONALITY` | data oracle PASSED (five share fields populated for the top spot, both published copies of today agree); failed at the single-action oracle: "la tarjeta grande no ofrece ninguna acción de WhatsApp" |
| Con JavaScript apagado el botón sigue siendo un enlace que funciona | built home with page JavaScript disabled | `MISSING_FUNCTIONALITY` | anchor-presence oracle: 0 acciones de WhatsApp, ningún ancla `wa.me` en el HTML publicado |
| El mensaje y la página cuentan la misma historia, sin texto técnico | built home, top card DOM queried | `MISSING_FUNCTIONALITY` | message-vs-card oracle: no action carries a prewritten message to compare ("un ancla wa.me/?text= en la tarjeta grande de la home publicada") |
| La dirección del mensaje sigue a la configuración del sitio, nunca a un nombre fijo | copy repointed to `https://olas-registradas.example`, rebuilt, served, opened | `MISSING_FUNCTIONALITY` | config-derived-address oracle: no action carries any address to derive |
| La acción de WhatsApp respeta el presupuesto del primer vuelo | built home over HTTP | `MISSING_FUNCTIONALITY` | single-action oracle failed first; the 14 KB gz byte-ceiling oracle sits behind it (skipped) |
| El nombre más largo de la costa cabe completo en el mensaje y en el botón | surface mutated to promote the longest-name spot, rebuilt, served | `MISSING_FUNCTIONALITY` | full-name-in-message oracle: no action carries a message |
| La acción de compartir se ve terminada... (tema claro, movimiento normal) | U1-U7 audit against the rendered action + built-surface UI gate (gate exited 0) | `MISSING_FUNCTIONALITY` | U5: "la tarjeta grande no ofrece la acción de WhatsApp" |
| La acción de compartir se ve terminada... (tema oscuro, movimiento reducido) | same audit under dark scheme + reduced motion | `MISSING_FUNCTIONALITY` | U5: "la tarjeta grande no ofrece la acción de WhatsApp" |

Handoff condition satisfied: the only RED in the run is `MISSING_FUNCTIONALITY`. Every scenario
reached its production driving surface (the built page a surfer taps) before failing.

#### R5 — `wa.me/?text=` number-less anchor, observed branch (product fact)

Settled by live observation, recorded here per checklist R5 and contract rule 4; later slices
read the branch from this entry, they do not re-run the check.

- `https://wa.me/?text=<urlencoded>` with NO phone number returns HTTP 200 and redirects to
  `https://api.whatsapp.com/send/?text=...&type=custom_url&app_absent=0`.
- The redirect target and its `type=custom_url` parameter are the evidence: WhatsApp treats the
  number-less text link as a valid share carrier and opens its chat picker.
- **Branch: PASS. The JS-off anchor SHIPS.** The anchor is not struck; the clipboard island stays
  slice-02, an enhancement on top of the zero-JS floor, exactly as the Slice Plan row declares.

### Batch DISTILL of slices 02-05 — JIT relaxation, recorded 2026-08-10

Rule 5 above says no later-slice acceptance tag is authored ahead of its turn. On the
coordinator's instruction (2026-08-10 dispatch, branch `build/f2-paste2`), slices 02 through 05
were distilled in one batch so the feature can enter DELIVER — the same deliberate throughput
call as HANDOFF §10 waiver 1 for keystone slices 06-08, recorded here rather than hidden, and
carrying no precedent beyond this batch. One-at-a-time implementation discipline is unchanged:
DELIVER still enables one scenario at a time, slice order still follows the dependency rows.

Two decisions consumed by this batch, read from their owners:

- **Pre-requisite 3 (OG image cadence) is SETTLED**: per-spot cards regenerated on EVERY build
  (~14,400 S3 PUTs/month at 20 spots x 24 builds, about $0.07), chosen so a link pasted at
  3 p.m. never previews 6 a.m. numbers. Slice-04's DISTILL was gated on exactly this and is now
  open; the freshness and per-spot-per-build scenarios encode the settled cadence.
- **Pre-requisite 4 (keystone slice-06, per-spot pages) is satisfied**: `/spots/{id}/` pages are
  live in the shipped surface (HANDOFF §10). Slice-05's scenarios drive them directly.

Deploy note that shapes slice-03/04 oracles: the AWS deploy is hard-blocked at IAM
(`cloudformation:CreateChangeSet` / `CreateStack` denied for `andres-cli`), so every scenario
below observes the publication served locally — the same artifact the deploy would sync. The
live-WhatsApp half of R11 (a real paste against the hosted preview) is a charter observation
for the post-deploy examiner walk, not a scenario, and is marked BLOCKED in the requirement
checklist until the deploy lane unblocks.

### slice-02 — pre-delivery RED, observed 2026-08-10

Branch `build/f2-paste2`, base `f52abec` (slice-01 shipped and GREEN: 8/8 re-verified this day
before and after the shared-stash refactor). Suite:
`tests/acceptance/f-paste-the-call-into-the-group/copy-the-call-with-one-tap.feature`
(5 scenarios, one a two-row Scenario Outline, so 6 runs) with steps in
`steps/copy-the-call-with-one-tap.steps.ts` and shared machinery in
`steps/support/built-share-surface.ts` + `steps/support/preview-surface.ts`.

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-02" > /tmp/paste02-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
```

Summary line: `6 scenarios (6 failed) / 71 steps (58 passed, 7 skipped, 6 failed) / 0m 12.90s`.
Every Given (isolated production copy) and every When (real `npm run build`, dist/ over HTTP,
Chromium 390 px; the tap step records the control's absence instead of throwing) passed. Every
failure landed inside a Then at its behavior oracle. Zero BROKEN.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| Un toque deja el llamado completo en el portapapeles | built home over HTTP, Chromium 390 px, clipboard granted | `MISSING_FUNCTIONALITY` | "la tarjeta grande no ofrece la acción de copiar el llamado" |
| Si el teléfono niega el portapapeles, la página lo dice claro y WhatsApp sigue ahí | built home with every clipboard write path refused | `MISSING_FUNCTIONALITY` | same missing-copy oracle, reached at the visible-notice Then |
| Copiar funciona sin señal, porque compartir no depende de ningún servidor | built home loaded, then network cut, request log armed | `MISSING_FUNCTIONALITY` | same missing-copy oracle at the clipboard Then |
| La mejora de copiar viaja liviana y nunca reemplaza el piso | built home; script inventory + JS-off floor behind the presence oracle | `MISSING_FUNCTIONALITY` | "la tarjeta grande no ofrece la acción de copiar el llamado" (budget and floor oracles sit behind it) |
| La acción de copiar se ve terminada... (tema claro, movimiento normal) | U1-U7 audit of the copy control + built-surface UI gate | `MISSING_FUNCTIONALITY` | "U5: la superficie no ofrece la acción de copiar" |
| La acción de copiar se ve terminada... (tema oscuro, movimiento reducido) | same audit under dark scheme + reduced motion | `MISSING_FUNCTIONALITY` | "U5: la superficie no ofrece la acción de copiar" |

### slice-03 — pre-delivery RED, observed 2026-08-10

Suite: `link-preview-names-the-spot.feature` (5 scenarios) with steps in
`steps/link-preview-names-the-spot.steps.ts`. The announcement is read the way the preview
crawler reads it: off the served publication's own head.

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-03" > /tmp/paste03-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
```

Summary line: `5 scenarios (5 failed) / 56 steps (45 passed, 6 skipped, 5 failed) / 0m 8.43s`.
All failures inside Thens. Zero BROKEN.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| El anuncio del enlace nombra el mejor spot del día y trae su puntaje | built home head over HTTP | `MISSING_FUNCTIONALITY` | "la página publicada no anuncia su enlace: la vista previa quedaría como una dirección pelada" |
| El anuncio cuenta la misma historia que el mensaje pegado, sin texto técnico | anchor message decoded + head announcements | `MISSING_FUNCTIONALITY` | same missing-announcement oracle at the same-story Then |
| La dirección del anuncio deriva del sitio configurado, nunca de un nombre fijo | copy repointed to `https://olas-registradas.example`, rebuilt, served | `MISSING_FUNCTIONALITY` | "el anuncio no declara ninguna dirección" |
| La dirección permanente de la página no carga el sello del build | built home head over HTTP | `MISSING_FUNCTIONALITY` | "la página no declara su dirección permanente" |
| El anuncio no engorda el primer vuelo | built home head + gzip document measure | `MISSING_FUNCTIONALITY` | missing-announcement oracle first; the 14 KB gz ceiling sits behind it (skipped) |

### slice-04 — pre-delivery RED, observed 2026-08-10

Suite: `preview-card-fresh-every-build.feature` (5 scenarios) with steps in
`steps/preview-card-fresh-every-build.steps.ts`. Cards are found by what they are (JPEG at the
1200x630 preview size anywhere in the publication), never by an assumed path; the degrade
fixture strips `conf_level` + `wind_state` from ranked rows 2 and 3 in both published copies —
verified before authoring that the intact producer publishes such a morning without falling
over, so the scenario reaches its oracle instead of breaking in setup.

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-04" > /tmp/paste04-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1
```

Summary line: `5 scenarios (5 failed) / 64 steps (54 passed, 5 skipped, 5 failed) / 0m 10.94s`.
All failures inside Thens. Zero BROKEN. Two partial oracles already hold and are recorded so
DELIVER reads the RED precisely: the freshness scenario's first Then (the shared link re-stamps
with the new morning) PASSES — that behaviour shipped with slice-01 — and the degrade scenario's
first Then (the gapped morning still publishes, exit 0) PASSES; both scenarios then fail at
their card oracles, which are the slice's actual RED.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| El anuncio de la home declara su tarjeta, con las medidas y el peso acordados | built home head over HTTP | `MISSING_FUNCTIONALITY` | "el anuncio no declara ninguna tarjeta de imagen: la vista previa quedaría sin cara" |
| Cada spot publicado recibe su propia tarjeta en cada publicación | real publish of the intact morning, dist/ scanned for preview-sized cards | `MISSING_FUNCTIONALITY` | "hoy hay 20 spots publicados y lo publicado trae 0 tarjetas de vista previa" |
| Una mañana nueva rehace la tarjeta; lo viejo nunca se presenta como fresco | morning mutated (hour + top score), full rebuild, reopened | `MISSING_FUNCTIONALITY` | stamp oracle PASSED (slice-01 behaviour); failed at "el anuncio no declara ninguna tarjeta de imagen" |
| Cuando a un spot le faltan campos, da la cara la tarjeta genérica y el hueco queda anotado | two publishes: intact, then two spots stripped | `MISSING_FUNCTIONALITY` | publish-survives oracle PASSED (exit 0); failed at "la publicación con huecos no trae ninguna tarjeta de vista previa" |
| La tarjeta nunca viaja en el primer vuelo del surfista | built home head + downloaded-address inventory | `MISSING_FUNCTIONALITY` | missing-card-address oracle first; the crawler-only and ceiling oracles sit behind it |

### slice-05 — pre-delivery RED, observed 2026-08-10

Suite: `share-from-every-spot-page.feature` (6 scenarios, one a two-row Scenario Outline, so
7 runs) with steps in `steps/share-from-every-spot-page.steps.ts`. The spot page is reached the
way a surfer reaches it: tapping the second-ranked spot's row on the built home. Harness note,
learned during this RED run's first attempt: raw `vite preview` SPA-falls-back and silently
serves the home for a spot's directory-style href — the first run failed BROKEN with
"superficie no alcanzada" naming the home title, exactly as the surface-reached guard is meant
to. Switched to the daemonising `astro preview` (the keystone slice-06 precedent, including the
pid-capture race handling), re-ran, and every scenario then reached the genuine spot page
(h1 = the visited spot's name) before failing at its behavior oracle.

#### Commands observed

```sh
npm run test:at -- --tags "@feature-f-paste-the-call-into-the-group and @slice-05" > /tmp/paste05-red.log 2>&1; echo "REAL_EXIT=$?"
# REAL_EXIT=1   (first attempt: 7/7 BROKEN on vite preview fallback; fixed harness, re-ran)
# REAL_EXIT=1   (recorded run below)
```

Summary line: `7 scenarios (7 failed) / 82 steps (71 passed, 4 skipped, 7 failed) / 0m 19.64s`.
All failures inside Thens. Zero BROKEN in the recorded run.

#### Scenario classification

| Scenario (run) | Observable exercised | Classification | Behavior oracle reached |
| --- | --- | --- | --- |
| Desde la página de un spot se comparte el llamado de ese spot | built second-spot page via astro preview, Chromium 390 px | `MISSING_FUNCTIONALITY` | "la página del spot no ofrece ninguna acción de WhatsApp con su llamado" |
| Copiar en la página del spot copia el llamado de ese spot | same page, tap attempted, clipboard granted | `MISSING_FUNCTIONALITY` | "la página del spot no ofrece la acción de copiar el llamado" |
| El llamado del spot nunca cuenta la historia de la portada | same page, home expectation held for contrast | `MISSING_FUNCTIONALITY` | missing-action oracle at the never-the-home's-values Then |
| Sin JavaScript la página del spot sigue compartiendo con un enlace normal | second-spot page with page JavaScript disabled | `MISSING_FUNCTIONALITY` | "sin JavaScript hay 0 acciones de WhatsApp en la página del spot" |
| La página del spot con su acción de compartir sigue liviana | same page; first-flight weigh-in behind the presence oracle | `MISSING_FUNCTIONALITY` | missing-action oracle first; the 100 KB ceiling sits behind it |
| Las acciones de compartir... (tema claro, movimiento normal) | U1-U7 audit of both actions + built-surface UI gate | `MISSING_FUNCTIONALITY` | "U5: la superficie no ofrece la acción de WhatsApp; ... la acción de copiar" |
| Las acciones de compartir... (tema oscuro, movimiento reducido) | same audit under dark scheme + reduced motion | `MISSING_FUNCTIONALITY` | same U5 pair |

Handoff condition satisfied for all four slices: the only RED in every recorded run is
`MISSING_FUNCTIONALITY`, and every scenario reached its production driving surface (the built
page a surfer taps, or the publication the crawler fetches) before failing.
