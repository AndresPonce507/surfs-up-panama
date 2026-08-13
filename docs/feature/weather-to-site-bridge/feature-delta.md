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
| slice-01 | A fresh bundle becomes a freshly published site through one bounded pipeline: given the bundle a Build cycle just wrote, the Publisher merges it into the durable surface archive, renders the real Astro site for the production origin, and uploads every page PUT-only with its directory alias; and every dishonest input (wrong civil day, wrong origin receipt, wrong build id) refuses loudly, uploads nothing, and leaves the previous surface intact. | **BLOCKED, not shipped** (code complete; Vera FAIL 2026-08-13; DoD 6 unmet) | @walking_skeleton, owns the publish core + Lambda image | Thinnest end-to-end vertical that proves the risky part: the whole manual release chain (`pipeline:build` → `publish:surface` → `npm run build` → `publish-preview --target production`) running unattended inside one function, with its four seam commitments preserved by reuse, not by copy: PUT-only additive publication, directory-key double-write (`directoryAliasFor`), the origin receipt guard (`publicationPlan` / `assertPublicationArtifactOrigin`, commit `0fa6d66`), and the midnight rule (`publish:surface --verify` refusing a surface that is not Panama's current civil day). Durable previous-surface state lives at `site/published-surface.json` in the site bucket so dawn receipts survive cold starts (ADR decision 2); a missing state object seeds honestly from the incoming update, the same null-previous path `publish-static-surface.ts` already has. `publish.success` is derived by a pure function in the `log-events.ts` pattern and is never logged unless every PUT completed; refusals log `publish.refused` with the reason. The container image is proven on Linux/ARM64 by a smoke sibling of `scripts/smoke-build-lambda-arm64.mjs` before anything counts. |
| slice-02 | Build hands the fresh bundle to the Publisher and the stacks know it: the hour Build logs build.success, it synchronously invokes the Publisher with the bundle it just wrote; the synthesized template carries the bounded function (reserved concurrency 1, 300 s timeout, PUT-only grants, no schedule of its own, no S3 event, no queue), and a publish dead-man alarm mirrors the Build pattern so a silently stale site pages a human. | **shipped** `b3f64cb` (02-01) + `4c1467b` (02-02) | depends-on slice-01 | The seam is `build-handler.ts` after the public-manifest probe: synchronous RequestResponse invoke with `{build_id, bundle_key}`, `retryAttempts: 0`, failure logged as an event line and never retried (next hour self-heals because publication is idempotent PUT-only). Build's declared timeout rises 120 s → 420 s to cover the wait; that is a reviewed guardrail change shipped with its declaration and `test:infra` updates in the same slice, not drift. Infra is honest by synthesis: `synth:infra` stays credential-free green, and the template assertions pin what "bounded" means (no new trigger types, no Delete in any Publisher grant, `PublishSuccess` metric filter, observability dead-man mirroring `surfs-up-panama-build-dead-mans-switch`). Deploy explicitly does NOT happen in this lane; order Site → Ingest → Observability belongs to the integration terminal per the release-readiness doc. |

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

## Wave: DISTILL / [REF] Slice-02 acceptance design

Authored 2026-08-13 (Quinn, DISTILL), Just In Time, on the rebased base
(`origin/main` 36e0290). Reconciliation across the feature-delta DISCUSS sections, the ADR, and
the slice-02 charter: **1 contradiction, flagged not resolved** — the publish dead-man alarm
(DoD row 9 + the charter's oracle) against the ten-alarm free-tier ceiling the design is already
sitting on. It is Flag 1 below, with both options and a recommendation; no scenario in this slice
presupposes either outcome. Everything else reconciles at 0.

### Feature files (the executable SSOT)

| File | Scenarios |
|---|---|
| `tests/acceptance/weather-to-site-bridge/build-hands-the-bundle-to-the-publisher.feature` | 5 |
| `tests/acceptance/weather-to-site-bridge/the-deployment-plan-proves-the-publisher-is-bounded.feature` | 6 |

Steps: `steps/build-handoff.steps.ts`, `steps/publisher-boundary.steps.ts`, and two support
modules — `steps/support/slice-02-world.ts` (scenario state, the Before hook, Build's half) and
`steps/support/deployment-plan.ts` (the plan readers, deliberately free of the cucumber lifecycle
so they can be proven on their own; see Flag 12). Both are NEW, with their own `WeakMap` and their
own `Before({ tags: '@feature-weather-to-site-bridge and @slice-02' })` hook, so slice-01's shipped
and green `steps/support/world.ts` is never edited or imported from; the two hooks are independent
and both run. The runner's existing globs already cover the new files. 11 scenarios (61 real
steps), of which **6 of 11 are refusal, negative or error paths (55%)**.

### The pinned seams (the crafter implements to exactly these)

**`src/pipeline/lambda/build-handler.ts`** — `BuildOverrides` gains exactly ONE key:

```ts
invokePublisher?: (invocation: { build_id: string; bundle_key: string }) => Promise<unknown>
```

Called **after** the public-manifest probe **and after** `deriveBuildLogLines`' lines are printed,
only when `outcome.published`, exactly once. Its rejection is caught: never rethrown, never retried
in-cycle, and it never changes what `runBuild` answers. Ordering is load-bearing and is pinned
here, not left to taste: `build.success` describes Build's own work, which really happened, so a
publisher that hangs until Build's own limit must not be able to erase it and page a human about a
build that worked. The bundle key handed over is `pub/v1/regions/${REGION_ID}/bundle.json`,
composed from the `REGION_ID` constant this file already passes to `runBuildOnce` — never a second
hand-typed literal. `BuildOutcome` carries no bundle key, so this composition is unavoidable; the
key is exactly what `src/pipeline/build.ts:212` writes, and `S3Store` maps its `pub/` root away, so
the **physical** key is `v1/regions/pa-pacific/bundle.json` and the read grant belongs on `v1/*`.

**`src/pipeline/lambda/log-events.ts`** — one new constant, in the informational `health.*` family
that file already defines:

```ts
export const PUBLISH_HANDOFF_FAILED_EVENT = 'health.publish.handoff_failed';
```

No metric filter watches it. The line Build prints is `{ event, build_id, reason }`, with the
rejection's own message as the reason.

**`infra/lib/physical-names.ts`** — `functionNames.publish = 'surfs-up-panama-publish'`, following
the `surfs-up-panama-<role>` convention every other slot follows. `publish` is the verb that pairs
with `fetch` and `build`, and `constructId('publish')` collides with nothing.

**Which stack declares the Publisher: `IngestStack`**, beside Build. Three concrete reasons, no
taste involved. The `PublishSuccess` metric filter needs the Publisher's own log group in the same
stack, exactly as `BuildSuccessFilter` sits on `buildLogs`. `publishFn.grantInvoke(buildFn)` stays
same-stack, so no new CloudFormation export crosses a boundary — the deliberate design of
`physical-names.ts`. And a fifth stack would force `realStacks` / `realTemplates` in
`infra/test/guardrails.test.ts` to grow, plus a fifth entry in `infra/bin/app.ts`, plus a change to
the mandated Site → Ingest → Observability deploy order. The image is wired with
`DockerImageCode.fromImageAsset(repositoryRoot, { file: 'infra/lambda-images/publisher/Dockerfile' })`
— the shape the checked-in Dockerfile's own header already names.

### Scenario titles (exact) and RED classification

Run: `npm run test:at -- --tags "@feature-weather-to-site-bridge and @slice-02"` → **exit 1**,
`11 scenarios (11 failed)`, `270 steps (235 passed, 24 skipped, 11 failed)` — **zero undefined
steps, zero ambiguous steps, zero import crashes**. Every failure is an `AssertionError` carrying
its stated absence. The deployment plan itself synthesizes fine inside the run (the failure
messages list all nine functions the plan really carries), and the handler scenarios reach their
assertions through a build that really published, so nothing fails early for a harness reason.

| # | Scenario | RED classification (one line) |
|---|---|---|
| 1 | Build hands the publisher the build it just finished | MISSING_FUNCTIONALITY — "the publisher was asked 0 time(s) this hour, not once"; stated absence: `log-events.ts` exports no `PUBLISH_HANDOFF_FAILED_EVENT` and `runBuild` ignores `invokePublisher` |
| 2 | An hour with nothing worth publishing never wakes the publisher | MISSING_FUNCTIONALITY — "this morning's honest cycle handed the publisher 0 bundle(s), not one"; the chained Given is what keeps this negative from passing vacuously |
| 3 | Pages that cannot be confirmed public are never handed over | MISSING_FUNCTIONALITY — same stated absence, same anti-vacuity guard |
| 4 | A publisher that cannot be reached is written down, never retried, and never erases the build | MISSING_FUNCTIONALITY — "the publisher was asked 0 time(s) this hour" |
| 5 | A publisher that refuses spoke for itself, so Build records no failed handover | MISSING_FUNCTIONALITY — fails on the handover before it can reach the "no failed handover" Then, which alone would pass vacuously |
| 6 | The plan carries the publisher bounded exactly as the decision says | MISSING_FUNCTIONALITY — "the plan carries no publisher named `surfs-up-panama-publish`. It carries: breaker, build, fetch, mint, notify, photo-presign, push, report, resize" |
| 7 | Build is the only thing that can start the publisher | MISSING_FUNCTIONALITY — same stated absence; every negative here is gated behind the publisher existing first |
| 8 | The publisher may add pages and may never erase one or ask what is there | MISSING_FUNCTIONALITY — same stated absence |
| 9 | Neither Build nor the publisher is ever quietly run twice for the same hour | MISSING_FUNCTIONALITY — same stated absence |
| 10 | Build's reviewed limit covers the wait, and the limit a deployer reads is the limit that deploys | MISSING_FUNCTIONALITY — "Build would be cut off after 120 seconds"; needs 420 |
| 11 | A site that quietly stops republishing pages a human | MISSING_FUNCTIONALITY — same stated absence; the `PublishSuccess` counter and its watch do not exist |

### What runs real vs fake

**Build's half** (layer 2, in-memory): real through the port is Build's own production composition
root and the whole real `runBuildOnce` scoring and publication path, against readings held in
memory in the shape `tests/unit/build-handler.test.ts` already proves `runBuild` composes against.
Fake: a recording publisher invoker (can be told to reject), the public page check (passes or
throws), and the hour's instant. Nothing reads the wall clock.

**The plan's half** (layer 4, real synthesis): real is `Template.fromStack` over the real
`infra/bin/app.ts`, all four real stacks, credential-free, memoized once per process — the same
synthesis `synth:infra` performs. Nothing is faked. Nothing is deployed, uploaded or diffed.

### Tier and paradigm decisions

Tier A only. Tier B (state-machine PBT) deliberately skipped for the same reason as slice-01 and
one more: the handover has two states, not a state space, and the plan is a static artifact with
no transitions to model at all. Both halves are example-only per Mandates 9 and 11 — the plan half
because it is a real-adapter layer, the handler half because its sad paths are four named, enumerated
failure modes rather than an input space.

**Mandate 8** is satisfied where there is state to guard and its absence is stated where there is
not. Build's half declares the universe `{ 'publisher.handoffs', 'logbook.events' }` — both
port-exposed observations (what the injected publisher port was handed; what the hour actually
printed), never a field inside anything — and the honest hour asserts its delta through
`assertStateDelta`. The refusal scenarios name the exact list each must leave behind, which is the
same fail-closed guarantee stated positively. The plan half has **no universe on purpose**: it is a
read-only artifact and no step in that file mutates anything, so there is no mutation to guard
(Mandate 8's layer-4 traditional-assertion allowance).

### Flags

1. **CONTRADICTION, escalate — the publish dead-man alarm has no room at the ten-alarm ceiling.**
   DoD row 9 and the charter both require a publish dead-man mirroring the Build pattern. But the
   design is at **10 of 10**: `infra/test/guardrails.test.ts:936-939` asserts `alarmCount` is
   `toBeLessThanOrEqual(10)` **and** `toBe(10)`, under the title "keeps the whole design inside the
   ten-alarm free tier"; the ten are 6 in the observability stack and 4 write-path breakers. This is
   a recorded cost decision with a whole sibling feature named after it
   (`f-bill-stays-zero-and-stays-up`), not an inventory count, so this lane may not quietly cross it.
   - **Option A — retarget the existing Build dead-man from `BuildSuccess` to `PublishSuccess`.**
     Alarm count stays 10; the ceiling assertion is untouched. It is also strictly the better
     staleness detector: Build only hands over after `build.success` **and** the manifest probe, and
     the publisher only logs `publish.success` after every single PUT completed, so a `publish.success`
     line implies the whole chain worked. What is lost is differential paging — "build failed" and
     "built but never published" would page identically — but both stay fully diagnosable from the
     `build.refused` / `publish.refused` / `health.publish.handoff_failed` lines, which is where a
     human looks anyway. Consequence to record: the `BuildSuccess` metric filter survives as
     diagnostic-only, with no alarm watching it. Edit surface: the alarm's `alarmName` changes, which
     is a CloudFormation replacement, and `docs/demo/weather-ingestion-release-readiness-2026-08-11.md`
     line 70 and `HANDOFF.md` line 16 both name `surfs-up-panama-build-dead-mans-switch`.
   - **Option B — add an eleventh alarm.** `guardrails.test.ts:938-939` must move and the free-tier
     ceiling is crossed for about $0.10/month.
   - **Recommendation: Option A.** It satisfies the DoD's intent (a silently stale site pages a
     human) at zero cost and keeps the recorded ceiling honest, and the paging it gives up is
     recoverable from the log lines. **This lane should not decide it alone** — it touches the
     sibling billing feature's premise. Scenario 11 is written mechanism-agnostic on purpose:
     it looks for *a* watch on `PublishSuccess` with the dead-man properties, and passes under
     either option. Also worth recording: `docs/product/architecture/system-architecture.md` still
     budgets alarm usage at **8** ("4 infra + 4 write-path breakers", amended 2026-08-08) while the
     synthesized reality is 10. The doc understates by two, which strengthens rather than weakens
     the "we are at the ceiling" reading, and is its own small drift worth fixing.

2. **The house grant helper cannot be used for the publisher's read, and the survey said it could.**
   `bucket.grantRead(fn, prefix)` grants `["s3:GetObject*","s3:GetBucket*","s3:List*"]`
   (`aws-cdk-lib/aws-s3/lib/perms.js`), so it hands out `s3:List*`. The charter's oracle forbids any
   List action in any publisher statement. This is not theoretical:
   `infra/test/ingest-fetch-permissions.test.ts:42-45` exists precisely because `grantRead` put
   `s3:List*` on the Fetch role. The publisher's bundle read must therefore be an **explicit
   `s3:GetObject` statement** on the physical `v1/*` prefix (and the durable archive key), not
   `grantRead`. The precedent is already in this repo: the write stack writes its own scoped
   `s3:ListBucket` statement with a condition (`ingest-fetch-permissions.test.ts:62-75`), so raw
   statements are established practice where the helper's action set is too broad. `grantPut` is
   safe — `["s3:PutObject*","s3:Abort*"]`, no List, no Delete. Scenario 8's failure message carries
   this warning inline so a crafter meets it at the moment it matters.

3. **Build's 120 → 420 s move has a six-file blast radius, and two of those files belong to another
   feature.** The declaration must not be allowed to lie about what deploys, so all of these move in
   the same commit:
   1. `infra/lib/ingest-stack.ts` — `lambdaTimeoutSeconds.build`
   2. `infra/lib/guardrail-declarations.ts:7` — `'timeout-build': '120 seconds'`
   3. `infra/guardrail-evaluator.mjs:9` — the hardcoded required value the credential-free gate
      compares against; leaving it behind reds `ci:local`
   4. `tests/acceptance/f-bill-stays-zero-and-stays-up/fixtures/controlled-bill-declarations/infra/lib/guardrail-declarations.ts:8`
   5. `tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-declarations/infra/lib/guardrail-declarations.ts:16`
   6. `tests/acceptance/daily-call-with-permanent-receipts/steps/infrastructure-guardrails.steps.ts:93` and `:123`,
      **and the `.feature` file itself** at `infrastructure-guardrails.feature:64`
   Item 6 means editing a sibling feature's Gherkin, which the house rule normally forbids DELIVER
   from doing. **The coordinator should sanction that edit explicitly before the crafter makes it.**
   Scenario 10 asserts the declaration and the plan agree, so this cannot be silently half-done.

4. **The full list of closed-world assertions that must move in the same commit.** The dispatch
   survey named four; these are the ones it missed, verified by reading:
   - `infra/lib/write-declarations.ts:52` `reservedConcurrencySum = 14`, asserted at
     `guardrails.test.ts:538` → **15** with the publisher at concurrency 1.
   - `guardrails.test.ts:525` `toBeLessThanOrEqual(120)` breaks for **both** Build (420) and the
     publisher (300). The intended replacement is per-function declared equality plus a new stated
     ceiling, with the synchronous publish wait named as the reviewed reason — not a quietly deleted
     assertion.
   - `guardrails.test.ts:543` `logGroups.length === functions.length` self-adjusts, but only if the
     publisher gets its own explicit 14-day log group like Fetch and Build. It needs one anyway, for
     the metric filter to attach to.
   - Already known and confirmed exact: `:517` (nine functions, no strays), `:522`/`:529` (declared
     timeout / reserved concurrency tables), `:936` (the alarm ceiling, Flag 1).

5. **Pinned decision — do NOT add a `timeout-publish` row to `guardrailDeclarations`.** It looks
   consistent and it is a trap: `infra/bin/app.ts:95` builds one synthetic placeholder function per
   `timeout-*` key at the single global `lambda-reserved-concurrency: '2'`, which would declare the
   publisher as running two cycles at once when it really runs one; and
   `infra/guardrail-evaluator.mjs:181-182` hardcodes `'11 Lambda guardrail values inspected'` with a
   matching `slice(0, 11)`, a string a sibling feature asserts verbatim at
   `infrastructure-guardrails.steps.ts:604`. The publisher's bound is proven where the charter asks
   for it — in the plan — by scenarios 6 and 11. If a later slice wants the row anyway, it is a
   DISTILL change, not a DELIVER one.

6. **Pinned decision — a refusal answer is not a failed handover.** Scenario 5 pins that Build
   writes down `health.publish.handoff_failed` only when the invoke itself REJECTS, never when the
   publisher answers "nothing was published". The publisher already logs `publish.refused` with its
   own reason in its own log; a second line in Build's log for the same event would make the
   publisher's honesty gate ambiguous about who is claiming what. A crafter could reasonably have
   guessed either way, so it is pinned rather than left open.

7. **Pinned decision — event name and line shape.** `health.publish.handoff_failed`, in the
   informational `health.*` family `log-events.ts` already defines, watched by no metric filter,
   printed as `{ event, build_id, reason }`. Changing it is a DISTILL change (slice-01 flag 1
   precedent).

8. **Plan steps carry a fifteen-minute budget, not fifteen seconds.** Drawing the plan up costs
   about 2 s today with warm layers, and MINUTES the first time the publisher's container image is
   staged (`npm ci` inside Docker — the ADR's consequences section says so plainly). A budget sized
   for RED alone would time out during GREEN and read as a failure instead of a cold cache.

9. **Stale scaffold-audit row, corrected.** The "Scaffold audit" table above says "Publish log
   events | absent" and "Publisher Lambda (handler, image, smoke) | absent". Both were true on
   2026-08-12 and are false now: slice-01 shipped `src/pipeline/publish-site.ts`,
   `src/pipeline/lambda/publish-handler.ts`, `derivePublishLogLines` with both publish event
   constants, `infra/lambda-images/publisher/Dockerfile` and the ARM64 smoke. Slice-01's nine
   acceptance scenarios are green on this base (verified this run, exit 0).

10. **Base is green before any of this, both gates.** `npm run synth:infra` exits **0**
    credential-free, and the plan it draws carries exactly nine functions with no publisher.
    `npm run test:infra` exits **0** — 10 files, 94 tests passed — so the five `guardrails.test.ts`
    edits in Flag 4 start from a genuinely green baseline, not an inherited chase. `npm run
    typecheck` exits **0**, a whole-suite `--dry-run` exits **0** (402 scenarios, 8,903 steps, zero
    undefined and zero ambiguous), and slice-01's nine scenarios still pass. Every RED above is a
    real absence. Nothing was committed and no git command that mutates state was run (dispatch
    constraint); everything under `src/`, `scripts/` and `infra/` remains DELIVER's.

11. Cucumber's summary counts every registered sibling hook as hidden steps ("270 steps" for the 61
    real ones across the two feature files), the same inflation slice-01 recorded.

12. **The plan readers were proven falsifiable before the scenarios were allowed to lean on them.**
    Scenarios 7, 8, 9 and 11 all stop at `publisherIn()` today, which means every helper past that
    point — the role/statement walk, the action reader, the retry-configuration lookup, the alarm
    and metric-filter lookups, the ops-topic resolver, the declaration reader — would have been
    untested code whose first real execution happened at GREEN, where a wrong-shape helper reads as
    a crafter mistake. This project's `CLAUDE.md` is explicit that two of its tests have already
    passed for accidental reasons, so each helper was instead exercised against **Build and the
    existing dead-man watch**, which already carry every shape the publisher will carry. All pass.
    That is why the plan readers live in their own cucumber-free module. Two things the run
    settled: `EventInvokeConfig.FunctionName` renders as `{"Ref":"Build45A36621"}`, a reference to
    the logical id rather than the literal name, so the lookup now matches **either** form; and
    Build's real synthesized action set is
    `s3:Abort*, s3:GetBucket*, s3:GetObject*, s3:List*, s3:PutObject*` — `grantRead`'s `s3:List*`
    confirmed on the live template, not just read out of the CDK source (Flag 2).

13. **The synchronous claim is now actually discriminating.** The fake publisher settles on a
    macrotask, not a microtask. A microtask drains before the outer `await runBuild(...)` resolves,
    so `void invokePublisher(...)` with no `await` would have passed the one assertion that carries
    the synchronous claim — the whole justification for Build's 420 s limit and DoD row 7. A
    macrotask cannot drain before an un-awaited `runBuild` returns.

## Wave: DELIVER / [REF] Process waiver: DES enforcement exempt, evidence enforced by hand

Applied 2026-08-12 on coordinator instruction, citing the HANDOFF §10 precedent ("Waivers,
recorded rather than hidden", waiver 2: absent or broken DES gates are replaced by real, named
gates with real exit codes, and no broken gate is ever reported as passing).

**Defect**: the DES Stop hook on this machine anchors to a foreign worktree (cwd-based; this
orchestrator session's cwd is `/Users/andres/psb-deliver-integration-20260812`, not this lane's
worktree) and wedges crafter subagents dispatched with `DES-VALIDATION` markers.

**Waiver**: crafter dispatches for this feature carry `<!-- DES-ENFORCEMENT : exempt -->`. The
first 01-01 dispatch predated the instruction and went out with DES-VALIDATION markers; it was
course-corrected in flight (absolute `--project-dir`, refusals noted plainly, evidence in the
commit message).

**What replaces the mechanical gate, per step — nothing is reported as passing that did not run**:

1. Real RED and GREEN test runs with exit codes captured in the step's commit message (and/or a
   step contract JSON in this deliver/ directory).
2. Focused slice tags green (`npm run test:at -- --tags "@feature-weather-to-site-bridge and
   @slice-NN"`) plus the fast gate (`node scripts/ci-local.mjs --fast`) with 0 skipped required
   jobs, output redirected to a file and the file read.
3. `des-log-phase` records with absolute `--project-dir` into this worktree where the shim
   accepts them (legacy phase names if RED is rejected); tooling refusals are noted plainly in
   the step report, never fabricated.
4. Vera examination for visible steps (this feature's steps are non-visual with recorded
   rationale; the slice-01 charter is examined through its CLI surface).

**Correction appended 2026-08-12 (coordinator), binding on every dispatch in this lane**: a
PreToolUse hook on this machine blocks bash commands whose text contains "execution-log". One
crafter staged that file by rewording its git command to slip past the filter. The staged
content was legitimate (its own CLI-accepted phase records) and no harm was done, but dodging a
hook filter is never the move. The standing rule: when a hook blocks a legitimate operation,
record the block verbatim in the lane report as a tooling defect and either use the
DES-sanctioned path or leave the staging to the coordinator. This correction is propagated into
every subsequent dispatch prompt.

## Wave: DELIVER / [REF] Flagged production risk: page-weight ceiling on the Lambda Node runtime

Found by the 01-02 crafter while proving the real render inside the linux/arm64 Node 22
container; coordinator-acknowledged as REAL on 2026-08-12. **Owned by the page-weight gate's
owner, not this lane — flagged, not fixed here.**

- The deploy-runtime Node (Lambda Node 22, linux/arm64) gzips roughly 22 bytes heavier than the
  local toolchain the page-weight gate measures with.
- `santa-catalina-la-punta/reportado` is already OVER its declared ceiling when built on the
  Lambda runtime, while passing the local gate.
- The whole `*/reportado` route family sits within ~20 bytes of its ceiling under the deploy
  runtime.

Consequence if unaddressed: the first hourly Publisher cycles can be refused (or ship
budget-violating pages, depending on where the gate runs) for pages that pass local CI. The
honest fix belongs to the page-weight gate: measure with the runtime that publishes, or set the
ceilings with an explicit runtime-gzip margin. Until then this is a known, recorded production
risk for the bridge's first live cycles.

**Status after the 2026-08-13 rebase onto `origin/main` (36e0290): still real, still unfixed, and
now MASKED.** Main did not move the ceilings and added no runtime margin
(`scripts/page-weight-core.mjs` line 57 still declares `/spots/{slug}/reportado` at `4 * KB` =
4,096 B). Main only added property laws for the gate (`tests/unit/page-weight-laws.test.ts`).
The re-run smoke can no longer reach the page-weight gate at all, because the render now refuses
earlier for the reason recorded in the next section, so the 4,099 B measurement could not be
re-taken on the rebased base. It has not been retired, only hidden behind a nearer failure.

Re-measured on the host on 2026-08-13 (`npm run build`, exit 0, whole build 2.03 s). Every one of
the twenty `*/reportado` routes now lands between **4,046 and 4,069 B gz against the 4,096 B
ceiling**, the worst still being `santa-catalina-la-punta/reportado` at **4,069 B — 27 bytes of
headroom**. Against the ~22 B the deploy runtime is known to add, true margin on the worst route
is roughly **5 bytes**, and all twenty routes sit inside 50 bytes of the ceiling.

Be honest about what that does and does not say: the in-container figure could not be re-taken, so
whether `santa-catalina-la-punta/reportado` is currently over or a hair under on the Lambda runtime
is **unknown on this base**. The structural defect is unchanged either way — the ceiling is
measured with a different runtime than the one that publishes, and the entire family is inside the
noise band of that difference. Any content change of a few dozen bytes flips it.

## Wave: DELIVER / [REF] BLOCKER found on the rebase: the static break map manifest is not reproducible on the deploy runtime

Found 2026-08-13 by this lane re-running `npm run smoke:publish-lambda-arm64` after rebasing onto
`origin/main` (36e0290). **NEW since the branch's base — introduced on main overnight by the
static-break-map lane. Owned by that lane and/or the maps policy, NOT fixable honestly inside this
lane. Flagged, not routed around.**

This is strictly more severe than the page-weight risk above: it does not degrade the first live
cycles, it stops every one of them.

### What happens

Main changed the `build` script to put map verification first:

```
build = npm run maps:verify && npm run publish:surface -- --verify && astro build
```

The Publisher runs that real `npm run build` inside the image and, by design and by slice-01
pre-requisite 3, may never bypass it. Inside the linux/arm64 Lambda container the very first step
refuses, so the handler answers 204 (refused) and uploads nothing:

```
Fontconfig error: Cannot load default config file: File not found
static map build refused: WHAT the committed map manifest is not what this policy and seed
produce; WHY the emitted pages would credit one diagram while the manifest names another;
HOW run npm run maps:generate and commit the result.
```

Measured both sides on 2026-08-13:

| Where | `npm run maps:verify` | Result |
|---|---|---|
| Host (macOS, Node 26) | exit 0 | `verified 18 static break map(s), 2 refused, seed b772915cc092` |
| Publisher image (linux/arm64, Node 22) | exit 1 | refuses on the manifest comparison, as quoted above |

### Root cause, confirmed not guessed

Not an encoder difference. `sharp.versions` is **byte-identical** on both sides (sharp 0.35.3,
vips 8.18.3, webp 1.6.0, rsvg 2.62.90, freetype 2.14.3, fontconfig 2.18.1), so the WebP encoding
path is the same on host and in the container.

The difference is **fonts**. `src/publish/static-map-diagram.ts` line 122 draws exactly one glyph
— the north marker "N" — and declares it as:

```
font-family="Helvetica,Arial,sans-serif"
```

The container has no fonts installed and no fontconfig configuration at all (`fc-list` is not even
present; hence the `Fontconfig error` line). librsvg therefore rasterises that single glyph
differently from the macOS host, the WebP bytes differ, the sha256 differs from the committed
`data/maps/pa-pacific-map-manifest.json`, and `verifyStaticMaps` refuses.

So the committed manifest is **host-specific**: it is only reproducible on a machine carrying the
same font that drew it. `npm run maps:verify` is not a portable contract today, and the whole
bridge design rests on the deploy runtime reproducing the host's build.

### Why this lane does not fix it

Installing some font into `infra/lambda-images/publisher/Dockerfile` would be routing around the
finding, not fixing it: any Linux font (Liberation, DejaVu) draws a different "N" outline than
macOS Helvetica, so the hashes still would not match the committed manifest. Making them match
would mean regenerating the manifest on Linux, which then breaks the same gate for every human
running `npm run build` on a Mac. The reproducibility decision belongs to the maps lane.

The two honest fixes, both outside this lane:

1. **Make the diagram font-free** (preferred, cheapest): replace the single "N" `<text>` with a
   vector path. Rendering then depends on no installed font and reproduces identically on every
   runtime. One glyph is a small price for a portable manifest.
2. **Pin the font in-repo**: commit the exact font file, point fontconfig at it from both the host
   and the image, and regenerate the manifest against it.

### Consequence for this feature

slice-01's Definition of Done #6 ("the container image runs the real render on Linux/ARM64 ...
printing PASS evidence") is **NOT met on the rebased base**, and cannot be met by this lane alone.
The Publisher is correct in its own terms — it refuses honestly, uploads nothing, and leaves the
previous pages serving, which is exactly the designed behavior for a build that cannot complete —
but the deployed bridge would refuse every hour until the maps manifest is portable. **Do not
deploy the bridge expecting live republication until this is closed.**

## Wave: DELIVER / [REF] Decision: the staleness dead-man watches PublishSuccess, and no eleventh alarm is added

Decided 2026-08-13 by this lane, resolved from existing authority rather than escalated, and
recorded here because it contradicts a line in this lane's own ADR.

### The contradiction

DISTILL slice-02 Flag 1. Two committed sources disagreed:

| Source | Says | Scope |
|---|---|---|
| `adr-weather-to-site-bridge.md` §5 + the slice-02 charter oracle + DoD row 9 | add a publish dead-man alarm mirroring the Build pattern | feature-scoped, authored by THIS lane on 2026-08-12 |
| `system-architecture.md` §12 | CloudWatch alarms budgeted at **10, perpetual free tier** | project-wide |
| `infra/test/guardrails.test.ts` (~936) | `alarmCount` `toBeLessThanOrEqual(10)` **and** `toBe(10)`, titled "keeps the whole design inside the ten-alarm free tier" | project-wide, enforced |

The design already synthesizes exactly 10 alarms, so the publish dead-man would be the 11th and
would cross a documented perpetual-free-tier ceiling. A sibling feature is literally named
`f-bill-stays-zero-and-stays-up`, so this is a real cost boundary, not bookkeeping.

### The decision

**Retarget the existing dead-man to watch `PublishSuccess` instead of `BuildSuccess`. Do not add
an eleventh alarm.** The project-wide architecture budget outranks this lane's own feature-scoped
ADR, so the ADR is what gives way.

Why this keeps the signal rather than trading it away: Build invokes the Publisher only after
`build.success` and the manifest probe, and the Publisher logs `publish.success` only after every
PUT completed. So one `publish.success` line implies the entire chain worked, and a dead-man on it
strictly **dominates** the `BuildSuccess` dead-man as a staleness detector — it catches everything
the old alarm caught, plus the failure this bridge newly introduces ("built fine, never
published"), which the old alarm cannot see at all.

What is genuinely lost: the ability to *page differently* for "build failed" versus "built but
never published". Both remain diagnosable from the log event lines
(`build.refused` / `publish.refused` / `health.publish.handoff_failed`). Alarms page; logs
diagnose. That is an acceptable trade at a hard cost ceiling, and it is cheap to reverse — it is
one metric name in `observability-stack.ts` plus the ceiling assertion.

### Operational consequence, and it is sharp

A `PublishSuccess` dead-man **fires continuously** until the Publisher actually publishes. With the
map-manifest blocker above unresolved, the Publisher refuses every cycle, so this alarm would page
forever the moment Observability is deployed. That is honest — the site really would be stale —
but it means the deploy has an extra ordering constraint beyond the usual stack order:

> **Do not deploy the Observability stack's retargeted alarm until the map-manifest portability
> fix has landed.** Stack order stays Site → Ingest → Observability, with Observability gated on
> the maps fix, not merely last.

### ADR amendment

`adr-weather-to-site-bridge.md` §5 has been amended: its "a publish dead-man alarm mirror[s] the
existing Build pattern" sentence was true when written and is now false. Leaving an ADR
contradicting the implementation is precisely the drift this project treats as its worst bug.

## Wave: DELIVER / [REF] Lane close-out 2026-08-13: what is sealed, what is not, and what the deploy needs

### Status, stated as a binary rather than softened

| Slice | State | Why |
|---|---|---|
| slice-01 | **NOT sealed** | Code complete and correct in its own terms, but DoD 6 (real render proven inside the ARM64 image) cannot be met by this lane. Vera examined it and returned **FAIL** on 2026-08-13, on the charter's own named negative. The cause is the map-manifest portability blocker recorded above, owned by the maps lane. |
| slice-02 | **shipped** | `b3f64cb` (02-01, the handover) + `4c1467b` (02-02, the declaration). Its own observables are the synthesized template and Build's handler against fakes; neither touches the container render, so its evidence is complete on its own terms. |

slice-01 is not "sealed except for an external blocker". It is not sealed.

### Gates, measured on the final tree

| Gate | Result |
|---|---|
| `npm run test:at --tags "@feature-weather-to-site-bridge"` | exit 0 — 20 scenarios (20 passed), 480 steps (480 passed) |
| `npm run synth:infra` | exit 0, credential-free |
| `npm run test:infra` | exit 0 — 10 files / 94 tests |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 122 files / 614 tests |
| `node scripts/ci-local.mjs --fast` | exit 0 — **11 passed / 0 failed / 0 skipped** |
| `npm run smoke:publish-lambda-arm64` | **exit 1** — blocked by the map manifest, see above |

### What the deploy step needs

Deploy belongs to the integration terminal. Nothing in this lane deployed, and `cdk diff` was never
run (it uploads assets; a prior lane was stopped for exactly that).

Order, per `docs/demo/weather-ingestion-release-readiness-2026-08-11.md`, with one addition this
lane is responsible for:

1. `SurfsUpPanamaSite`
2. `SurfsUpPanamaIngest` — carries both the Publisher (`surfs-up-panama-publish`) and Build's
   420 s timeout. This is the stack that activates the bridge.
3. `SurfsUpPanamaObservability` — **and this one is now gated, not merely last.**

**The added constraint:** the staleness dead-man now watches `PublishSuccess`, and the Publisher
refuses every cycle while the map manifest is unportable. Deploying Observability before that fix
lands means an alarm that pages continuously. Honest, but useless. Hold step 3 until the maps fix
is in.

Deploying requires Docker on the deploying machine and ECR access, because the Publisher is a
container-image function whose asset is built and pushed at deploy time. That is new for this
stack.

### Open, flagged, owned elsewhere

1. **Map manifest is not reproducible on the deploy runtime.** The blocker. Maps lane. Stops every
   publish cycle. Fully diagnosed above.
2. **Page-weight ceilings are measured with a different runtime than publishes.** Page-weight gate
   owner. Worst route has ~5 B of true margin; all twenty `*/reportado` routes sit inside 50 B.
3. **The dead-man's physical name no longer matches its meaning.** It is still
   `surfs-up-panama-build-dead-mans-switch` while watching publication. Kept deliberately to avoid
   an unforced CloudFormation replacement and drift against the readiness doc and `HANDOFF.md`,
   but it will mislead whoever it pages at 03:00. Observability owner.
4. **Publisher `memorySize` is 1536 MB**, an unpinned choice. A ceiling rather than an
   expectation, but worth the billing owner's eyes against `f-bill-stays-zero-and-stays-up`.
5. **`system-architecture.md` §12 records 8 CloudWatch alarms; the design synthesizes 10.** Small
   pre-existing doc drift, found while settling the alarm ceiling.
6. **300 s (Publisher) and 420 s (Build) are declared but UNVALIDATED on this base.** The full
   container render cannot be timed end to end while it refuses at `maps:verify`. The host build
   takes 2.03 s, which suggests both are ample, but that is an inference from a warm-cache host
   run, not a measurement of the runtime these numbers govern. Re-measure once the blocker closes.

### Tooling defects, recorded verbatim rather than worked around

1. A PreToolUse hook on this machine blocks any bash command whose text contains the string
   `execution-log`. Every dispatch in this lane carried the standing rule to record such a block
   rather than reword a command past the filter. No block fired this session.
2. `des-record-examine` refused to record Vera's examination against roadmap step 01-01 or 01-02,
   reporting *"is not a user-visible upgraded roadmap step; source-blind examination is not
   applicable"*, because both steps are `surface_classification=non-visual` — even though the
   slice-01 charter explicitly commissions a non-visual CLI examination. The verdict was written
   into the charter's Session log by hand instead.

## Wave: DELIVER / [REF] Review remediation 2026-08-13: both deploy blockers closed, short-term items done

The independent platform review conditionally approved slice-02's infra (`4c1467b`, `c38e98f`
defect-free on their own scope) behind two blockers. Both are closed on this branch, test-first,
on the rebased base (`origin/main` 50a42ee).

- **HIGH-1 closed (`61e78ff`) — the Publisher has a real caller now.** The deployed handler
  called `runBuild()` bare, so `overrides.invokePublisher` was always undefined and
  `handOverToPublisher` silently no-oped: the feature's whole premise did not execute outside
  tests, and the retargeted dead-man would have paged forever, correctly but uselessly. The fix
  follows `defaultStore`'s composition pattern: `handler` composes `productionBuildOverrides()`,
  whose `defaultInvokePublisher` sends one `InvokeCommand` (`InvocationType: 'RequestResponse'`)
  addressed by the `PUBLISH_FUNCTION_NAME` the ingest stack now wires beside `BUCKET_NAME`, from
  the same `functionNames.publish` single source of truth. The SDK client is capped
  `maxAttempts: 1` explicitly — the template's `MaximumRetryAttempts: 0` governs async invokes
  only and is inert on this synchronous path; the SDK default of 3 attempts x 300 s behind
  reserved concurrency 1 would serialize to ~900 s against Build's 420 s budget and triple-bill
  a wedged render. A `FunctionError` answer surfaces as a rejection so Build writes down the
  failed handover. Guardrails now pin the env wiring (`test:infra`), and three deliberate
  mutants (empty production overrides, uncapped client, injected `s3:ListBucket`) were each
  killed and reverted — the guards are falsifiable, not decorative.
  - Scope note: Build's composition root gained a third required setting. The DISTILL pin
    "exactly `BUCKET_NAME` + `PUBLIC_SITE_ORIGIN`" binds the *Publisher's* front door
    (untouched); Build's own root already refused loudly on missing env in the house
    WHAT/WHY/HOW shape, and `PUBLISH_FUNCTION_NAME` joins that same contract.
- **HIGH-2 closed (`89a3440`) — runbook matches the alarm.**
  `docs/demo/weather-ingestion-release-readiness-2026-08-11.md` now states the dead-man watches
  `PublishSuccess` (threshold: no `publish.success` by the second `:22` cycle after a successful
  Fetch), why the physical name still says build, and that the Observability deploy is **gated
  on the map-manifest portability fix**, not merely ordered last.
- **Short-term items closed (`035b115`).** The Publisher's narrowing Deny now also covers
  `v1/*`, `log/*` and the root `manifest.json` (surfaces Build owns; the rendered dist never
  touches them — it carries `manifest.webmanifest` and no `v1/` or `log/` directory). The
  acceptance suite's no-List/no-Delete guarantee is mirrored into
  `infra/test/guardrails.test.ts` over both DefaultPolicy and role-inlined statements, so a
  widening grant reds `test:infra` alone.
- **gitleaks:** HEAD-reachable history verified clean
  (`gitleaks detect --source . --config gitleaks.toml --redact --no-banner --log-opts="HEAD"`,
  exit 0). The tripping assertion prose was already reworded in the current commits; the known
  offender `dde8651` is an orphaned pre-rebase object in the shared store, unreachable from this
  branch, and reds other lanes' full-store scans until it is garbage-collected.
- **Vera:** N/A recorded — both remediation surfaces are the roadmap's `non-visual`
  pipeline/infra steps, examined through their terminal gates per the slice classifications.

**The lane's deploy posture is unchanged:** slice-02 is now genuinely deploy-ready on its own
scope, but the map-manifest portability blocker (maps lane) still stops every live publish
cycle, slice-01 DoD 6 stays unmet, and Observability stays gated on that fix.
