<!-- des-feature-context-bootstrap: {"feature_id":"daily-call-with-permanent-receipts","intent":"A surfer opens the site at 5:40am and sees today's twenty Pacific spots ranked, with the top one called out and a plain-language reason in Spanish. The next morning, yesterday's numbers are still readable, unchanged, in an append-only archive.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: daily-call-with-permanent-receipts

Intent: A surfer opens the site at 5:40am and sees today's twenty Pacific spots ranked, with the top one called out and a plain-language reason in Spanish. The next morning, yesterday's numbers are still readable, unchanged, in an append-only archive.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer opens the site and sees one real spot with today's score and its call in Spanish, computed from this morning's actual model data. The next morning, they open that spot's yesterday page in the browser and read exactly what the site said the day before, unchanged. | shipped | @walking_skeleton | Thinnest end-to-end vertical: fetched, snapshotted permanently, scored, rendered, and re-readable the next day. The prediction log write is the run's first durable side effect (HANDOFF §3, 04-ingest §3 steps 4 and 7) and cannot be added later. All four Open-Meteo wave members (`ncep_gfswave016`, `ncep_gfswave025`, `meteofrance_wave`, `dwd_gwam`) are fetched and snapshotted from day one, one log row per member per valid hour per domain-model §5 (Andres, 2026-08-08): the log cannot be backfilled, per-source skill comparison is its whole point, and the members arrive in the same API call at zero cost. Scoring in this slice runs from the settled input-space blend of the usable members (05 §3.3, `adr-scoring-member-blend`), not from a single named member: deliberate, because the blend is a small ADR'd pure function while a one-member selection path exists nowhere in the design, and it keeps the skeleton's displayed number identical in kind to every later slice. The yesterday surface is a public page rendered from the published call log (`log/calls/v1`, domain-model §6), kept inside this slice, not split out (Andres, 2026-08-08): the build already writes that log (04 §3 step 10), and rendering one more static page for one spot from the previous day's file is a template plus one read, while the promise it proves is the keystone's reason to exist: the accuracy scorecard, the product's differentiator, becomes checkable instead of asserted only when anyone can read in a browser that we said 74 yesterday. The raw prediction log stays private: four members per lead hour feeds the learning loop, not human eyes. One spot, physics only (research 09 §7 via 05), correction hook wired and inert: no file, gate `no_file`, `Q_final = Q` exactly (05 §5, law L8). Thin value accepted. |
| slice-02 | Nobody can quietly destroy yesterday's receipts or unbound the bill: before deploy, CI rejects a prediction-log lifecycle violation or any missing locally declared cost guardrail value, naming what broke and why. The $18 budget deny action is deferred to F-BILL-STAYS-ZERO-AND-STAYS-UP. | shipped | @commit-592d660 | Eight Slice-02 ATs are green, a fresh delegated approval is recorded, and the carpaccio gate clears. Commit `592d660` passed slice-commit verification and the contract gate. The real guardrail suite and credential-free CDK synth run in the default 9/9 local gate. |
| slice-03 | A surfer sees today's twenty Pacific spots ranked best first on the home page, in Spanish, and the order actually changes when the swell does. The spot list is a seed data file: adding a spot is a data edit, not code. | shipped | @commit-df25ee6 | The launch policy names 20 source-backed Pacific spots and three explicit exclusions in `data/spots/pa-pacific-launch-v1.json`. Six ATs, 29 unit tests, the UI gate, and the browser journey are green; Vera passed the 20-row Spanish home; DES commit gates passed. |
| slice-04 | The top spot is unmistakably the call: an oversized card names it and gives a plain-language reason in Spanish a surfer can repeat to a friend without looking back at the screen. | shipped | depends-on slice-03 | The call card is the top row of the ranked list slice-03 renders: same page surface, and there is no best spot to call until every spot is scored and ranked. |
| slice-05 | A surfer flips to Mañana and gets tomorrow's own ranking with tomorrow's own numbers, and the site says plainly that past tomorrow it will not pretend to know. | pending |  |  |
| slice-06 | A surfer taps any spot and gets that spot's own page: today's and tomorrow's numbers, size in body-height words with metre ranges beside them, and the best window to go. | pending |  |  |
| slice-07 | Every ranked row carries a confidence level with the reason one tap away, in plain Spanish: how far the models agree, and whether anyone has confirmed conditions from the beach. The level never claims more certainty than the data earns. | pending |  |  |
| slice-08 | The home page loads in under two seconds on a beach 3G connection, and a build that would break that fails CI, naming the route, the measured bytes, and the ceiling. | pending |  |  |

Notes on the plan:

- Row order is dependency order, backward only. An empty Annotation cell is parallel-safe once the rows above it have landed.
- slice-02 sits directly behind the skeleton on purpose. `system-architecture.md` §11 names the guardrail assertion suite a DELIVER precondition, proven red then green before any human `cdk deploy` counts as guarded, and the archive starts accumulating irreplaceable data at the first deployed hour. Protection lands before the first deploy can happen.
- All four Open-Meteo wave members are fetched, snapshotted and blended from slice-01 on (Andres, 2026-08-08: use every free source; the archive cannot be backfilled). Wave sources beyond that one call land in F-KNOW-HOW-MUCH-TO-TRUST-IT. Fact for slice-07, stated so nobody promises past it: with four members the `members_used < 2` cap (05 §6.1) no longer binds, but with zero reports the freshness factor does not participate at all: a spot with no report ever is UNREPORTED, not stale, and flooring it at 0.3 was fabricating a staleness reading for something never observed (05 §6.3, D4 ANSWERED 2026-08-08 by Andres, "day-one confidence means model agreement"). So `c_total = c_spread` on day one and **all three levels are reachable from model agreement alone**: four members in tight agreement reads alta, a wide period split reads baja. A single-member day still caps at baja via the f(M) cap (05 §6.1), and freshness rejoins at a spot's first report and binds normally from then on. The reason string names that nobody has reported yet, so the level is an agreement claim and never an accuracy claim. Scoring D4 is closed; Pre-requisites row 4 no longer carries it.
- The eleven locally declared cost guardrail VALUES remain required before deploy: log retention, lifecycle rules, reserved concurrency, and timeouts ship inside whichever slice creates each resource, per the epic F-BILL-STAYS-ZERO-AND-STAYS-UP row. slice-02 is the gate that asserts every one of those declarations, plus prediction-log lifecycle safety. Anthropic and CloudFront remain external-audit concerns: the gate must identify them as such, never treat a local declaration check as proof about either. The dead-man's switch observable and the $18 budget deny action belong to F-BILL-STAYS-ZERO-AND-STAYS-UP, not slice-02.
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
| 1 | Launch spot list settled: Playa Duartes located or dropped, Playa Serena season resolved, the ~20 named (epic OQ2, HANDOFF §6 items 9-10) | slice-03 seed file content; build proceeds on the verified subset | local research + DISTILL | closed 2026-08-09: `docs/research/slice-03-launch-seed-readiness.md` and `data/spots/pa-pacific-launch-v1.json` name 20 eligible records and 3 explicit exclusions |
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
| DISCUSS Slice Plan slices 01-04 | Slice-01's Venao vertical remains unchanged; Slice-02 protects the irreplaceable archive and concrete cost limits before any deploy; Slice-03 expands the real public coast to the data-defined 20-spot ranking; Slice-04 turns its first row into the unmistakable daily call. | n/a | Slice-03 shipped in `df25ee6`; Slice-04 is active RED through the real built home; later-slice scenarios remain absent. |
| DISCUSS Definition of Done 2, 9 | The prediction log is private, append-only, first-write-wins; `/spots/{slug}/ayer` reads the public call receipt. | n/a | Requires the tests to distinguish immutable `predictions/` from public `log/calls/` artifacts. |
| HANDOFF §6 items 2, 3 | `/spots/{slug}/ayer` selects the prior Panama civil day's dawn receipt and exact publish time; slice-01 exposes no English tree. | n/a | Removes route and language ambiguity from R38, R43, R46, and R48. |
| application-architecture §4, §12 | Reading pages are publish-time HTML. A first-morning archive is an explicit empty state; a refused build preserves the dated stale receipt. | n/a | Makes U5 testable without a browser data-fetch or a false loading indicator. |
| domain-model §5, §6 and 05-scoring-engine laws | Snapshot keys are immutable and the 17 scoring laws are invariants, including rotational invariance and confidence separation. | n/a | Induces Cucumber archive scenarios and fast-check properties rather than example-only scoring tests. |
| nw-ui-quality-mandates U1-U8 | The mobile reading surface must meet the visual bar during the slice, with U8 examined by a person. | n/a | Adds R39-R46 checks and charter-visible finishedness observation before DELIVER. |
| DISCUSS Slice Plan slice-02; system-architecture §9, §11; 08-devops §2 | The default local `infra` CI job runs `infra/test/guardrails.test.ts` plus credential-free synth. Slice-02 owns only four safeguard groups: Lambda reserved concurrency, Lambda timeouts, log retention, and non-prediction lifecycle rules, plus prediction-prefix lifecycle safety. | n/a | Induces bounded-change scenarios through the production-owned in-process `runLocalCi` entry and its shared declaration evaluator against copied controlled declaration fixtures; no new browser journey. The coupled table exercises concrete subvalues without adding product scope. |

### [REF] Scenario list

| AT group | Tags / coverage | Production driving surface | Consumer artifact | Observable capability |
| --- | --- | --- | --- | --- |
| `morning-call-from-todays-models.feature` | `@feature-daily-call-with-permanent-receipts`, every scenario `@slice-01`, `@in-memory`, `@contract-shape:bounded-change`, `@covers-R1` through `@covers-R11` | `runIngestOnce`, `runBuildOnce` | in-memory object-store universe | Snapshot, scoring, partial failure, and publish behavior are observable without a network dependency. |
| `yesterdays-numbers-still-readable.feature` | same feature and slice tags; `@covers-R4`, `@covers-R7` | `runIngestOnce`, `runBuildOnce` | in-memory call-log universe | A dawn receipt survives tomorrow and a later build cannot overwrite it. |
| `tests/unit/scoring-laws.test.ts` | `// covers: R12` through `R29`; fast-check properties | pure scoring and confidence functions | DIRECT-SURFACE | The declared scoring laws hold across generated physical inputs. |
| `tests/acceptance/daily-call-with-permanent-receipts/reading-state.test.ts` | `// covers: R43, R46` | `resolveYesterdayReading` | builder reading-state contract | Empty, success, stale, and static-loading-exemption states are selected honestly. |
| `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | `@walking_skeleton`; `// covers: R1, R7, R38-R41, R43, R46-R49` | `npm run build`, static preview, browser routes | immutable `dist/` candidate | A phone browser reads Spanish published HTML, reaches `/ayer`, and cannot fetch or expose the raw log. |
| `infrastructure-guardrails.feature` | every scenario `@slice-02`, `@driving_port`, `@real-io`, `@contract-shape:bounded-change`, `@covers-R35`; archive scenarios also `@covers-R49`; coupled negative populations additionally `@negative @error @coupled` | production-owned `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` from `scripts/ci-local.mjs` | captured production evaluator result over a contained declaration-only universe | Eight scenarios prove default registration plus real-root provenance for the `--job=infra` guardrail-test and credential-free synth phases, the named real `infra/` lifecycle and eleven-value Lambda population, clean traversal, exact allowance, every lifecycle near miss, every concrete in-scope safeguard value, and unavailable or malformed declaration failure with no repository-root side effect. |
| `top-call-card.feature` | eight scenarios, each `@slice-04 @driving_port @real-io @adapter-integration`; R31 plus slice-local U1-U7 rows R50-R56; three scenarios are `@negative @error` | isolated credential-free `npm run build`, installed Vite preview over HTTP, Chromium at 390 px | real emitted `dist/index.html` plus rendered geometry and computed styles | The first ranked entry is the sole "VE A" call, shares the top spot and score, gives a repeatable Spanish size, wind and time-window reason, degrades empty or technical narrative from structured fields, and remains finished in both themes with reduced motion. One scenario builds from a byte-identical copy of the installed public input. Two contrasting profiles require exact Spanish values for `size_band`, `wind_state`, and `best_window`, so fixture-only adapter wiring or a fixed fallback sentence cannot satisfy the contract. |

### [REF] Walking-skeleton strategy

| Surface | Classification | Strategy | Why |
| --- | --- | --- | --- |
| Browser reading journey | ASSEMBLED-SURFACE | One Playwright mobile journey builds `dist/`, serves it as a static candidate, and walks home, `/ayer`, and raw-log denial. | It is the feature's sole subprocess browser test and proves the user receives a built reading surface. |
| Pipeline and scoring contracts | DIRECT-SURFACE | Cucumber drives the application ports in memory; fast-check drives pure scoring functions. | These assertions are faster and give precise archive and invariant failures without adding browser processes. |
| Static reading states | DIRECT-SURFACE | Vitest drives the explicit builder selection seam. | Empty and stale state selection must be deterministic before Astro consumes it. |
| Slice-04 public call | ASSEMBLED-SURFACE | Each Cucumber scenario copies only the source and controlled public input to a temporary root, reuses the exact installed dependency tree, runs the real build, serves `dist/` over HTTP and observes it with Chromium. | Layer 5 is required because contrast against the real gradient, 390 px geometry, touch size and reduced-motion behavior do not exist at an in-memory port. The feature keeps the single inherited walking skeleton and adds no second `@walking_skeleton`. |

### [REF] Adapter coverage

| Driven boundary | Current treatment | Evidence / limitation |
| --- | --- | --- |
| Forecast source port | In-memory contract fixture | `FixtureSource` exercises all declared success and failure shapes. No concrete network adapter exists yet, so a real-network scenario would be false coverage; the eventual adapter owes a separate real-I/O contract test. |
| Prediction and call storage ports | In-memory conditional-put fixture | `InMemoryStore` preserves the port's first-write-wins semantics, state deltas, and byte identity. Production S3 adapter is not yet on disk. |
| Static publish artifact | Real local build and browser preview | The walking skeleton and Slice-04 Cucumber suite consume actual generated HTML from `dist/`, not a component mock. Slice-04 runs in temporary copies so malformed narrative fixtures cannot mutate the worktree. Its installed-input scenario proves the copied `data/published-surface.json` is byte-identical to the real input before building. |
| Local CI protection command | Production-owned in-process `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` composition; every mutation runs over a fully copied controlled declaration input | The AT imports no guard internals, starts no child process, supplies no `commandRunner`, and never mutates global process state. Each call receives a fresh empty temporary `HOME` with every `AWS_*` credential/configuration override removed. The evaluator runs declaration-only for the copy; the public job owns the reported `infra/test/guardrails.test.ts` and credential-free synth phases. No cloud account is used. |

### [REF] RED scaffold history

| File | RED seam | Classification evidence |
| --- | --- | --- |
| `src/pipeline/ingest.ts` | `runIngestOnce` | Cucumber reaches the explicit ingest scaffold assertion. |
| `src/pipeline/build.ts` | `runBuildOnce` | Cucumber reaches the explicit build scaffold assertion. |
| `src/scoring/engine.ts`, `src/scoring/confidence.ts` | scoring laws and confidence | Fast-check reaches named scoring scaffold assertions. |
| `src/publish/reading-state.ts` | `resolveYesterdayReading` | Four reading-state tests reach the explicit selection scaffold assertion. |
| `scripts/ci-local.mjs` | `__SCAFFOLD__` default `infra` branch plus `evaluateInfrastructureDeclarations({ root, environment, output })`, reached through production-owned `runLocalCi` | Declaration scaffolds are present. Orchestration must wire the shared evaluator and `runLocalCi` input extension specified in `distill/red-classification.md`: the public job reports both required phases and the actual `infra/` population; declaration-only output says credential-free offline inspection and cannot write `repoRoot/infra` or `repoRoot/.ci-local-logs`. The AT fails at its individual output oracle rather than import or setup. No new `src/ci` module is allowed. |

### [REF] Test placement and prerequisite status

| Item | Decision | Evidence |
| --- | --- | --- |
| Cucumber placement | `tests/acceptance/daily-call-with-permanent-receipts/` | Existing project convention keeps behavioral feature files, steps, fixtures, and support universe together. |
| Property placement | `tests/unit/scoring-laws.test.ts` | Laws are pure, generated invariants and do not require a browser or store. |
| Browser placement | `tests/e2e/daily-call-with-permanent-receipts/` | Exactly one feature-level subprocess journey, required for the built public surface. |
| CI-guardrail placement | `tests/acceptance/daily-call-with-permanent-receipts/infrastructure-guardrails.feature` + `steps/infrastructure-guardrails.steps.ts` + `fixtures/controlled-infrastructure-declarations/` | Cucumber drives the production in-process composition root. The fixture rejects source symlinks, is copied without dereferencing, never identifies as production, and requires no `node_modules`; every declaration-only failure snapshots and preserves both the real `infra/` tree and `.ci-local-logs`. The feature adds no browser E2E. |
| Slice-04 call-card placement | `tests/acceptance/daily-call-with-permanent-receipts/top-call-card.feature` + `steps/top-call-card.steps.ts` + `fixtures/slice-04-top-call-variants.json` | The existing Cucumber runner drives the real installed build and HTTP preview. One outline covers the two negative narrative states and one covers light/dark plus reduced motion. A controlled long-name row uses `head_overhead`, `choppy`, and 10:15 to 12:45 to prove field fidelity and 390 px Spanish fit without adding another feature-level browser journey. |
| User-facing prerequisites | Closed | HANDOFF §6 resolves the route, dawn selector, Spanish-only scope, and size-band build blocker. |
| DELIVER prerequisite | Slice-01 through Slice-03 shipped; Slice-04 JIT DISTILL is active RED under nWave 3.15.1 | Slice-03's fresh delegated independent APPROVED verdict and `SliceCleared` preceded DES commit `df25ee6`. Slice-04 has eight production-driven RED scenarios and a sealed source-blind charter ready for independent review; no approval is recorded here. |

### [REF] Slice-04 UI quality contract

```json
{
  "slice_id": "slice-04",
  "surface_classification": "user-visible",
  "charter_path": "docs/product/expectations/daily-call-with-permanent-receipts/the-top-spot-is-unmistakably-the-call-an-oversized-card-names-it-and-gives-a-plain-language.md",
  "u8_observation": "La tarjeta se ve terminada: el puntaje se lee con el brazo estirado, es obvio de un vistazo cuál es EL llamado del día, nada está desalineado ni cortado y nada se mueve solo.",
  "ui_checks": {
    "U1": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u1"],
    "U2": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u2"],
    "U3": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u3"],
    "U4": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u4"],
    "U5": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u5"],
    "U6": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u6"],
    "U7": ["npm", "run", "test:at", "--", "--tags", "@slice-04 and @ui-u7"]
  }
}
```

The two outline examples are deliberate layer-5 examples, not PBT candidates. Browser geometry,
theme media queries and reduced-motion state are environment observations at layer 5. The
negative outline varies only the published narrative while retaining its first structured profile;
the fixture cannot model real cellular latency or a deployed CDN and makes no such claim.
Its contrasting long-name profile changes all three structured source fields and their exact
Spanish expectations, so no single fixed fallback sentence can pass both profiles. That row also
measures the long destination and reason at 390 px for U2 and U6.
The separate installed-input scenario never overlays those fields. U7 reads the emitted hero rule
and requires named tokens for its background, outer and inner spacing, radius, and elevation.
Motion is explicitly not applicable to this static card: any computed transition or animation is
a failure.

### [REF] Slice-04 reconciliation and typed outcomes

Reconciliation passed - 0 contradictions. This feature uses the unified `feature-delta.md`; the
legacy DISCUSS, DESIGN and DEVOPS `wave-decisions.md` files are absent. The binding sources agree
that array position zero is the top rank, the home top card says `VE A {SPOT}`, the score remains
an integer 0 to 100, and the reason uses Spanish body size, wind and `best_window`. Slice-04 adds
no new operation, rule module, endpoint or system invariant, so the outcomes registry inherits
the existing publication operation and receives no duplicate OUT row. No production scaffold is
needed: all tests import or execute existing production entry points, reach emitted HTML, and fail
at a user-visible behavior oracle.

### [REF] Historical gate evidence at pre-delivery RED

| Check | Result | Meaning |
| --- | --- | --- |
| `npm run typecheck` | PASS | The current `environment` and `declarationInput` production contract typechecks. |
| `npm test` | PASS, 22 tests | Existing in-process and property tests remain green. |
| `npm run test:at -- --tags 'not @slice-02'` | PASS, 17 scenarios | Slice-01 acceptance behavior remains green. |
| `npm run test:e2e` | one active RED journey | Built mobile surface exposes observable missing product behavior, including the missing dated receipt route. |
| `npm run build && node scripts/check-ui-quality.mjs` | RED at U6 | The UI gate reports the raw type-scale violation by file and declaration. |
| `npm run test:at -- --tags @slice-02` | Active RED, 8 failed scenarios | Every scenario reached `runLocalCi`, captured `__SCAFFOLD__`, preserved the declaration-only side-effect universe, and then failed at its individual behavior oracle. No import, fixture, or step-match failure occurred. |

### [REF] Slice-02 completion and shipment evidence

| Check | Result | Meaning |
| --- | --- | --- |
| `npm run test:at -- --tags @slice-02` | PASS, 8 scenarios and 56 steps | The production-owned `runLocalCi` surface proves all eight guardrail scenarios green. |
| `des verify-negative-at --repo . --test-file tests/acceptance/daily-call-with-permanent-receipts/infrastructure-guardrails.feature --all-critical` | PASS, 5 negative ATs | The critical refusal coverage remains present. |
| Fresh delegated AT review and `des carpaccio-slice-gate --repo-root . --feature-id daily-call-with-permanent-receipts --entering-slice slice-02` | PASS, `SliceCleared` | Independent approval and carpaccio clearance were recorded before the DES commit. |
| Slice-02 DES commit, `des verify-slice-commit`, and `des run-contract-gate --verify-gate-scope` | PASS, commit `592d660` | Slice-02 is shipped. |
| `npm run ci:local` | PASS, 9/9 jobs | The default gate runs the real infra guardrail suite, credential-free CDK synth, and the full lockfile OSV scan. |
| `osv-scanner.toml` | One expiring GHSA exception | Only `GHSA-rgw5-rvv9-x895` is filtered for the AWS CDK bundled `brace-expansion@5.0.8` path. Its rationale, expiry, and removal condition live in `docs/security/osv-exceptions.md`. |

Slice-02 shipped in `592d660`. Slice-03 shipped in `df25ee6` with its launch policy as verified production behavior. Slice-04 is now open in JIT DISTILL with active RED acceptance evidence under upgraded classic nWave 3.15.1.

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
| Local CI runner | `scripts/ci-local.mjs` | **bounded-change**: `runLocalCi({ argv, repoRoot, output, commandRunner, environment, declarationInput })` invokes the same evaluator for real `infra/` and an isolated declaration input; it changes only captured output plus local result. Fixture copies are restored and removed. | EXTEND | Reuse the documented runner and its future shared evaluator rather than inventing a command, fixture-only branch, or test-owned process wrapper. |

Read-only protocols and scoring properties are consumed dependencies, not reuse rows: the ATs
drive their declared application surfaces and observe resulting artifacts.

## Prefactoring Assessment

**NONE — justified.** Examined `scripts/ci-local.mjs`, its table-driven job registry, and the existing pipeline ports: Slice-02 adds one `infra` job and a new `infra/` declaration component, while the runner's in-process `runLocalCi` composition is the new driving-port behavior rather than a behavior-preserving reshape. No existing component needs a flag, second execution path, or special case to receive that work, so a prior `@prefactoring` slice would be speculative.

## Test Reuse & Consolidation Analysis

| Existing Test/DSL-Step | File | Overlap | Decision | Justification |
| --- | --- | --- | --- | --- |
| Feature browser journey | `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | Built public reading capability and mobile visual obligations. | EXTEND | The single feature E2E absorbs archive-route and timestamp assertions rather than adding another browser process. |
| Pipeline behavior scenarios | `tests/acceptance/daily-call-with-permanent-receipts/*.feature` | State changes in snapshots, receipts, and no-data failures. | EXTEND | New source-failure rows share the same in-memory universe and retain one scenario outline for four failure variants. |
| Scoring-law properties | `tests/unit/scoring-laws.test.ts` | Pure algebraic scoring behavior. | EXTEND | Fast-check folds boundary and permutation values into the existing generated property suite. |
| Static reading-state acceptance | `tests/acceptance/daily-call-with-permanent-receipts/reading-state.test.ts` | No existing test selects a dated archive receipt or materializes U5 states. | CREATE_NEW | This one in-process suite covers all four states without multiplying subprocess E2E tests. |
| Controlled declaration fixture | `tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-declarations/` | Source-side mutations for the four Slice-02 safeguard groups and known unrelated lifecycle rules. | CREATE_NEW | This fixture is a copied test input only. It cannot borrow from the worktree, require a package or CDK app, or claim to be a shipped infrastructure source. |
