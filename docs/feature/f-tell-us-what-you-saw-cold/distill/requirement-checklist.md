# Requirement checklist: f-tell-us-what-you-saw-cold

Extracted at workspace open (2026-08-09) from `feature-delta.md` (Slice Plan + Definition of Done
+ Pre-requisites), `07-write-path.md` §2 to §7, `domain-model.md` §7, §7.4, §8, §10, §12 and §15,
`application-architecture.md` §4, §6, §7, §8, §9, §10, §12 and §14, `docs/DISCUSS-decisions.md` 4,
9, 11, 28 and the RESOLVED anchoring section, `adr-report-flow-leak-isolation.md`,
`system-architecture.md` §6.1, and the U1-U7 UI mandates (`nw-ui-quality-mandates`). One row per
requirement. Category from the closed set {ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows whose
slice has not entered DISTILL yet are expected-uncovered (per-slice JIT); they are visible here
from day one so no requirement is silently dropped. NO test exists for this feature yet; that is
the correct JIT state, not a gap.

| # | Requirement | Category |
|---|---|---|
| R1 | Screen one asks exactly three questions with the settled Spanish labels: 7 size bands, 3 wind words, 4 quality words, verbatim from application-architecture §10 Q1-Q3, plus Mandar; no fourth control and no time selector (slice-01) | functional |
| R2 | Tapping Mandar commits the full record with a fresh client-minted ULID `report_id` durably to the device BEFORE any network attempt (domain-model §7.4) (slice-01) | functional |
| R3 | After the commit the screen changes to the saved confirmation carrying no score, no forecast field, no comparison, and no way back to an editable form (decision 28; domain-model §7.1) (slice-01) | functional |
| R4 | Ordering is commit, then `history.replaceState`, then render: Back from the confirmation lands on the spot page at every moment, never on an editable form; reopening the report screen starts a blank report with a fresh `report_id` (application-architecture §8 L3) (slice-01) | validation |
| R5 | Committed records carry canonical enum tokens only; no `*-placeholder-*` token can ever be committed to the queue, because the queued record replays byte-identical (domain-model §7.4; gated on feature-delta Pre-requisite 1) (slice-01) | validation |
| R6 | The island probes IndexedDB (write, read, delete a sentinel) before showing the form; on refusal it says so plainly and falls back to submit-only-with-signal; no silent queue that drops labels (application-architecture §12; string pending, Pre-requisite 8) (slice-01) | validation |
| R7 | Built `/spots/{slug}/reportar` and `/reportado` documents contain zero forecast markers, and report-flow source imports no forecast module: dependency-cruiser rule plus dist grep gate, the gate proven against one deliberately poisoned fixture at authoring time (application-architecture §9) (slice-01) | security |
| R8 | The whole slice-01 journey works with zero AWS resources and zero network: same three taps, same commit, same confirmation (slice-01, walking skeleton) | e2e |
| R9 | With JS off, the noscript copy renders and reporting is unavailable by design; reading never needs JS (application-architecture §6; strings.ts noscript verbatim) (slice-01) | validation |
| R10 | The report routes emit no `/en/` alternate links: the scaffold's broken `altPath` into the removed English tree is gone (HANDOFF §6 item 3; scaffold defect) (slice-01) | validation |
| R11 | Byte ceilings: reportar document <= 6 KB gz plus island <= 5 KB gz; reportado <= 4 KB gz (application-architecture §4, §6) (slice-01) | nfr |
| R12 | CI rejects a write Function URL not declared `AuthType: NONE` with `AllowOrigins` = the exact site origin, on all four write URLs (07 §11 item 1) (slice-02) | build |
| R13 | CI rejects a report function without reserved concurrency 2, or mint/push/presign without reserved concurrency 1 (07 §2) (slice-02) | build |
| R14 | CI rejects a table not `BillingMode: PROVISIONED` at 25 WCU / 25 RCU (07 §11 item 2; adr-write-store-provisioned-capacity) (slice-02) | build |
| R15 | CI rejects a missing breaker alarm: the four write-path breaker alarms are declared alongside the four existing ones, eight of ten free alarm metrics (07 §11 item 4; §7.2 item 0.6) (slice-02) | build |
| R16 | Guardrail 7's quota rows are device rows only, no per-IP rows: 20 reports, 10 presigns, 20 subscription writes per device per day (07 §11 item 3; §7.2 item 0.10) (slice-02) | build |
| R17 | Every guardrail failure names what broke, why it matters and how to restore it; the suite is demonstrated red once; everything runs credential-free with CDK synth and no AWS account (slice-02) | build |
| R18 | Slice-02 sizing assertions trace to system-architecture §6.1's corrected arithmetic, never to 07 §12 (falsified per HANDOFF §6) (slice-02) | build |
| R19 | A report submitted online lands on the server and the surfer sees an arrival state; the state makes no claim about forecast availability (slice-03) | functional |
| R20 | Filing the same report twice stores it once: conditional put on `attribute_not_exists(SK)`, dedup key `report_id` alone, quota untouched on the duplicate branch (domain-model §7.4; 07 §4.2 step 7, §4.4) (slice-03) | functional |
| R21 | The server attaches `predicted{}` and `build_id` authoritatively at accept time from `log/calls/v1`, stored even though not yet rendered; the client's cached value is never trusted (domain-model §7.4; 07 §4.5) (slice-03) | functional |
| R22 | Mint is background and idempotent: a 401 triggers a silent mint-and-retry, re-minting returns the original `issued_at`, and no user-visible step exists anywhere in the flow (07 §3) (slice-03) | functional |
| R23 | The device quota ADD and the report PutItem are one `TransactWriteItems`: an over-quota report is 429 `quota_exceeded` with `Retry-After` and stays queued; a duplicate retry never burns quota (07 §4.2 step 7) (slice-03) | validation |
| R24 | `spot_id` is validated against the spot index before any table write: a junk spot gets 400 `unknown_spot` and never reaches the table (07 §4.2 step 4; blocked on the spot-index producer, Pre-requisite 6) (slice-03) | validation |
| R25 | Every stored record carries `received_at`, `credential_issued_at` and `trigger` from the very first report, the fields retroactive trust depends on (07 §6) (slice-03) | security |
| R26 | This slice owns submit-while-online and the page-open flush trigger only; the `online` event, service worker activation and the backoff ladder are F-WORKS-WITH-NO-SIGNAL's (HANDOFF §7 flush ownership) (slice-03) | validation |
| R27 | The reveal renders only from the POST response: what we said (score, band, wind), what you saw, and the signed delta with positive meaning we ran big, using the canonical q_obs anchors (07 §4.3; 06-learning-layer §8) (slice-04) | functional |
| R28 | The `no_snapshot` branch says plainly there is nothing to compare, verbatim application-architecture §10, and never fabricates a number (research 09 §14.4) (slice-04) | functional |
| R29 | The `predicted: null` path is exercised in the acceptance tests (domain-model §15 item 4) (slice-04) | validation |
| R30 | The counter line renders `Reporte {n} de {threshold}` from the response; the counter is best-effort display: tests assert n <= stored count, never equality (07 §4.2 step 8; 07 unobservables note) (slice-04) | functional |
| R31 | Build resolution walks back: latest `build=<HH>Z` with `HH <= hour(observed_at)`, at most 3 hours on 404, then `predicted: null`; a resolution miss is a degrade, never a 5xx (07 §4.5) (slice-04) | validation |
| R32 | The reveal has no URL: direct navigation to the reported screen without a submission shows a generic thanks, and nothing on the write path answers a GET (07 §2; adr-report-flow-leak-isolation decision 2) (slice-04) | security |
| R33 | Predicted and observed words on the reveal card come from ONE canonical vocabulary: the same wind and quality tokens the form captured (feature-delta Pre-requisite 1) (slice-04) | validation |
| R34 | An out-of-window `observed_at` gets 400 `observed_at_out_of_range` carrying both bounds and the server time; the screen shows the reason plainly and keeps the label visible (07 §4.2 step 5; application-architecture §7 P2) (slice-05) | functional |
| R35 | A 4xx other than 401 and 429 triggers no mechanical retry: the record will not become valid by waiting (application-architecture §7 P2) (slice-05) | validation |
| R36 | 429 is never an error state in the UI: same pending state as no signal, no toast, no red (07 §4.3; research 15 §5.5) (slice-05, applies from slice-03 on) | validation |
| R37 | No control exists to pick the session time; the flow stays three questions plus Mandar (feature-delta Pre-requisite 9, D19 recommendation) (slice-05) | validation |
| R38 | No payload delivered to the reportar route family contains any forecast field for any spot, ever (application-architecture §7 anti-leak contract) (feature-wide) | security |
| R39 | U1: every text/surface pair on the report flow clears its declared WCAG ratio computed against the real backdrop in both themes (feature-wide, visible slices) | ui |
| R40 | U2: no horizontal scroll, clipping or overlap at 390 px on reportar or reportado in any state (feature-wide, visible slices) | ui |
| R41 | U3: radios, Mandar and every action on screen two measure at least 44 px and stay thumb-reachable (feature-wide, visible slices) | ui |
| R42 | U4: every transition has a reduced-motion branch and nothing delays first meaningful content (feature-wide, visible slices) | ui |
| R43 | U5: the designed states are real, each honestly distinct: form ready, probe-refused, saved/queued, arrival, reveal compared, reveal no_snapshot, clock refusal; pending never reads as error, refusal never reads as pending (feature-wide, visible slices) | ui |
| R44 | U6: type uses the declared scale and survives the longest Spanish strings at 390 px without truncation (feature-wide, visible slices) | ui |
| R45 | U7: colour, spacing, radius, elevation and motion on the report flow use named tokens; no raw hex outside src/styles (feature-wide, visible slices) | ui |

## Current DISTILL coverage

Updated 2026-08-09 at slice-01 JIT DISTILL verification (Pre-requisite 1 closed by
`src/data/report-vocab.ts`). Evidence files: `tests/acceptance/f-tell-us-what-you-saw-cold/`
`three-taps-locks-the-label.feature` + `nothing-of-ours-before-yours.feature` with steps under
`steps/`. Gate run: `npm run test:at -- --tags "@feature-f-tell-us-what-you-saw-cold and
@slice-01"`, real exit 1, 10 scenarios (7 active-RED `MISSING_FUNCTIONALITY`, 3 already-satisfied
regression guards). Per-scenario classification and falsifiability proofs:
`distill/red-classification.md`.

| Current requirement | Active acceptance evidence | Status |
|---|---|---|
| R1 | `@covers-R1`: "A surfer walking off Playa Venao locks a label in three taps" — three-questions oracle asserts the settled labels and the 14 canonical tokens from the constants files | Covered; form-shape steps green against the scaffold, journey RED (`MISSING_FUNCTIONALITY`) |
| R2 | `@covers-R2`: offline commit scenario + shared-vocabulary scenario observe the durable queue at the driven storage port | Covered; RED (`MISSING_FUNCTIONALITY`, no island commits yet) |
| R3 | `@covers-R3`: walking skeleton asserts the saved confirmation carries no score, no forecast, no way back | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R4 | `@covers-R4`: "Back never returns to an editable form and a new report starts blank" | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R5 | `@covers-R5`: saved record asserts canonical tokens, fresh ULID, `photo_ids: []`, zero placeholder wording | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R6 | `@covers-R6`: "A phone that cannot keep the label is told plainly before answering" — behavioural oracle on `[data-storage-notice]` (verbatim string pending Pre-requisite 8a) | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R7 | `@covers-R7`: walked anti-leak negative (falsifiability proven by source-poisoning the built route, see red-classification.md) + "A deliberately poisoned page cannot slip past the leak gate" (gate CLI `scripts/check-report-leak.mjs` does not exist yet) | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R8 | `@covers-R8`: offline scenario runs the whole journey with the signal cut against the local built site; zero AWS anywhere in the slice-01 suite | Covered; RED (`MISSING_FUNCTIONALITY`) |
| R9 | `@covers-R9`: JS-off scenario asserts the verbatim noscript copy, no live submit control, reading intact | Covered; PASSING (already satisfied by the committed scaffold; regression guard) |
| R10 | `@covers-R10`: English-twin scenario over both built report documents; matcher proven non-vacuous. Dead `altPath` props remain in `ReportCapture.astro:44` / `ReportShell.astro:32` (source debt, artifact clean) | Covered; PASSING (already satisfied; regression guard) |
| R11 | `@covers-R11`: gzip ceilings on both documents plus the 5 KB island budget (island budget trivially green until the island ships) | Covered; PASSING (already satisfied; regression guard) |
| R38 | `@covers-R38` (feature-wide, slice-01 contribution): walked anti-leak negative over live page, both built documents, and every referenced asset | Partially covered — slice-01 surface only; later slices extend to write-path payloads |
| R12 | `@covers-R12`: 8 independent `AuthType` and exact-origin Scenario Outline rows, one per address and predicate | Covered; RED (`MISSING_FUNCTIONALITY`): all four `NONE` and all four exact-origin drifts are accepted without observed/required/why/repair diagnostics. |
| R13 | `@covers-R13`: 4 independent concurrency rows, report 2 and mint/push/photo-presign 1 | Covered; RED (`MISSING_FUNCTIONALITY`): each changed ceiling is accepted without its required value and repair. |
| R14 | `@covers-R14`: 3 independent billing, 25 RCU and 25 WCU rows | Covered; RED (`MISSING_FUNCTIONALITY`): every changed fixed-store value is accepted. |
| R15 | `@covers-R15`: 4 independent named-breaker removal rows | Covered; RED (`MISSING_FUNCTIONALITY`): every missing write breaker is accepted. |
| R16 | `@covers-R16`: 4 independent device-only rows for report 20, presign 10, subscription 20 and no per-IP identity | Covered; RED (`MISSING_FUNCTIONALITY`): every changed allowance or identity is accepted. |
| R17 | `@covers-R17`: baseline, unreadable declaration and all 24 controlled bites, each requiring observed, required, why, repair and same-copy green restoration | Mixed and honest: unreadable declaration is PASSING as an existing regression guard; baseline narration and every required policy diagnostic remain RED (`MISSING_FUNCTIONALITY`). |
| R18 | `@covers-R18`: one independent corrected-source Scenario Outline row | Covered; RED (`MISSING_FUNCTIONALITY`): the falsified 07 §12 source is accepted and §6.1 is not named as required. |
| R19 | `@covers-R19`: "A surfer sends a saved report and sees it arrive" | RED pending the real report journey (`REPORT_ACCEPTANCE_ORIGIN`); no fake endpoint is permitted. |
| R20 | `@covers-R20`: "Sending the same saved report again leaves one arrival" | RED pending the real report journey. |
| R21 | `@covers-R21`: page-open arrival scenario makes the server-owned comparison available only after a real send | RED pending the real report journey; Slice-04 observes the authoritative attachment through its receipt. |
| R22 | `@covers-R22`: arrival walking skeleton has no visible credential step | RED pending the real report journey. |
| R23 | `@covers-R23`: "A full daily allowance defers another saved report" | RED at the real public-handler boundary; `REPORT_ACCEPTANCE_QUOTA_CREDENTIAL` must name a real pre-provisioned device. |
| R24 | `@covers-R24`: "A named beach is refused before its report arrives" | RED at the real public-handler boundary and pending the generated spot index. |
| R25 | `@covers-R25`: arrival walking skeleton | RED pending the real report journey; receipt persistence is verified through the production port, not table inspection. |
| R26 | `@covers-R26`: "Opening the report screen sends a report that was already waiting" | RED pending the real report journey; reconnect and service-worker triggers remain out of scope. |
| R27 | `@covers-R27`: "A surfer sees how the call did after sending their label" | RED pending the real report journey and real published call. |
| R28 to R29 | `@covers-R28 @covers-R29`: "A surfer is told plainly when there is no call to compare" | RED pending a real no-call hour. |
| R30 | `@covers-R30`: compared reveal shows the report count | RED pending the real report journey. |
| R31 | `@covers-R31`: no-call reveal scenario | RED pending the production lookup. |
| R32 | `@covers-R32`: "A visitor without a sent report receives no comparison" | RED pending the real report journey. |
| R33 | `@covers-R33`: compared reveal uses report words on both sides | RED pending the real report journey. |
| R34 | `@covers-R34`: wrong-clock walking skeleton and corrected-clock recovery | RED pending the real report journey. |
| R35 | `@covers-R35`: "A refused report does not keep trying by itself" | RED pending the real report journey. |
| R36 | `@covers-R36`: quota deferral is the handler prerequisite for the eventual calm wait | RED at the real public-handler boundary; the browser-owned calm-wait launch proof remains external-only and is not faked. |
| R37 | `@covers-R37`: wrong-clock walking skeleton retains three taps and no time choice | RED pending the real report journey. |
| R38 | `@covers-R38`: direct visitor receives no comparison; the report route family remains forecast-free before a send | RED pending the real report journey. |
| R39 to R45 | `@ui-u1` through `@ui-u7` tags on the three walking skeletons; each expectation charter contains its U8 observation | RED pending the real report journey. |
