# Requirement checklist: f-paste-the-call-into-the-group

Extracted at workspace creation (2026-08-09) from `feature-delta.md` (Slice Plan + Definition
of Done + plan notes), `application-architecture.md` §5 (byte budget), §6 (island inventory),
§7 (P1/P7 payload contracts), §10 (share card template, exact copy), §13 (WhatsApp share card
and Open Graph), §14 (wireframes), `docs/DISCUSS-decisions.md` 5, 30, 31,
`07-write-path.md` line 90 (client-only composition), HANDOFF §10 (CloudFront hostname
decision, preview tooling, published-surface field failure), and the U1-U7 UI mandates
(`nw-ui-quality-mandates`). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body.
Rows whose slice has not entered DELIVER yet are expected-uncovered (per-slice JIT); they
are visible here from day one so no requirement is silently dropped. Slice-01 entered JIT
DISTILL 2026-08-09; its acceptance suite is RED on disk (see `distill/red-classification.md`).

| # | Requirement | Category |
|---|---|---|
| R1 | One tap on the home top card opens WhatsApp with the day's call prewritten in Spanish per the `application-architecture.md` §10 template: SURF {fecha}, Mejor: {spot}, {score}, {tamaño} y {viento}, {ventana}, Confianza {nivel}, and the absolute link ending `?b={build_id}` (slice-01) | functional |
| R2 | The WhatsApp action works with JavaScript off: a plain `wa.me/?text=` anchor carrying the same text, no script required (§13, §6 row 2) (slice-01) | functional |
| R3 | `astro.config.mjs` declares `site: 'https://d1j9u9fxnap4es.cloudfront.net'`; every shared URL, `og:url` and canonical derives from the configured `site`; no template or component hardcodes the hostname, so a registered domain later is a config edit plus republish only (HANDOFF §10) (slice-01) | build |
| R4 | The share text fields come from that spot's `days[0]` summary of the published surface for the current build (P1/P7, §7); the score is the integer `score_q` rendered as-is; never stale, never invented, and the five share fields are verified populated for the shared spot (HANDOFF §10 field failure) (slice-01) | validation |
| R5 | The `wa.me/?text=` number-less anchor is verified live once; PASS ships the anchor, FAIL strikes the anchor and promotes the clipboard island to the floor; the observed branch is recorded in this feature's red-classification history (slice-01) | validation |
| R6 | The anchor's document bytes stay inside the 14 KB gz home document ceiling; the byte gate stays green (§5, keystone slice-08) (slice-01) | nfr |
| R7 | One tap copies the full call text to the clipboard and shows a Spanish confirmation only after the text is actually on the clipboard; no false green (slice-02) | functional |
| R8 | The share island is deferred JS at or under 1.0 KB gz (budget line item 3, §5); it never blocks or delays first render; with JS off the slice-01 anchor still works (slice-02) | nfr |
| R9 | A denied or failed clipboard shows a plain Spanish fallback naming what happened, with the WhatsApp anchor still offered; never a silent failure (slice-02) | validation |
| R10 | The home document head carries `og:title` naming the day's best spot, `og:description` carrying its score, absolute `og:url`, and `og:locale` es_PA, rendered at publish time (§13, `adr-publish-time-html-rendering.md`) (slice-03) | functional |
| R11 | A share URL pasted into WhatsApp previews with the spot name and its score visible instead of a bare URL, observed against the hosted preview (slice-03) | e2e |
| R12 | The page canonical strips the `?b=` parameter; the cache-buster lives only in shared URLs (§13) (slice-03) | validation |
| R13 | The OG meta block's document bytes stay inside the 14 KB gz ceiling per document (§5) (slice-03) | nfr |
| R14 | The preview carries a per-spot card image, 1200x630 JPEG at or under 60 KB, showing spot name, score, size words and confidence (§13; cadence per Pre-requisite 3) (slice-04) | functional |
| R15 | Re-pasting after a new build (new `?b={build_id}`) fetches a preview with the new numbers; a stale card is never presented as fresh (§13) (slice-04) | functional |
| R16 | Missing P7 fields degrade to the static generic OG card and log the gap; never a broken image, never invented numbers (P7 failure behaviour, §7) (slice-04) | validation |
| R17 | The OG image is fetched only by the preview crawler; zero bytes added to any route's first-visit budget (§5, `plan-cluster-reach.md` §2.2) (slice-04) | nfr |
| R18 | Every spot page shares that spot's own call: same template scoped to the spot, and its link previews with that spot's name and score, never the home card's values (decision 30) (slice-05) | functional |
| R19 | The spot route with the share island stays inside the 100 KB first-visit cap (worst case ~51 KB + 1.0 KB island, §5) (slice-05) | nfr |
| R20 | U1: share and copy controls clear WCAG AA (4.5:1 or better) against the real rendered backdrop in both themes, including gradient extremes | ui |
| R21 | U2: no horizontal scroll, clipping or overlap at 390 px with the share controls present, including the longest Spanish spot name | ui |
| R22 | U3: share and copy targets measure at least 44 px and sit reachable for a thumb on the phone surfaces | ui |
| R23 | U4: reduced-motion is honoured; the copy confirmation never depends on motion; nothing delays first meaningful content | ui |
| R24 | U5: the designed states exist and are honest: copied success, clipboard-denied fallback, JS-off anchor, and the generic-card fallback for missing P7 data | ui |
| R25 | U6: control and confirmation type come from the declared scale and survive Spanish length at 390 px without truncation | ui |
| R26 | U7: share surfaces use named tokens for colour, spacing, radius, elevation and motion; no raw hex outside `src/styles` | ui |
| R27 | No share server surface exists: composition is client plus builder only; no endpoint, Lambda or write path is added by this feature (`07-write-path.md` line 90, decision 30) | security |
| R28 | Zero technical text in the pasted message or any preview surface: no model names, JSON, placeholder tokens, or English on the Spanish surface | validation |

## Current DISTILL coverage

Slice-01 suite: `tests/acceptance/f-paste-the-call-into-the-group/whatsapp-call-from-home.feature`
(all scenarios `@slice-01`, file-level `@feature-f-paste-the-call-into-the-group`). RED run
recorded 2026-08-09 in `distill/red-classification.md`: 8/8 scenario runs `MISSING_FUNCTIONALITY`,
zero BROKEN. Slice-01 shipped 2026-08-10 (PR #3, `f52abec`); its suite is GREEN on disk and is
the regression floor the later slices' scenarios lean on.

Slices 02-05 suites, authored 2026-08-10 in one batch DISTILL (JIT relaxation recorded in
`distill/red-classification.md`), one file per slice, same shape and location as slice-01's:

- slice-02: `copy-the-call-with-one-tap.feature` (5 scenarios, one a two-row outline, 6 runs)
- slice-03: `link-preview-names-the-spot.feature` (5 scenarios)
- slice-04: `preview-card-fresh-every-build.feature` (5 scenarios)
- slice-05: `share-from-every-spot-page.feature` (6 scenarios, one a two-row outline, 7 runs)

Pre-delivery RED runs recorded 2026-08-10 in `distill/red-classification.md`: 23/23 scenario
runs `MISSING_FUNCTIONALITY`, zero BROKEN. Error/negative scenarios across the four new suites:
10 of 21 (48%).

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| R1 | `@covers-R1`: "Un toque abre WhatsApp con el llamado del día ya escrito" (walking skeleton) and "El mensaje y la página cuentan la misma historia, sin texto técnico" | GREEN, shipped in slice-01 2026-08-10 (`f52abec`) |
| R2 | `@covers-R2`: "Con JavaScript apagado el botón sigue siendo un enlace que funciona" | GREEN, shipped in slice-01 2026-08-10 (`f52abec`) |
| R3 | `@covers-R3`: "La dirección del mensaje sigue a la configuración del sitio, nunca a un nombre fijo" (copy repointed to a fresh domain; expected host always derived from the copy's `astro.config.mjs`, never hardcoded) | GREEN, shipped in slice-01 2026-08-10 (`f52abec`) |
| R4 | `@covers-R4`: walking skeleton's populated-fields oracle (five share fields for the shared spot, both published copies of today agree) plus the same-story scenario | GREEN, shipped in slice-01 2026-08-10 (`f52abec`) |
| R5 | Not a test: observed branch recorded as a product fact in `distill/red-classification.md` slice-01 entry (`wa.me/?text=` number-less → 200, redirect to `api.whatsapp.com/send/?text=...&type=custom_url&app_absent=0`; anchor SHIPS) | recorded, PASS branch |
| R6 | `@covers-R6`: "La acción de WhatsApp respeta el presupuesto del primer vuelo" (14 KB gz home document, gzip semantics of the production page-weight gate) | GREEN, shipped in slice-01 2026-08-10 (`f52abec`) |
| R20 | `@covers-R20`: U1-U7 Scenario Outline, contrast measured against the real rendered backdrop in both themes | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R21 | `@covers-R21`: U1-U7 outline plus "El nombre más largo de la costa cabe completo en el mensaje y en el botón" at 390 px | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R22 | `@covers-R22`: U1-U7 outline (44 px target) plus the walking skeleton's single-action oracle | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R23 | `@covers-R23`: U1-U7 outline, reduced-motion example row | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R24 | `@covers-R24`: JS-off anchor scenario (the slice-01 designed state) plus the U1-U7 outline's honest-states check; copied/denied states remain slice-02 | GREEN for the slice-01 anchor; RED for copied, denied, and generic-card states |
| R25 | `@covers-R25`: U1-U7 outline (type scale, no truncation) plus the longest-name scenario | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R26 | `@covers-R26`: U1-U7 outline (no raw hex, named tokens in every matched rule) plus the built-surface UI gate run inside every scenario | GREEN for the slice-01 WhatsApp action; RED for the later copy and spot-action surfaces |
| R28 (slice-01 half) | `@covers-R28`: same-story scenario's purity oracle (no model names, internal fields, template braces, filler, or English in the pasted message) | GREEN, shipped in slice-01 2026-08-10 (`f52abec`); preview-surface half stays with slices 03-04 |
| R7 | `@covers-R7`: "Un toque deja el llamado completo en el portapapeles" (clipboard content equals the anchor's message; confirmation only with the text actually copied) plus the offline scenario | RED, awaiting slice-02 DELIVER |
| R8 | `@covers-R8`: "La mejora de copiar viaja liviana y nunca reemplaza el piso" (deferred script bytes at or under 1.0 KB gz, nothing render-blocking, JS-off anchor floor intact, no dead button offered) | RED, awaiting slice-02 DELIVER |
| R9 | `@covers-R9`: "Si el teléfono niega el portapapeles..." (visible plain-Spanish notice, clipboard never holds the call, WhatsApp anchor still offered; never silent) | RED, awaiting slice-02 DELIVER |
| R10 | `@covers-R10`: announcement scenarios (og title names the day's best spot, description carries its score, es_PA declared, address derives from the configured site — the repointed-domain copy proves no hardcoded host) | RED, awaiting slice-03 DELIVER |
| R11 (local half) | `@covers-R11`: the crawler's-view oracle — the announcement read off the served publication names the spot and its score. The OTHER half (a live paste into WhatsApp against the hosted preview) cannot run until the AWS deploy unblocks (IAM: cloudformation CreateChangeSet/CreateStack denied for andres-cli); it stays a charter observation for the post-deploy examiner walk | local half RED, awaiting slice-03 DELIVER; hosted half BLOCKED on deploy |
| R12 | `@covers-R12`: "La dirección permanente de la página no carga el sello del build" (canonical clean, `?b=` only in the shared link) | RED, awaiting slice-03 DELIVER |
| R13 | `@covers-R13`: "El anuncio no engorda el primer vuelo" (announcement present AND 14 KB gz document ceiling, production gate semantics) | RED, awaiting slice-03 DELIVER |
| R14 | `@covers-R14`: home card scenario (og:image absolute from configured site, exists in the publication, JPEG 1200x630 at or under 60 KB) plus "Cada spot publicado recibe su propia tarjeta" (one card per published spot per build, no repeated face — cadence per Pre-requisite 3, SETTLED 2026-08-10: per-spot per-build) | RED, awaiting slice-04 DELIVER |
| R15 | `@covers-R15`: "Una mañana nueva rehace la tarjeta" (new `?b=` stamp on the shared link, card bytes change with the new numbers; the stamp half already holds from slice-01, the card half is the RED) | RED, awaiting slice-04 DELIVER |
| R16 | `@covers-R16`: degrade scenario (two stripped spots share the generic face, publish succeeds, gap logged naming each spot; the intact morning never repeats a face) | RED, awaiting slice-04 DELIVER |
| R17 | `@covers-R17`: "La tarjeta nunca viaja en el primer vuelo" (card declared but never referenced by img/preload; document ceiling re-checked) | RED, awaiting slice-04 DELIVER |
| R18 | `@covers-R18`: slice-05 suite from the second-ranked spot's page (own message, own announcement, own stamped page link, JS-off anchor, copy action; home-values leakage explicitly red) | RED, awaiting slice-05 DELIVER |
| R19 | `@covers-R19`: "La página del spot con su acción de compartir sigue liviana" (100 KB first-visit ceiling measured over the served route) | RED, awaiting slice-05 DELIVER |
| R20-R26 (slices 02, 05 halves) | `@covers-R20`..`@covers-R26`: U1-U7 Scenario Outlines for the copy control (home) and for both spot-page actions, light/normal + dark/reduced, against the built surface with the production UI gate | RED, awaiting slice-02/slice-05 DELIVER |
| R27 | `@covers-R27`: "Copiar funciona sin señal" — the page is loaded, the signal is cut, the tap still copies and makes zero network requests: composition is provably client-only | RED, awaiting slice-02 DELIVER |
| R28 (preview half) | `@covers-R28`: announcement purity oracle (no model names, internal fields, template braces, or English in og title/description) | RED, awaiting slice-03 DELIVER |
