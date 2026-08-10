# RED classification record

Feature: `f-tell-us-what-you-saw-cold`
Slices: `slice-01` through `slice-05`
Workspace opened: 2026-08-09, docs only

## Status

No RED has been observed because no test exists. This feature's workspace was opened as a
DOCS-ONLY task: no `.feature` file, no step definition, no scaffold and no production code were
written. That is the correct state under the JIT rule (`HANDOFF.md` §1: each slice's tests remain
absent until that slice legally enters DISTILL). This file records the reconciliation result and
the classification contract the first JIT DISTILL run must satisfy, so genuine RED is
distinguishable from a broken test on day one.

## Reconciliation at workspace open

This project uses the unified `feature-delta.md` model; the legacy per-wave `wave-decisions.md`
files (discuss/, design/, devops/) do not exist for any feature. `docs/product/journeys/` and
`docs/product/kpi-contracts.yaml` do not exist either; both absences are warnings under the
graceful-degradation rules, not blockers, because the driving surfaces are fully named by the
DESIGN corpus.

Cross-document contradictions were found, carried and resolved by declared SSOT precedence, not
silently:

| # | Contradiction | Resolution applied here |
|---|---|---|
| A | Duplicate response: domain-model §7.4 says HTTP 200 `{status:"duplicate"}`; 07-write-path §4.3 says `outcome: queued_duplicate` with the original reveal | 07 wins: application-architecture §7 names 07 §4.1 the wire SSOT. Scenarios must test 07's shape; the domain sentence is stale |
| B | Wind vocabulary: 05-scoring-engine §7 (line 498) `clean, bumpy, choppy` (choppy worst) vs application-architecture §10 Q2 `clean, choppy, blown_out` (choppy middle); both words meet on one reveal card | **NOT resolved by precedence. Gating open decision**, feature-delta Pre-requisite 1. Evidence that 05 is the stale side: shipped `src/pipeline/build.ts` lines 80 and 233 to 236 already emit `clean, choppy, blown_out`, mapped at line 252 to limpio, picado, destrozado. Recommendation on record: canon `clean | choppy | blown_out` and `bad | ok | good | epic`. Needs Andres |
| C | Quality middle-bucket token: §10 Q3 "Normal"/"OK" has no token spelling anywhere | Same gating decision as B, same recommendation (`ok`) |
| D | Report body cap: system-architecture §6 layer 6 says 2 KB; 07 §4.2 step 1 says 4 KB before parse | 07 wins, owner file for its own contract; system-architecture layer row is stale |
| E | Worst-case dollars: 07 §12 vs system-architecture §6.1 | §6.1 wins per HANDOFF §6 ("Known stale"); every figure in this workspace cites §6.1 |
| F | HANDOFF citation: the workspace dispatch cited HANDOFF "section 10"; the authoritative `/Users/andres/panama-surf/HANDOFF.md` (29525 bytes, 2026-08-09) ends at §9, and the worktree copy is an older 21143-byte version ending at §8 | All HANDOFF citations in this workspace were verified against the authoritative copy (§1, §3, §4, §6 items 6 to 8, §7). The phantom §10 is flagged in feature-delta Pre-requisite 10, not silently repaired |

Result: zero unresolved wave-level contradictions after SSOT precedence, and exactly ONE gating
open decision (B/C, the enum tokens) that blocks slice-01 scenario authoring. Do not author
slice-01 acceptance tests against guessed tokens: the queued record replays byte-identical
(domain-model §7.4), so a guessed token becomes a schema-invalid POST later, which is the exact
defect the gate exists to prevent.

## Classification contract for the first JIT DISTILL (slice-01)

When slice-01 enters DISTILL, its RED snapshot must classify every scenario as
`MISSING_FUNCTIONALITY`, never `IMPORT_ERROR`, `FIXTURE_BROKEN` or `SETUP_FAILURE`:

- Scenarios drive the BUILT surface: the real `npm run build` output for
  `/spots/{slug}/reportar` and `/reportado`, and the report island seam. Today the island does not
  exist and the Mandar button is `disabled` (`ReportCapture.astro` line 81), so genuine RED for
  the capture scenarios is "the label is never committed / the confirmation never renders", failing
  at the behavior oracle after the page loads, not at build or import time.
- If a step definition imports a not-yet-existing island module, DISTILL creates the RED scaffold
  with the `__SCAFFOLD__` marker whose methods fail with an assertion-class error, so the runner
  reports RED, not BROKEN (Mandate 7; same convention as the keystone's scaffolds).
- The anti-leak gate scenarios must include the poisoned-fixture proof: the dist grep gate is fed
  one deliberately forecast-poisoned page and must refuse it. A leak gate never seen firing proves
  nothing (application-architecture §9, clause check:unfired-is-not-evidence).
- Zero AWS: no slice-01 scenario may require a network, an account or a deployed resource. A
  slice-01 test that cannot run offline is testing the wrong slice.
- Load-bearing tags, same trap as the keystone (HANDOFF §4): file-level
  `@feature-f-tell-us-what-you-saw-cold` above `Feature:`, and per-scenario `@slice-NN` on every
  scenario; feature-level tags do not inherit downward. Coverage markers `@covers-Rn` against
  `distill/requirement-checklist.md`.

For slices 03 to 05, the same contract applies with one addition: handler-level scenarios drive
the real `decide_report` core and store adapters through their ports (07 §10's contract shapes),
example-only at the subprocess/integration layers, and the wire oracles come verbatim from 07
§4.1 to §4.5. The `predicted: null` path is a named scenario, not a branch inside another
(domain-model §15 item 4).

## Gate result

DISTILL may not author slice-01 scenarios until feature-delta Pre-requisite 1 (enum tokens) is
answered. Everything else about slice-01 is unblocked today: no AWS, no quota answer, no producer
gap touches it. Slice-02 is unblocked immediately after slice-01's tokens land, and needs no AWS
account either. No approval, examiner verdict or RED observation is recorded in this file yet;
the first JIT DISTILL run appends its observed classification below this line.

## Slice-01 observed RED classification (2026-08-09, JIT DISTILL verification run)

Pre-requisite 1 was closed 2026-08-09 (`src/data/report-vocab.ts`, canon `clean | choppy |
blown_out` and `bad | ok | good | epic`), unblocking this run. Tag rules verified in both
`.feature` files: file-level `@feature-f-tell-us-what-you-saw-cold` on the line above `Feature:`,
and `@slice-01` on all 10 scenarios (tags do not inherit downward). No tag fix was needed.

### Filter mechanism (trap record)

The positional path argument does NOT override `cucumber.mjs`'s `paths: ['tests/**/*.feature']`;
a run invoked with a path still executes the whole suite. The working filter is the tag
expression, passed as ONE quoted argument:

```
npm run test:at -- --tags "@feature-f-tell-us-what-you-saw-cold and @slice-01"
```

Filter proven live before the gate run: `--dry-run` with the tag expression selects 10 scenarios;
`--dry-run` without it selects 88. Exit codes captured via redirect-then-`$?`, never through a
pipeline.

### Gate run

Command: `npm run test:at -- --tags "@feature-f-tell-us-what-you-saw-cold and @slice-01"`
Real exit code: **1**. 10 scenarios: 7 failed, 3 passed. Full log preserved during the run at
`/tmp/tellus-red.log` (ephemeral; the classification below is the durable record).

| # | Scenario (file) | Failing step and error | Classification |
|---|---|---|---|
| 1 | A surfer walking off Playa Venao locks a label in three taps (three-taps) | `Then the screen changes to the saved confirmation` — AssertionError: after Mandar the screen never became the saved confirmation (still at `/spots/playa-venao/reportar/`); captured journey failure: Mandar click timeout, the scaffold ships the button `disabled`, the island does not exist | MISSING_FUNCTIONALITY |
| 2 | The same three taps work with the signal cut (three-taps) | Same oracle, offline context — AssertionError at the saved-confirmation behaviour | MISSING_FUNCTIONALITY |
| 3 | What the phone keeps is exactly what the surfer said (three-taps) | `Then the phone holds exactly one saved report` — AssertionError: the phone holds 0 saved report(s); observed at the durable-queue driven port (IndexedDB dump) | MISSING_FUNCTIONALITY |
| 4 | Back never returns to an editable form and a new report starts blank (three-taps) | `Then the phone holds two saved reports with two different identities` — AssertionError: 0 !== 2 | MISSING_FUNCTIONALITY |
| 5 | A phone that cannot keep the label is told plainly before answering (three-taps) | `Then the screen says plainly that the report cannot be saved` — AssertionError: storage refused and the screen says nothing (`[data-storage-notice]` seam absent; sentinel probe unbuilt) | MISSING_FUNCTIONALITY |
| 6 | No forecast reaches the report screens at any moment before the label is saved (nothing-of-ours) | Anti-leak and blank-reload steps PASS against today's clean scaffold; fails later at `Then the screen changes to the saved confirmation` — AssertionError, same missing island | MISSING_FUNCTIONALITY |
| 7 | A deliberately poisoned page cannot slip past the leak gate (nothing-of-ours) | `Then the gate refuses the poisoned copy naming the report route and what leaked` — AssertionError: the refusal does not name the poisoned route; the underlying cause (`scripts/check-report-leak.mjs` does not exist, subprocess ERR_MODULE_NOT_FOUND) is carried INSIDE the assertion message per the world's active-RED convention. The missing module is the production deliverable invoked over its CLI protocol, not a test import — the test itself never breaks | MISSING_FUNCTIONALITY |
| 8 | The built report screens carry no path into the removed English twin (nothing-of-ours) | PASS. Built docs genuinely emit zero `/en/`: `Base.astro` declares `altPath` (line 28) but never renders it; only the `es` self-alternate (line 57) is emitted. Matcher proven non-vacuous against a synthetic `/en/` alternate link. The dead `altPath` props at `ReportCapture.astro:44` / `ReportShell.astro:32` remain source debt for the crafter | ALREADY_SATISFIED (regression guard) |
| 9 | With JavaScript off, reporting says so plainly and reading still works (nothing-of-ours) | PASS. The scaffold already renders the verbatim noscript copy, ships Mandar `disabled`, and carries no plain-HTML form action; the spot page reads fine with JS off | ALREADY_SATISFIED (regression guard) |
| 10 | The report screens stay light enough for one bar of signal (nothing-of-ours) | PASS. reportar 3042 B gz <= 6144, reportado 2709 B gz <= 4096; the 5 KB island budget passes with zero referenced scripts today and starts biting the moment the island ships | ALREADY_SATISFIED (regression guard) |

No scenario is BROKEN: zero import errors, zero fixture failures, zero browser-startup failures.
Every failure is an assertion at the behaviour oracle after reaching the production driving
surface (real `npm run build` output over real HTTP, Chromium at 390 px). The three passes are
behaviours the committed scaffold already delivers; they are honest regression guards, not
authored-green tests, and none passes vacuously (see falsifiability proofs below).

### Falsifiability proof: the walked anti-leak negative

A negative that cannot fire proves nothing. Proven at authoring time, against the real build:

1. **Poisoned**: `src/components/ReportCapture.astro` — injected `<div data-forecast>score_q 82</div>`
   immediately after the `<h1>`, so the real `npm run build` emits a forecast marker into the
   built `/spots/playa-venao/reportar` document itself.
2. **Watched it fail**: `npm run test:at -- --tags "@feature-f-tell-us-what-you-saw-cold and
   @slice-01" --name "No forecast reaches"` → real exit 1, failing at
   `Then nothing the report screen shows or loads carries forecast data` with:
   `WHAT: forecast vocabulary reached the report flow: "score_q" in live page
   http://127.0.0.1:<port>/spots/playa-venao/reportar/`. The rebuilt dist document verifiably
   carried the poison (`data-forecast` and `score_q` both present).
3. **Reverted**: `git diff` and `git status` clean; `npm run build` re-run green; zero
   `score_q`/`data-forecast` matches in the rebuilt `dist/spots/playa-venao/reportar.html`.

Supporting teeth, verified live this run: the marker-sensitivity guard fires 5 of 9
`FORECAST_MARKERS` on `data/published-surface.json` (threshold >= 3), so the absence check
cannot go vacuous while the live forecast vocabulary drifts; and the leak-gate scenario's own
poisoned-copy proof runs every time as scenario 7.

### Scaffold-audit staleness (feature-delta correction)

`feature-delta.md`'s scaffold audit row "Every enum value token" claims `src/data/size-bands.ts`
emits `band-placeholder-1..7` and `src/i18n/strings.ts` emits `wind/quality-placeholder-*`. That
is STALE as of commit 535de91: `size-bands.ts` carries the seven canonical `size_band` tokens
(`flat` … `double_overhead_plus`) and `strings.ts` emits Limpio/Picado/Destrozado and
Malo/Normal/Bueno/Épico from the canonical token constants. Scenario 1's oracle asserts the
canonical tokens straight from the constants files, and its form-shape steps passed this run —
the placeholders are gone. The feature-delta row is left as the historical audit record; this
note is the correction.

### Open Spanish strings (still pending Andres, feature-delta Pre-requisite 8)

1. The IndexedDB-probe refusal copy (§12 fallback string). Scenario 5's oracle is deliberately
   behavioural (`[data-storage-notice]` visible, non-empty, no technical vocabulary) so it does
   not invent product copy; it tightens to verbatim once the string is settled.
2. The §14 screen-one note "Nota: aquí no te mostramos el pronóstico. Primero lo tuyo, después
   el nuestro." — whether it is shipping copy is unanswered; no scenario asserts it either way.
