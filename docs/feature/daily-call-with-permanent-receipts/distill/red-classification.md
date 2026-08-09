# RED classification history

Feature: `daily-call-with-permanent-receipts`  
Slices: `slice-01`, `slice-02`
Observed: 2026-08-08

## Commands observed

```sh
npm run test:at
npm test
npm run test:e2e
npm run build && node scripts/check-ui-quality.mjs
```

The Cucumber command collected 17 scenarios and 138 steps. Every scenario failed
only after its step exercised the pipeline port. The failure was an explicit
`__SCAFFOLD__` assertion from `runIngestOnce` or `runBuildOnce`, which records
that the requested ingest or build behaviour has not been implemented.

The Vitest command collected 22 tests: 18 scoring-law property tests plus four static-reading
state scenarios. Each scoring-law test reached its imported function and failed at an explicit
`__SCAFFOLD__` assertion in `hEff`, `combine`, `sDir`, `sSize`, `sWind`,
`sTide`, `blend`, `rankSpots`, `applyCorrection`, or `confidence`. Each static-reading scenario
reached `resolveYesterdayReading` and failed at its explicit state-selection scaffold.

Before `tests/unit/scoring-laws.test.ts` was added, `npm test` exited green with
"No test files found". That result was not treated as evidence of behaviour.

## Cucumber scenarios

| Scenario | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- |
| Snapshot writes before scoring | ingest port | `MISSING_FUNCTIONALITY` | `runIngestOnce` scaffold assertion |
| Snapshot key is append-only | ingest port | `MISSING_FUNCTIONALITY` | `runIngestOnce` scaffold assertion |
| Snapshot remains after a scoring crash | ingest then build port | `MISSING_FUNCTIONALITY` | ingest and build scaffold assertions |
| Yesterday's snapshot remains untouched | ingest port | `MISSING_FUNCTIONALITY` | `runIngestOnce` scaffold assertion |
| Models stay members before blend | ingest port | `MISSING_FUNCTIONALITY` | `runIngestOnce` scaffold assertion |
| Call row contains physics and model evidence | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |
| Missing wind is explicit and capped | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |
| Three sources produce named confidence | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |
| One usable source still publishes with an honest cap | ingest then build port | `MISSING_FUNCTIONALITY` | explicit pipeline scaffold assertion |
| Each declared source failure (`error`, `malformed`, `stale`, `dark`) preserves yesterday | ingest then build port | `MISSING_FUNCTIONALITY` | explicit pipeline scaffold assertion |
| Two sources produce capped confidence | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |
| A past receipt remains byte-stable | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |
| Build writes a static public bundle | build port | `MISSING_FUNCTIONALITY` | `runBuildOnce` scaffold assertion |

## Scoring-law property tests

| Requirement | Test focus | Classification | Evidence |
| --- | --- | --- | --- |
| R12 | score bounds | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R13 | deterministic output | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R14 | direction gate | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R15 | geometric mean | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R16 | direction curve | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R17 | size curve | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R18 | wind asymmetry | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R19 | correction hook | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R20 | confidence separation | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R21 | damage decomposition | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R22 | member blend | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R23 | rotational invariance | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R24 | effective height | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R25 | microtidal neutrality | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R26 | deterministic rank | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R27 | absent factor handling | `MISSING_FUNCTIONALITY` | explicit scoring scaffold assertion |
| R28 | freshness confidence | `MISSING_FUNCTIONALITY` | explicit confidence scaffold assertion |
| R29 | confidence levels | `MISSING_FUNCTIONALITY` | explicit confidence scaffold assertion |

## Browser walking skeleton

| Requirement | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- |
| R1, R7, R48 | built mobile reading routes | `MISSING_FUNCTIONALITY` | visible placeholder fixtures instead of Playa Venao, score 80, Spanish call, and yesterday receipt |
| R38 | Spanish-only feature surface | `MISSING_FUNCTIONALITY` | current built candidate contains an `en/` directory and English route artifacts, not only an English link |
| R39, R40, R47 | rendered 390px home and archive route, light and dark | `PASS` | computed text contrast against rendered solid/gradient backdrops, including body AAA, no horizontal overflow, and no browser forecast-data request all passed |
| R41 | rendered 390px home and archive route | `MISSING_FUNCTIONALITY` | built home exposes 32px navigation and 25-26px spot-row link targets, with no declared thumb-zone primary action |
| R42, R45 | built stylesheet gate | `PASS` | reduced-motion branch exists and the token-drift static check passed |
| R44 | built stylesheet gate | `MISSING_FUNCTIONALITY` | `src/styles/components.css` declares `font-size: 1.75rem` outside the type scale |
| R49 | public raw-prediction path | `PASS` | the public raw-prediction path does not return JSON, gzip, or a binary snapshot, and the page never exposes a member name |
| R43, R46 | static reading-state contract | `MISSING_FUNCTIONALITY` | the explicit `resolveYesterdayReading` scaffold is reached by four in-process scenarios: first-morning Spanish empty, prior-day dawn success against current-day, older-day, wrong-spot, and later-build decoys, stale retained receipt after refusal, and the static-HTML loading exemption |

## R43 closed contract

HANDOFF §6 items 2 and 3 close the route, day selector, and slice language scope. R43 is now
executable, rather than a deferred product decision:

| State | Acceptance contract | Test layer |
| --- | --- | --- |
| Loading | Explicit exemption: a reading route is complete publish-time HTML and the browser fetches no forecast data. It must not show a fake loading state or delay first meaningful content. | in-process static-state scenario plus R47 browser assertion |
| Empty | On the first morning, `/spots/{slug}/ayer` has no prior dawn receipt. It explains that in plain Spanish and shows no invented score. | in-process static-state scenario |
| Error / stale | A current no-data refusal makes no call, bundle, or manifest. A pre-existing receipt stays byte-identical, exposes its original exact `published_at`, and says in Spanish that new data could not be obtained that morning rather than claiming a new score. | Cucumber refusal scenario plus in-process static-state scenario |
| Success | `/spots/{slug}/ayer` selects only the prior Panama civil day's dawn-build receipt, not a later hourly revision or the current civil day's dawn receipt, and exposes that receipt's exact publish time in its HTML. | in-process static-state scenario plus the sole browser walking skeleton |

U8 is present in the slice charter as an examiner observation: the screen must
look finished, readable at arm's length, uncut, unaligned, placeholder-free, and
free of unsolicited motion. It is intentionally not replaced with a screenshot
assertion.

## Gate result

Slice-01's 17 Cucumber scenarios, 22 Vitest scenarios, and the one browser walking
skeleton are genuine RED where their required behaviour is absent. None failed during module loading, fixture
construction, step matching, or test-runner setup. There are no skipped or
pending scenarios.

The Playwright walking-skeleton command built and served the Astro site, then
ran its one mobile browser test. Its assertions found placeholder spot names,
placeholder call copy, the absence of the Venao score, an English route tree,
small touch targets, no thumb-zone primary action, no yesterday surface, and
no receipt `time[datetime]`. It audits both reading routes under light and dark
colour schemes. This is `MISSING_FUNCTIONALITY`, not a browser-server or import
failure. The assertion also confirms the raw prediction path is not a public
reading route.

The slice is ready for the DISTILL review gate, not yet for DELIVER until the
independent human AT-review verdict is recorded.

## Slice-03 RED classification

Status: `historical RED observed 2026-08-09; green and shipped in df25ee6`

The launch policy intentionally partitions the 23 human-owned Pacific source records into 20
launch records and three named exclusions. `loadLaunchSpotSeeds` is the only new production
entry. It returns an empty array while RED, so the scenarios execute its exported production
surface and then fail at their individual behavior assertions.

```sh
npm run test:at -- --tags @slice-03
```

The command collects six scenarios and 36 steps. All six reach the existing production
`runIngestOnce` and `runBuildOnce` ports, which own the data-policy loader whenever the caller
omits an explicit spot set, before their own assertion fails. There
is no import, world construction, fixture, step matching, or runner failure.

| Scenario | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- |
| Twenty published launch spots | `runIngestOnce` then `runBuildOnce` | `MISSING_FUNCTIONALITY` | production morning publication has 0 rows where the declared launch policy names 20 |
| Explicit launch exclusions | `runIngestOnce` then `runBuildOnce` | `MISSING_FUNCTIONALITY` | an empty publication cannot prove the source set and its three exclusions reach the home surface |
| Empty launch policy | `runIngestOnce` over an isolated policy copy | `MISSING_FUNCTIONALITY` | a zero-record policy reaches publication instead of being refused before a public bundle can exist |
| One-record launch policy | `runIngestOnce` over an isolated policy copy | `MISSING_FUNCTIONALITY` | a one-record policy reaches publication instead of naming the exact 20-record repair rule |
| Descending Spanish public ranking | `runIngestOnce` then `runBuildOnce` | `MISSING_FUNCTIONALITY` | public day bundle has 0 rows where it must contain 20 ranked, Spanish calls |
| Direction-sensitive coast ranking | `runIngestOnce` and `runBuildOnce` over two published mornings | `MISSING_FUNCTIONALITY` | neither day has 20 rows, so a true order comparison cannot yet occur |

The sole existing browser journey is extended in this DISTILL turn, not duplicated. It builds and
opens the real home page, then fails on its added 20-row observable while the one-row Slice-01
surface remains in place. This makes R30 an assembled-surface requirement without adding a second
subprocess browser journey. Slice-04 through Slice-08 acceptance tests remain absent.

## Slice-03 green result

The production loader now reads the versioned policy and only the selected YAML records, rejects
zero- and one-record policies before publication, applies the declared priors, publishes a
descending 20-row 18Z ranking with `score_q`, and renders the static Spanish home from the
published surface. On 2026-08-09, all six Slice-03 scenarios and 36 steps, 29 unit tests, the UI
gate, and the sole browser journey passed. Source-blind Vera observed 20 named rows, scores 88 to
39 in descending order, Spanish calls, no clipping or filler, and stable rebuilds/reloads. DES
committed and verified the result in `df25ee6`.

## Slice-02 RED scaffold classification history

Status: `scaffold-present, RED observed before delivery`

The prior 17-scenario run is invalid evidence. It used a test-owned
`spawnSync` wrapper, stopped every mutation before its individual oracle, and
did not drive an importable production composition entry. It must not be used
for Slice-02 handoff or human review.

### Required minimal production RED scaffold, owned by orchestration

The declaration source scaffolds are present and the production-owned entry
already exists at `scripts/ci-local.mjs`. Do not add a second entry module.
Orchestration must wire one shared declaration evaluator through that entry for
both the real `infra/` source and the generic contained declaration input. The
fixture must not need a package, CDK app, synth, deploy, or fixture-specific
branch.

```ts
export const __SCAFFOLD__ = true;

export async function evaluateInfrastructureDeclarations({ root, environment, output }) {
  throw new Error('__SCAFFOLD__: infrastructure declaration evaluation is not implemented');
}

export async function runLocalCi({
  argv = [],
  repoRoot,
  output,
  commandRunner,
  environment,
  declarationInput,
} = {}) {
  // Existing default infra handling evaluates repoRoot/infra, then owns the
  // production guardrail-test plus credential-free synth and reports both
  // phases with the named inspected population. A declarationInput uses the
  // same evaluator with { root, mode: 'declaration-only' }, no synth/deploy,
  // and no repoRoot/infra or repoRoot/.ci-local-logs side effect.
}
```

The required public signature is
`runLocalCi({ argv?, repoRoot?, output?, commandRunner?, environment?, declarationInput? }): Promise<number>`.
`environment` is a read-only map. `declarationInput` is
`{ root: string, mode: 'declaration-only' }`. The evaluator takes
`{ root, environment, output }`. The AT invokes only `runLocalCi`, never a
direct evaluator import, and passes no `commandRunner`. The scaffold failure
is a runtime error captured by the production output port, not test setup or a
module-level direct-domain import.

### Observed execution contract

Orchestration ran:

```sh
npm run test:at -- --tags @slice-02
```

Observed collection: eight Slice-02 scenarios. All eight failed at their individual
behavior assertions after `runLocalCi` emitted its runtime `__SCAFFOLD__`
message. No scenario failed during import, fixture construction, or step
matching. Later assertions were skipped only because Cucumber stops a
scenario after its first failed assertion.

Each scenario reaches `runLocalCi` in process. The default-registration
scenario captures the public inventory result before invoking the default
`infra` job. Its output oracle requires the two real production phases,
credential-free offline disclosure, the real `infra` root, the three named
lifecycle rules, and all eleven Lambda capacity/timeout values. The real-root provenance scenario
passes its copied checkout as `repoRoot`; every declaration-only mutation scenario rejects all
source symlinks, copies and mutates a regular file inside
`fixtures/controlled-infrastructure-declarations/`, then calls `runLocalCi`
with `argv: ['--job=infra']`, the real project as `repoRoot`, a test-local
credential-free `environment`, and `declarationInput: { root, mode:
'declaration-only' }`. The supplied environment is a fixed minimal allowlist
with fresh empty `HOME` and XDG paths, no credential or configuration override,
and `AWS_EC2_METADATA_DISABLED=true`, so an offline statement cannot inherit a
host profile or metadata credential. The copied declaration source and child
command traps must remain untouched, proving parse-not-execute and the
no-command/no-network declaration-only boundary. It never mutates global
`process.env`.

| Scenario / proof | Expected RED classification at the time observed | Individual oracle after the scaffold runtime output |
|---|---|---|
| Default `infra` registration | `MISSING_FUNCTIONALITY` | public inventory row `● infra`, then the production `--job=infra` result names `infra/test/guardrails.test.ts: passed`, `credential-free synth: passed`, an honest credential-free offline statement, the actual `repoRoot/infra` path, all three lifecycle rules, and all eleven Lambda capacity/timeout values before returning success; the current runtime scaffold reaches the first phase oracle and lacks that behavior |
| Contained public-root provenance | `MISSING_FUNCTIONALITY` | a changed copied checkout fails before protected phases and names that contained `infra` root plus its unique missing concurrency value, proving the public job reports the root it actually inspected |
| Clean zero-rule inspection | `MISSING_FUNCTIONALITY` | copied-fixture identity, declaration-only mode, three named unrelated lifecycle rules inspected, zero prediction-reaching rules |
| Exact 90-day Glacier Instant Retrieval exception | `MISSING_FUNCTIONALITY` | named sole allowlisted rule, exact prefix, class, and age |
| Coupled lifecycle population | `MISSING_FUNCTIONALITY` | each bucket-wide, exact, descendant, 89-day, 91-day, wrong-class, and parent/child row has its own offending rule, reason, and removal guidance |
| Coupled safeguard population | `MISSING_FUNCTIONALITY` | every concrete value within Lambda capacity, Lambda timeouts, log retention, and non-prediction lifecycle has its own safeguard, changed value, and restoration guidance; rows do not add product scope |
| Unavailable site declaration | `MISSING_FUNCTIONALITY` | named source, cannot-inspect reason, and restoration guidance |
| Malformed guardrail declaration | `MISSING_FUNCTIONALITY` | named source, cannot-inspect reason, and restoration guidance |

### Controlled fixture and external-audit boundary

The fixture is a copied test input with no `node_modules` and no symlink. It
is not a shipped `infra/` source. Every source symlink is rejected before a
non-dereferencing copy. The output must identify the copied fixture path and
the three unrelated lifecycle rules it inspected, so zero prediction-reaching
rules prove traversal without borrowing from the working tree. Each
declaration-only call snapshots the real `repoRoot/infra` tree and
`repoRoot/.ci-local-logs` immediately before and after the call; every failure
must leave that universe byte-identical. Finally-safe cleanup restores every
changed regular file and removes the copy.

Anthropic's `$5/month` hard limit and CloudFront's pay-as-you-go posture are
terminal-report external-audit statements, not local mutation or live-console
claims. The report must say `external audit` and `not a live-console
assertion`. Actual console compliance remains a release and monthly checklist
responsibility.

## Advisory coverage-gate limitation

`des verify-spec-coverage --repo . --feature-id daily-call-with-permanent-receipts`
reported 36 uncovered rows. Its static discovery recognized the Gherkin
coverage tags for R1 through R11, but it did not recognize TypeScript
`// covers: Rn` markers in the fast-check, Playwright, or static UI suites.
The 18 scoring-law rows R12 through R29 and the executable browser/static
checks for R38 through R49 are therefore manually traceable in this file and
in their test files, but absent from that tool's count. Future-slice rows are
also correctly absent under JIT. This is a TypeScript-discovery limitation in
the installed nWave tool, not a reason to add dummy Gherkin scenarios.

Slice-02's Gherkin scenarios all carry `@covers-R35`; its lifecycle scenarios
also carry `@covers-R49`, so both the CI guardrail and no-lifecycle-expiration
prefix obligation are mechanically covered. The remaining refusal combines the
known TypeScript-discovery limitation with JIT-absent slices and is not a
missing Slice-02 marker.

`des check-contract-shape` is likewise Python-only in this installation and
reported `malformed_input` when given the TypeScript project's `.feature`
files. The Gherkin contract-shape tags were therefore checked directly:
Slice-01 mutating scenarios are `@contract-shape:bounded-change`; every
Slice-02 scenario is likewise `@contract-shape:bounded-change` and carries its
own `@slice-02` tag.

Rows R30 through R34 and R36 through R37 remain visibly uncovered by design.
They belong to future slices and must stay absent until their slice enters
DISTILL under the JIT rule. R38 through R47 are feature-wide visual and reading-surface
obligations, so their applicable checks entered this slice. R43 is covered by
the static-reading contract and the browser route assertion. It was RED in this
pre-delivery observation because the builder-state selector and static receipt
route were explicit scaffolds, not because a route, day selector, or language
decision was unresolved.

## Slice-02 green completion record

The preceding Slice-02 RED record is historical evidence. The production-owned
`runLocalCi` implementation replaced that scaffold without changing the eight
acceptance scenarios.

On 2026-08-09, `npm run test:at -- --tags @slice-02` passed all 8 scenarios and
56 steps. The default `npm run ci:local` gate passed all 9 jobs. Its real
infrastructure path runs `infra/test/guardrails.test.ts` and credential-free CDK
synth; it also preserves the full OSV lockfile scan. The only OSV exception is
the documented, expiring `GHSA-rgw5-rvv9-x895` allowance for
`aws-cdk-lib@2.263.0`'s bundled `brace-expansion@5.0.8`.

The fresh delegated APPROVED review verdict is recorded and
`des carpaccio-slice-gate --repo-root . --feature-id daily-call-with-permanent-receipts --entering-slice slice-02`
returns `SliceCleared`. Slice-02 is green, but no Slice-02 commit exists yet;
the slice is not shipped until its DES commit and verification gate complete.
