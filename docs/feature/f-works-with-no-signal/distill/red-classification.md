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

## Observed RED, slice-01 JIT DISTILL, 2026-08-09

Command, run from `/Users/andres/psb-signal` on `build/f2-signal`:

```
npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-01" > /tmp/signal-red.log 2>&1; echo "REAL_EXIT=$?"
```

`REAL_EXIT=1`. Summary line: **12 scenarios (12 failed), 155 steps (122 passed, 21 skipped, 12
failed)**, 1 hook passed, 1m 30s. The gate was redirected to a file and its status captured
directly; it was never piped into `tail`, `head` or `grep` (project `CLAUDE.md`: a pipeline
returns the last command's status, and this repository has committed over a red gate exactly
that way). A `--dry-run` over the same tag expression reported 12 scenarios / 155 steps and
**zero undefined steps** before the real run, which is what rules out a step-matching failure
being mistaken for RED under `strict: true`. `npx tsc --noEmit` exits 0.

Every scenario failed with `AssertionError [ERR_ASSERTION]` raised by its own behaviour oracle,
after the real `npm run build` finished green, the emitted `dist/` was served over real HTTP and
Chromium had loaded the page at 390 px. 122 of 155 steps executed and passed, which is the
positive evidence that the harness itself is sound: no import error, no fixture construction
failure, no browser startup failure, no undefined or ambiguous step anywhere in the run.

Driving surface for all twelve: the production entry points only. The real `npm run build`
(which runs `publish:surface --verify` and the page-weight gate, because the gate is wired into
`astro.config.mjs` as an integration), the emitted `dist/` served over real HTTP with the
static-host `build.format: 'file'` mapping, and real Chromium at 390 px. `astro preview` is
deliberately not used: it resolves directory URLs itself and hides the class of hosting bug that
once shipped twenty spot links returning 403. The signal is cut at the server rather than
emulated in the browser: `blackout` destroys the socket on arrival (an unreachable origin as a
phone experiences it) and `stall` accepts and never answers (the only condition under which a
three-second timeout can be watched firing). Chromium's own offline emulation is not used,
because its propagation to service-worker fetches is the thing under test. Every response carries
`Cache-Control: no-store`, so the browser's own HTTP cache cannot impersonate the helper and turn
"the same forecast is on the screen" green with nothing installed.

| Slice | Scenario | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- | --- |
| slice-01 | A surfer parked at Venao with one bar still reads the last forecast that loaded | `navigator.serviceWorker` registration on the built site in Chromium | MISSING_FUNCTIONALITY | `AssertionError`: the phone has no offline helper installed after reading the site with signal. No `sw` script exists and no registration snippet is in the built home page, so nothing can install. Failed at the behaviour oracle after the page loaded |
| slice-01 | A network that stalls gives up after three seconds and shows what we already had | elapsed time of a navigation against a server that accepts and never answers | MISSING_FUNCTIONALITY | `AssertionError`: the stalled network kept the surfer waiting 8003 ms and the page never arrived. Nothing gives up at three seconds because there is no network-first router; the browser waited out the harness's own patience |
| slice-01 | With nothing saved for what they asked for, no signal lands on plain Spanish words | visible text of an unvisited spot route with the origin unreachable | MISSING_FUNCTIONALITY | `AssertionError`: the screen does not carry `"Sin señal. Esto es lo último que vimos, de las "`. Captured context names the real navigation failure (`net::ERR_EMPTY_RESPONSE`), which is exactly the raw browser error this row exists to replace |
| slice-01 | The report screen opens with no signal once it has been opened with signal | visible text of the report route, compared against the same route read with signal | MISSING_FUNCTIONALITY | `AssertionError`: the offline screen is empty where the online screen read the three settled questions. The expected/actual diff in the log carries the full online text, so the oracle is visibly a content comparison, not a fixture check |
| slice-01 | A report screen never opened before lands on the sin señal words, never an error | visible text of an unvisited report route with the origin unreachable | MISSING_FUNCTIONALITY | `AssertionError`: same settled sentence absent; captured `net::ERR_EMPTY_RESPONSE` on `/spots/punta-chame/reportar` |
| slice-01 | The small parts the page draws itself with come from the phone when the signal is gone | the origin's Cache Storage contents, plus a real `fetch` of `/favicon.svg` with the origin unreachable | MISSING_FUNCTIONALITY | `AssertionError`: the phone is holding nothing at all (`[]`), so the small parts every route asks for on first visit are not kept |
| slice-01 | A whole morning's reading asks the site for ten things or fewer | helper registration, then the count of requests the harness server received | MISSING_FUNCTIONALITY | `AssertionError` on the helper being installed. The count is deliberately guarded behind that assertion: with no helper the count is trivially small and would report a false green |
| slice-01 | A report that got through is answered by the site and left nowhere on the phone | a real `POST /api/report` from the page through the registered helper, then Cache Storage | MISSING_FUNCTIONALITY | `AssertionError` on the helper being installed. Same guard: with no helper, "nothing about the send is kept" is vacuously true, so the row is pinned to a helper actually being in charge |
| slice-01 | With the signal gone, a planted answer is never handed back as if the report went out | a real `POST /api/report` with a poisoned answer planted in Cache Storage under the write-path address | MISSING_FUNCTIONALITY | `AssertionError` on the helper being installed. The plant itself succeeded (the step passed), so the poisoned fixture of §9 is real and present on the surface, waiting to be refused |
| slice-01 | A later alerts feature is added to the helper without touching a line of what it already does | the emitted helper file, discovered from the built page's own registration snippet | MISSING_FUNCTIONALITY | `AssertionError`: the built site starts no offline helper, so there is nothing for the alerts lane to be added to. Captured context: "the built home page starts no offline helper" |
| slice-01 | Everything this slice adds stays inside the weight it was given | gzipped bytes of the emitted helper, of `sin-senal.html`, and raw bytes of the inline registration snippet | MISSING_FUNCTIONALITY | `AssertionError`: no helper to weigh. Measurements, not estimates, over the real gzipped `dist/` output |
| slice-01 | The weight gate counts the sin señal page instead of calling it unbuilt | the measurement the real build printed | MISSING_FUNCTIONALITY | `AssertionError`: the measurement never names `/sin-senal` as a route it measured, and still lists it among the routes this site does not build. This is the shipped-gate amendment of Pre-requisite 4 demanded as behaviour rather than performed by this lane |

Zero scenarios classified `IMPORT_ERROR`, `FIXTURE_BROKEN`, `SETUP_FAILURE`, `WRONG_ASSERTION`
or `OBSERVABLE_NOT_AT_PORT`. The gate result for slice-01 is genuine RED and DELIVER may take it.

### What DELIVER owes on the two shipped gates (Pre-requisite 4, measured)

Two files, three edits, all of them inside slice-01 and strictly serial with the keystone lane.
The count is three, not two: the gate refuses an emitted document it has no declared ceiling for,
and it runs inside `astro build`, so without the first edit `npm run build` fails outright the
moment `src/pages/sin-senal.astro` exists and every scenario in this suite turns BROKEN.

| # | File and line | Edit |
| --- | --- | --- |
| 1 | `scripts/page-weight-core.mjs`, the `DECLARED_ROUTES` array (ends line 62) | Add a `/sin-senal` row: `{ shape: '/sin-senal', pattern: /^sin-senal\.html$/, route: () => '/sin-senal', label: '3 KB', bytes: 3 * KB, reading: true }`. Without it the build refuses the emitted document as "emitted but no declared route ceiling covers it" |
| 2 | `scripts/page-weight-core.mjs:68` | Drop `/sin-senal (3 KB), ` from `DECLARED_BUT_UNBUILT`. The sentence becomes false the moment the page is built, and a gate that states a falsehood about its own coverage is worse than one that fails |
| 3 | `tests/acceptance/daily-call-with-permanent-receipts/steps/page-weight.steps.ts:88` | `DECLARED_BUT_UNBUILT_ROUTES` becomes `['/acerca'] as const`. Consumed at line 591, which asserts each named route appears in the measurement's unbuilt line; edit 2 breaks that assertion until this lands. Keystone-owned test surface: serialize with the keystone lane, same convention f-tell slice-02 declared for the F-BILL guardrail files |

### One design tension the scenarios imply, named so it is not resolved by weakening a test

R4 asks `/sin-senal` for the hour the phone last saw the forecast, and §4's route map gives that
route 0 JS. Those are only in tension if the hour is read as something the document computes.
The implementation they leave open is the helper composing the served body: the precached
document plus the `published_at` of the forecast copy the phone is holding. §12's "the SW adds no
header tricks: truth lives in the document" rules out signalling age through response headers; it
does not rule out the helper filling `{hora}` in the body of the page it serves, which is still
truth living in the document the surfer reads. The scenario asserts the outcome (a plain clock
hour after "de las ") and never the mechanism, on purpose. The wrong resolution is a hour baked
in at build time: that reports when the site was published, not when this phone last saw a
forecast, which is a different and less honest claim.

Checked and NOT owed: the emitted helper script and any later `manifest.webmanifest` are not
`.html`, and the gate only matches documents against declared routes, so neither is refused as an
undeclared document. The inline registration snippet is inline, so it is weighed inside the home
document's own 14 KB rather than as a first-visit asset. A `<link rel="manifest">` in slice-05
WILL be counted as a first-visit asset and must be emitted in the build output.


## Observed RED, slices 02-05 JIT DISTILL, 2026-08-10

Slices 02-05 entered DISTILL together on coordinator dispatch (this lane, `build/f2-signal`),
which supersedes the earlier "slices 03-04 may not enter DISTILL until f-tell slice-01 exists"
line above: the dispatch instructs authoring now, with the cross-feature blocks RECORDED rather
than waited out. The flush scenarios therefore plant already-committed records at the queue seam
(`tests/acceptance/f-works-with-no-signal/steps/support/queue-seam.ts` — a PROPOSED naming,
reconciliation owed to f-tell slice-01, recorded in `cross_lane_seams`), because capture is
another feature's journey and the behaviour under test here is only ever the flush.

Commands, each redirected to a file with the status captured directly, never piped:

```
npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-02"   REAL_EXIT=1  (5 scenarios: 4 failed, 1 passed)
npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-03"   REAL_EXIT=1  (7 scenarios: 7 failed)
npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-04"   REAL_EXIT=1  (3 scenarios: 3 failed)
npm run test:at -- --tags "@feature-f-works-with-no-signal and @slice-05"   REAL_EXIT=1  (3 scenarios: 2 failed, 1 passed)
```

A `--dry-run` over `@feature-f-works-with-no-signal` reported 30 scenarios / 394 steps with zero
undefined steps under `strict: true`, and `npx tsc --noEmit` exits 0. Every failure below is an
`AssertionError` raised by its own behaviour oracle after the real build was served and Chromium
walked it at 390 px — zero `IMPORT_ERROR`, `FIXTURE_BROKEN` or `SETUP_FAILURE`. (One transient
`ReferenceError` in the post-review scenario split was caught by this very gate and fixed before
commit; the re-run above is the clean record.)

| Slice | Scenario | Classification | Evidence |
| --- | --- | --- | --- |
| slice-02 | A fresh forecast is never called old | MISSING_FUNCTIONALITY | No machine-readable publish moment underneath the home page (`time[datetime]` / `[data-published-at]` both absent). The visible stamp and the no-Viejo guard already hold |
| slice-02 | Three hours later the same page admits it is old | MISSING_FUNCTIONALITY | With the phone's clock moved 3.4 h (Playwright clock), the page never says the settled Viejo line. No flip script exists |
| slice-02 | An old forecast served with no signal looks old, never fresh | MISSING_FUNCTIONALITY | Offline navigation dies `net::ERR_EMPTY_RESPONSE` (no helper installed — the slice-01 registration seam), so neither the kept copy nor the Viejo line renders. Right reason: two missing halves, both named |
| slice-02 | With no JavaScript the page still tells the true hour | GUARD_ALREADY_TRUE | PASSES today: the corrected plain-clock stamp (BUGFIX `6b02fe0`, Pre-requisite 1 CLOSED) renders with scripts off. A deliberate guard consuming the landed fix; step 02-04 proves it falsifiable rather than implementing |
| slice-02 | Admitting age costs almost nothing to carry | MISSING_FUNCTIONALITY | The built home carries no inline script beyond the helper registration: nothing to weigh, stated as the finding |
| slice-03 | A report filed with no signal sends itself when the signal comes back | MISSING_FUNCTIONALITY | Planted committed record; signal returned (server answering + window `online` dispatched); nothing reached the site in 10 s. No flush code exists |
| slice-03 | A report waiting on a phone that never noticed the signal return still goes out | MISSING_FUNCTIONALITY | Withheld-helper journey staged; captured context also names the missing registration ("the built home page starts no offline helper"). No activation flush exists |
| slice-03 | A throttled door keeps the report waiting patiently, never as a failure | MISSING_FUNCTIONALITY | The scripted 429 door heard zero knocks: no flush ever tried. Entry correctly still queued |
| slice-03 | A report the site refuses is kept, explained, and never hammered | MISSING_FUNCTIONALITY | The scripted refusal reason never rendered anywhere the surfer can see. Label correctly kept (vacuously — no flush) |
| slice-03 | The sin señal page finally makes its second promise, and counts what is waiting | MISSING_FUNCTIONALITY | Offline navigation dies at the registration seam; sentence two and the queue box do not exist on the page either |
| slice-03 | Filed on the sand, the report is saved for the road | MISSING_FUNCTIONALITY (cross-feature) | The real report form renders its three settled questions but `Mandar` times out: no capture island (f-tell slice-01). The RED names the exact seam the integration waits on |
| slice-03 | Sent from the road | MISSING_FUNCTIONALITY (cross-feature) | Its Given replays the filing journey (Pillar-2 composition); with no capture and no flush, nothing reaches the site. Split from the scenario above per the Sentinel review (one When per scenario) |
| slice-04 | The phone never decides a report already went; it asks, and the site answers | MISSING_FUNCTIONALITY | Two planted records, one prestored on the site; the site was asked about neither. No replay code exists |
| slice-04 | A report the site already had is answered exactly like the first time | MISSING_FUNCTIONALITY | No ask, so no first-answer acceptance to observe |
| slice-04 | An answer lost on the way back never becomes a second report | MISSING_FUNCTIONALITY | The lose-answer-once branch was staged (server stores, socket dies); the site was asked 0 times where the journey needs exactly 2 |
| slice-05 | The site offers itself to the home screen with its settled identity | MISSING_FUNCTIONALITY | The built home names no app identity (no manifest link — also the Base.astro head seam). No manifest, no icons exist |
| slice-05 | No promise of avisos before avisos exist | GUARD_ALREADY_TRUE | PASSES today: no avisos wording renders anywhere. This guard IS the recorded A2HS staging condition; it must stay green until the alerts lane's subscribe path is live |
| slice-05 | Opening like an app costs almost nothing on a normal visit | MISSING_FUNCTIONALITY | No app identity in the build to weigh, stated as the finding |

Two scenarios are deliberately green at DISTILL (`GUARD_ALREADY_TRUE`): both are absence/truth
guards whose passing is the specified state today, with falsifiability passes demanded in their
roadmap steps (02-04, 05-02) instead of implementation. Sixteen of eighteen are genuine RED and
DELIVER may take slices 02 and 05 now; slices 03-04 are authorable-RED with their cross-feature
blocks recorded (f-tell slices 01/03/04, the queue-seam naming, and the deploy-blocked write
stack: CloudFormation writes are denied to the CLI identity today, so the live send stays out of
every oracle — zero AWS anywhere in these phases).

Peer review (Sentinel, nw-acceptance-designer-reviewer, 2026-08-10): CONDITIONALLY_APPROVED,
0 blockers, 1 high — a compound two-When journey scenario in slice-03 — resolved in the same
session by splitting it into the two chained scenarios recorded above; all other dimensions
scored 9-10 with mandates CM-A/B/C passing. Reviewer output is PR-ephemeral per the wave
contract; this line is the durable record of the verdict and the fix.
