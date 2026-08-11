# Weather ingestion release readiness, 2026-08-11

Candidate: `cadc46ac2131dd41e54ca8030e2cf9ec9523cd34` (`release/integration-20260810-batch2`). It includes reviewed weather commit `072d40f4dd7d33bf5b02558a6f31a0764000b247`.

## Decision

**Code is ready to deploy after it is merged to `main`; production is not ready yet.** No deployment was performed in this lane. The live ingest functions are still the former placeholder artifact and are deliberately producing no success metrics. Deploying the candidate Ingest stack is the change that activates real capture.

## Evidence

| Gate | Result |
| --- | --- |
| Focused weather pipeline tests | PASS, 48 tests in 8 files |
| `npm run test:infra` | PASS, 76 tests in 8 files |
| `npm run synth:infra` | PASS, five stacks synthesized without lookups |
| `npm run smoke:build-lambda-arm64` | PASS, Linux/ARM64 handler; 26,877 B zip, 102,487 B unpacked |
| `npm run smoke:fetch-lambda-arm64` | PASS, Linux/ARM64 handler; durable prediction receipt logged |
| `npm run ci:local:fast` | PASS: typecheck, unit, SBOM/checksum, audit, OSV, gitleaks, Semgrep, UI, build/budget, report leak |

## Candidate versus live state

The candidate template expects both functions to use Node.js 22 on ARM64 and the following configuration.

| Function | Candidate | Live observation at 2026-08-11 | Required change |
| --- | --- | --- | --- |
| `surfs-up-panama-fetch` | 512 MB, 60 s, reserved concurrency 2, `BUCKET_NAME=surfs-up-panama-site-602167897909` | Active, Node.js 22/ARM64, 512 MB/60 s, **no environment**, **no reserved concurrency** | Deploy `SurfsUpPanamaIngest` |
| `surfs-up-panama-build` | 1,024 MB, 120 s, reserved concurrency 2, `BUCKET_NAME` and `PUBLIC_SITE_ORIGIN` | Active, Node.js 22/ARM64, 1,024 MB/120 s, **no environment**, **no reserved concurrency** | Deploy `SurfsUpPanamaIngest` |

Live Fetch logs show one scheduled invocation every hour at `:17`, all with `{"event":"ingest.placeholder"}`. There are no `IngestSuccess`, `BuildSuccess`, or `predictions/` objects. `surfs-up-panama-dead-mans-switch` is consequently `ALARM` and `surfs-up-panama-provider-errors` is `OK`.

The candidate adds both schedules and metric filters in `SurfsUpPanamaIngest`:

- Fetch: `cron(17 * * * ? *)` UTC, logs `ingest.success` to `SurfsUpPanama/IngestSuccess`.
- Build: `cron(22 * * * ? *)` UTC, logs `build.success` to `SurfsUpPanama/BuildSuccess`.
- Provider, wind-source, and frozen-cycle metric filters feed their matching alarms.

The inspection credential can describe stacks, Lambda configuration, CloudWatch logs/metrics/alarms, and S3 objects. It cannot read Scheduler schedules or CloudFormation templates/resources. That prevents a complete server-side drift proof, but the direct Lambda and log evidence establishes the activation gap above.

## Required deploy order

Run only after the coordinator confirms the exact candidate has reached `main`, from a clean checkout of that merge commit. Wait for each stack to complete before starting the next.

1. `SurfsUpPanamaSite`
2. `SurfsUpPanamaIngest`
3. `SurfsUpPanamaObservability`
4. `SurfsUpPanamaWrite` last, only if the approved release includes the write path

Weather activation is complete after step 3. Step 1 must remain first because Build imports the site origin; the project’s declared stack order deliberately keeps the write path last.

```sh
npm ci
npm run test:infra
npm run synth:infra
npm run smoke:build-lambda-arm64
npm run smoke:fetch-lambda-arm64
npx cdk deploy --app 'npx tsx infra/bin/app.ts' --require-approval never SurfsUpPanamaSite
npx cdk deploy --app 'npx tsx infra/bin/app.ts' --require-approval never SurfsUpPanamaIngest
npx cdk deploy --app 'npx tsx infra/bin/app.ts' --require-approval never SurfsUpPanamaObservability
# Only if separately in scope:
npx cdk deploy --app 'npx tsx infra/bin/app.ts' --require-approval never SurfsUpPanamaWrite
```

Before each command, record `aws cloudformation describe-stacks --stack-name <name> --region us-east-1`. After each, require `*_COMPLETE` and inspect stack events on failure. Do not use direct `lambda update-function-*` commands: that would create IaC drift.

## Alarm expectations and response

| Alarm | Deployment expectation | Rollback threshold |
| --- | --- | --- |
| `surfs-up-panama-dead-mans-switch` | May remain `ALARM` until two hourly Fetch successes. It must become `OK` after two successful `:17` cycles. | No `ingest.success` by the second scheduled cycle, `health.startup.refused`, or failed prediction write |
| `surfs-up-panama-build-dead-mans-switch` | Created by the candidate observability stack. It must become `OK` after two successful Build cycles. | No `build.success` by the second `:22` cycle after a successful Fetch |
| `surfs-up-panama-provider-errors` | `OK` unless three provider failures occur in one hour. | `ALARM`, then preserve raw evidence and investigate provider access/schema before advancing |
| `surfs-up-panama-wind-source-errors` | `OK` unless three wind failures occur in one hour. | `ALARM`; public site may remain stale-but-correct |
| `surfs-up-panama-frozen-provider-cycle` | `OK`. | First occurrence is a correctness failure |

## Rollback

Record the pre-deploy `main` commit before step 2. If the first real Fetch or Build fails the thresholds above, stop promotion and redeploy `SurfsUpPanamaIngest` from that recorded commit with CDK. If observability was changed, redeploy `SurfsUpPanamaObservability` from the same commit. Do not delete raw or prediction objects: they are forensic receipts and are versioned. Do not use manual code or configuration edits.

The currently deployed placeholder is a safe functional fallback: it does not fabricate a forecast and the dead-man alarm remains honest.

## First real-ingest smoke plan

1. Deploy through `SurfsUpPanamaObservability` before `:17` UTC, or wait for the next complete hourly window after deployment.
2. At the next `:17`, inspect `/aws/lambda/surfs-up-panama-fetch` for `ingest.success`, no `health.startup.refused`, and no `health.provider.cycle_frozen`.
3. Verify raw receipts under `raw/open-meteo-marine/dt=<UTC-date>/<HH>/` and prediction receipts under `predictions/v1/dt=<run-date>/` in `surfs-up-panama-site-602167897909`.
4. At the next `:22`, inspect `/aws/lambda/surfs-up-panama-build` for `build.success`; verify `manifest.json`, `v1/regions/pa-pacific/bundle.json`, and `v1/meta/spot-index.json` are present and the public manifest returns the matching build id.
5. Repeat through the following `:17` and `:22` cycles. Confirm both dead-man alarms are `OK`, then retain the deployment under observation for one additional hour.

No AWS deployment or operational mutation was performed as part of this readiness lane. An attempted `cdk diff` was stopped because CDK's default mode uploaded synthesized templates before preparing a read-only CloudFormation change-set diff. It did not deploy or update a stack; do not repeat that command in a read-only inspection window.
