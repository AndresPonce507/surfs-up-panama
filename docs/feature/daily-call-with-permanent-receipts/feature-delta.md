<!-- des-feature-context-bootstrap: {"feature_id":"daily-call-with-permanent-receipts","intent":"A surfer opens the site at 5:40am and sees today's twenty Pacific spots ranked, with the top one called out and a plain-language reason in Spanish. The next morning, yesterday's numbers are still readable, unchanged, in an append-only archive.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: daily-call-with-permanent-receipts

Intent: A surfer opens the site at 5:40am and sees today's twenty Pacific spots ranked, with the top one called out and a plain-language reason in Spanish. The next morning, yesterday's numbers are still readable, unchanged, in an append-only archive.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer opens the site and sees one real spot with today's score and its call in Spanish, computed from this morning's actual model data. The next morning, they open that spot's yesterday page in the browser and read exactly what the site said the day before, unchanged. | pending | @walking_skeleton | Thinnest end-to-end vertical: fetched, snapshotted permanently, scored, rendered, and re-readable the next day. The prediction log write is the run's first durable side effect (HANDOFF §3, 04-ingest §3 steps 4 and 7) and cannot be added later. All four Open-Meteo wave members (`ncep_gfswave016`, `ncep_gfswave025`, `meteofrance_wave`, `dwd_gwam`) are fetched and snapshotted from day one, one log row per member per valid hour per domain-model §5 (Andres, 2026-08-08): the log cannot be backfilled, per-source skill comparison is its whole point, and the members arrive in the same API call at zero cost. Scoring in this slice runs from the settled input-space blend of the usable members (05 §3.3, `adr-scoring-member-blend`), not from a single named member: deliberate, because the blend is a small ADR'd pure function while a one-member selection path exists nowhere in the design, and it keeps the skeleton's displayed number identical in kind to every later slice. The yesterday surface is a public page rendered from the published call log (`log/calls/v1`, domain-model §6), kept inside this slice, not split out (Andres, 2026-08-08): the build already writes that log (04 §3 step 10), and rendering one more static page for one spot from the previous day's file is a template plus one read, while the promise it proves is the keystone's reason to exist: the accuracy scorecard, the product's differentiator, becomes checkable instead of asserted only when anyone can read in a browser that we said 74 yesterday. The raw prediction log stays private: four members per lead hour feeds the learning loop, not human eyes. One spot, physics only (research 09 §7 via 05), correction hook wired and inert: no file, gate `no_file`, `Q_final = Q` exactly (05 §5, law L8). Thin value accepted. |
| slice-02 | Nobody can quietly destroy yesterday's receipts or unbound the bill: an infra change that would expire or touch the prediction log, or drop a cost guardrail value, fails CI loudly, naming what broke and why. | pending |  |  |
| slice-03 | A surfer sees today's twenty Pacific spots ranked best first on the home page, in Spanish, and the order actually changes when the swell does. The spot list is a seed data file: adding a spot is a data edit, not code. | pending |  |  |
| slice-04 | The top spot is unmistakably the call: an oversized card names it and gives a plain-language reason in Spanish a surfer can repeat to a friend without looking back at the screen. | pending | depends-on slice-03 | The call card is the top row of the ranked list slice-03 renders: same page surface, and there is no best spot to call until every spot is scored and ranked. |
| slice-05 | A surfer flips to Mañana and gets tomorrow's own ranking with tomorrow's own numbers, and the site says plainly that past tomorrow it will not pretend to know. | pending |  |  |
| slice-06 | A surfer taps any spot and gets that spot's own page: today's and tomorrow's numbers, size in body-height words with metre ranges beside them, and the best window to go. | pending |  |  |
| slice-07 | Every ranked row carries a confidence level with the reason one tap away, in plain Spanish: how far the models agree, and whether anyone has confirmed conditions from the beach. The level never claims more certainty than the data earns. | pending |  |  |
| slice-08 | The home page loads in under two seconds on a beach 3G connection, and a build that would break that fails CI, naming the route, the measured bytes, and the ceiling. | pending |  |  |

Notes on the plan:

- Row order is dependency order, backward only. An empty Annotation cell is parallel-safe once the rows above it have landed.
- slice-02 sits directly behind the skeleton on purpose. `system-architecture.md` §11 names the guardrail assertion suite a DELIVER precondition, proven red then green before any human `cdk deploy` counts as guarded, and the archive starts accumulating irreplaceable data at the first deployed hour. Protection lands before the first deploy can happen.
- All four Open-Meteo wave members are fetched, snapshotted and blended from slice-01 on (Andres, 2026-08-08: use every free source; the archive cannot be backfilled). Wave sources beyond that one call land in F-KNOW-HOW-MUCH-TO-TRUST-IT. Fact for slice-07, stated so nobody promises past it: with four members the `members_used < 2` cap (05 §6.1) no longer binds, but with zero reports the freshness factor does not participate at all: a spot with no report ever is UNREPORTED, not stale, and flooring it at 0.3 was fabricating a staleness reading for something never observed (05 §6.3, D4 ANSWERED 2026-08-08 by Andres, "day-one confidence means model agreement"). So `c_total = c_spread` on day one and **all three levels are reachable from model agreement alone**: four members in tight agreement reads alta, a wide period split reads baja. A single-member day still caps at baja via the f(M) cap (05 §6.1), and freshness rejoins at a spot's first report and binds normally from then on. The reason string names that nobody has reported yet, so the level is an agreement claim and never an accuracy claim. Scoring D4 is closed; Pre-requisites row 4 no longer carries it.
- The eleven cost guardrail VALUES (log retention, lifecycle rules, reserved concurrency, timeouts) ship inside whichever slice creates each resource, per the epic F-BILL-STAYS-ZERO-AND-STAYS-UP row. slice-02 is the gate that asserts them. The dead-man's switch observable belongs to that later feature, not this one.
- The yesterday page is `/spots/{slug}/ayer`. It renders the prior Panama civil day's dawn-build receipt and its exact `published_at` stamp, not a later hourly revision. On a first morning with no prior dawn receipt it renders an explicit Spanish empty state. If a current build refuses to publish, it keeps the prior receipt and its original stamp rather than minting a score or a fresh date. The English twin belongs to F-READ-IT-IN-YOUR-LANGUAGE and is absent from slice-01. Settled by HANDOFF §6 item 2, 2026-08-08.

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | The epic promise is walkable end to end on the built site: ranked Spanish home at dawn, top call with a plain-language reason, tomorrow route, per-spot pages, confidence level on every row. All four Open-Meteo wave members from the one call, blended per 05 §3.3, physics scoring only. |
| 2 | The prediction log is written from the first deployed hour: insert-only via S3 conditional PUT, top-level `predictions/` prefix, natural keys per `domain-model.md` §5.2, one row per member per valid hour for all four members. Yesterday's file re-reads byte-identical the next day. |
| 3 | The learning term is wired in and set to zero: correction file absent, gate `no_file`, `Q_final = Q` exactly (05 §5, law L8). Turning learning on later is the appearance of a file, not a code change. |
| 4 | Guardrail assertion suite green in CI and demonstrated red once (`system-architecture.md` §11). No lifecycle expiration or transition rule overlaps the prediction-log prefix (guardrail 4). |
| 5 | Byte gate green in CI and demonstrated red once: home document ≤ 14 KB gz, every route ≤ 100 KB first visit, emulated-3G first render under 2 s (`application-architecture.md` §5, §9). |
| 6 | Nothing keyed on Panama: spots, regions, tide stations, timezones all come from seed data files; rotational invariance (05 law L12) holds. |
| 7 | All UI copy is the settled Spanish strings (`application-architecture.md` §10). No English routes exist. |
| 8 | Every Slice Plan row above is flipped `shipped`. |
| 9 | Yesterday's published call is readable in a browser at `/spots/{slug}/ayer`, per spot, rendered from `log/calls/v1` using the previous civil day's dawn receipt and its exact publish time. The raw prediction log stays private. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Report flow, write path, DynamoDB, Function URLs, anonymous identity | F-TELL-US-WHAT-YOU-SAW-COLD |
| Learning and correction fitting (the hook ships inert at zero) | F-FORECAST-LEARNS-FROM-THE-BEACH |
| Scorecard, track record, report counters, day-one report empty states | F-SHOW-OUR-TRACK-RECORD |
| Wave sources beyond the four Open-Meteo members (raw GRIB2 as primary, CMEMS, DWD opendata), and confidence that means something to a surfer: real spread semantics plus track record | F-KNOW-HOW-MUCH-TO-TRUST-IT |
| Weakest-link callout, breakdown bars, static break map on the spot page | F-SEE-WHAT-KILLED-IT |
| Share card, OG images, WhatsApp paste flow | F-PASTE-THE-CALL-INTO-THE-GROUP |
| Web push, per-spot subscriptions | F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE |
| Offline cache, service worker, PWA install, report queue | F-WORKS-WITH-NO-SIGNAL |
| English toggle and `/en/` tree | F-READ-IT-IN-YOUR-LANGUAGE |
| Dead-man's switch observable, budget deny action | F-BILL-STAYS-ZERO-AND-STAYS-UP |
| Photos | Epic open question 4 |
| 7-day forecast | Never (decision 10) |
| LLM narration | Not at launch (04 §7 citing system-architecture §18 decision 4); call text is deterministic from structured scoring output |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | Launch spot list settled: Playa Duartes located or dropped, Playa Serena season resolved, the ~20 named (epic OQ2, HANDOFF §6 items 9-10) | slice-03 seed file content; build proceeds on the verified subset | Andres + cousin | open |
| 2 | Open-Meteo redistribution email sent and launch posture chosen (04 §13 decision 1, epic OQ1) | public launch, not the build | Andres | open |
| 3 | Size-band edges, tide word-to-number map, and Spanish register checked with the cousin's crew (domain-model §16 D7, scoring §13 D3, app-arch decision 6) | launch wording validation only; the settled canonical schema does not block slice-01 | Andres | closed as a build blocker, HANDOFF §6 item 1 |
| 4 | Design decision defaults confirmed or overridden where they change an observable: domain-model §16 D1-D6, scoring §13 D1-D6, ingest §13 1-4, app-arch decisions 1-5 (every one carries a recommendation) | DISTILL scenario authoring on the affected observables | Andres | open |
| 5 | AWS account: Paid Plan upgrade, Lambda concurrency quota ≥ 102 check, S3/DynamoDB free-tier read, domain registration (system-architecture §11 step 1 + launch blockers; decision 31) | first human deploy, not the build | Andres | open |
| 6 | `tide_station` field in the spot seed schema (was 04 §11's DELIVER blocker) | nothing | domain lane | closed, landed in amended domain-model §11 |
| 7 | Wave-member scope: one member or all four from day one | nothing | Andres | ANSWERED 2026-08-08: all four Open-Meteo members (`ncep_gfswave016`, `ncep_gfswave025`, `meteofrance_wave`, `dwd_gwam`) from day one. Reason is the archive, not accuracy: the prediction log cannot be backfilled, per-source skill comparison per spot is its whole point, and the members arrive in the same API call at zero cost |
| 8 | Read surface for "yesterday's numbers are still readable" | nothing | Andres | ANSWERED 2026-08-08: a page on the website, readable by anyone in a browser. The published call log (`log/calls/v1`) is what becomes publicly readable: what we actually told people, per spot per build. The raw prediction log (`predictions/v1`) stays private. Reasoning: the accuracy claim becomes checkable instead of asserted when anyone can read yesterday's call |
| 9 | Yesterday-page route and day-stamp rule: `/spots/{slug}/ayer` renders the prior Panama civil day's dawn-build receipt, stamped with its exact publish time; its English twin is deferred with F-READ-IT-IN-YOUR-LANGUAGE | nothing | frontend lane + domain lane | closed, HANDOFF §6 item 2 |
| 10 | `log/calls/v1` carries a Glacier IR transition at 90 days (system-architecture §5). Those files now back a public page. The yesterday page itself only reads day-old files, but any deeper backfill, page rebuild, or future archive-beyond-yesterday would hit cold storage: price the retrieval cost and latency, or exempt the range pages need. Raised, not solved | nothing at launch scale; an infra answer before any archive deeper than yesterday | infra lane | open |

## Wave: DISTILL / [REF] Acceptance design

### [REF] Inherited commitments

| Origin | Commitment | DDD | Impact |
| --- | --- | --- | --- |
| DISCUSS Slice Plan slice-01 | One Venao vertical is the active slice: ingest all four members, snapshot before scoring, publish a Spanish reading, and retain the dawn receipt for browser reading. | n/a | Defines the only current-slice executable surface; all later slice scenarios remain absent. |
| DISCUSS Definition of Done 2, 9 | The prediction log is private, append-only, first-write-wins; `/spots/{slug}/ayer` reads the public call receipt. | n/a | Requires the tests to distinguish immutable `predictions/` from public `log/calls/` artifacts. |
| HANDOFF §6 items 2, 3 | `/spots/{slug}/ayer` selects the prior Panama civil day's dawn receipt and exact publish time; slice-01 exposes no English tree. | n/a | Removes route and language ambiguity from R38, R43, R46, and R48. |
| application-architecture §4, §12 | Reading pages are publish-time HTML. A first-morning archive is an explicit empty state; a refused build preserves the dated stale receipt. | n/a | Makes U5 testable without a browser data-fetch or a false loading indicator. |
| domain-model §5, §6 and 05-scoring-engine laws | Snapshot keys are immutable and the 17 scoring laws are invariants, including rotational invariance and confidence separation. | n/a | Induces Cucumber archive scenarios and fast-check properties rather than example-only scoring tests. |
| nw-ui-quality-mandates U1-U8 | The mobile reading surface must meet the visual bar during the slice, with U8 examined by a person. | n/a | Adds R39-R46 checks and charter-visible finishedness observation before DELIVER. |

### [REF] Scenario list

| AT group | Tags / coverage | Production driving surface | Consumer artifact | Observable capability |
| --- | --- | --- | --- | --- |
| `morning-call-from-todays-models.feature` | `@feature-daily-call-with-permanent-receipts`, every scenario `@slice-01`, `@in-memory`, `@contract-shape:bounded-change`, `@covers-R1` through `@covers-R11` | `runIngestOnce`, `runBuildOnce` | in-memory object-store universe | Snapshot, scoring, partial failure, and publish behavior are observable without a network dependency. |
| `yesterdays-numbers-still-readable.feature` | same feature and slice tags; `@covers-R4`, `@covers-R7` | `runIngestOnce`, `runBuildOnce` | in-memory call-log universe | A dawn receipt survives tomorrow and a later build cannot overwrite it. |
| `tests/unit/scoring-laws.test.ts` | `// covers: R12` through `R29`; fast-check properties | pure scoring and confidence functions | DIRECT-SURFACE | The declared scoring laws hold across generated physical inputs. |
| `tests/acceptance/daily-call-with-permanent-receipts/reading-state.test.ts` | `// covers: R43, R46` | `resolveYesterdayReading` | builder reading-state contract | Empty, success, stale, and static-loading-exemption states are selected honestly. |
| `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | `@walking_skeleton`; `// covers: R1, R7, R38-R41, R43, R46-R49` | `npm run build`, static preview, browser routes | immutable `dist/` candidate | A phone browser reads Spanish published HTML, reaches `/ayer`, and cannot fetch or expose the raw log. |

### [REF] Walking-skeleton strategy

| Surface | Classification | Strategy | Why |
| --- | --- | --- | --- |
| Browser reading journey | ASSEMBLED-SURFACE | One Playwright mobile journey builds `dist/`, serves it as a static candidate, and walks home, `/ayer`, and raw-log denial. | It is the feature's sole subprocess browser test and proves the user receives a built reading surface. |
| Pipeline and scoring contracts | DIRECT-SURFACE | Cucumber drives the application ports in memory; fast-check drives pure scoring functions. | These assertions are faster and give precise archive and invariant failures without adding browser processes. |
| Static reading states | DIRECT-SURFACE | Vitest drives the explicit builder selection seam. | Empty and stale state selection must be deterministic before Astro consumes it. |

### [REF] Adapter coverage

| Driven boundary | Current treatment | Evidence / limitation |
| --- | --- | --- |
| Forecast source port | In-memory contract fixture | `FixtureSource` exercises all declared success and failure shapes. No concrete network adapter exists yet, so a real-network scenario would be false coverage; the eventual adapter owes a separate real-I/O contract test. |
| Prediction and call storage ports | In-memory conditional-put fixture | `InMemoryStore` preserves the port's first-write-wins semantics, state deltas, and byte identity. Production S3 adapter is not yet on disk. |
| Static publish artifact | Real local build and browser preview | The walking skeleton consumes actual generated HTML from `dist/`, not a component mock. |

### [REF] RED scaffolds

| File | RED seam | Classification evidence |
| --- | --- | --- |
| `src/pipeline/ingest.ts` | `runIngestOnce` | Cucumber reaches the explicit ingest scaffold assertion. |
| `src/pipeline/build.ts` | `runBuildOnce` | Cucumber reaches the explicit build scaffold assertion. |
| `src/scoring/engine.ts`, `src/scoring/confidence.ts` | scoring laws and confidence | Fast-check reaches named scoring scaffold assertions. |
| `src/publish/reading-state.ts` | `resolveYesterdayReading` | Four reading-state tests reach the explicit selection scaffold assertion. |

### [REF] Test placement and prerequisite status

| Item | Decision | Evidence |
| --- | --- | --- |
| Cucumber placement | `tests/acceptance/daily-call-with-permanent-receipts/` | Existing project convention keeps behavioral feature files, steps, fixtures, and support universe together. |
| Property placement | `tests/unit/scoring-laws.test.ts` | Laws are pure, generated invariants and do not require a browser or store. |
| Browser placement | `tests/e2e/daily-call-with-permanent-receipts/` | Exactly one feature-level subprocess journey, required for the built public surface. |
| User-facing prerequisites | Closed | HANDOFF §6 resolves the route, dawn selector, Spanish-only scope, and size-band build blocker. |
| DELIVER prerequisite | Still blocked | Andres must record the independent slice-01 AT-review verdict; the carpaccio gate fails closed until then. |

### [REF] Gate evidence

| Check | Result | Meaning |
| --- | --- | --- |
| `npm run typecheck` | PASS | The active RED scaffolds and tests type-check. |
| `npm test` | 22 active RED failures | Every failure reaches an explicit missing-behavior scaffold. |
| `npm run test:at` | 17 active RED scenarios | Every failure reaches a pipeline behavior assertion after steps execute. |
| `npm run test:e2e` | one active RED journey | Built mobile surface exposes observable missing product behavior, including the missing dated receipt route. |
| `npm run build && node scripts/check-ui-quality.mjs` | RED at U6 | The UI gate reports the raw type-scale violation by file and declaration. |

## Wave: DESIGN / [REF] Architecture & Contract Tests

| Contract | Architecture source | Induced witness |
| --- | --- | --- |
| Prediction snapshots precede all scoring and are conditional first writes (`OUT-DAILY-CALL-INGEST`). | `04-ingest-pipeline.md` §3, `domain-model.md` §5 | Cucumber snapshot, crash-survival, duplicate, and byte-identity scenarios. |
| Four model members blend before scoring; scoring has 17 declared laws. | `05-scoring-engine.md`, `adr-scoring-member-blend.md` | Pipeline blend scenario and 18 generated fast-check properties. |
| Call receipts are immutable, public reading artifacts; raw predictions never cross the public surface (`OUT-DAILY-CALL-BUILD`). | `domain-model.md` §6, `adr-prediction-log-format.md` | Cucumber archive scenarios plus browser raw-route denial. |
| `/spots/{slug}/ayer` selects the previous civil day's dawn receipt, with original `published_at` (`OUT-DAILY-CALL-ARCHIVE-STATE`). | `application-architecture.md` §4, §12; HANDOFF §6 item 2 | Static reading-state scenarios and the sole browser walking skeleton. |
| Spanish-only slice must be usable outdoors on a narrow phone. | `09-design-system.md`, UI mandates U1-U8; HANDOFF §6 item 3 | Built-surface contrast, 390px, target-size, token, motion, and charter observations. |

## Wave: DESIGN / [REF] ADR Refs

| ADR | Contract carried into DISTILL |
| --- | --- |
| `adr-prediction-log-format.md` | Prediction rows and published receipts preserve first-write-wins semantics. |
| `adr-scoring-member-blend.md` | Usable members blend in input space before scoring. |
| `adr-publish-time-html-rendering.md` | The browser consumes complete reading HTML, not forecast JSON. |
| `adr-two-day-ranking.md` | Today and tomorrow are distinct, ordered read models. |

## Reuse Analysis

| Existing Component | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Static Astro build | `astro.config.mjs`, `src/layouts/Base.astro` | **bounded-change**: builder capability may replace the `dist/` candidate atomically; browser code receives no write capability. | EXTEND | The receipt route and date stamp belong in the established static publish model, with an output universe bounded to one generated candidate. |
| Typed pipeline boundaries | `src/pipeline/ports.ts` | **pure-function** type boundary: `IngestStore` and `BuildStore` declare the only injected capabilities. | EXTEND | Narrow capabilities keep prediction immutability reviewable: ingest cannot publish and build cannot mutate predictions. |
| Ingest driving operation | `src/pipeline/ingest.ts` | **bounded-change**: injected `IngestStore` writes only `raw/` and conditional `predictions/`; the allowed delta is new immutable objects only. | EXTEND | The existing operation is the first durable-effect seam and must retain an explicit, minimal write universe. |
| Build driving operation | `src/pipeline/build.ts` | **bounded-change**: injected `BuildStore` reads predictions and corrections, writes only call receipts, bundle, and manifest; prediction delta is empty. | EXTEND | The existing operation owns public publication while the restricted port makes archive preservation mechanically testable. |
| Placeholder reading components | `src/components/RankedList.astro`, `src/components/SpotDetail.astro` | **pure-function** from builder-owned render input to HTML; browser performs no forecast-data fetch. | EXTEND | Replace placeholders with the published receipt contract instead of adding a parallel UI path. |
| Static receipt selection | `src/publish/reading-state.ts` | **pure-function**: declared receipts and build outcome in, one empty, success, or stale value out. | CREATE_NEW | The settled archive rule needs one deterministic builder seam for empty, success, and stale selection. |

Read-only protocols and scoring properties are consumed dependencies, not reuse rows: the ATs
drive their declared application surfaces and observe resulting artifacts.

## Test Reuse & Consolidation Analysis

| Existing Test/DSL-Step | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Feature browser journey | `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | Built public reading capability and mobile visual obligations. | EXTEND | The single feature E2E absorbs archive-route and timestamp assertions rather than adding another browser process. |
| Pipeline behavior scenarios | `tests/acceptance/daily-call-with-permanent-receipts/*.feature` | State changes in snapshots, receipts, and no-data failures. | EXTEND | New source-failure rows share the same in-memory universe and retain one scenario outline for four failure variants. |
| Scoring-law properties | `tests/unit/scoring-laws.test.ts` | Pure algebraic scoring behavior. | EXTEND | Fast-check folds boundary and permutation values into the existing generated property suite. |
| Static reading-state acceptance | `tests/acceptance/daily-call-with-permanent-receipts/reading-state.test.ts` | No existing test selects a dated archive receipt or materializes U5 states. | CREATE_NEW | This one in-process suite covers all four states without multiplying subprocess E2E tests. |
