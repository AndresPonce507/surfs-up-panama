# Requirement checklist: f-works-with-no-signal

Extracted at workspace open (2026-08-09) from `feature-delta.md` (Slice Plan + Definition of Done
+ Pre-requisites), `application-architecture.md` §4, §5, §6, §9, §10, §12 and §14,
`07-write-path.md` §3, §4.2 to §4.5 and §5, `domain-model.md` §7.4,
`docs/DISCUSS-decisions.md` 12, 25, 26, `docs/research/raw/08-aws-architecture-and-cost.md`
§12.4, `docs/research/raw/12-community-whatsapp-ugc.md` §4,
`docs/research/raw/15-anonymous-write-path-abuse-protection.md` §5.5, and the U1-U7 UI mandates
(`nw-ui-quality-mandates`). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows whose
slice has not entered DISTILL yet are expected-uncovered (per-slice JIT); they are visible here
from day one so no requirement is silently dropped. NO test exists for this feature yet; that is
the correct JIT state, not a gap.

| # | Requirement | Category |
|---|---|---|
| R1 | The SW registers after load from the ≤ 0.2 KB inline snippet; the site is fully functional unregistered, SW is enhancement only (application-architecture §6, §12) (slice-01) | functional |
| R2 | Reading HTML (`/`, `/manana`, `/spots/*`) is network-first with a 3 s timeout falling back to cache; successful responses are re-cached (§12 row 1) (slice-01) | functional |
| R3 | No network and no cache → the precached `/sin-senal` page renders (Spanish, 0 JS, §4 route row), never a raw browser or origin error (§12 row 1 failure behaviour) (slice-01) | functional |
| R4 | `/sin-senal` renders the first verbatim §10 sentence with the last-cached publish time as `{hora}`; the second sentence ("Los reportes que mandes quedan guardados.") is ABSENT until the queue exists, because no shipped sentence may be untrue (feature-delta plan note; slice-03 lands it) (slice-01) | validation |
| R5 | Report screen 1 HTML is cache-first (static and forecast-free by construction, staleness harmless); not cached and offline → `/sin-senal` (the extra explanatory line is gated on Pre-requisite 6a, the branch itself is not) (§12 row 2) (slice-01) | functional |
| R6 | Hashed CSS/JS/icons are cache-first immutable; missing → network; failing → the page still renders on system fonts and inline critical CSS (§12 row 3) (slice-01) | functional |
| R7 | Static map and photo thumbs are cache-first with an LRU cap of ~5 MB; missing offline → alt text renders and layout reserves space, no CLS (§12 row 4) (slice-01) | functional |
| R8 | The write path (POST) is network-only: never `cache.put`, never served from cache; the reveal is network-only `no-store`; the SW honours the write path's `Cache-Control: no-store` (§12 rows 5-6; the fixed contract row f-tell depends on, closure L4) (slice-01) | security |
| R9 | The SW router-table unit test exists and its fixture suite includes one deliberately poisoned case, a cache-served write-path response, which the gate refuses; the gate is watched firing at authoring time (§9; clause check:unfired-is-not-evidence) (slice-01) | build |
| R10 | Adding a `push` listener to the SW file is additive: new registrations at the file end, zero edits to existing router rows or listeners (the named PUSH-lane seat, feature-delta plan note) (slice-01) | validation |
| R11 | Byte ceilings: SW ≤ 3.0 KB gz; `/sin-senal` document ≤ 3 KB gz; registration ≤ 0.2 KB inline (§5 line item 4, §4 route table, §6) (slice-01) | nfr |
| R12 | Request discipline: a typical reading session stays at ~8-10 CloudFront requests with the SW active (research 08 §12.4; §12 preamble) (slice-01) | nfr |
| R13 | The two shipped gates asserting `/sin-senal` unbuilt are amended in the same change that builds it: `scripts/page-weight-core.mjs` line 68 and `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts` line 88, serialized with the keystone lane (feature-delta Pre-requisite 4) (slice-01) | build |
| R14 | End-to-end: load the home online, cut the network, reload → the same forecast renders with its own stamp; navigate to a never-cached route → `/sin-senal` (slice-01, walking skeleton) | e2e |
| R15 | Every document renders its absolute publish time in HTML, true with JS off and true for a SW-served stale copy, because the stamp travels inside the document it describes; the SW adds no header tricks (§12 staleness rule) (slice-02) | functional |
| R16 | The ≤ 0.3 KB inline script upgrades the absolute time to a relative age and past 3 h flips the amber chip to the verbatim §10 stale line ("Viejo. Lo último que vimos fue a las 6:04. No pudimos sacar datos nuevos esta mañana.") (§12; §10) (slice-02) | functional |
| R17 | The machine-readable `published_at` is never rewritten by the SW or the script; an old score is never presented as a new call; the stale document says both "Viejo" and that no new data could be obtained (§12 reading states; the honesty property in DoD row 3) (slice-02) | validation |
| R18 | Staleness upgrade script ≤ 0.3 KB gz inline (§5 line item 1, §6 row 4) (slice-02) | nfr |
| R19 | A queued report flushes on the `online` event (07 §5 sequence; §12 flush triggers) (slice-03) | functional |
| R20 | A queued report flushes on SW activation (§12 flush triggers; the trigger that catches a phone whose tab never fires `online`) (slice-03) | functional |
| R21 | Mint completes before the queue flushes; the mint is idempotent and never user-visible (07 §5, §3) (slice-03) | validation |
| R22 | On 429, 5xx or timeout the entry stays queued with exponential backoff 30s×2^n plus jitter; 429 is never an error state in the UI, same pending state as no signal (07 §5, §4.3; research 15 §5.5) (slice-03) | validation |
| R23 | The flush re-sends the byte-identical committed record: `report_id` never re-minted, `observed_at` and `submitted_at` never touched at sync time (07 §5; domain-model §7.4; application-architecture §8) (slice-03) | validation |
| R24 | Any 200 (`compared`, `no_snapshot`, `queued_duplicate`) deletes the queue entry; a 4xx other than 401/429 surfaces the reason, keeps the label locally and triggers no mechanical retry (07 §5; P2) (slice-03) | validation |
| R25 | No flush path depends on Background Sync; every trigger works with it absent (iOS availability UNVERIFIED, §12) (slice-03) | validation |
| R26 | `/sin-senal` renders the queued-count box ("1 reporte guardado. Se manda al volver la señal.", §14 wireframe) counting real queue entries, and the second verbatim §10 offline sentence lands, both now true (slice-03) | functional |
| R27 | End-to-end: file a report with the network cut (f-tell slice-01 journey), restore the network → the report sends itself without any user action and the surfer is told how we did (the reveal, or the arrival state while f-tell slice-04 is unshipped) (slice-03) | e2e |
| R28 | A re-sync replay of an already-acked `report_id` renders the original reveal byte-equivalent (`queued_duplicate`), the counter never double-increments, and the quota is untouched on the duplicate branch (07 §4.4, §5 sequence; P3/P4) (slice-04) | functional |
| R29 | Burst flush from one device on re-sync is normal traffic: no client-side throttle beyond the backoff ladder, per decision 26; the client never decides "already sent", it replays and lets `report_id` decide (07 §5) (slice-04) | validation |
| R30 | End-to-end: cut the network after the server ack but before the client ack; the entry stays queued, the next flush replays, and the surfer sees exactly one reveal and one counter value (slice-04) | e2e |
| R31 | The manifest ships per §12: `display: standalone`, `start_url: /`, `lang: es`, 192 and 512 icons, theme colours per theme; the site is installable on Android Chrome from a plain tab and on iOS via A2HS (research 12 §4) (slice-05) | functional |
| R32 | The A2HS iOS hint renders verbatim §10 as a pure `<details>` disclosure, 0 JS, in the home footer (spot-page slot follows keystone slice-06) (§6, §10) (slice-05) | functional |
| R33 | Manifest plus favicon ≤ 1.5 KB on first visit; app icons are fetched on install only, 0 bytes on any visit (§5 line items 5 and 6) (slice-05) | nfr |
| R34 | U1: every text/surface pair this feature adds (offline page, Viejo chip, queue box, A2HS hint) clears its declared WCAG ratio against the real backdrop in both themes (feature-wide, visible slices) | ui |
| R35 | U2: no horizontal scroll, clipping or overlap at 390 px on any state this feature adds (feature-wide, visible slices) | ui |
| R36 | U3: every interactive target this feature adds measures at least 44 px and stays thumb-reachable (feature-wide, visible slices) | ui |
| R37 | U4: every transition has a reduced-motion branch and nothing this feature adds delays first meaningful content (feature-wide, visible slices) | ui |
| R38 | U5: the designed states are real and honestly distinct: cached-fresh, cached-stale (Viejo), offline-with-cache, offline-no-cache (`/sin-senal`), n-queued, sending, sent; pending never reads as error, stale never reads as fresh (feature-wide, visible slices) | ui |
| R39 | U6: type uses the declared scale and survives the longest Spanish strings at 390 px without truncation (feature-wide, visible slices) | ui |
| R40 | U7: colour, spacing, radius, elevation and motion on every surface this feature adds use named tokens; no raw hex outside src/styles (feature-wide, visible slices) | ui |
| R41 | Zero technical text on the Spanish surface in every state this feature adds: no raw ISO timestamps (Pre-requisite 1 ties this to the BUGFIX lane's corrected stamp), no JSON, no placeholder tokens, no English (project CLAUDE.md copy rules) (feature-wide) | validation |

## Current DISTILL coverage

Updated 2026-08-10 at the slices 02-05 JIT DISTILL (slice-01's entry was 2026-08-09).
Thirty acceptance scenarios exist across six feature files under
`tests/acceptance/f-works-with-no-signal/` (`the-last-forecast-still-reads`,
`the-helper-keeps-its-discipline`, `an-old-forecast-says-so`, `a-queued-report-sends-itself`,
`it-sends-once-and-only-once`, `it-opens-like-an-app`), all tagged
`@feature-f-works-with-no-signal` at file level and `@slice-NN` on every scenario. Observed
classification per scenario lives in `distill/red-classification.md`: 27 RED
`MISSING_FUNCTIONALITY`, 2 deliberate `GUARD_ALREADY_TRUE` absence/truth guards.

| Requirement | Active acceptance evidence | Status |
|---|---|---|
| R1 | "A surfer parked at Venao with one bar still reads the last forecast that loaded"; "A whole morning's reading asks the site for ten things or fewer" | Covered, RED |
| R2 | "A surfer parked at Venao..."; "A network that stalls gives up after three seconds and shows what we already had" | Covered, RED |
| R3 | "With nothing saved for what they asked for, no signal lands on plain Spanish words"; "A report screen never opened before lands on the sin señal words, never an error" | Covered, RED |
| R4 | "With nothing saved for what they asked for..." asserts the settled first sentence present and the second sentence ABSENT | Covered, RED, with one half deferred: the hour is asserted by shape (a plain clock after "de las "), not by equality with the home page's stamp, because that stamp still prints a raw ISO timestamp and its correction belongs to the BUGFIX lane (Pre-requisite 1). Equality becomes assertable at slice-02 |
| R5 | "The report screen opens with no signal once it has been opened with signal"; "A report screen never opened before lands on the sin señal words, never an error" | Covered, RED. The extra explanatory line of §12 row 2 stays uncovered per Pre-requisite 6a: the Spanish string does not exist and inventing product copy is out of scope |
| R6 | "The small parts the page draws itself with come from the phone when the signal is gone" | Partly covered, RED. The cache-first clause is covered through `/favicon.svg`, the one first-visit subresource the built site has. The failure clause ("page still renders on system fonts and inline critical CSS") is NOT claimed: `Base.astro` inlines every stylesheet as one `<style>` block, so it is structurally true today and a scenario asserting it would pass vacuously; the render-blocking-subresource refusal in the shipped page-weight gate is what holds it |
| R7 | none | Uncovered at the browser, deliberately and with the reason recorded: the built site emits no static map and no photo thumbnail, so a scenario asserting either would fail at the locator on another lane's missing surface, which is BROKEN and not RED. The router row still ships in slice-01; its browser proof is owed the moment a map or a thumb exists (keystone slice-06/07 surface). No test carries `@covers-R7` |
| R8 | "A report that got through is answered by the site and left nowhere on the phone"; "With the signal gone, a planted answer is never handed back as if the report went out" | Covered, RED. Both halves: network-only with nothing kept after a success, and never served from a copy on failure |
| R9 | "With the signal gone, a planted answer is never handed back as if the report went out" | Half covered, RED. The poisoned fixture is real and on the real surface (an answer planted in the phone's own store under the write-path address) and the helper is watched being required to refuse it, which satisfies clause `check:unfired-is-not-evidence` at the acceptance layer. The §9 router-table UNIT test is owed by DELIVER's inner loop and is not an acceptance artefact; DoD row 2 is not satisfied by this scenario alone |
| R10 | "A later alerts feature is added to the helper without touching a line of what it already does" | Covered, RED. The append is behavioural, not structural: the emitted helper is served amended from memory (never written into `dist/`) and the offline reading journey must still hold |
| R11 | "Everything this slice adds stays inside the weight it was given" | Covered, RED. Measurements over the real gzipped `dist/` output, not estimates |
| R12 | "A whole morning's reading asks the site for ten things or fewer" | Covered, RED. Guarded behind the helper actually being in charge, so the count cannot report a false green on a phone with no helper |
| R13 | "The weight gate counts the sin señal page instead of calling it unbuilt" | Covered, RED. The scenario demands the post-slice behaviour; the three edits it implies are named in `red-classification.md` and are the crafter's to make, serialized with the keystone lane |
| R14 | "A surfer parked at Venao with one bar still reads the last forecast that loaded" (the walking skeleton) | Covered, RED |
| R38 | "A surfer parked at Venao..."; "With nothing saved for what they asked for..." | Covered for the two states slice-01 adds (offline-with-cache, offline-no-cache): each asserts its own words and that neither reads as a browser error. The remaining designed states arrive with slices 02, 03 and 04 |
| R41 | "With nothing saved for what they asked for, no signal lands on plain Spanish words" | Covered for the surface slice-01 adds: no raw timestamp, no placeholder token, no machine word, no English on the sin señal page |
| R34, R35, R36, R37, R39, R40 | the shipped `ui-quality` gate (`npm run test:ui`, `scripts/check-ui-quality.mjs`) | Covered by mechanism, not by a scenario, and deliberately not tagged. Verified 2026-08-09, both halves: the gate walks every built HTML document under `dist/` (`walk(DIST)` then an `.html` filter), so it starts covering `/sin-senal` the moment the page is built; and it is genuinely gated, as job `ui` of the ten in `scripts/ci-local-core.mjs:49` with `default: true`, running `npm run test:ui`, which builds first. Duplicating U1-U7 as browser scenarios would restate a shipped gate; a `@covers-Rn` tag on a test that does not check the thing would be worse. The U8 observation is the human examiner's against the slice charter |
| R15 | "A fresh forecast is never called old" (embedded moment + stamp); "With no JavaScript the page still tells the true hour" (JS-off half, green guard on the landed BUGFIX); "An old forecast served with no signal looks old, never fresh" (SW-served-copy half) | Covered, RED (JS-off half already true; Pre-requisite 1 CLOSED at `6b02fe0`) |
| R16 | "Three hours later the same page admits it is old"; "An old forecast served with no signal looks old, never fresh" | Covered, RED, with one half deferred: the >3 h Viejo flip is pinned verbatim; the under-3 h RELATIVE age has no settled Spanish string in §10 and is deliberately not pinned — the settled absolute stamp is the honest under-3 h rendering until the string exists (copy gap flagged, cousin's-crew channel, same as Pre-requisite 6a) |
| R17 | "Three hours later..." and "An old forecast served with no signal..." both assert the underneath moment unchanged; "A fresh forecast is never called old" guards the inverse (fresh never dressed old) | Covered, RED |
| R18 | "Admitting age costs almost nothing to carry" | Covered, RED. Gzipped dist measurement, registration snippet excluded |
| R19 | "A report filed with no signal sends itself when the signal comes back" | Covered, RED. The Given plants a committed record at the queue seam (capture is f-tell's journey); seam naming PROPOSED, reconciliation owed (cross_lane_seams) |
| R20 | "A report waiting on a phone that never noticed the signal return still goes out" | Covered, RED. Models the queue-predates-helper state by withholding /sw.js on the first visit |
| R21 | "Sent from the road" (order observable once mint exists) | Partly covered, RED. Mint itself is f-tell slice-03's; mint-before-flush becomes assertable when /api/mint exists, seam left visible in step 03-01 |
| R22 | "A throttled door keeps the report waiting patiently, never as a failure" | Covered, RED at the acceptance layer (one knock in window, entry kept, no failure words); the precise ladder (30s×2^n, jitter, cap) is the step 03-03 unit oracle with an injected clock — a `@property` candidate per the project paradigm |
| R23 | "...exactly as it was filed" step in every flush scenario: deep-equal against the committed record plus wind/quality membership in `src/data/report-vocab.ts` tokens | Covered, RED. The frozen-vocabulary half guards the queued-placeholder-becomes-invalid-POST trap |
| R24 | Delete-on-200: every flush scenario's "no longer waiting"; keep-and-explain: "A report the site refuses is kept, explained, and never hammered" | Covered, RED |
| R25 | "...still goes out" asserts zero background-sync registrations at flush time | Covered, RED |
| R26 | "The sin señal page finally makes its second promise, and counts what is waiting" | Covered, RED. Singular box only: no settled plural string exists (flagged in step 03-05); the slice-01 absence-scenario amendment is pre-authorized in step 03-05 |
| R27 | "Filed on the sand, the report is saved for the road" + "Sent from the road" (the full journey, two chained scenarios); "A report filed with no signal sends itself..." (flush half) | Covered, RED, cross-feature: the journey's capture half is f-tell slice-01's and the RED names that seam (Mandar times out, no island) |
| R28 | "A report the site already had is answered exactly like the first time"; "An answer lost on the way back never becomes a second report" | Covered, RED, with the rendering-equality half deferred: word-for-word reveal equality becomes assertable when f-tell slice-04 ships the renderer (amendment owed, step 04-02); today's oracle is the idempotent ack + single stored record + no double count |
| R29 | "The phone never decides a report already went; it asks, and the site answers" | Covered, RED. Two queued, one already stored, both must be asked |
| R30 | "An answer lost on the way back never becomes a second report" | Covered, RED. The harness stages the store-then-dead-socket branch for real |
| R31 | "The site offers itself to the home screen with its settled identity" | Covered, RED. Reads the identity from the built head — the manifest link is the recorded Base.astro seam, so RED holds until the coordinator lands that line |
| R32 | "No promise of avisos before avisos exist" | Covered as a deliberate ABSENCE guard (GUARD_ALREADY_TRUE): the settled hint wording must NOT render before a live subscribe path exists (the recorded A2HS ownership condition, step 05-02); the render assertion is the alerts lane's amendment at flip time |
| R33 | "Opening like an app costs almost nothing on a normal visit" | Covered, RED. Manifest+favicon gz weight plus a watched visit fetching neither icon |

Note for slice-03's DISTILL opener: the scenario "With nothing saved for what they asked for, no
signal lands on plain Spanish words" asserts that `"Los reportes que mandes quedan guardados."` is
ABSENT (R4). That assertion becomes false the moment slice-03 makes the sentence true (R26).
Amending that one step is slice-03's, and it is an amendment owed, not a test that broke.
RESOLVED 2026-08-10: the exact edit is pre-authorized verbatim in roadmap step 03-05 (delete the
one `And` line from the slice-01 scenario, then drop the orphaned step definition), the only
acceptance-test edit permitted in that phase.

Note on R7 (map/thumb LRU row): still uncovered at the browser and deliberately so — no map or
thumb surface exists on any lane yet (the slice-01 record above stands). None of slices 02-05
changes this; the browser proof stays owed to the moment a map or a thumb exists.
