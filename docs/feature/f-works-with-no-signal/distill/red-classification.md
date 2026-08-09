# RED classification record

Feature: `f-works-with-no-signal`
Slices: `slice-01` through `slice-05`
Workspace opened: 2026-08-09, docs only, on `build/f2-signal` (base `82be859`)

## Status

No RED has been observed because no test exists. This feature's workspace was opened as a
DOCS-ONLY task: no `.feature` file, no step definition, no scaffold, no service worker and no
production code were written. That is the correct state under the JIT rule (`HANDOFF.md` §1:
each slice's tests remain absent until that slice legally enters DISTILL). This file records the
reconciliation result and the classification contract the first JIT DISTILL run must satisfy, so
genuine RED is distinguishable from a broken test on day one.

## Reconciliation at workspace open

This project uses the unified `feature-delta.md` model; the legacy per-wave `wave-decisions.md`
files do not exist for any feature. `docs/product/journeys/` and `docs/product/kpi-contracts.yaml`
do not exist either; both absences are warnings under the graceful-degradation rules, not
blockers, because the driving surfaces are fully named by the DESIGN corpus
(`application-architecture.md` §12, §10, §4; `07-write-path.md` §5).

This feature had no workspace and no history of its own; reconciliation here is against the
corpus that pre-committed parts of it. Findings, carried and resolved by declared precedence or
flagged, never silently:

| # | Finding | Resolution applied here |
|---|---|---|
| A | Feature identity: only `F-WORKS-WITH-NO-SIGNAL` (epic row, `epic-delta.md` line 49) is attested; no workspace, commit or dangling object ever existed under any spelling (verified against all refs, reflog and `git fsck --lost-found`, 2026-08-09) | Workspace id `f-works-with-no-signal` derived from the `des-feature-context-bootstrap` convention of the three sibling `f-*` workspaces. Greenfield authoring, not recovery, stated in feature-delta |
| B | Slice numbering was pre-committed by a neighbour: f-tell's Out-of-scope table names flush-on-reconnect as "F-WORKS-WITH-NO-SIGNAL slice-03" and the `queued_duplicate` re-sync observable as "slice-04" | Honoured. Slices 01, 02 and 05 were authored here; 03 and 04 keep their assigned numbers and scope. Renumbering would orphan written references in a shipped sibling workspace |
| C | The flush-ownership seam citation is broken: sibling files cite "`HANDOFF.md` §7 flush ownership", and §7 in BOTH HANDOFF copies on disk is "How Andres wants this run", with no flush content | The substantive split survives in the feature files themselves (f-tell slice-03 row and R26; this feature's slice-03 row). Flagged in feature-delta Pre-requisite 7, not silently repaired |
| D | `BUILD-ORDER.md` and `plan-cluster-*.md` are cited as the source of the sibling workspace openings and of D-numbered decisions, but were never committed on any ref and exist nowhere on disk (verified 2026-08-09) | This plan was authored from surviving evidence only (epic row, §12/§10/§4, 07 §5, the seam rows). Flagged in feature-delta Pre-requisite 8: if either document resurfaces, reconcile before slice-01 DELIVER |
| E | Offline copy truth: §10's offline string is one verbatim block whose second sentence ("Los reportes que mandes quedan guardados.") asserts a queue that will not exist when slice-01 ships | Staged landing, not rewording: sentence one ships with slice-01, sentence two with slice-03, both word for word from §10. Per the plan rule that no slice ships a sentence that is not true at the moment it ships (R4, R26) |
| F | §12's report-screen-1 row names a failure string §10 never defines ("a line saying the report form needs one first online visit"); no such string exists in `strings.ts` either | Open copy gap, feature-delta Pre-requisite 6a. The branch (offline, uncached reportar → `/sin-senal`) is testable without the line; the line's oracle waits for the settled string. Inventing product copy is out of scope |
| G | Two shipped gates assert `/sin-senal` is unbuilt: `scripts/page-weight-core.mjs:68` and the keystone-owned `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts:88` | Amending both is inside slice-01 (R13), strictly serial with the keystone lane, same convention f-tell slice-02 declared for the F-BILL guardrail files. A slice-01 RED caused by these gates firing is genuine RED of the un-amended gate, not a broken test |
| H | HANDOFF copies diverge: this worktree's `HANDOFF.md` runs through §10 (Slices 06-08 build, base `63d5b1e`, preview tooling, the null-wind and raw-ISO-stamp defects); the `/Users/andres/panama-surf` copy ends at §9. The keystone tracker rows for slices 06-08 in this worktree still read `pending` while HANDOFF §10 records them building | Citations in this workspace that need §10 content use this worktree's copy and say so. Cross-worktree tracker staleness recorded, not repaired |
| I | The epic tracker row flip (pending → in-flight plus the workspace link) and the charters directory under `docs/product/expectations/` are owed but sit outside this lane's declared file boundary (`docs/feature/f-works-with-no-signal/**` only) | Flagged in feature-delta Pre-requisite 9 for the coordinator and each slice's DISTILL opener. Not silently written across the boundary |

Result: zero unresolved wave-level contradictions, and NO decision gates slice-01 scenario
authoring. The gates on later slices are deliveries, not decisions: slice-02 waits on the stamp
BUGFIX lane, slices 03-04 wait on f-tell slices 01/03/04.

## Classification contract for the first JIT DISTILL (slice-01)

When slice-01 enters DISTILL, its RED snapshot must classify every scenario as
`MISSING_FUNCTIONALITY`, never `IMPORT_ERROR`, `FIXTURE_BROKEN` or `SETUP_FAILURE`:

- Scenarios drive the BUILT surface: the real `npm run build` output served to a real browser
  context with a registered service worker, network conditions controlled by the harness
  (offline, stalled-past-3 s, online). Today no SW file, no `/sin-senal` page and no registration
  snippet exist (scaffold audit in `feature-delta.md`), so genuine RED for the skeleton scenarios
  is "the cached page is never served / the offline fallback never renders", failing at the
  behaviour oracle after the page loads, not at build or import time.
- If a step definition imports a not-yet-existing SW module, DISTILL creates the RED scaffold
  with the `__SCAFFOLD__` marker whose methods fail with an assertion-class error, so the runner
  reports RED, not BROKEN (same convention as the keystone's and f-tell's scaffolds).
- The write-path row scenarios must include the poisoned-fixture proof: the router-table check is
  fed one deliberately cache-served write-path response and must refuse it. A gate never seen
  firing proves nothing (§9, clause check:unfired-is-not-evidence). This proof runs at gate
  authoring time, before the row's first green.
- Zero AWS and zero real network beyond localhost: no slice-01 scenario may require an account, a
  deployed resource, or a live origin. A slice-01 scenario that cannot run offline is testing the
  wrong slice. The same holds for slices 02 and 05.
- Byte-ceiling rows (R11, R18, R33) run against gzipped `dist/` output, measurements not
  estimates, and fail naming route, measured bytes and ceiling (§5 gate convention).
- Load-bearing tags, same trap as the keystone (`HANDOFF.md` §4): file-level
  `@feature-f-works-with-no-signal` above `Feature:`, and per-scenario `@slice-NN` on EVERY
  scenario; feature-level tags do not inherit downward. Coverage markers `@covers-Rn` against
  `distill/requirement-checklist.md`.

For slices 03 and 04 the same contract applies with one addition: flush and backoff scenarios
drive the queue-flush logic through its ports with a controlled clock and a controlled endpoint
(the 07 §5 sequence is the oracle: 429 → backoff 30s×2^n plus jitter → byte-identical replay →
`queued_duplicate` → delete), example-based at the integration layer, and the live-send
observable waits for f-tell slice-03's deployed endpoint. Per this project's paradigm
declaration (`CLAUDE.md`), backoff and replay laws are candidates for property tests
(`@property`): byte-identity of every replay, and monotone non-decreasing backoff under
consecutive 429s.

## Gate result

DISTILL may author slice-01 scenarios today: no open decision gates them. Slice-01's LANDING is
sequenced behind two serial file seams (feature-delta Pre-requisites 4 and 5), which order edits,
not tests. Slice-02 authoring is legal but its green needs the BUGFIX lane's corrected stamp
(Pre-requisite 1). Slices 03 and 04 may not enter DISTILL until f-tell slice-01 exists to
provide a queue (Pre-requisite 2); their port-level oracles are already fixed by 07 §5. Slice-05
is unblocked the moment slice-01 lands. No approval, examiner verdict or RED observation is
recorded in this file yet; the first JIT DISTILL run appends its observed classification below
this line.
