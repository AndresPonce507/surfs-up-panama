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
are visible here from day one so no requirement is silently dropped. No acceptance test
exists yet: this feature has not entered JIT DISTILL.

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

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| none | No slice of this feature has entered JIT DISTILL. Acceptance tests are written per slice, one slice at a time, when the slice legally opens (HANDOFF §4 workflow; waiver history for parallel opens is recorded in HANDOFF §10 and does not change this feature's default). | expected-uncovered by design |
