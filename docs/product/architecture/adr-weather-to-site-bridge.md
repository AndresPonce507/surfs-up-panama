# ADR: Weather-to-site bridge — the bounded Publisher Lambda runs the real release pipeline

## Status

Accepted (DELIVER lane `build/weather-site-bridge`, 2026-08-12). This records and pins the
decision `HANDOFF.md` "Important remaining work" item 3 carries only as one sentence: "a bounded
Publisher Lambda synchronously invoked by Build", with GitHub Actions and an S3-event primary
trigger explicitly rejected. No dedicated decision record existed under `docs/` before this file
(verified 2026-08-12 by grep over `docs/**` for publisher/bridge decision records); what
"bounded" means was unrecorded. This ADR does not redesign the trigger; it defines the boundary.

## Context

The deployed hourly Build Lambda publishes JSON only: `v1/regions/pa-pacific/bundle.json`,
`v1/meta/spot-index.json`, `manifest.json` (`src/pipeline/build.ts`, granted prefixes in
`infra/lib/ingest-stack.ts`). But `adr-publish-time-html-rendering.md` decided the browser
fetches documents, never forecast JSON: "No forecast JSON is delivered to the client. The region
data file remains the builder's input." So JSON republication alone refreshes nothing a surfer
reads. The public HTML goes stale until a human runs the manual chain:

```
npm run pipeline:build -- --at <ISO>        # bundle from predictions
npm run publish:surface -- --input <bundle> # merge into data/published-surface.json
npm run build                                # midnight verify + astro build -> dist/
node scripts/preview/publish-preview.mjs --target production   # PUT-only upload
```

That chain already carries four seam commitments this bridge must not break:

1. **PUT-only, additive publication.** `scripts/preview/publish-preview.mjs` never lists or
   deletes bucket keys; raw captures and the prediction log stay outside its blast radius.
2. **Directory-key double-write.** Every `x.html` also lands at the literal key `x/` because the
   S3 REST origin serves no index document and CloudFront Functions usage is pinned at zero.
3. **Origin receipt guard** (commit `0fa6d66`, `scripts/release/publication-target.mjs`): the
   build bakes `.public-site-origin.json` into `dist/`; publication refuses an artifact built for
   any other origin, so a preview build can never be relabelled production.
4. **The midnight rule.** `npm run build` refuses when `data/published-surface.json` is not for
   Panama's current civil day ("a stale build cannot pretend to be this morning's call").

Freshness on the edge is already solved by design: HTML and published JSON ride short-TTL cache
policies (`infra/lib/site-stack.ts`, default TTL 300 s), "zero routine invalidations by
construction". Rejected upstream and honored here: GitHub Actions (billing-capped account,
`adr-no-hosted-cd.md`) and an S3-event primary trigger (HANDOFF item 3).

## Decision

The Publisher is one Lambda, packaged as a container image that carries the repository and its
installed dependencies, and it runs the exact existing release pipeline. Per invocation:

1. **Input**: Build invokes it synchronously (RequestResponse) after `build.success`, passing
   `{ build_id, bundle_key }`. A successful Publisher answer is followed by Build's
   public-manifest probe, because that is the first instant the fresh HTML can exist. The
   Publisher reads that bundle from the site bucket and refuses when the bundle's `build_id`
   does not match the invocation.
2. **Merge**: `mergePublishedSurface` against the durable previous surface at
   `site/published-surface.json` in the site bucket, then writes the merged state back. S3 is the
   archive of record for the running system, so dawn receipts survive cold starts and redeploys;
   a missing state object seeds honestly from the incoming update alone (same null-previous path
   `src/publish/publish-static-surface.ts` already has).
3. **Render**: the same `npm run build` (midnight verify, then `astro build`) with
   `PUBLIC_SITE_ORIGIN` set to the production origin, executed in a writable copy of the
   project under `/tmp`. The midnight rule fires inside the Lambda exactly as it does locally;
   a stale surface refuses by design and the previous HTML keeps serving.
4. **Publish**: PUT-only upload of `dist/` plus directory aliases with `no-cache`, gated by the
   origin receipt, reusing the checked-in publication code (`publishBuild`, `directoryAliasFor`,
   `publicationPlan`, `assertPublicationArtifactOrigin`), never a copy of it. No CloudFront
   invalidation: short-TTL freshness is the recorded design.
5. **Honesty**: `publish.success` is logged only after every PUT completed, derived by a pure
   function in the `src/pipeline/lambda/log-events.ts` pattern; every refusal logs
   `publish.refused` with its reason. A `PublishSuccess` metric filter mirrors the existing
   Build pattern.

   **Amended 2026-08-13.** This clause originally also required "a publish dead-man alarm mirror
   the existing Build pattern". That is withdrawn: the design already sits at 10 of the 10
   CloudWatch alarms `system-architecture.md` §12 budgets as a perpetual free tier, so an
   eleventh alarm would cross a project-wide cost ceiling that outranks this feature-scoped ADR.
   Instead, **the existing staleness dead-man is retargeted from `BuildSuccess` to
   `PublishSuccess`**, which strictly dominates it as a staleness detector: `publish.success` is
   logged only after a successful build AND every completed PUT, so it implies the whole chain.
   Differential paging between "build failed" and "built but never published" is given up; both
   stay diagnosable from the `build.refused` / `publish.refused` /
   `health.publish.handoff_failed` log lines. Rationale and the deploy-ordering consequence are
   recorded in the feature-delta's alarm-ceiling decision section.

**Bounded means, concretely:**

- One invocation per hourly Build cycle. No schedule of its own, no S3 event, no queue, no new
  trigger type of any kind.
- Synchronous RequestResponse from Build, `retryAttempts: 0` everywhere. A failed or refused
  publish leaves the previous HTML serving, which is stale-but-honest (the staleness stamp lives
  inside each document) and self-heals on the next hourly cycle.
- Reserved concurrency 1, hard timeout 300 s, memory sized for one Astro build.
- PUT-only S3 permissions: read on the region bundle prefix, read+put on
  `site/published-surface.json`, put on the published route keys, and one bucket-level
  `ListBucket` permission scoped to those two read paths so S3 can distinguish a missing first-run
  object from a denied read. Publisher never lists objects and has no Delete permission.

## Alternatives considered

- **Republish JSON + CloudFront invalidation ("narrower contract").** Rejected: the client
  fetches no forecast JSON (`adr-publish-time-html-rendering.md`), so this refreshes nothing a
  surfer sees, and routine invalidations are zero by construction. It would be motion, not a
  bridge.
- **A second, smaller HTML renderer that fits a zip Lambda.** Rejected: it forks the reading
  surface. The worst bug this project ever shipped was silent surface drift that passed all ten
  CI jobs (project `CLAUDE.md`); two render paths make that drift structural. The page-weight,
  UI, and acceptance gates all run against the Astro output and would prove nothing about a
  parallel renderer.
- **Astro build in a zip-packaged NodejsFunction.** Rejected on mechanics: `astro build` needs
  the project tree and its real `node_modules` (vite plugins, platform-specific esbuild binary),
  which esbuild cannot bundle and which risks the 250 MB unpacked zip limit. The container image
  (10 GB limit) carries the exact tree the local gates prove.
- **GitHub Actions / S3-event trigger.** Rejected upstream; recorded here only so nobody
  re-litigates it (`adr-no-hosted-cd.md`; HANDOFF item 3).

## Consequences

- Build waits for the Publisher, so Build's declared timeout rises 120 s → 420 s (covers its own
  ~2 min plus the Publisher's 300 s bound). This is a reviewed guardrail change, updated with its
  declaration and tests in the same slice, not drift.
- `synth:infra` and `test:infra` now stage a container image asset (`npm ci` inside Docker).
  First synth on a machine is minutes; Docker layer caching keyed on `package-lock.json` makes
  later synths cheap. The project already accepted Docker-at-synth for the pipeline Lambdas.
- New least-privilege IAM for one function; nothing existing widens.
- The public site origin keeps serving stale-but-honest pages through any Publisher failure;
  recovery requires no human because the next hourly cycle republishes everything (PUT-only
  publication is idempotent).

## Follow-ups recorded, deliberately not built here

1. **Report activation env**: when the Write stack ships its Function URLs, the Publisher's
   environment gains `PUBLIC_REPORT_MINT_URL` / `PUBLIC_REPORT_SUBMIT_URL` and Ingest redeploys
   (HANDOFF item 2 owns that lane).
2. **Hashed assets upload with `no-cache`**: pre-existing behavior of the PUT-only publisher that
   defeats the immutable-asset cache design for `assets/*`. Flagged, not fixed; it is shared with
   the manual path and belongs to its own slice.
3. **Deploy** belongs to the integration terminal, order Site → Ingest → Observability, per
   `docs/demo/weather-ingestion-release-readiness-2026-08-11.md`. Nothing in this lane deploys.
