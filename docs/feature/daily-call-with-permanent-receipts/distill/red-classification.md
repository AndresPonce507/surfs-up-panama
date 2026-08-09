# Active RED classification

Feature: `daily-call-with-permanent-receipts`  
Slice: `slice-01`  
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

The 17 Cucumber scenarios, 22 Vitest scenarios, and the one browser walking
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

## Advisory coverage-gate limitation

`des verify-spec-coverage --repo . --feature-id daily-call-with-permanent-receipts`
reported 38 uncovered rows. Its static discovery recognized the Gherkin
coverage tags for R1 through R11, but it did not recognize TypeScript
`// covers: Rn` markers in the fast-check, Playwright, or static UI suites.
The 18 scoring-law rows R12 through R29 and the executable browser/static
checks for R38 through R49 are therefore manually traceable in this file and
in their test files, but absent from that tool's count. Future-slice rows are
also correctly absent under JIT. This is a TypeScript-discovery limitation in
the installed nWave tool, not a reason to add dummy Gherkin scenarios.

`des check-contract-shape` is likewise Python-only in this installation and
reported `malformed_input` when given the TypeScript project's `.feature`
files. The Gherkin contract-shape tags were therefore checked directly: every
state-mutating scenario is `@contract-shape:bounded-change`, and every
scenario carries `@slice-01`.

Rows R30 through R37 remain visibly uncovered by design. They belong to slices
02 through 08 and must stay absent until their slice enters DISTILL under the
JIT rule. R38 through R47 are feature-wide visual and reading-surface
obligations, so their applicable checks entered this slice. R43 is covered by
the static-reading contract and the browser route assertion. It remains RED
because the builder-state selector and static receipt route are explicit
scaffolds, not because a route, day selector, or language decision is unresolved.
