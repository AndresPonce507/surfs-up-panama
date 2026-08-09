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
