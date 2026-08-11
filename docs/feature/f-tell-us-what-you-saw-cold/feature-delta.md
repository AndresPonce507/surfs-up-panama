<!-- des-feature-context-bootstrap: {"feature_id":"f-tell-us-what-you-saw-cold","intent":"A surfer walking off the beach answers three taps about what they actually saw, and only after that answer is locked in does the site show what it had predicted and how far off it was.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-tell-us-what-you-saw-cold

Intent: A surfer walking off the beach answers three taps about what they actually saw, and only after that answer is locked in does the site show what it had predicted and how far off it was.

Workspace opened 2026-08-09 from `plan-cluster-reporting.md` and `BUILD-ORDER.md`. This is the
DOCS-ONLY workspace creation: no acceptance test, no step definition, and no production code exists
for this feature yet. Each slice's tests are written Just In Time when that slice legally enters
DISTILL, per the project rule recorded in `HANDOFF.md` §1 (DISTILL row).

Arithmetic source, stated as required: `HANDOFF.md` §6 ("Known stale, low priority") records that
`07-write-path.md` §12 carries falsified worst-case arithmetic. Every dollar figure in this file
comes from the corrected `system-architecture.md` §6.1 and never from `07-write-path.md` §12.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer walking off Playa Venao opens the report screen, answers how big, how the wind was and how it was, taps Mandar, and the screen changes to a saved confirmation that carries no score, no forecast and no way back to the form. The label is on the phone for good before anything else happens. | pending | @walking_skeleton | Thinnest end-to-end vertical that proves the risky part, and it needs no server at all. `docs/DISCUSS-decisions.md` RESOLVED section states the build implication directly: the label must be captured and committed before screen two renders, and the reveal must never round-trip back to allow an edit. `domain-model.md` §7.1 carries that as a domain invariant and §10 records that no edit command exists on the SurfReport aggregate, so anchoring cannot re-enter through an API. `domain-model.md` §7.4 puts the durable local write BEFORE any network attempt, and `07-write-path.md` §2 draws the same order on the topology (commit to queue first, then POST), so the queue write belongs to capture, not to sync. That is why this slice is legal with zero AWS: `07-write-path.md` §5's offline sequence and `application-architecture.md` §10 already define a screen two with no reveal, "Guardado. Cuando vuelva la señal lo mandamos y te decimos cómo nos fue." `application-architecture.md` §8 L3 fixes the ordering as commit, then `history.replaceState`, then render, so Back lands on the spot page and never on an editable form. The IndexedDB sentinel probe ships here and not later, because `application-architecture.md` §12 states the rule as "no silent queue that drops labels", which is a property of the commit. Byte ceiling is `application-architecture.md` §4: 6 KB document plus 5 KB island on `/spots/{slug}/reportar`. The dependency-cruiser rule and the poisoned-fixture `dist/` grep gate over the report routes (`application-architecture.md` §9) land here, with the slice that first ships the island. The broken `/en/` alternate links in the scaffold (`ReportCapture.astro` line 44, `ReportShell.astro` line 32, against `HANDOFF.md` §6 item 3) are fixed here, the first slice that touches those components. Gated on Pre-requisite 1: `domain-model.md` §7.4 replays the queued record byte-identical, so a `band-placeholder-4` token written into the queue today becomes a schema-invalid POST the day the endpoint exists. |
| slice-02 | Nobody can deploy a write path that can run up a bill: before deploy, CI rejects a write Function URL that is not locked to the site origin, a report function without its reserved concurrency, a table that is not provisioned at the free tier, or a missing breaker alarm, naming what broke and why. | pending |  | Same reasoning the keystone used to put its own guardrail slice directly behind its skeleton (`docs/feature/daily-call-with-permanent-receipts/feature-delta.md`, Notes bullet 2): protection lands before the first deploy can happen. The mechanism already exists and is shipped, so this slice amends rather than invents. The amendments owed are enumerated in `07-write-path.md` §11 items 1 to 7: guardrail 6's assert moves from `AuthType: AWS_IAM` to `AuthType: NONE` plus exact-origin `AllowOrigins` on the four write URLs, guardrail 7 drops its per-IP rows and gains the 20 subscription writes per day device row, the table gains `BillingMode: PROVISIONED` 25/25, and four breaker alarms join the four existing ones for eight of ten free alarm metrics. Sizing is `system-architecture.md` §6.1's corrected arithmetic, never `07-write-path.md` §12 which `HANDOFF.md` §6 records as falsified: $14.30/mo report supremum at reserved concurrency 2, and because all four breakers share one SNS topic the correlated case is about $46/mo compute plus about $10/mo logs, about $56/mo all-in, past the $20 alarm. That is exactly why the assert has to precede the deploy. Runs with no AWS account: `HANDOFF.md` §1 records the keystone's shipped slice-02 passing real guardrail tests plus credential-free CDK synth in the default 9 of 9 local gate. Serial with the F-BILL infra lane on `infra/lib/guardrail-declarations.ts` and `infra/test/guardrails.test.ts` (`BUILD-ORDER.md` §2 contended-files table). |
| slice-03 | The saved report leaves the phone, lands on the server, and the surfer sees it arrive. Filing the same report twice stores it once. | pending | depends-on slice-02 | The first slice that creates a deployable write resource, so it comes after the gate. Contract is `07-write-path.md` §4.1 request body and §4.2 handler pipeline steps 1 to 8. Mint is inside this slice and is not its own slice: `07-write-path.md` §3 makes `X-Surf-Credential` mandatory on `/api/report` and states no user-visible step exists anywhere in minting, because the mint fires in the background while the user reads the forecast. A mint-only slice would deliver no observable at all. The device quota is inside this slice for a mechanical reason: `07-write-path.md` §4.2 step 7 puts the quota `ADD` and the report `PutItem` in one `TransactWriteItems`, so quota is not separable without rewriting the transaction. `predicted{}` resolution is inside this slice too, and this is not optional: `domain-model.md` §7.3 and §7.4 make the server attach `predicted{}` authoritatively at accept time, and §10 freezes it at commit with no edit command anywhere in the domain. A report stored before the §4.5 resolution exists would carry a permanently null `predicted{}` and could never be backfilled, the same un-repairable shape `HANDOFF.md` §3 argues about the prediction log. So the server resolves and stores; this slice just does not render the comparison yet. Screen two here shows an arrival state that makes no claim at all about forecast availability, which is why it cannot be false. Storage idempotence is the conditional put of `domain-model.md` §7.4, `attribute_not_exists(SK)`. Flush ownership, settled here rather than at dispatch (`HANDOFF.md` §7 lesson): this slice owns the submit-while-online path and `application-architecture.md` §12's page-open flush trigger, exactly enough to make its own value statement true. The `online` event, service worker activation and the backoff ladder belong to F-WORKS-WITH-NO-SIGNAL slice-03 and are named there. The three day-one trust fields (`received_at`, `credential_issued_at`, `trigger`) ship here because `07-write-path.md` §6 and §7.3 make retroactivity depend on them existing from the very first report. Blocked at deploy by Pre-requisites 2 and 5, and carries the `pub/v1/meta/spot-index.json` producer gap, Pre-requisite 6. |
| slice-04 | Only after the label is locked and sent does the site say what it had predicted: we said 82, chest to head, clean, you saw waist to chest, choppy, we were 14 too high. On the rare morning the builder was down and there is nothing to compare against, it says that plainly instead of inventing a number. | pending | depends-on slice-03 | The feature's headline promise, and the design makes it impossible to fake locally, which is why it must be its own slice. `application-architecture.md` §7's anti-leak payload contract forbids any forecast field in any payload delivered to the report route family, and `07-write-path.md` §2 states that no GET endpoint exists anywhere on the write path, so the reveal exists only as the POST response and an offline client cannot compute one by construction. This slice renders what slice-03 already stores: `07-write-path.md` §4.5 resolves the build live at `observed_at` from `log/calls/v1/dt=<date>/build=<HH>Z/` with `HH <= hour(observed_at)`, walking back at most 3 hours on a 404. Delta arithmetic is `07-write-path.md` §4.3, positive means we ran big, with `q_obs` anchors owned by `06-learning-layer.md` §8 in one constants file with two consumers. Copy fills are `application-architecture.md` §10 screen two compared line and the §14 wireframe. Both `outcome` branches ship together and that is deliberate: `no_snapshot` is defined by `07-write-path.md` §4.3 as no call logged for that hour (builder down), so it is only honest once the lookup exists and can genuinely miss. Its Spanish is settled in `application-architecture.md` §10, "Gracias. Esa hora no la teníamos pronosticada, así que no hay comparación." Shipping that sentence any earlier would say something false, which research 09 §14.4 forbids outright. `domain-model.md` §15 item 4 requires the `predicted: null` path to be in the acceptance tests, a DISTILL obligation for this slice. The report counter line lands here too, because `application-architecture.md` §7 P3 carries `counter` in every outcome and §10 pairs it with the reveal, "Reporte {n} de {threshold} en este spot. Gracias."; the write is `07-write-path.md` §4.2 step 8's `ADD` on `(SPOT#, COUNTER)`. The scorecard headline stays in F-SHOW-OUR-TRACK-RECORD per the keystone Out-of-scope table. Its input already exists in production: `HANDOFF.md` §1 records keystone slice-01 shipped, and `domain-model.md` §6 is the PublishedCall log the build writes. |
| slice-05 | A phone with a badly wrong clock is told plainly why its report was refused and keeps the label on screen, instead of the report vanishing without a word. | pending | depends-on slice-03 | The honest-failure half of the capture, and the only failure branch in this feature that can silently destroy a label. `07-write-path.md` §4.2 step 5 rejects `observed_at` outside `received_at - 12 h 15 m` to `received_at + 15 m` and returns 400 `observed_at_out_of_range` carrying both bounds and the server time so the client can correct. `application-architecture.md` §7 P2 states the client obligation: a 4xx other than 401 and 429 shows the reason, keeps the label locally, and never silently drops, with no mechanical retry because the record will not become valid by waiting. `07-write-path.md` "What I am unsure about" item 7 names the residual cost outright: a badly wrong clock loses the report and the label cannot be salvaged server side without trusting a clock we know lies. This slice ships the observable half of that so a lost label is always explained. It deliberately adds no control that lets a surfer pick a time: `domain-model.md` §7.3 says `observed_at` is adjustable back up to 12 hours, but no such control exists in `application-architecture.md` §10 screen one copy or the §14 wireframe, and inventing one would be inventing product. See Pre-requisite 9 (D19). |

Notes on the plan:

- Row order is dependency order, backward only. An empty Annotation cell is parallel-safe once the
  rows above it have landed. Same convention as the keystone.
- slice-01 is deliberately server-free. The anti-anchoring invariant is a client property, so it is
  provable without a single AWS resource, and it stays provable while Pre-requisite 2 (the Lambda
  quota) is unanswered.
- No slice fakes screen two, and no slice ships a sentence that is not true at the moment it ships.
  `application-architecture.md` §7's anti-leak payload contract makes a locally computed reveal
  impossible, so screen one plus a mocked screen two is not a legal slice pair. Screen two is
  slice-01's queued variant, slice-03's arrival state, or slice-04's reveal. The `no_snapshot`
  sentence is held back to slice-04 on purpose: the keystone's build is shipped and writes
  `log/calls/v1` hourly, so shipping that sentence before the §4.5 lookup exists would tell a
  surfer we had no forecast when we did.
- Sizing release valve, declared not taken. If slice-03 trips the 3 to 7 scenario ceiling, the
  counter is the piece to pull out. `07-write-path.md` §4.2 step 8 is a separate non-transactional
  `ADD` whose declared failure behaviour is a one-directional display-only undercount, so the
  counter is a legal standalone slice. Step 7's transaction is not separable.
- Photos are not in any slice. Epic open question 4 is unresolved and `07-write-path.md` §9 states
  outright, in bold, that the full abuse re-analysis of the upload surface is not done. Recorded in
  Pre-requisite 9 with a recommendation to defer; not decided here.
- Identity claim and merge are not in any slice, and that is settled rather than missing:
  `domain-model.md` §8 says the claim flow ships later and the schema ships now.
- The trust gate ships at zero and is invisible. `07-write-path.md` §7.3 states plainly that nobody
  sees that line at launch. It is not a slice, it is a config file value shipped with slice-03.
- One cross-feature seam, settled in writing before any parallel dispatch (`HANDOFF.md` §7 lesson):
  the service worker file is owned by F-WORKS-WITH-NO-SIGNAL, and its router table's write-path row
  is fixed as network-only plus `Cache-Control: no-store` (`application-architecture.md` §12,
  closure L4). This feature depends on that row and never edits that file.

## Wave: DISCUSS / [REF] Slice classification

Required at DISTILL open per `HANDOFF.md` §4 (classify every slice as user-visible or non-visual),
recorded now so it is not invented later. Charters live under
`docs/product/expectations/f-tell-us-what-you-saw-cold/`.

| Slice | Classification | Note |
|---|---|---|
| slice-01 | user-visible | Screen one and the saved confirmation are the whole slice. U1 to U7 checks plus a U8 observation apply, at 390 px, both themes, reduced motion aware |
| slice-02 | non-visual | Creates no rendered surface. UI N/A rationale: this slice changes only CDK declarations and the CI guardrail assertions over them, and emits no HTML. Fabricating pixel checks here would be dishonest. Its charter examines the terminal output of the gate |
| slice-03 | user-visible | Screen two's arrival state is rendered |
| slice-04 | user-visible | The reveal card and the counter line are the most-read surface this feature produces |
| slice-05 | user-visible | The refusal message is a rendered state on screen two |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | The epic promise is walkable end to end: three taps, label locked on the phone, then and only then the reveal, with the signed delta per `07-write-path.md` §4.3 (positive means we ran big) and the counter line per decision 19. |
| 2 | The label is durable before any network attempt: full record plus fresh client-minted ULID `report_id` committed to IndexedDB at Mandar, sentinel probe proven, no silent queue that drops labels (`domain-model.md` §7.4, `application-architecture.md` §12). |
| 3 | The anti-anchoring closure is structural and CI-enforced: leak paths L1 to L4 closed per `application-architecture.md` §8, dependency-cruiser rule plus `dist/` grep gate over the report routes proven against one deliberately poisoned fixture (`application-architecture.md` §9, `adr-report-flow-leak-isolation.md`). |
| 4 | Filing the same report twice stores it once: conditional put on `attribute_not_exists(SK)`, dedup key `report_id` alone, quota untouched on the duplicate branch (`07-write-path.md` §4.2 step 7, §4.4). |
| 5 | The server attaches `predicted{}` authoritatively at accept time from `log/calls/v1`, and the `predicted: null` path is in the acceptance tests (`07-write-path.md` §4.5, `domain-model.md` §15 item 4). |
| 6 | Both reveal branches are honest: `compared` renders the stored comparison, `no_snapshot` says plainly there is nothing to compare and never fabricates (research 09 §14.4). |
| 7 | The clock refusal is observable: 400 `observed_at_out_of_range` shows the reason, keeps the label on screen, and triggers no mechanical retry (`07-write-path.md` §4.2 step 5, `application-architecture.md` §7 P2). 429 is never an error state in the UI. |
| 8 | The write-path guardrail amendments of `07-write-path.md` §11 items 1 to 7 are asserted in CI, demonstrated red once, credential-free, before any deploy. Sizing asserted from `system-architecture.md` §6.1. |
| 9 | The canonical wind and quality enum tokens live in one constants file consumed by capture form, display and wire contract; zero placeholder tokens exist in any committed record (Pre-requisite 1). |
| 10 | Byte ceilings hold: `/spots/{slug}/reportar` 6 KB document plus 5 KB island, `/spots/{slug}/reportado` 4 KB (`application-architecture.md` §4, §6). |
| 11 | Every Slice Plan row above is flipped `shipped`. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Flush on reconnect: `online` event, service worker activation, backoff ladder | F-WORKS-WITH-NO-SIGNAL slice-03 (`HANDOFF.md` §7 flush ownership, stated in both rows) |
| `queued_duplicate` re-sync observable (byte-equivalent reveal on retry) | F-WORKS-WITH-NO-SIGNAL slice-04; storage idempotence itself ships here in slice-03 |
| Service worker, `/sin-senal`, PWA install, read cache | F-WORKS-WITH-NO-SIGNAL |
| Photos, `/api/photo-url`, presign quota, resize pipeline | Epic open question 4; Pre-requisite 9 recommends defer, `07-write-path.md` §9 abuse analysis not done |
| Scorecard headline and track record | F-SHOW-OUR-TRACK-RECORD |
| $18 budget deny action, dead-man's switch observable | F-BILL-STAYS-ZERO-AND-STAYS-UP |
| Web push, subscriptions, solicitation follow-up | F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE |
| English routes and copy (`/en/` tree, English report CTA placeholder in `strings.ts` line 116) | F-READ-IT-IN-YOUR-LANGUAGE |
| Identity claim and merge | Later per `domain-model.md` §8; the schema and the three day-one fields ship in slice-03 |
| Trust gate active values | Not a slice; config shipped at zero with slice-03 (`07-write-path.md` §7.3) |
| A control to say when you surfed | Pre-requisite 9 (D19); recommendation is always-now at launch, server window stays open |

## Wave: DISCUSS / [REF] Pre-requisites

Row 1 gates the first slice and is the decision that must be settled first. Rows 2 to 5 are the
externally blocked items, recorded accurately: what each actually blocks and what proceeds anyway.

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **Canonical wind and quality enum tokens.** The two documents that name words disagree: `05-scoring-engine.md` §7 (line 498) defines `windWord` as `clean` at or above 0.75, `bumpy` at or above 0.40, else `choppy`, and claims C2 is its single source; `application-architecture.md` §10 Q2 gives the form's options as Limpio, Picado, Destrozado, which is `clean, choppy, blown_out`. So `choppy` is the WORST bucket in the scoring engine and the MIDDLE bucket in the report form, and both words meet on the same reveal card (`application-architecture.md` §14). `domain-model.md` §7.3 shows only `"wind":"clean"` and enumerates nothing. Same gap for quality: §10 Q3 is Malo, Normal, Bueno, Épico; `06-learning-layer.md` anchors "OK 45"; no token spelling exists for the middle bucket. The shipped code has already voted: `src/pipeline/build.ts` lines 80 and 233 to 236 emit `clean, choppy, blown_out` and line 252 maps them to limpio, picado, destrozado, so the scoring document is the stale one. This gates slice-01, not a later slice, because `domain-model.md` §7.4 replays the queued record byte-identical: a placeholder token written into IndexedDB today becomes a schema-invalid POST the day the endpoint exists. **Recommendation: canon is `clean | choppy | blown_out` and `bad | ok | good | epic`**; `05-scoring-engine.md`'s `windWord` renames `bumpy` to `choppy` and `choppy` to `blown_out`, ordering and thresholds untouched, every settled Spanish string unchanged, and 05's own claim that C2 is the single source becomes true. | slice-01 (and everything after it) | Andres | open |
| 2 | **Account Lambda concurrency quota** (`HANDOFF.md` §6 item 6). If the applied quota is at or under 102, `PutFunctionConcurrency` is rejected: reserved concurrency (control 0.2) and the circuit breakers (control 0.6) do not exist (`07-write-path.md` §7.2 item 0.15), and the whole cost bound of `system-architecture.md` §6.1 collapses (research 15's worked case at quota 50 is about $130/mo). Verified unanswered this session, 2026-08-09: `aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384 --region us-east-1` returns AccessDeniedException for `arn:aws:iam::602167897909:user/andres-cli` (no `servicequotas:GetServiceQuota` in its policy). Deploying the write path without the answer is the one action in this feature that can produce a real bill. | Deploy of slices 03, 04, 05. NOT the build: handler authoring, port-level tests, CDK declarations and credential-free synth all proceed, and slices 01 and 02 are entirely unblocked | Andres (console or a policy grant for andres-cli) | open |
| 3 | **Whether AWS meters egress for a 429 emitted before the function runs** (`HANDOFF.md` §6 item 7). No read-only command answers it; it needs a load test against a deployed Function URL plus a Cost Explorer read (`07-write-path.md` D4). `07-write-path.md` §12 names it as the one open question that can produce a large bill (potentially hundreds); the pessimistic bound still favours bare Function URLs 40 times over CloudFront-fronted writes, and tier 4 (delete the Function URL config) is the working control until verified. | No slice. Blocks the $0 claim and whether tier 4 stays a real runbook step or becomes theory. Launch-checklist action, not a slice | Andres, post first deploy | open |
| 4 | **DynamoDB 25 WCU/RCU perpetuity, marked UNVERIFIED** (`HANDOFF.md` §6 item 8). $0 if perpetual, about $14.24/mo from month 13 if not. Changes cost, not behavior: the table is provisioned 25/25 either way (`adr-write-store-provisioned-capacity.md`), and slice-02's `BillingMode: PROVISIONED` assert is correct regardless of the answer. | No slice. Blocks the "$0.00 permanently" claim in the epic's operator persona, an epic-level honesty item | Andres | open |
| 5 | **Zero CloudFormation stacks are deployed and nobody owns building the four real CDK stacks** (BUILD-ORDER D4). `system-architecture.md` §11 names `site-stack`, `ingest-stack`, `write-stack`, `observability-stack`. On disk, `infra/lib/` holds placeholder declaration constants for site, ingest and observability, and no write-stack file exists at all (verified 2026-08-09). BUILD-ORDER D4 recommends option (b): the write-stack ships inside this feature's slice-03, matching the standing rule that values ship with the resource, with one named owner for site and ingest before the first deploy. Ownership is not settled; recorded as a gap, not decided here. | First deploy of slice-03 onward | Andres names the owner | open, ownership gap |
| 6 | **`pub/v1/meta/spot-index.json` has a consumer and no producer slice.** Consumer: `07-write-path.md` §4.5 (S3 key construction, geohash4 tile) and §4.2 step 4 (spot validation, so junk-spot writes never reach the table). Producer: owed by the site builder per `07-write-path.md` §11 item 10, about 1 KB, one PUT per build. It appears in none of the keystone's Slice Plan rows. Either slice-03 crosses into the keystone-owned builder (`src/pipeline/build.ts`), or a keystone/builder-lane task adds it. BUILD-ORDER D21 recommends the builder lane lands it before slice-03; that is a scheduling call for whoever owns the keystone. | slice-03 | keystone/builder lane, pending assignment | open, ownership gap |
| 7 | **Epic open question C3 is not formally closed: anonymous reporting versus auth-gated rate limiting.** Research 08 §10.4 builds free rate limiting on the write path being auth-gated; decision 11 makes reporting anonymous. The substantive resolution exists: `07-write-path.md` §7.3 separates accepted-and-displayed from counts-toward-learning, and `adr-anonymous-credential-trust-tiers.md` records the mechanism (server-countersigned credential, signed age, trust gate at zero). But that ADR's Status is **Proposed**, not Accepted. The design residual is Pre-requisite 2 and nothing else; the paperwork residual is flipping the ADR status before slice-03 DISTILL leans on it. | slice-03 scenario authoring leans on the ADR; flag, not a build blocker | Andres or DESIGN owner accepts the ADR | open |
| 8 | **Two missing Spanish strings for slice-01, plus one shipping-copy question** (BUILD-ORDER D20). (a) `application-architecture.md` §12 requires that when the IndexedDB probe fails the island "says so plainly and falls back to submit-only-with-signal"; no such string exists in §10 or §14. Blocks the probe-refusal observable of slice-01. (b) §14 screen one carries "Nota: aquí no te mostramos el pronóstico. Primero lo tuyo, después el nuestro." in the wireframe but not in §10's copy list, and the scaffold does not render it; whether it is shipping copy is unanswered. Recommendation: route both through the cousin's crew channel the keystone already opened (its Pre-requisite row 3), fallback neutral phrasing per the plan. Inventing product copy is out of scope here. | slice-01's probe-refusal oracle and the screen-one note | Andres via the cousin's crew | open |
| 9 | **Two product decisions recorded, not made.** (a) Photos in the launch report flow (epic open question 4, BUILD-ORDER D5): `07-write-path.md` §9 prices the presigned PUT as the most expensive grant in the system and states in bold that the research-15-grade abuse re-analysis is NOT done; the §14 screen-two wireframe shows a photo prompt. Recommendation: defer entirely, keep `photo_ids: []` on the record; `domain-model.md` §10 makes `AttachPhoto` append-only so adding photos later is purely additive. (b) Whether a surfer can say when they surfed (BUILD-ORDER D19): recommendation always-now at launch, no fourth control, the server window already accepts back-dated values so nothing is foreclosed. Slice-05 as planned assumes (b)'s recommendation. Neither is decided in this file. | (a) blocks nothing while deferred; (b) blocks nothing if the recommendation holds | Andres | open |
| 10 | **Stale references, named so nobody trips on them.** The HANDOFF copy in this worktree (21143 bytes) is an older version; the authority is `/Users/andres/panama-surf/HANDOFF.md` (29525 bytes, rewritten 2026-08-09), which ends at §9 (Slice-04 pause point). The workspace dispatch cited a HANDOFF "section 10" that exists in neither copy on disk as of 2026-08-09; every HANDOFF citation in this file was verified against the authoritative copy (§3, §4, §6 items 6 to 8, §7). `07-write-path.md` §12 arithmetic is falsified per `HANDOFF.md` §6; `system-architecture.md` §6 layer 6's 2 KB report cap is stale against `07-write-path.md` §4.2's 4 KB (07 owns its own contract); `domain-model.md` §7.4's duplicate response `{status:"duplicate"}` is stale against `07-write-path.md` §4.3's `queued_duplicate` (`application-architecture.md` §7 names 07 the wire SSOT). | nothing; carried so the next agent does not rediscover them | doc corrections owed per BUILD-ORDER §5 | open, low priority |

### Scaffold audit: what is real and what is placeholder (verified on disk 2026-08-09)

Real:

| Thing | Evidence |
|---|---|
| Two static routes, one page per launch spot | `src/pages/spots/[slug]/reportar.astro` and `reportado.astro` lines 8 to 11 build `getStaticPaths` from `region.spots` |
| Forecast-free import discipline, the L1 closure | `src/components/ReportCapture.astro` imports only region identity, `size-bands`, `strings`, `routes`; `ReportShell.astro` the same minus size bands; neither touches `src/data/forecast` (`application-architecture.md` §8 L1) |
| The constraint written into the source as a comment | `ReportCapture.astro` lines 2 to 16, `ReportShell.astro` lines 2 to 9 |
| Screen one's three questions and all 14 option labels, verbatim Spanish | `ReportCapture.astro` lines 47 to 82: 7 size, 3 wind, 4 quality radios, matching `application-architecture.md` §10 and §14 word for word |
| The `<noscript>` copy | `ReportCapture.astro` lines 83 to 85, `strings.ts` line 79, verbatim from §10 |
| Screen two is a real forecast-free shell with an island mount point | `ReportShell.astro` line 34, `<main data-reveal-shell>` |
| The entry point already links here | `src/components/SpotDetail.astro` line 61, CTA `¿ESTUVISTE? CUÉNTANOS` |
| Route spellings match the settled route map | `src/i18n/routes.ts` against `application-architecture.md` §4 |

Placeholder or absent:

| Thing | Evidence |
|---|---|
| Every enum value token | `src/data/size-bands.ts` lines 17 to 43 emit `band-placeholder-1..7`; `src/i18n/strings.ts` lines 66 to 77 emit `wind-placeholder-1..3` and `quality-placeholder-1..4`; both headers say the canonical tokens must replace them before any report submits |
| Nothing submits | `ReportCapture.astro` line 81: the button is `disabled`; the form has no action and no method |
| No report island exists at all | `ReportCapture.astro` lines 35 to 37 say so; `application-architecture.md` §6 budgets it at 5.0 KB gz |
| No `report_id` minting, no IndexedDB, no queue, no POST, no credential, no `/api/mint` call | No such module anywhere under `src/` |
| Screen two renders nothing | `ReportShell.astro` line 34 is an empty `<main>`; no reveal renderer exists |
| The back-stack closure (commit, `history.replaceState`, render) is undelivered | No JS exists on either route |
| The wireframe's cold-capture note is not rendered | `application-architecture.md` §14 screen one note; `ReportCapture.astro` renders no such line (Pre-requisite 8b) |
| Broken alternate links in the emitted HTML | `ReportCapture.astro` line 44 and `ReportShell.astro` line 32 pass `altPath` into the removed `/en/` tree (`HANDOFF.md` §6 item 3); fixed in slice-01 |
| No write path exists server-side | No handler module, no write-stack in `infra/lib/` (see Pre-requisite 5) |

One line: the routes, the copy and the anti-anchoring import discipline are real. The label
capture, the commit, the network, the reveal and the enum tokens are not.

## Wave: DISTILL / [REF] Acceptance design

### [REF] Inherited commitments

| Origin | Commitment | DDD | Impact |
| --- | --- | --- | --- |
| DISCUSS decision 28 + RESOLVED anchoring section | The label commits before the reveal renders, and the reveal never round-trips back to allow an edit. The "Known cost" note stands: cold absolute capture is noisier and the learning layer budgets a per-reporter bias term; the decision is not reopened here. | n/a | Every user-visible slice's charter carries a negative observation for the forecast leak; screen-one scenarios may never receive forecast data; no scenario may exercise an edit path because none exists in the domain. |
| DISCUSS decisions 4, 9, 11 | Three taps, no photo required, photos optional after, anonymous with zero friction. | n/a | No login step in any scenario; mint is background-only and never user-visible (07 §3); photo scenarios are absent until epic open question 4 is decided. |
| domain-model §7.4 + adr-report-label-immutability | Durable local commit before any network attempt; retry re-sends the byte-identical record; no edit command exists on SurfReport. | n/a | slice-01 is provable with zero AWS; placeholder enum tokens are forbidden in any committed record, which is why Pre-requisite 1 gates slice-01 scenario authoring. |
| 07-write-path §2 + adr-report-flow-leak-isolation | No GET endpoint exists on the write path; the reveal is the POST response and nothing else. | n/a | No scenario may fetch, prefetch or cache a reveal URL; the offline reveal is structurally impossible and the queued variant is the honest screen two. |
| 07-write-path §4.1 to §4.5 (wire SSOT per application-architecture §7) | Request, pipeline, response and dedup contracts, including `queued_duplicate` with the original reveal. | n/a | slice-03, 04 and 05 oracles come verbatim from 07; domain-model §7.4's `{status:"duplicate"}` sentence is stale and must not be tested. |
| domain-model §15 item 4 | The `predicted: null` path must be in the acceptance tests. | n/a | slice-04 ships both outcome branches together, `compared` and `no_snapshot`. |
| HANDOFF §6 known-stale note + system-architecture §6.1 | Worst-case arithmetic comes from §6.1; 07 §12 is falsified. | n/a | slice-02 asserts reserved concurrency, provisioned billing and breaker alarms against §6.1's figures, never 07 §12's. |
| HANDOFF §4 + nw-ui-quality-mandates | Slice classification at DISTILL open; visible slices carry U1-U7 rows and a U8 charter observation; non-visual slices record an N/A rationale. | n/a | Classification table above; slice-02 carries the honest N/A rationale; charters exist for all five slices. |
| application-architecture §4, §6 | Byte ceilings: reportar 6 KB plus 5 KB island, reportado 4 KB. | n/a | Ceiling checks enter the slice-01 requirement rows and run against the built dist output. |
| HANDOFF §1 DISTILL row (JIT rule) | Each slice's acceptance tests are written when that slice legally enters DISTILL, never earlier. | n/a | No `.feature` file, step definition or scaffold exists in this workspace; slice-01 is first, gated on Pre-requisite 1. |

### [REF] JIT status

No acceptance test exists for this feature. That is correct, not a gap: the project's JIT rule
(`HANDOFF.md` §1) requires each slice's tests to remain absent until that slice enters DISTILL.
slice-01 is the first legal entrant and its scenario authoring is gated on exactly one decision,
Pre-requisite 1 (enum tokens). The requirement checklist and the RED-classification contract live
under `docs/feature/f-tell-us-what-you-saw-cold/distill/`.

## Reuse Analysis

| Existing Component | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Report screen 1 route + component | `src/pages/spots/[slug]/reportar.astro`, `src/components/ReportCapture.astro` | **bounded-change**: real route, settled copy, forecast-free import discipline already in place; the delta is the island mount, the canonical tokens, the note line if it is shipping copy, and the `/en/` altPath fix | EXTEND | The scaffold is the settled screen one. Rebuilding it would discard verbatim copy and the L1 closure already encoded in its import list |
| Report screen 2 shell | `src/pages/spots/[slug]/reportado.astro`, `src/components/ReportShell.astro` | **bounded-change**: `<main data-reveal-shell>` is the declared island mount; the shell stays forecast-free | EXTEND | The reveal renders from the POST response into this mount; the static document never gains a forecast field |
| Size band vocabulary | `src/data/size-bands.ts` | **bounded-change**: replace `band-placeholder-*` values with the canonical `domain-model.md` §7.2 tokens; labels stay verbatim | EXTEND | This module is the frontend side of the one canonical constants file; only the tokens are wrong |
| Wind and quality options | `src/i18n/strings.ts` | **bounded-change**: replace `wind-placeholder-*` and `quality-placeholder-*` after Pre-requisite 1; Spanish labels stay verbatim | EXTEND | The labels are settled §10 copy; the tokens await the canon decision |
| Route map | `src/i18n/routes.ts` | none: spellings already match `application-architecture.md` §4 | REUSE | Nothing to change |
| Spot page CTA | `src/components/SpotDetail.astro` line 61 | none for this feature: the link exists at scaffold grade, so slice-01 is reachable today | REUSE | Keystone slice-06 upgrades the page around it |
| Report island | none, does not exist | n/a | CREATE_NEW | `application-architecture.md` §6 budgets 5.0 KB gz: capture, ULID mint, IndexedDB commit with sentinel probe, POST, reveal render. The one new client component this feature ships |
| Write path handlers + write-stack | none, do not exist (`infra/lib/` has no write-stack; verified 2026-08-09) | n/a | CREATE_NEW | `07-write-path.md` §10's contract shapes: pure `decide_report`/`decide_mint` cores, bounded-change store adapters with startup probes; ownership of the stack per Pre-requisite 5 |
| Infra guardrail suite + local CI job | `infra/lib/guardrail-declarations.ts`, `infra/test/guardrails.test.ts`, `scripts/ci-local.mjs` | **bounded-change**: slice-02 amends asserts per `07-write-path.md` §11 items 1 to 7; the runner and evaluator entry are production-owned and shipped | EXTEND | The keystone's slice-02 already proved this surface green with credential-free synth; this feature amends the assert population, strictly serial with the F-BILL lane per BUILD-ORDER §2 |

## Prefactoring Assessment

**NONE, justified.** The scaffold routes and components take their deltas in place, and the two
genuinely new pieces (the report island, the write path with its stack) are new components, not
reshapes of existing behavior. No existing component needs a flag, a second execution path or a
special case to receive this work. The one cross-lane seam that could have argued for preparatory
work, the service worker router table's write-path row, is owned by F-WORKS-WITH-NO-SIGNAL and is
settled by contract (network-only, `no-store`) rather than by touching a file that does not exist
yet.

## Test Reuse & Consolidation Analysis

| Existing Test/DSL-Step | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Keystone browser journey | `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | Reading routes only | DO NOT EXTEND | This feature's flow starts where the reading surface ends. Its own slice-01 journey walks reportar, commit and confirmation; folding that into the keystone's journey would couple two features' RED states |
| UI quality gate | `scripts/check-ui-quality.mjs` | U1 to U7 mechanics | REUSE | Feature-level fixture reuse is the HANDOFF §4 rule; each visible slice proves its own affected states, viewport, targets, motion, tokens and contrast against the real backdrop |
| Infra guardrail acceptance pattern | `tests/acceptance/daily-call-with-permanent-receipts/infrastructure-guardrails.feature` + `runLocalCi` entry | Production-owned in-process CI driving, declaration-only fixtures, WHAT/WHY/HOW oracles | PATTERN REUSE | slice-02 writes its own scenarios in this feature's own test directory against the same production entry, amended assert population per 07 §11 |
| Anti-leak gate + poisoned fixture | none, does not exist | n/a | CREATE_NEW | `application-architecture.md` §9: dist grep over the report routes plus dependency-cruiser rule, proven against one deliberately poisoned fixture at gate-authoring time. Belongs to slice-01, the slice that first ships the island |

## Wave: DISTILL / [REF] Slice-03 through Slice-05 acceptance mapping

### [REF] Scenarios

| Slice | Contract | Tags | Tier |
| --- | --- | --- | --- |
| slice-03 | A surfer sends a saved report and sees it arrive | `@walking_skeleton @driving_port @real-io @requires_external` | A |
| slice-03 | Repeated send, real-handler quota deferral, real-handler unknown beach, page-open send | `@error @real-io @requires_external` | A |
| slice-04 | A surfer sees how the call did after sending their label | `@walking_skeleton @driving_port @real-io @requires_external` | A |
| slice-04 | No call to compare; direct visitor receives no comparison | `@error @real-io @requires_external` | A |
| slice-05 | A wrong phone clock keeps the label and explains itself | `@walking_skeleton @driving_port @real-io @requires_external @error` | A |
| slice-05 | Refusal does not retry; corrected clock recovers | `@error @real-io @requires_external` | A |

### [REF] Walking-skeleton and adapter strategy

Production report page plus the real write handler is the Tier-A driving surface. The report
store, published-call lookup and spot-index lookup use their production adapters. The browser
clock is controlled only to make the wrong-clock example reproducible. No endpoint, response or
prediction lookup is faked. Tier B is intentionally absent: these are real-I/O journeys, and the
state-rich exploration belongs in the handler's layer-1 or layer-2 unit suite once its production
composition exists.

### [REF] Scaffolds and placement

`report-arrives-once.feature`, `the-call-is-revealed-only-after-arrival.feature`,
`a-wrong-clock-keeps-the-label.feature`, and `steps/report-arrival-and-reveal.steps.ts` are
RED-ready Tier-A scaffolds under the existing feature-nested acceptance tree. Their assertion
message names the real missing driving surface rather than creating an import failure. The
project-wide TypeScript state-delta port is now `tests/common/state_delta.ts`.

### [REF] External prerequisites

`REPORT_ACCEPTANCE_ORIGIN` must name the production page connected to the real report handler.
Before deploy evidence, the account concurrency quota, write-stack owner and spot-index producer
(Pre-requisites 2, 5 and 6) need recorded resolution. These tests do not deploy and do not use a
fake endpoint. The missing journey is active RED, not a substitute for those decisions.

The real call and real no-call launch examples additionally require their respective published
artifact environments. Those two `@indeterminate` launch proofs stay INDETERMINATE until supplied;
the contracts do not fabricate them. Duplicate, unknown-beach and quota cases instead use the real
public handler with a browser-created durable record, because the page properly has no control for
those invalid inputs.

### [REF] Traceability fallback

The legacy `discuss/user-stories.md`, `discuss/story-map.md` and `devops/environments.yaml` files
are absent. For this feature, the accepted `DISCUSS / [REF] Slice Plan` above is the authoritative
replacement: its slice-03 row maps to `@covers-R19` through `@covers-R26`, slice-04 maps to
`@covers-R27` through `@covers-R33`, and slice-05 maps to `@covers-R34` through `@covers-R37`.
The requirement checklist maps the feature-wide anti-leak and UI rows. The generic legacy
environments (`clean`, `with-pre-commit`, `with-stale-config`) do not alter a surfer's report
journey, so each walking skeleton instead requires the one relevant environment: a real report
page, real handler and real store supplied at `REPORT_ACCEPTANCE_ORIGIN`. Source-tree hooks and
stale developer configuration remain CI concerns, not report-journey fixtures.
