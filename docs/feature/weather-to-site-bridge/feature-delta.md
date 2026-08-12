<!-- des-feature-context-bootstrap: {"feature_id":"weather-to-site-bridge","intent":"The hour a fresh forecast lands, the public site republishes itself: every reading page serves the new call with no human in the loop, and a cycle that cannot publish honestly refuses and leaves the previous pages serving.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: weather-to-site-bridge

Intent: The hour a fresh forecast lands, the public site republishes itself: every reading page
serves the new call with no human in the loop, and a cycle that cannot publish honestly refuses
and leaves the previous pages serving.

Workspace opened 2026-08-12 on `build/weather-site-bridge` (worktree
`/Users/andres/psb-weather-bridge`, base `1f1f671`). Serialized slice per `HANDOFF.md`
"Important remaining work" item 3: this is NOT part of the sealed weather data plane. The design
decision is recorded in `docs/product/architecture/adr-weather-to-site-bridge.md` (written at
this workspace's opening, because the HANDOFF sentence was the only record): a bounded Publisher
Lambda, container image, synchronously invoked by Build, running the exact existing release
pipeline (merge → midnight verify → astro build → PUT-only publish with directory aliases and
the origin receipt guard). GitHub Actions and an S3-event primary trigger are rejected upstream
and stay rejected. This file slices that decision; it invents none of it.

Each slice's acceptance tests are written Just In Time when that slice legally enters DISTILL
(`HANDOFF.md` legacy §1 DISTILL row; same convention as every sibling `f-*` workspace).

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A fresh bundle becomes a freshly published site through one bounded pipeline: given the bundle a Build cycle just wrote, the Publisher merges it into the durable surface archive, renders the real Astro site for the production origin, and uploads every page PUT-only with its directory alias; and every dishonest input (wrong civil day, wrong origin receipt, wrong build id) refuses loudly, uploads nothing, and leaves the previous surface intact. | pending | @walking_skeleton, owns the publish core + Lambda image | Thinnest end-to-end vertical that proves the risky part: the whole manual release chain (`pipeline:build` → `publish:surface` → `npm run build` → `publish-preview --target production`) running unattended inside one function, with its four seam commitments preserved by reuse, not by copy: PUT-only additive publication, directory-key double-write (`directoryAliasFor`), the origin receipt guard (`publicationPlan` / `assertPublicationArtifactOrigin`, commit `0fa6d66`), and the midnight rule (`publish:surface --verify` refusing a surface that is not Panama's current civil day). Durable previous-surface state lives at `site/published-surface.json` in the site bucket so dawn receipts survive cold starts (ADR decision 2); a missing state object seeds honestly from the incoming update, the same null-previous path `publish-static-surface.ts` already has. `publish.success` is derived by a pure function in the `log-events.ts` pattern and is never logged unless every PUT completed; refusals log `publish.refused` with the reason. The container image is proven on Linux/ARM64 by a smoke sibling of `scripts/smoke-build-lambda-arm64.mjs` before anything counts. |
| slice-02 | Build hands the fresh bundle to the Publisher and the stacks know it: the hour Build logs build.success, it synchronously invokes the Publisher with the bundle it just wrote; the synthesized template carries the bounded function (reserved concurrency 1, 300 s timeout, PUT-only grants, no schedule of its own, no S3 event, no queue), and a publish dead-man alarm mirrors the Build pattern so a silently stale site pages a human. | pending | depends-on slice-01 | The seam is `build-handler.ts` after the public-manifest probe: synchronous RequestResponse invoke with `{build_id, bundle_key}`, `retryAttempts: 0`, failure logged as an event line and never retried (next hour self-heals because publication is idempotent PUT-only). Build's declared timeout rises 120 s → 420 s to cover the wait; that is a reviewed guardrail change shipped with its declaration and `test:infra` updates in the same slice, not drift. Infra is honest by synthesis: `synth:infra` stays credential-free green, and the template assertions pin what "bounded" means (no new trigger types, no Delete in any Publisher grant, `PublishSuccess` metric filter, observability dead-man mirroring `surfs-up-panama-build-dead-mans-switch`). Deploy explicitly does NOT happen in this lane; order Site → Ingest → Observability belongs to the integration terminal per the release-readiness doc. |

Notes on the plan:

- Row order is dependency order. slice-02 consumes slice-01's handler and cannot enter DELIVER
  before slice-01 seals.
- **This lane owns no deployed mutation.** Everything is proven by local gates: acceptance
  suite, unit suite, ARM64 container smoke, credential-free synth, infra tests, `ci:local:fast`.
- **Reuse is load-bearing.** The publication seam functions (`publishBuild`, `directoryAliasFor`,
  `publicationPlan`, `assertPublicationArtifactOrigin`) and the surface merge
  (`mergePublishedSurface`) are imported, never reimplemented. A second implementation of any of
  them is a contract violation, not a refactor (drift is this project's worst shipped bug).
- **No new trigger types.** The only path into the Publisher is Build's synchronous invoke. Any
  schedule, queue, or bucket notification appearing in a template is a defect by definition.

## Wave: DISCUSS / [REF] Slice classification

| Slice | Classification | Note |
|---|---|---|
| slice-01 | pipeline (non-user-visible) | No rendered surface changes: the HTML the Publisher uploads is byte-for-byte what the manual path publishes. The observable is a terminal one: the driving port's refusal/success behavior and the ARM64 smoke's printed evidence. U1-U7 N/A rationale: no DOM, no route, no style is added or changed; the slice's honest surface is CLI output, examined against the slice charter through that surface. |
| slice-02 | pipeline/infra (non-user-visible) | The observable is the synthesized CloudFormation template plus Build's handler behavior with fake ports. U1-U7 N/A rationale: infra declarations and a handler seam; nothing renders. |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | The driving port (`runPublishOnce`) walks merge → render → PUT-only publish end to end through injected ports, and every slice-01 acceptance scenario is green. |
| 2 | Refusals are honest and total: a surface not for Panama's current civil day, an artifact whose origin receipt does not match production, and a bundle whose `build_id` does not match the invocation each refuse with a named reason, upload zero objects, and leave the previous durable surface unchanged. |
| 3 | PUT-only is proven, not promised: acceptance asserts the recorded operations contain no list and no delete, and the slice-02 template assertions show no Delete action in any Publisher grant. |
| 4 | The directory-key double-write and `no-cache` upload behavior are preserved by importing the checked-in publication code; dawn receipts survive across two simulated cycles via the S3 state object, and a first run with no state seeds honestly. |
| 5 | `publish.success` is never logged unless every PUT completed (pure derivation, `log-events.ts` pattern); refusals log `publish.refused` with the reason. |
| 6 | The container image runs the real render on Linux/ARM64: the smoke script builds the image, executes the pipeline against fixture predictions inside it, and prints PASS evidence with the artifact sizes, refusing on any budget breach. |
| 7 | Build invokes the Publisher synchronously after `build.success` + manifest probe, `retryAttempts: 0`; an invoke failure is logged as an event line and never retried in-cycle. |
| 8 | The synthesized template carries the Publisher bounded exactly as the ADR says: ARM64 container image function, reserved concurrency 1, timeout 300 s, production-origin env, no schedule targeting it, no S3 bucket notification, no queue anywhere in the diff; Build's timeout declaration moves to 420 s with its guardrail test updated in the same commit. |
| 9 | `PublishSuccess` metric filter + publish dead-man alarm land following the existing Build pattern, alarm wired to the same SNS topic. |
| 10 | Gates: `npm run synth:infra` green credential-free, `npm run test:infra` green, `node scripts/ci-local.mjs --fast` exits 0 with 0 skipped required jobs. Nothing is deployed from this lane; no `cdk diff` is ever run (it uploads assets). |
| 11 | The ADR is committed; every Slice Plan row above is flipped `shipped` with its sealing SHA. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Deploying any stack, observing live alarms, the first real publish cycle | Integration terminal, order Site → Ingest → Observability (release-readiness doc); this lane only proves local gates |
| `PUBLIC_REPORT_MINT_URL` / `PUBLIC_REPORT_SUBMIT_URL` in the Publisher env | Report production activation (HANDOFF item 2); ADR follow-up 1 |
| Fixing `no-cache` on hashed `assets/*` uploads (defeats the immutable-asset cache design) | Its own future slice; pre-existing behavior shared with the manual path (ADR follow-up 2) |
| Preview-target automation (auto-publishing the preview distribution) | Nowhere yet; the bridge is production-only by decision |
| Per-cycle OG images beyond what `npm run build` already emits | F-PASTE-THE-CALL-INTO-THE-GROUP's lane |
| Any new trigger (schedule, queue, S3 event) for the Publisher | Never, by the recorded decision |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | Docker running locally (CDK bundling + container smoke) | slice-01 smoke, slice-02 synth | this lane | satisfied at workspace opening |
| 2 | The weather data plane is committed but NOT deployed; live functions are still placeholders. Nothing here may assume a deployed Build. All proof is local. | nothing mechanically; framing | integration terminal | open, recorded |
| 3 | Publisher image must keep `npm run build`'s midnight verify in the execution path (never bypass it); the acceptance suite pins this. | slice-01 | this lane | closed by design |

## Scaffold audit: what exists on disk today (verified 2026-08-12)

| Thing | State | Evidence |
|---|---|---|
| Publisher Lambda (handler, image, smoke) | absent | `src/pipeline/lambda/` holds fetch-handler, build-handler, log-events, bundled-launch-seed-paths only |
| Build → Publisher invoke seam | absent | `build-handler.ts` ends at the manifest probe; no lambda:InvokeFunction anywhere in `infra/` |
| Publish log events | absent | `log-events.ts` has ingest/build events only |
| Durable surface state in S3 | absent | `data/published-surface.json` is git-committed local state; no `site/published-surface.json` writer exists |
| Publication seam functions to reuse | real | `scripts/preview/publish-preview.mjs` (exports `publishBuild`, `directoryAliasFor`), `scripts/release/publication-target.mjs`, `src/publish/static-surface.ts` (`mergePublishedSurface`), `src/publish/publish-static-surface.ts` (midnight verify via `npm run build`) |
| Bounded-function precedents | real | `ingest-stack.ts` (reserved concurrency, retryAttempts 0, metric filters), `observability-stack.ts` (`BuildDeadMansSwitch` pattern), `scripts/smoke-build-lambda-arm64.mjs` |
| functionNames slot for the publisher | absent | `infra/lib/physical-names.ts` has fetch/build/report/mint/push/photo-presign/resize/breaker |

One line: nothing of this bridge exists in code; every seam it must honor is already committed
and tested, and the bridge's job is to compose them inside one bounded function.

## Wave: DISTILL / [REF] Slice-01 acceptance design

Authored 2026-08-12 (Quinn, DISTILL). Reconciliation across feature-delta DISCUSS sections, the
ADR, and the slice charter: **0 contradictions** (the ADR's "midnight rule fires inside `npm run
build`" and the port's injected-clock civil-day check are belt and suspenders — the core check is
pinned here; the real render's verify stays proven by the ARM64 smoke per pre-requisite 3).

### Feature files (the executable SSOT)

| File | Scenarios |
|---|---|
| `tests/acceptance/weather-to-site-bridge/a-fresh-bundle-republishes-the-site.feature` | 7 |
| `tests/acceptance/weather-to-site-bridge/the-publisher-answers-only-its-build.feature` | 2 |

Steps: `tests/acceptance/weather-to-site-bridge/steps/publish-pipeline.steps.ts`,
`steps/publish-handler.steps.ts`, `steps/support/world.ts` (fakes, fixtures, port pins).
The runner's existing globs (`tests/**/*.feature`, `tests/**/steps/**/*.ts`) already cover them;
no runner change was needed. 9 scenarios total; 5 of 9 are refusal/error paths (56%).

### The pinned driving-port contract (crafter implements to exactly this seam)

`src/pipeline/publish-site.ts` exports `runPublishOnce(deps): Promise<PublishOutcome>` with deps
`{ invocation: { build_id, bundle_key }, store: { get(key), put(key, body) }, renderer:
(mergedSurfaceJson) => Promise<distDir>, commandRunner: (command, args) => Promise<unknown>,
clock: { now() } }` and `PublishOutcome = { published: true, build_id, uploaded_objects,
directory_aliases } | { published: false, reason }`. Publication target fixed to production
inside the port. Refusals RESOLVE with a named reason, never throw. Durable archive key:
`site/published-surface.json`. `derivePublishLogLines(outcome)` is exported from
`src/pipeline/lambda/log-events.ts` (the `deriveBuildLogLines` pattern; scaffold-audit row
"Publish log events" already places it there). `src/pipeline/lambda/publish-handler.ts` exports
`runPublish(event, overrides)` with overrides `{ environment?, publish? }`, answering
`{ statusCode: 200 }` published / `{ statusCode: 204 }` refused (build-handler precedent).

### Scenario titles (exact) and RED classification

Run: `npm run test:at -- --tags "@feature-weather-to-site-bridge and @slice-01"` → exit 1,
`9 scenarios (9 failed)`, zero undefined steps, zero import crashes. Every failure is an
`AssertionError` carrying its stated absence — MISSING_FUNCTIONALITY, correct RED, all nine:

| # | Scenario | RED classification (one line) |
|---|---|---|
| 1 | A fresh bundle for today republishes every page with no human in the loop | MISSING_FUNCTIONALITY — assertion "the publish cycle produced no outcome at all", stated absence: `src/pipeline/publish-site.ts` does not exist yet |
| 2 | A bundle for the wrong civil day refuses by name and touches nothing | MISSING_FUNCTIONALITY — same stated absence, fails on "the cycle refuses naming both civil days" |
| 3 | A site rendered for another origin refuses before anything is uploaded | MISSING_FUNCTIONALITY — same stated absence, fails on "refuses naming the origin the site was really rendered for" |
| 4 | A bundle that is not the build the publisher was asked for refuses before any work | MISSING_FUNCTIONALITY — same stated absence, fails on "refuses because the bundle is not the build it was asked to publish" |
| 5 | A publish cycle only ever adds, it never lists and never deletes | MISSING_FUNCTIONALITY — same stated absence; the PUT-only Then guards against a vacuous pass by first requiring a completed cycle |
| 6 | Dawn receipts survive the day's later cycles, and a first run seeds honestly | MISSING_FUNCTIONALITY — assertion "nothing is get-able at the durable archive key site/published-surface.json", same stated absence |
| 7 | A publish that could not finish never claims success | MISSING_FUNCTIONALITY — same stated absence, fails on "the cycle does not claim it published" |
| 8 | The front door passes Build's call through unchanged and answers with what happened | MISSING_FUNCTIONALITY — assertion "the cycle behind the door never received anything", stated absence: `src/pipeline/lambda/publish-handler.ts` does not exist yet |
| 9 | A front door missing a setting refuses loudly and starts nothing | MISSING_FUNCTIONALITY — assertion "the door answered as if it could run", same stated absence |

### What runs real vs fake (per the Project Infrastructure Policy, rows appended this run)

Real through the port: `mergePublishedSurface`, `assertStrictTwoDayUpdate` (also validates every
fixture at build time, so no scenario can fail for fixture reasons), the civil-day rule against
the injected instant, and `publishBuild`'s walk + alias double-write + content types + no-cache +
`assertPublicationArtifactOrigin` over the fake renderer's REAL temp directory. Fake: recording
get/put store, recording command runner (breakable on the Nth put), fixture renderer (writes the
dist shape incl. the origin receipt), fixed injected clock. Expected archives in Thens are
computed through the real `mergePublishedSurface` — the oracle is the checked-in seam.

### Tier and paradigm decisions

Tier A only; Tier B (state-machine PBT) deliberately skipped: this is a layer-3 suite (real FS +
recorded ports), sad paths are enumerated example-based per Mandates 9/11, and the input-space
exploration belongs to DELIVER's fast-check unit layer (project functional paradigm). State-delta
universe (`archive.bytes`, `uploads.keys` — port-exposed names via `tests/common/state_delta.ts`)
guards the refusal scenarios fail-closed and the happy-cycle delta.

### Flags

1. **Pinned decision — log-lines home**: `derivePublishLogLines` is pinned to
   `src/pipeline/lambda/log-events.ts` (where the scaffold audit already expects publish events).
   If the crafter wants it elsewhere, that is a DISTILL change, not a DELIVER one.
2. **Pinned decision — front-door answer**: 200/204 mapping and the `{ environment, publish }`
   overrides shape are pinned from the build-handler precedent + the policy's explicit read-only
   environment input. Required settings pinned to exactly `BUCKET_NAME` + `PUBLIC_SITE_ORIGIN`;
   needing a third required setting comes back through DISTILL.
3. **Pinned decision — refusals name things**: both civil days (scenario 2), both build ids
   (scenario 4), the receipt's real origin (scenario 3), and the broken upload's own error
   message (scenario 7). A reason that swallows its cause fails.
4. **Stronger than the dispatch minimum**: scenario 4 also asserts zero uploads and an untouched
   archive (follows the ADR's step-1 ordering: identity check before merge).
5. Cucumber's summary line counts every registered sibling hook as hidden steps ("201 steps" for
   48 real ones); the per-scenario step counts above are from the JSON formatter.
6. Nothing was committed and no git command was run (dispatch constraint); the ARM64 container
   smoke and everything under `src/`, `scripts/`, `infra/` remain DELIVER's.
