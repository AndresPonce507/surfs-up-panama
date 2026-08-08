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
- All four Open-Meteo wave members are fetched, snapshotted and blended from slice-01 on (Andres, 2026-08-08: use every free source; the archive cannot be backfilled). Wave sources beyond that one call land in F-KNOW-HOW-MUCH-TO-TRUST-IT. Fact for slice-07, stated so nobody promises past it: with four members the `members_used < 2` cap (05 §6.1) no longer binds, but with zero reports the freshness floor (05 §6.3, `fresh_floor = 0.3`) still holds `c_total ≤ 0.3`, at or under the low threshold (05 §6.4, low ≤ 0.4), so the displayed level stays "baja" until reports exist in a later feature. The reason string names why. Moving day-one levels with model agreement alone is scoring D4 option (c), Andres's call, carried in Pre-requisites row 4.
- The eleven cost guardrail VALUES (log retention, lifecycle rules, reserved concurrency, timeouts) ship inside whichever slice creates each resource, per the epic F-BILL-STAYS-ZERO-AND-STAYS-UP row. slice-02 is the gate that asserts them. The dead-man's switch observable belongs to that later feature, not this one.
- The yesterday page needs a route the settled route map (`application-architecture.md` §4) does not carry. Proposed: `/spots/{slug}/ayer` (the English twin lands with F-READ-IT-IN-YOUR-LANGUAGE, not here). Owed by the frontend lane, plus one rule owed by the domain lane: which of the day's hourly builds counts as "what we said" for a civil day (recommendation: the dawn build surfers acted on). Carried in Pre-requisites rows 8-10, not solved here.

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
| 9 | Yesterday's published call is readable in a browser, per spot, rendered from `log/calls/v1` (route owed by the frontend lane, Pre-requisites row 9). The raw prediction log stays private. |

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
| 3 | Size-band edges, tide word-to-number map, and Spanish register checked with the cousin's crew (domain-model §16 D7, scoring §13 D3, app-arch decision 6) | copy freeze at DISTILL | Andres | open |
| 4 | Design decision defaults confirmed or overridden where they change an observable: domain-model §16 D1-D6, scoring §13 D1-D6, ingest §13 1-4, app-arch decisions 1-5 (every one carries a recommendation) | DISTILL scenario authoring on the affected observables | Andres | open |
| 5 | AWS account: Paid Plan upgrade, Lambda concurrency quota ≥ 102 check, S3/DynamoDB free-tier read, domain registration (system-architecture §11 step 1 + launch blockers; decision 31) | first human deploy, not the build | Andres | open |
| 6 | `tide_station` field in the spot seed schema (was 04 §11's DELIVER blocker) | nothing | domain lane | closed, landed in amended domain-model §11 |
| 7 | Wave-member scope: one member or all four from day one | nothing | Andres | ANSWERED 2026-08-08: all four Open-Meteo members (`ncep_gfswave016`, `ncep_gfswave025`, `meteofrance_wave`, `dwd_gwam`) from day one. Reason is the archive, not accuracy: the prediction log cannot be backfilled, per-source skill comparison per spot is its whole point, and the members arrive in the same API call at zero cost |
| 8 | Read surface for "yesterday's numbers are still readable" | nothing | Andres | ANSWERED 2026-08-08: a page on the website, readable by anyone in a browser. The published call log (`log/calls/v1`) is what becomes publicly readable: what we actually told people, per spot per build. The raw prediction log (`predictions/v1`) stays private. Reasoning: the accuracy claim becomes checkable instead of asserted when anyone can read yesterday's call |
| 9 | Yesterday-page route and day-stamp rule: the route is absent from `application-architecture.md` §4 (proposed `/spots/{slug}/ayer`), and no design doc says which of the day's hourly builds counts as "what we said" for a civil day (recommendation: the dawn build) | slice-01 scenario naming at DISTILL | frontend lane (route) + domain lane (day-stamp rule) | open, owed |
| 10 | `log/calls/v1` carries a Glacier IR transition at 90 days (system-architecture §5). Those files now back a public page. The yesterday page itself only reads day-old files, but any deeper backfill, page rebuild, or future archive-beyond-yesterday would hit cold storage: price the retrieval cost and latency, or exempt the range pages need. Raised, not solved | nothing at launch scale; an infra answer before any archive deeper than yesterday | infra lane | open |
