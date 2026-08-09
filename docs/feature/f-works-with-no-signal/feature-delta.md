<!-- des-feature-context-bootstrap: {"feature_id":"f-works-with-no-signal","intent":"A surfer parked at Venao with one bar still sees the last forecast that loaded, and a report filed with no signal at all sends itself once, and only once, when they get back into coverage.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-works-with-no-signal

Intent: A surfer parked at Venao with one bar still sees the last forecast that loaded, and a
report filed with no signal at all sends itself once, and only once, when they get back into
coverage.

Workspace opened 2026-08-09 on `build/f2-signal` (worktree `/Users/andres/psb-signal`, base
`82be859`). This is the DOCS-ONLY workspace creation: no acceptance test, no step definition, no
service worker and no production code exist for this feature yet. Each slice's tests are written
Just In Time when that slice legally enters DISTILL (`HANDOFF.md` §1, DISTILL row).

Identity, established from evidence rather than assumed: the only attested spelling anywhere in
history is `F-WORKS-WITH-NO-SIGNAL`, epic row 7 of 11 (`docs/epic/surfs-up-panama/epic-delta.md`
line 49, present identically on `design-round-1`). No workspace, commit, branch content or
dangling object for it has ever existed under any name (verified against all refs, the reflog and
`git fsck --lost-found`, 2026-08-09). The directory id `f-works-with-no-signal` follows the
`des-feature-context-bootstrap` convention of the three sibling `f-*` workspaces. Two slice
numbers arrive pre-assigned from `docs/feature/f-tell-us-what-you-saw-cold/feature-delta.md`
(Out-of-scope rows: flush on reconnect is "F-WORKS-WITH-NO-SIGNAL slice-03", the
`queued_duplicate` re-sync observable is "F-WORKS-WITH-NO-SIGNAL slice-04"); this plan honours
both numbers. The planning documents the sibling workspaces cite (`BUILD-ORDER.md`,
`plan-cluster-*.md`) were never committed and are unrecoverable; see Pre-requisite 8.

The design is settled, not designed here: `application-architecture.md` §12 carries the complete
per-route service worker strategy table, the staleness stamp rule, the three materialized reading
states, the offline queue flush triggers, the PWA manifest shape and the iOS-versus-Android push
reality. §10 carries the verbatim Spanish. §4 carries the route map (`/sin-senal`, 3 KB, 0 JS).
This file slices that design; it invents none of it.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer parked at Venao with one bar still sees the last forecast that loaded: when the network stalls past 3 seconds the service worker serves the cached page with its own publish stamp, and with nothing cached at all a plain Spanish sin-señal page renders instead of a raw browser error. | pending | @walking_skeleton, owns the service worker file | Thinnest end-to-end vertical that proves the risky part: the service worker and its per-route discipline, which is the read half of decision 26 ("Cache the last forecast"). The entire router table ships in this slice, verbatim from `application-architecture.md` §12: reading HTML network-first with 3 s timeout falling back to cache, report screen 1 cache-first (its document is forecast-free by construction so staleness is harmless), hashed assets cache-first immutable, map and photo thumbs cache-first LRU capped ~5 MB, write path POST network-only never cached, reveal network-only `no-store`. The two write-path rows ship NOW, before any write path exists, because they are a fixed cross-feature contract: `f-tell-us-what-you-saw-cold/feature-delta.md` (plan note, Prefactoring Assessment) records that this feature owns the service worker file, that the write-path row is settled as network-only plus `Cache-Control: no-store` (§12 closure L4), and that f-tell depends on the row and never edits the file. Shipping the file without the row would invite exactly the parallel-edit race the seam was settled to prevent. `/sin-senal` ships precached per §4 (3 KB doc, 0 JS) with §10's offline copy, first sentence only: the second sentence ("Los reportes que mandes quedan guardados.") asserts a queue that does not exist yet and no slice may ship a sentence that is not true at the moment it ships; slice-03 lands it (Pre-requisite 2). Precaching also makes the offline page immune to the S3 URL-form trap `HANDOFF.md` §10 records (directory links 403 on the REST origin): the SW serves it from its own cache by name, never from origin. Registration is the ≤0.2 KB inline snippet (§6); the site works fully unregistered, SW is enhancement only. Budget lines 4 and 5 of §5's home first-visit table were reserved for this feature in DESIGN, so the adds spend booked budget, not headroom. Two shipped gates currently assert this route is unbuilt and fail the moment it lands: `scripts/page-weight-core.mjs` line 68 (`DECLARED_BUT_UNBUILT`) and `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts` line 88; amending both is inside this slice, strictly serial with the keystone lane (Pre-requisite 4). The `Base.astro` head (registration snippet, later manifest link) is a named contended seam with the REACH lane; f-paste slice-03's meta block lands first and alone (Pre-requisite 5). The SW file is structured so the PUSH lane's later `push` handler is additive: event listeners are separate registrations, and adding one touches no router row (plan note below). |
| slice-02 | A forecast served from cache is honest about its age: the page shows its own original publish time, flips to the amber "Viejo" line past three hours, and never dresses an old score up as a new call. | pending | depends-on Pre-requisite 1 (stamp BUGFIX lane) | This is §12's staleness stamp rule made real on the surface this feature creates, the SW-served stale copy: "truth lives in the document" — every document embeds `published_at`, the absolute time renders with JS off, and the stamp travels inside the document it describes, so a stale cached copy carries its own true age with zero SW header tricks. This slice ships the 0.3 KB inline upgrade script (§5 line item 1, §6 row 4): relative age under 3 h, past 3 h the amber chip with §10's verbatim stale line, "Viejo. Lo último que vimos fue a las 6:04. No pudimos sacar datos nuevos esta mañana." The honesty property is contractual and lands in the Definition of Done: the stale document keeps its original machine-readable `published_at`, says both "Viejo" and that no new data could be obtained, and never labels an old score as a new call (§12 reading states; the project's one rule, `CLAUDE.md`: never claim more certainty than the data earns). Gated on the concurrent BUGFIX lane: the absolute stamp today prints a raw ISO timestamp, which violates the zero-technical-text copy rule; that fix is owned there and is consumed here, not duplicated (Pre-requisite 1). Placed before the flush slices because it needs no queue, no write path and no AWS, and because the walking skeleton's cache-serving behaviour is only honest once the age is visible. |
| slice-03 | A report filed with no signal sends itself when the surfer walks back into coverage: the queue flushes on the online event and on service worker activation, backs off politely when the door is throttled, and the sin-señal page shows the reports waiting to go. | pending | depends-on Pre-requisites 2 and 3 | The slice number is pre-assigned by the settled seam: `f-tell-us-what-you-saw-cold/feature-delta.md` Out-of-scope row names "Flush on reconnect: `online` event, service worker activation, backoff ladder" as F-WORKS-WITH-NO-SIGNAL slice-03, and its R26 states the same split from the other side (f-tell slice-03 owns submit-while-online and the page-open trigger only). The flush contract is `07-write-path.md` §5, verbatim: retry re-sends the byte-identical record, never re-mints `report_id`, never touches `observed_at`; mint completes before the queue flushes (idempotent, never user-visible, 07 §3); any 429 or 5xx leaves the entry queued with exponential backoff 30s×2^n plus jitter; any 200 (`compared`, `no_snapshot`, `queued_duplicate`) deletes the entry; 4xx other than 401/429 surfaces the reason, keeps the label and never retries mechanically (P2). 429 is never an error state in the UI, same pending state as no signal (research 15 §5.5). Bursts from one device on re-sync are normal traffic by decision 26; nothing here treats them as abuse. Background Sync is progressive enhancement only: its iOS availability is UNVERIFIED in the research corpus, the design must not depend on it (§12), and no scenario in this feature may either. This slice also lands the second verbatim sentence of the §10 offline copy and the §14 queued-count box ("1 reporte guardado. Se manda al volver la señal."), because with a queue and a flush both are finally true. Blocked by two f-tell deliverables: slice-01 there (a durable queue to flush; its enum-token gate closed 2026-08-09, `src/data/report-vocab.ts` is live) and slice-03 there (an endpoint and mint to flush to, itself deploy-gated on the Lambda concurrency quota, HANDOFF §6 item 6, and the missing write stack, f-tell Pre-requisite 5). Note: the sibling citations for this seam name "HANDOFF.md §7 flush ownership", and §7 in both HANDOFF copies contains no such section; the ownership split survives in the two feature files themselves (Pre-requisite 7, flagged not repaired). |
| slice-04 | The queued report sends itself once, and only once: a retry that raced an earlier success is answered with the original reveal, rendered identically, and nothing is ever double-counted. | pending | depends-on slice-03, depends-on Pre-requisite 3 (f-tell slices 03 and 04) | The slice number is pre-assigned by the same seam: f-tell's Out-of-scope row names "`queued_duplicate` re-sync observable (byte-equivalent reveal on retry)" as F-WORKS-WITH-NO-SIGNAL slice-04, with storage idempotence itself shipping in f-tell slice-03 (conditional put on `attribute_not_exists(SK)`, dedup key `report_id` alone, quota untouched on the duplicate branch, 07 §4.2 step 7 and §4.4). This slice owns the client half, which is the epic sentence "once, and only once" made observable: per the 07 §5 sequence, a replayed acked record gets `ConditionalCheckFailed`, the server reads the stored item and returns 200 `outcome: queued_duplicate` carrying the original reveal; the client renders it identically to the first ack and deletes the queue entry (idempotent ack, P3/P4). The epic row's own justification is this slice's reason for existing: signal is worst exactly where reports happen, so the queue needs server-side dedup on re-sync rather than client-side trust — the client never decides "already sent", it replays and lets `report_id` decide. Rendering the reveal byte-equivalent needs f-tell slice-04's reveal renderer on screen two; before that ships the equivalent observable is the arrival state, which makes no forecast claim and so cannot be false. The nastiest branch is in scope by design: network dies after the server ack but before the client ack, the entry stays queued, the next flush replays, and the surfer sees one reveal and one counter increment, ever. |
| slice-05 | A surfer adds the site to their home screen and it opens like an app: installable with the settled manifest, and the iPhone hint explains the one Apple step in plain Spanish, which is also the only door to alerts later. | pending | depends-on slice-01 only | Decision 25 names add-to-home-screen as one of the four mobile priorities, and decision 12's parenthesis is the reason it lives in THIS feature: iOS requires add-to-home-screen before push is even possible. The manifest ships per §12 verbatim: `display: standalone`, `start_url: /`, `lang: es`, both icon sizes (192/512), theme colours per theme; standalone because the installed context IS the push context (research 12 §4, accessed 2026-08-08: Android Chrome has full Web Push from a plain tab; iOS 16.4+ supports Web Push only for PWAs added to the Home Screen, an open Safari tab cannot request push, and there is no automatic install prompt, so §10's A2HS hint is the onboarding). The hint ships verbatim from §10 ("¿Quieres avisos? En iPhone: Compartir, y luego Añadir a pantalla de inicio. Sin eso, iPhone no deja avisar.") as a pure `<details>` disclosure, 0 JS (§6). Byte budget: manifest plus favicon ≤ 1.5 KB on first visit, app icons fetched on install only, 0 on-visit bytes (§5 lines 5 and 6). The 192/512 icons do not exist (`public/` holds only `favicon.svg`, verified 2026-08-09); this slice creates them derived from the existing favicon mark, flagged for Andres's eye, not his hands (Pre-requisite 6). Placement: home footer now; the spot-page hint slot follows keystone slice-06's page (§6 row 6). Installability requires a registered SW plus the manifest, hence depends-on slice-01; it needs nothing from slices 02-04 and is parallel-safe once slice-01 lands. This slice ships zero push code: the `push` handler, subscriptions and copy stay in F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE and land additively at the seat slice-01 leaves (plan note below). |

Notes on the plan:

- Row order is dependency order, backward only. An empty Annotation cell is parallel-safe once the
  rows above it have landed. Same convention as the keystone and both sibling `f-*` plans.
- **This feature owns the service worker file.** The write-path row of its router table is fixed
  by contract as network-only plus `Cache-Control: no-store` (`application-architecture.md` §12,
  closure L4). `f-tell-us-what-you-saw-cold` depends on that row and never edits the file. Any
  edit to that row by any lane is a contract violation, not a refactor.
- **The push seat, named now so adding it is additive.** The SW is organised as one router table
  plus independent event-listener registrations (`install`, `activate`, `fetch`, later `sync` if
  ever verified). The PUSH lane (F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE) adds a `push` and a
  `notificationclick` listener as new registrations at the end of the file, touching zero existing
  router rows and zero existing listeners. That lane edits this file only for those two
  registrations, coordinated as a serial append, never concurrently with a SIGNAL slice in
  flight.
- **Background Sync is never load-bearing.** iOS availability is UNVERIFIED in the research
  corpus; §12 makes it progressive enhancement only and this plan's flush triggers (`online`
  event, SW activation, plus f-tell's page-open trigger) work everywhere. No slice, scenario or
  DoD row may depend on it.
- **Byte discipline.** Estimated adds, all inside ceilings `application-architecture.md` §5
  already books: SW script ≤ 3.0 KB gz (line item 4), registration ≤ 0.2 KB inline, manifest plus
  favicon ≤ 1.5 KB (line item 5), icons 0 on first visit (line item 6), staleness upgrade script
  ≤ 0.3 KB inline (inside line item 1), `/sin-senal` document ≤ 3 KB gz (§4 route table). The
  ceilings are contractual now; the CI gate that enforces them is keystone slice-08 (in flight
  per HANDOFF §10). Every byte-adding slice ships under the gate once it is green.
- **Request-count discipline is a product property here, not an aside.** §12's table exists to
  keep a typical session at ~8-10 CloudFront requests (research 08 §12.4: requests per session,
  not bytes, are the binding cost constraint). A SW change that inflates request count is a
  regression against F-BILL-STAYS-ZERO-AND-STAYS-UP even when every byte gate stays green.
- **Offline copy lands in two honest stages.** §10's offline string is one verbatim block whose
  second sentence promises a queue. Slice-01 renders sentence one; slice-03 adds sentence two the
  moment it is true. Staging is not rewording: both sentences ship word for word from §10.
- **No slice fakes coverage state.** The offline page never claims a report was sent, the queue
  box counts real queue entries, and the pending state never reads as an error (429 discipline,
  research 15 §5.5).

## Wave: DISCUSS / [REF] Slice classification

Required at DISTILL open per `HANDOFF.md` §4, recorded now so it is not invented later. Charters
belong under `docs/product/expectations/f-works-with-no-signal/`; they are owed at each slice's
DISTILL open and are NOT created in this workspace commit, because this lane's declared file
boundary is `docs/feature/f-works-with-no-signal/**` only (flagged in Pre-requisite 9).

| Slice | Classification | Note |
|---|---|---|
| slice-01 | user-visible | The cached page with its own stamp and the `/sin-senal` fallback are rendered surfaces. U1-U7 checks plus a U8 observation apply at 390 px, both themes, reduced motion aware. The write-path router row inside this slice has no visible surface until a write path exists; its proof is the router-table unit test plus the poisoned-fixture refusal (§9), stated honestly as a non-visual observable inside a visible slice |
| slice-02 | user-visible | The relative age and the amber "Viejo" chip are the most-read honesty surface this feature produces |
| slice-03 | user-visible | The queued-count box, the second offline sentence, and a queued report visibly leaving the phone are rendered outcomes |
| slice-04 | user-visible | The byte-equivalent reveal on retry renders on screen two; sameness is the observable |
| slice-05 | user-visible | The install surface, standalone display and the A2HS `<details>` hint are rendered |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | The epic promise is walkable end to end: parked at Venao with one bar, the last forecast that loaded renders with its own publish stamp; with nothing cached, the Spanish `/sin-senal` page renders, never a raw browser or origin error; a report filed with no signal sends itself once, and only once, on return to coverage. |
| 2 | The SW router table matches `application-architecture.md` §12 row for row: reading HTML network-first 3 s falling back to cache, report screen 1 cache-first, hashed assets cache-first immutable, map and thumbs cache-first LRU ~5 MB, write path POST network-only never cached, reveal network-only `no-store`. The write-path row is proven by a router-table unit test plus one deliberately poisoned fixture the gate refuses (§9, clause check:unfired-is-not-evidence), and no other feature has edited the file. |
| 3 | Staleness is honest by construction: every SW-served document carries its own embedded `published_at`, absolute time true with JS off; past 3 h the chip flips to §10's verbatim "Viejo" line; the original machine-readable `published_at` is never rewritten; an old score is never labelled a new call. |
| 4 | The flush honours `07-write-path.md` §5 exactly: triggers are `online`, SW activation and f-tell's page-open; mint completes first; backoff 30s×2^n plus jitter on 429/5xx; any 200 deletes the entry; the record replays byte-identical; nothing anywhere depends on Background Sync. |
| 5 | Once and only once is observable: a replayed acked `report_id` renders the original reveal identically (`queued_duplicate`), the counter never double-increments, the quota is untouched on the duplicate branch, and the queue entry is deleted on the idempotent ack. |
| 6 | Request discipline holds: a typical reading session stays at ~8-10 CloudFront requests with the SW active (research 08 §12.4). |
| 7 | Byte gates green: SW ≤ 3.0 KB gz, `/sin-senal` ≤ 3 KB gz, manifest plus favicon ≤ 1.5 KB, staleness script ≤ 0.3 KB inline, registration ≤ 0.2 KB inline; every route under its §4/§5 ceiling. |
| 8 | The site is installable per §12's manifest (`standalone`, `start_url: /`, `lang: es`, 192/512 icons, per-theme colours) and the A2HS iOS hint renders verbatim §10 as a 0 JS `<details>`; the installed standalone context is ready to be the push context for the later push feature. |
| 9 | U1-U7 checks green per slice through the built surface, and a sealed source-blind Vera PASS against each slice charter's U8 observation: 390 px, WCAG-AA against the real backdrop in both themes, reduced motion honoured, 44 px targets. |
| 10 | Zero technical text on the Spanish surface in every state this feature adds: no raw ISO timestamps, no JSON, no placeholder tokens, no English. |
| 11 | The push seat is intact: adding a `push` listener requires zero edits to existing router rows or listeners, demonstrated by the file structure, and recorded for the PUSH lane. |
| 12 | Every Slice Plan row above is flipped `shipped`. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Report capture, the durable IndexedDB label commit, the sentinel probe | F-TELL-US-WHAT-YOU-SAW-COLD slice-01 (domain-model §7.4; this feature flushes what that feature commits) |
| Submit-while-online and the page-open flush trigger | F-TELL-US-WHAT-YOU-SAW-COLD slice-03 (the flush ownership split, stated in both features' rows) |
| Server-side storage idempotence: conditional put, dedup on `report_id`, quota-safe duplicate branch | F-TELL-US-WHAT-YOU-SAW-COLD slice-03 (07 §4.2 step 7, §4.4); this feature's slice-04 owns only the client re-sync observable |
| The reveal renderer and both outcome branches' copy (`compared`, `no_snapshot`) | F-TELL-US-WHAT-YOU-SAW-COLD slice-04 |
| The `push` event handler body, subscriptions, VAPID, notification copy, the threshold rule | F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE (lands additively at the named seat in this feature's SW file) |
| `/en/offline`, English A2HS hint, English manifest alternates | F-READ-IT-IN-YOUR-LANGUAGE |
| The absolute staleness stamp fix (raw ISO timestamp on the shipped surface) | Concurrent BUGFIX lane (Pre-requisite 1); this feature consumes the corrected stamp, never duplicates the fix |
| Offline photo queueing | Nowhere yet: photos are epic open question 4, deferred per f-tell Pre-requisite 9; `07-write-path.md` §9's abuse analysis is not done |
| Background Sync as a required mechanism | Never, until iOS support is verified in a research doc; §12 makes it progressive enhancement only |
| Share/OG caching | Nothing to do: WhatsApp's crawler fetches the OG assets, not the browser, so no SW row exists for them; the share surface is F-PASTE-THE-CALL-INTO-THE-GROUP's |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **Staleness stamp BUGFIX: the absolute stamp stops printing a raw ISO timestamp.** A concurrent lane owns this fix. Slice-02's upgrade script consumes the corrected absolute stamp as its input; shipping the "Viejo" flip on top of a raw ISO stamp would put a technical string on the Spanish surface (copy rule, project `CLAUDE.md`). | slice-02 | BUGFIX lane (concurrent) | in flight at workspace creation |
| 2 | **A queue to flush: f-tell slice-01** (durable IndexedDB commit at Mandar, sentinel probe). Its own former gate, the canonical enum tokens, closed 2026-08-09: `src/data/report-vocab.ts` is live and `strings.ts` indexes it. Also gates the second verbatim sentence of the `/sin-senal` copy and the queued-count box, which are only true once labels actually persist. | slice-03 (and the sentence-two/queue-box observables) | f-tell lane | pending |
| 3 | **An endpoint to flush to: f-tell slice-03** (write path deployed, background mint, submit-while-online), itself deploy-blocked on the account Lambda concurrency quota (`HANDOFF.md` §6 item 6, still unanswered for `andres-cli`) and the missing write stack (f-tell Pre-requisite 5). **And a reveal to render byte-equivalent: f-tell slice-04.** Flush logic, port-level tests and the backoff ladder are authorable without AWS; only the live send is blocked. | slice-03's live send; slice-04 | f-tell lane + Andres (quota, stack ownership) | open |
| 4 | **Two shipped gates assert `/sin-senal` is unbuilt** and fail the moment slice-01 lands: `scripts/page-weight-core.mjs` line 68 (`DECLARED_BUT_UNBUILT`) and `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts` line 88 (`DECLARED_BUT_UNBUILT_ROUTES`). The second file is keystone-owned test surface. Amendment is inside slice-01, strictly serial with the keystone lane on those two files, same convention f-tell slice-02 declared for the F-BILL guardrail files. | slice-01's landing (not its authoring) | this lane, serialized with the keystone lane | open, sequencing |
| 5 | **`Base.astro` head is a contended seam** shared with the REACH lane: f-paste slice-03's OG meta block lands first and alone (its row says so); this feature's registration snippet (slice-01) and manifest link plus theme-color (slice-05) serialize after it. | slice-01 and slice-05 head edits | cross-lane coordination | open, sequencing |
| 6 | **Two copy/asset gaps, recorded not invented.** (a) §12's report-screen-1 cache row says the offline-uncached branch lands on `/sin-senal` "with a line saying the report form needs one first online visit"; no such Spanish string exists in §10 or `strings.ts`. Recommendation: route through the cousin's crew channel with the other pending strings; until it exists `/sin-senal` renders without the line and the branch still lands there. (b) The 192/512 app icons do not exist (`public/` holds only `favicon.svg`); slice-05 derives them from the favicon mark, and Andres eyeballs the result. | (a) one slice-01 observable; (b) nothing, slice-05 creates them | Andres via the cousin's crew (a); slice-05 (b) | open |
| 7 | **Broken citation, flagged not repaired.** The flush-ownership seam is cited across the f-tell workspace as "`HANDOFF.md` §7 flush ownership", and §7 in both HANDOFF copies on disk (`/Users/andres/psb-signal/HANDOFF.md`, `/Users/andres/panama-surf/HANDOFF.md`) is "How Andres wants this run", with no flush content. The substantive split survives in the two feature files themselves (f-tell's slice-03 row and Out-of-scope rows; this file's slice-03 row). The citation correction is owed to whoever next edits the f-tell workspace, not silently made here. | nothing | doc correction owed, f-tell workspace | open, low priority |
| 8 | **The plan documents this epic's workspaces cite are unrecoverable.** `BUILD-ORDER.md` and `plan-cluster-*.md` are named as the source of the sibling workspace openings and of decisions D4, D5, D17, D20, D21 and the §2 contended-files table, but were never committed on any ref and exist nowhere on disk (verified against all refs, dangling objects and the filesystem, 2026-08-09). This workspace was therefore authored from the surviving evidence: the epic row, `application-architecture.md` §12/§10/§4, `07-write-path.md` §5, and the seam rows in the sibling deltas. If either document resurfaces, reconcile this plan against it before slice-01 DELIVER. | nothing mechanically; provenance risk | Andres / coordinator | open, flagged |
| 9 | **Two tracker edits owed outside this lane's file boundary.** (a) The epic row flip: `docs/epic/surfs-up-panama/epic-delta.md` line 49 must flip `pending` to `in-flight` and link the Feature cell to `docs/feature/f-works-with-no-signal/` in one atomic edit; `docs/epic/` is outside this lane's declared boundary. (b) The expectation charters directory `docs/product/expectations/f-works-with-no-signal/` at each slice's DISTILL open, same reason. | the epic tracker's accuracy; each slice's DISTILL open | coordinator (a); slice DISTILL opener (b) | open |

## Scaffold audit: what exists on disk today (verified 2026-08-09)

| Thing | State | Evidence |
|---|---|---|
| Service worker, registration, manifest, icons | absent | zero hits for `serviceWorker`/`sw.js`/`sw.ts`/`manifest` across `src/` and `public/`; `public/` holds only `favicon.svg` |
| `/sin-senal` page | absent | no `src/pages/sin-senal.astro`; `src/pages/` holds 404, index, manana, spots/[slug]/{index,ayer,reportar,reportado} |
| Offline, stale ("Viejo"), queued and A2HS strings | absent | `src/i18n/strings.ts` carries home, report-capture and spot strings only |
| `/sin-senal` route builder | absent | `src/i18n/routes.ts` has no offline path |
| Canonical wind/quality tokens | real | `src/data/report-vocab.ts`, indexed by `strings.ts` (f-tell Pre-requisite 1, closed 2026-08-09) |
| IndexedDB queue | absent (owned by f-tell slice-01) | no queue module anywhere under `src/` |
| Gates asserting this feature's absence | real, will fire | `scripts/page-weight-core.mjs:68`, `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts:88` |

One line: nothing of this feature exists in code; the design, the copy, the budgets and two of
its slice numbers were already settled elsewhere, and two shipped gates are waiting to notice it
land.

## Wave: DISTILL / [REF] Acceptance design

### [REF] Inherited commitments

| Origin | Commitment | DDD | Impact |
| --- | --- | --- | --- |
| DISCUSS decisions 25, 26 | Works on bad signal; cache the last forecast AND queue reports offline; server-side dedup on re-sync rather than client-side trust. | n/a | The read half (slices 01-02) and the write half (slices 03-04) are both this feature's, but capture is not: scenarios flush committed labels, they never create them. |
| application-architecture §12 | The per-route strategy table, the staleness rule ("truth lives in the document"), flush triggers, sentinel-probe honesty, PWA manifest, iOS push reality, Background Sync as progressive enhancement only. | n/a | Router-table rows are oracles verbatim; no scenario may depend on Background Sync; stale-copy scenarios assert the embedded `published_at`, never SW headers. |
| application-architecture §12 closure L4 + f-tell delta (plan note, Prefactoring) | This feature owns the SW file; the write-path row is network-only plus `Cache-Control: no-store`, fixed by contract; f-tell never edits the file. | n/a | The row ships in slice-01 before any write path exists; its RED proof is the router-table unit test plus the poisoned-fixture refusal (§9). |
| 07-write-path §5 | Byte-identical replay, mint-before-flush, backoff 30s×2^n plus jitter, delete on any 200, bursts are normal traffic. | n/a | slice-03/04 oracles come verbatim from 07 §5 and §4.4; no scenario invents a client-side "already sent" decision. |
| f-tell delta Out-of-scope rows | slice-03 = flush on reconnect; slice-04 = `queued_duplicate` re-sync observable. Pre-assigned, honoured. | n/a | Slice numbering here is fixed; renumbering would break the sibling workspace's written references. |
| HANDOFF §4 + nw-ui-quality-mandates | Classification at DISTILL open; visible slices carry U1-U7 rows and a U8 charter observation. | n/a | Classification table above; all five slices visible; charters owed at DISTILL open (Pre-requisite 9b). |
| application-architecture §4, §5, §6 | Byte ceilings: SW 3.0, `/sin-senal` 3, manifest+favicon 1.5, stamp 0.3, registration 0.2. | n/a | Ceiling checks enter slice requirement rows and run against built `dist/` output. |
| HANDOFF §1 (JIT rule) | Each slice's acceptance tests are written when that slice legally enters DISTILL, never earlier. | n/a | No `.feature` file, step definition or scaffold exists in this workspace; slice-01 is the first legal entrant. |

### [REF] JIT status

No acceptance test exists for this feature. That is correct, not a gap: the JIT rule keeps each
slice's tests absent until that slice enters DISTILL. Slice-01 is the first legal entrant and no
decision gates its scenario authoring; its landing (not authoring) is sequenced behind
Pre-requisites 4 and 5. Slices 01, 02 and 05 need zero AWS. The requirement checklist and the
RED-classification contract live under `docs/feature/f-works-with-no-signal/distill/`.
