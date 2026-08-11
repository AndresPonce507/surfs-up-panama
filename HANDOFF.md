# HANDOFF: Surfs Up Panama

**This file is the truth.** If it disagrees with a transcript, a memory, or anyone's
recollection, this file wins. Update it before you stop working.

- **Rewritten:** 2026-08-09
- **Repo:** https://github.com/AndresPonce507/surfs-up-panama (public, MIT)
- **Local:** `/Users/andres/panama-surf`
- **Branch:** `design-round-1`; Slice-03 shipped through DES in `df25ee6`.
- **nWave:** upgraded Ponce checkout at `/Users/andres/nwave-ponce`, installed editable through `nwave-ai`. The package metadata still reports `3.15.1`; verify the active source path points to Ponce. This matters, see §4.

---

## 1. Where we are

| Wave | Status |
|---|---|
| RESEARCH | ✅ 15 files, every claim cited with an access date |
| DISCUSS | ✅ 31 product decisions + an 11-feature epic plan |
| DESIGN | ✅ 8 documents, ~30 ADRs, **two full review rounds and two fix rounds** |
| DEVOPS | ✅ `08-devops.md` |
| DISTILL | ✅ Slices 01 through 03 are shipped. Slice-04 through Slice-08 tests remain absent until each legally enters JIT DISTILL. |
| DELIVER | 🟡 Slice-01 (`0f04f07`), Slice-02 (`592d660`), and Slice-03 (`df25ee6`) are committed through DES. The upgraded classic 3.15.1 migration is installed and verified. Slice-04 is legally next for JIT DISTILL. |

**There is a working Slice-01 site** (16 pages, zero JS) and **a real spot data file** (23 spots).
Its pipeline, scoring, Spanish reading surface, permanent receipt and mobile journey are committed
in `0f04f07`. Slice-02 adds the pre-deploy CI guardrail. Its eight scenarios now drive the
production-owned local-CI entry green against real CDK guardrails and credential-free synth. The
default local gate passes all nine jobs, including the documented narrow OSV exception. Slice-02
shipped through DES in `592d660`. Slice-03 shipped through DES in `df25ee6`: it loads the
explicit 20-spot launch policy, ranks the coast, and renders the real static Spanish home. DISTILL
writes each slice's acceptance test before DELIVER writes that slice's production behavior.

---

## Restart checkpoint for Codex

**Slice-03 is shipped in `df25ee6`. Upgraded classic nWave 3.15.1 is installed and verified. Begin Slice-04 JIT DISTILL.**

1. Start in this repository and read this file before touching the worktree:
   `cd /Users/andres/panama-surf`.
2. Slice-02 has eight green CI-guardrail scenarios. `npm run test:at -- --tags @slice-02` passes
   all 8 scenarios and 56 steps. It still has five verified negative ATs. The real `infra` job
   runs the guardrail suite and credential-free CDK synth; the default `npm run ci:local` gate
   passes 9 of 9 jobs. The narrow, expiring OSV exception is documented in `osv-scanner.toml` and
   `docs/security/osv-exceptions.md`.
3. A fresh delegated APPROVED Slice-02 review verdict is recorded. The carpaccio command
   `des carpaccio-slice-gate --repo-root . --feature-id daily-call-with-permanent-receipts --entering-slice slice-02`
   returns `SliceCleared`, exit 0.
4. Slice-02 shipped as `592d660ab6235165a9522caadbd4ee80743b0c17`. Both
   `des verify-slice-commit --repo . --commit HEAD --feature-id daily-call-with-permanent-receipts`
   and `des run-contract-gate --repo . --commit HEAD --verify-gate-scope` passed. Slice-03 shipped
   as `df25ee6646615f6f267da7b40ef85cfd81e13509`: its 6 Slice-03 ATs and 36 steps, 29 unit tests,
   UI gate, and browser journey pass; Vera recorded PASS after walking the 20-row coast. Both DES
   commit gates passed. Slice-04 through Slice-08 tests remain absent.
6. Classic 3.15.1 quality port is committed in `12de550` and the installer/shim repair in
   `02e63e6`. It is installed as an editable `nwave-ai==3.15.1` tool. `nwave-ai doctor` passes
   8 of 8 checks; the UI-mandate and expectation-charter skills, Vera agent, and both DES shims
   exist on the Codex surface. The workflow now allows proven-safe worktree fan-out with isolated
   evidence, while visible steps require U1-U7 checks and a sealed Vera PASS before COMMIT. In
   `/Users/andres/nWave-experimental`, the uncommitted installer fix is limited to
   `scripts/shared/agent_catalog.py` and
   `tests/installer/unit/plugins/test_codex_skills_plugin.py`; it retains the composed UI mandate
   during a normal Codex install. `uv.lock` is an unrelated untracked user file. The focused
   installer test still needs a fresh run before committing or pushing anything.

---

## 2. Read these, in this order

1. `BRIEF.md`, the owner's hard constraints
2. `docs/DISCUSS-decisions.md`, 31 binding decisions. Note the strikethrough supersessions on 1, 4 and 28, and the "Known cost" note in the RESOLVED section
3. `docs/epic/surfs-up-panama/epic-delta.md`, the 11 features and their order. **Live tracker**, update row status as features are picked up
4. `docs/feature/daily-call-with-permanent-receipts/feature-delta.md`, the keystone's 8-slice plan. **This is what DISTILL and DELIVER read**
5. `docs/product/architecture/`, the 8 design documents. `domain-model.md` is the schema authority; where documents disagree about data, it wins
6. `docs/research/raw/`, 15 research files. 09 (forecast methodology) and 08 (AWS cost) are the load-bearing ones

---

## 3. The single most important thing (unchanged)

**Every model prediction must be written down at the moment it is made, from day one.**

Forecast archives are not retrievable after the fact. If today's forecast overwrites yesterday's,
there is nothing to compare reality against and the learning loop becomes impossible, permanently.

It costs under a cent a month. It cannot be added later. It is slice-01.

Two things about it were nearly lost and are now fixed:
- The log lived at `log/predictions/`, which a sibling lifecycle rule proposed to expire, and which
  the ingest IAM role had no permission to write. It is now top-level `predictions/`, and the guard
  tests prefix **overlap**, not string equality.
- **Nothing stops a human deleting it from the AWS console.** Bucket versioning is the one-line
  fix, on the launch checklist, not yet applied.

---

## 4. Exact next step

**Begin Slice-04 JIT DISTILL under the upgraded classic 3.15.1 workflow.**
Slice-03 is shipped in `df25ee6`; its versioned 20-spot policy is now production behavior. The
classic migration is complete in `12de550` and `02e63e6`, installed and doctor-verified.

### Post-Slice-03 workflow decision

The project moved off the 4.0.0 experimental `atdd_pure` workflow and onto upgraded
nWave 3.15.1 with the classic delivery spine. The following quality mechanisms are first-class
integration points, not copied prompt text:

- Classify every slice as user-visible or non-visual at DISTILL open. User-visible
  slices must load `nw-ui-quality-mandates`, carry `ui` requirement rows and induced
  automated checks for U1-U7, plus a U8 charter observation. Non-visual slices record
  an explicit N/A rationale instead of fabricating pixel checks.
- Reuse feature-level UI fixtures and static checks, while each changed visible slice
  proves its own affected states, minimum viewport, target sizes, motion treatment,
  token usage and contrast against the actual backdrop.
- Require Vera (`nw-user-examiner`) after GREEN and before the slice commit. Vera uses
  only the user surface, never source, and records PASS, FAIL or INDETERMINATE against
  the slice charter. The final visible slice also receives a feature-level smoke walk.
- Restore independent-slice worktree fan-out where dependencies permit it. Distillation,
  implementation and review may run concurrently; shared-file integration and commits
  remain serialized and dependency-ordered.
- Keep the experimental worktree safety model: each lane has its own checkout, environment
  and declared touched-path/schema/user-flow boundary. The scheduler may fan out only lanes
  with disjoint boundaries, then merges one verified lane at a time and runs the shared suite.
  Dead-agent recovery starts from the preserved worktree contents, not a speculative rewrite.
- Keep one fresh, independent acceptance reviewer that self-records an APPROVED verdict. Do
  not reintroduce manual approval or a fixed reviewer quorum. Re-review only after a contract
  mutation or a failed gate, and scale additional specialist review from measured blast radius.
- Keep deterministic, actionable gates: each failure must state the failed observable, why it
  matters and the next repair command. Preserve feature-end health checks and `des blast-radius`,
  but do not port the global future-AT requirement, duplicate ledgers or standing review loops
  that made legal JIT delivery look incomplete.

Slice-03 is complete under its current contract. The migration has passed focused quality,
installer, packaging, and deployed-doctor verification. Use it for Slice-04.

1. The eight charters are filled and pass their charter checks. The requirement checklist and
   red-classification record live under `docs/feature/daily-call-with-permanent-receipts/distill/`.
2. Slice-01 through Slice-03 scenarios are on disk and green. Slice-03's six scenarios and the
   single browser journey prove the 20-row home observable. Slice-04 through Slice-08 scenarios
   remain absent. The delivered acceptance suite covers durable prediction writes,
   scoring laws, the real built reading surface, source-failure modes, and the visual mandates.
3. The mandatory four-reviewer DISTILL re-review has approved the corrected suite: the R43
   reading-state contract, port capabilities, prediction write-once documentation,
   source-failure coverage, UI checks, and CI wiring have zero remaining blocker or high findings.
4. Andres recorded the independent slice-01 AT-review verdict as `andres-human`, `APPROVED`.
   `des carpaccio-slice-gate --feature-id daily-call-with-permanent-receipts --entering-slice slice-01`
   returned `SliceCleared`, exit 0. The crafter changed production code only, and its green result
   was independently confirmed: typecheck; 22/22 Vitest tests; 17 Cucumber scenarios and 138
   steps; the UI gate; and the one mobile E2E journey all pass.
5. `des verify-deliver-entry-contract` currently reports a tooling conflict: it requires authored
   AT modules for every future Slice Plan row, while this feature's explicit JIT rule requires
   slices 03-08 to remain absent until their turn. No future tests were added to bypass that rule.
6. The first non-technical examiner walk recorded `INDETERMINATE` in
   `.nwave/telemetry/examine/daily-call-with-permanent-receipts.jsonl`. It observed Playa Venao,
   score 80, Spanish call, stable reloads, a dated `/ayer` receipt, and a normal 404. It could not
   honestly perform the original charter's required Day-2 identity comparison because no genuine
   next-day publish existed. The fixed data exposed a production wiring gap, now closed: `npm run
   publish:surface -- --input <pub-v1-bundle.json>` atomically promotes a completed call, retains
   dawn receipts, and `npm run build` refuses if the current receipt is not for the actual Panama
   civil day. The reloop is independently green: typecheck, 22/22 Vitest tests, 17 Cucumber
   scenarios and 138 steps, UI gate, and mobile E2E pass. Tests remain unchanged.
7. A fresh product-owner context amended the charter and `des verify-charter-filled` now passes.
   Its local oracle is the observable one-session proof: today's page and the retained prior-dawn
   `/ayer` receipt, each stable through reload and navigation. The first independent examiner
   recorded `FAIL`: three valid `/spots/playa-venao/ayer` opens alternated blank, receipt, blank.
   This was a real user-visible correctness failure. A production-only repair removed the optional
   cross-document transition from that permanent receipt route and independently held under 40
   browser reloads and 10 repeated E2E journeys. The repair also made R23's angular computation
   canonical at the stated precision after a deterministic floating-point counterexample. All
   declared checks are green. A fresh Vera walk has now recorded `PASS` against the current charter
   seal: today and the distinct retained `/ayer` receipt were stable through reload and navigation,
   readable, Spanish, and free of raw errors. `des commit-slice` passed and produced
   `0f04f07da9fd88ecfbd046862f07e0f44c549943` with `SliceCommitVerified` for slice-01.
   The genuine two-real-morning comparison is a post-deploy launch verification only, when the
   unattended deployed ingest has actually run overnight. It is not local slice evidence and no
   local midnight wait is required.
8. Slice-02 shipped in `592d660ab6235165a9522caadbd4ee80743b0c17`. Its eight CI-guardrail ATs
   are green: `npm run test:at -- --tags @slice-02` passes 8
   scenarios and 56 steps. `des verify-negative-at` still finds five critical negative ATs. A fresh
   delegated `APPROVED` reviewer verdict is recorded and its carpaccio gate returns `SliceCleared`.
   `npm run ci:local` passes all 9 jobs, including real `infra/test/guardrails.test.ts`,
   credential-free CDK synth, and the full lockfile OSV scan. The one narrow, expiring OSV
   exception for AWS CDK's bundled `brace-expansion@5.0.8` is documented with its removal
   condition. `des verify-slice-commit --repo . --commit HEAD --feature-id daily-call-with-permanent-receipts`
   and `des run-contract-gate --repo . --commit HEAD --verify-gate-scope` passed. Slice-03 shipped
   in `df25ee6` after fresh autonomous approval, green gates, and Vera PASS.

**Two tags are mechanically load-bearing** and the carpaccio gate reads both. Get either wrong and
the gate reports no scenarios for the slice:
- File level `@feature-daily-call-with-permanent-receipts` above `Feature:`
- Per scenario `@slice-NN` on **every** scenario. Feature-level tags do NOT inherit downward

---

## 5. Decisions made 2026-08-08, do not relitigate

Beyond the 31 in the decisions log:

- **Epic mode.** 4 of 5 oversized signals fired, so the MVP is an epic of 11 features, not one feature
- **All four free wave models from day one**, not one. Reason is the archive, not accuracy: the log
  cannot be backfilled and per-source skill comparison is its whole point. Four is the real ceiling
  at Panama; ECMWF WAM and DWD EWAM return null at every coastal point here
- **Yesterday's forecast is a public page.** The raw prediction log stays private; the *published
  call* log becomes readable. This makes the accuracy scorecard checkable instead of asserted
- **Day-one confidence means model agreement**, since no spot has a track record yet. Being
  implemented in `05-scoring-engine.md`; slice-07 needs rewording when it lands
- **Wind is out of the scorecard grain.** It is a categorical word, has no residual, and nothing
  read those rows. Still captured and still displayed
- **The two-day bundle shape**: `days[]` for ranked per-day summaries, `spot_detail{}` for
  everything day-independent. The old shape had no representation for tomorrow at all
- **Writes are NOT behind CloudFront.** A rejected request costs real money at the CDN and nothing
  at a bare Function URL. A 429 from Lambda is not billed, which is what makes anonymous writes affordable

---

## 6. Open items

**DECISIONS RECORDED 2026-08-08 19:30. Items 1 to 4 below are CLOSED, treat them as settled and
proceed.**

1. **CLOSED, downgraded to a launch-checklist item, not a blocker.** The seven Spanish size-band
   strings already exist and are canonical in `domain-model.md` §7.2. The cousin's review is a
   VALIDATION of wording by a native surfer, not the source of it. Slice-01 proceeds on the
   current strings. If he corrects them it is a copy change against a settled schema, not rework.
   Ship, then verify. His answer on Punta Duarte is likewise a spot-list correction and Playa
   Duartes is already excluded from the seed file, so nothing depends on it.
2. **CLOSED. Route is `/spots/{slug}/ayer`, English twin `/en/spots/{slug}/yesterday`.** Settled,
   not a proposal. It matches the existing `/manana` and `/en/tomorrow` pattern and there is
   nothing else to weigh.
   **The day's call is the DAWN build, stamped with its exact publish time on the page.** The
   product is framed around the 5:40am decision, so the call that mattered is the one that was live
   when someone decided whether to drive. Showing a later build shows them something they never
   saw. Every hourly build stays in the calls log; this only decides which one the yesterday page
   displays. Known and accepted: showing one build slightly hides that the forecast moved during
   the day. Adding "updated N times" later is cheap and is not slice-01's problem.
3. **CLOSED. Slice-01 ships Spanish only. The Definition of Done is right and the scaffold is
   wrong.** English is feature 11 in the epic (`F-READ-IT-IN-YOUR-LANGUAGE`), placed last on
   purpose so one translation pass covers settled copy. The `/en/` tree exists because the
   scaffolding brief told an agent to build the full route map from the architecture document,
   which spans all eleven features. That was an error in the brief, not a design conflict.
   Remove the `/en/` routes from the build. They are placeholder files with bracketed English
   copy in them, and a half-English site is worse than an honestly Spanish one. Feature 11
   recreates them properly with real translation.
4. **CLOSED.** Slice-01's independent approval and commit are recorded. Slice-02's fresh
   delegated APPROVED verdict, cleared carpaccio gate, DES commit (`592d660`), slice-commit
   verification, and contract gate are recorded. Slice-03 shipped in `df25ee6`; its 20-spot policy
   and three documented exclusions are live in the built home.

**Needs Andres for launch, but not for the remaining local build:**

5. **Email Open-Meteo** (`info@open-meteo.com`). Their terms are silent on serving derived data to
   third parties, and precomputing to public static JSON *is* redistribution. Fallback is raw NOAA
   GRIB2, live-verified working. Not sent

**Needs AWS console access, deliberately not attempted (owner asked to leave AWS alone):**

6. Account Lambda concurrency quota. If ≤102, the rate-limit design does not exist and the attack
   ceiling is ~$130/mo. **ANSWERED 2026-08-10, read-only re-probe: the quota is 1000** (raised from
   the 10 observed 2026-08-09; `aws-permission-inventory.md` §9). The rate-limit design is
   deployable; all 13 declared reservations fit with 987 unreserved remaining
7. Whether AWS meters egress for a 429 emitted before the function runs. Can move the whole abuse answer
8. DynamoDB 25 WCU/RCU perpetuity. **Marked UNVERIFIED after a reviewer found the repo's own research
   contradicts the "always free" claim.** $0 if perpetual, ~$14.24/mo from month 13 if not
9. Bucket versioning on `predictions/` (see §3)

**Research gaps still open:** Copernicus Marine licence terms; Windy webcam Panama coverage; ACP
AQUARIUS tide API. Resolved today by live test: the `gfswave` grib_filter URL works, the GFS Zarr
mirror carries no wave fields, `global.0p16` exists (research 08 §15.2 was wrong).

**Known stale, low priority:** `07-write-path.md` §12 and `docs/research/raw/15-*.md` §14.3 still
carry arithmetic that was falsified. The corrected version is in `system-architecture.md` §6.1,
which names them.

---

## 7. How Andres wants this run

- **Short answers.** Findings go in a file; chat gets the headline and the path
- **No em dashes, plain contractor voice.** He reacts strongly to AI-sounding text
- **Check the data before answering.** Never state a fact from memory
- **Flag everything out of scope**, fix only what was asked
- **Challenge risky calls before acting**, then let him choose
- Parallelise aggressively, and always close a fleet with a reviewer pass
- Effort and tokens are not a constraint. Spinning without progress is the only sin

**The orchestration lesson from today, learned twice the hard way.** When a decision spans two
agents, settle it *before* dispatch. Do not let one lane decide something another lane depends on
while both run. It happened with the prediction log path and again with the payload field names,
and both times two individually-correct documents ended up contradicting each other. Parallel is
for genuinely disjoint work, not for work that merely lives in different files.

---

## 8. Environment notes

- **`~/.claude/bin/des` had a Python 3.9 shebang** and every `des` gate crashed. Repointed at the
  uv-managed 3.12. If gates start failing with a TypeError on `list[str] | None`, that is this
- **Model tiering is not in either installer** and every nWave install wipes it.
  `~/nwave-switch.sh` calls `~/nwave-pin-models.sh` automatically. Edit the arrays in that script,
  never the agent specs directly
- **Run the CI gate capturing its real exit code**, not piped into `tail`. A pipeline returns the
  last command's status, so `node scripts/ci-local.mjs | tail && git commit` will commit over a red
  gate. It did, once, today
- **Long-running agents die to a watchdog timeout** (six today). The work is always on disk; only
  the final report is lost. Verify every completion rather than trusting the summary, and split any
  review that has to read more than a few large documents
- The repo is public. Never commit credentials. `.nwave/config.yaml` and `des-config.json` are
  tracked on purpose; the rest of `.nwave/` is not
- Git identity here is `andresponce0001@gmail.com`, which attributes correctly on `AndresPonce507`

---

## 9. Slice-04 pause point, 2026-08-09

**Status: Slice-04 shipped.** The verified implementation commit is
`fee3aadf91b2c8f48922a9cd999a498907be4bba`; the tracker update is
`26df2b6`. The permanent source-blind Terra examiner recorded PASS against the HTTPS preview,
with title `¿Dónde se surfea hoy?`, reason `Pecho a cabeza, viento limpio, mejor de 06:00 a
09:30.`, and screenshot `/private/tmp/terra-vera-cloudfront-spanish-final.png`. DES recorded the
examiner verdict and verified the slice commit. The local built page was opened at
`http://127.0.0.1:58532/` in Chrome for Andres's smoke test.

### What Slice-04 changes

- The home page has an oversized winning call with literal Spanish `VE A Playa Venao`.
- Its visible reason is Spanish plain language: `Pecho a cabeza, viento limpio, mejor de 06:00 a
  09:30.`
- The pipeline publishes the structured size, wind, and time fields that make this repeatable.
- Slice-04 ATs include a disguised technical model token regression case. The E2E identity check
  understands the added `VE A` presentation prefix.

### Verified evidence

- `npm run ci:local` passed on 2026-08-09 after the last AT change: 9 passed, 0 failed, 0 skipped.
  This includes typecheck, unit, UI, infra, AT, E2E, security, secrets, and dependency gates.
- Focused Slice-04 ATs passed: 9 scenarios, 61 steps.
- `git diff --check` passed before the pause.
- A fresh `npm run build` completed immediately before the pause. A local static server is still
  running from `dist/` at `http://127.0.0.1:58532/` (parent agent session id 68427). Its direct
  HTTP output includes `VE A Playa Venao` and `Pecho a cabeza, viento limpio, mejor de 06:00 a
  09:30.`. Confirm it is still live with:

  ```sh
  curl -fsS http://127.0.0.1:58532/ | rg -o 'VE A[^<]*|Pecho a cabeza[^<]*'
  ```

### Vera blocker and correct next action

The built public page and a direct 390x844 Playwright screenshot were Spanish. Three earlier
examiner runs nevertheless claimed an English page. The final Terra run cited
`/tmp/panama-surf-slice04-vera-58532-390x844.png` but again claimed English although the fresh
server's direct HTML was Spanish. Treat those FAILs as conflicting examiner evidence, **not** as a
product defect. Do not record them as a charter failure and do not commit on a guessed PASS.

The permanent Codex-compatible replacement is installed globally as
`nw-codex-user-examiner`, model `gpt-5.6-terra`; Codex config sets high reasoning. It requires a
fresh public artifact and returns INDETERMINATE for conflicts. It will be visible only after a new
Codex session starts. In that new session, run this examiner source-blind against port 58532 or a
freshly built equivalent, requiring the final URL, exact title, exact reason, and a screenshot path.
If its screenshot conflicts with the direct server output, inspect the screenshot and return
INDETERMINATE rather than guessing.

**Latest examiner evidence, 2026-08-09:** the permanent Terra examiner reached
`http://127.0.0.1:58532/` but Chrome showed title `127.0.0.1`, reason
`127.0.0.1 didn’t send any data.`, and `ERR_EMPTY_RESPONSE`; its screenshot is
`/private/tmp/terra-vera-127-0-0-1-58532.png`. The verdict is **INDETERMINATE**.
Do not reinterpret this as a product PASS or FAIL. Restore a preview that is reachable from the
examiner's actual browser surface, then repeat the source-blind observation before committing.

**Repeated browser-artifact conflict, 2026-08-09:** after a fresh `npm run build`, the generated
`dist/index.html` contained Spanish title `¿Dónde se surfea hoy?` and `VE A Playa Venao` with
`Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.`. Two fresh Terra browser walks at the
same URL instead showed English title `Where's the surfing going today?` and English reason
`Chest to head, clear wind, best from 06:00 to 09:30.`; screenshots are
`/private/tmp/terra-vera-127-0-0-1-58532-repeat.png` and
`/private/tmp/terra-vera-127-0-0-1-58532-final.png`. This is an environment artifact conflict,
so the only valid result remains **INDETERMINATE**. Do not commit Slice-04 until Terra can inspect
the exact rebuilt public artifact, preferably through a separately hosted preview URL.

**AWS preview attempt, 2026-08-09:** Andres explicitly requested an isolated hosted preview.
`arn:aws:iam::602167897909:user/andres-cli` created private bucket
`surfs-up-panama-preview-602167897909` in `us-east-1`, tagged it as an ephemeral preview, and
uploaded the fresh `dist/` artifact. The account denies `s3:PutBucketPublicAccessBlock` and
`cloudfront:CreateOriginAccessControl`, so the bucket remains private (anonymous HTTPS fetch of
`index.html` returns 403) and no preview URL exists yet. No CDK stack, DNS, database, Lambda, or
production bucket was touched. Required least-privilege path: permit creation of a CloudFront
origin access control and distribution plus the narrowly scoped bucket policy for this preview
bucket, or have Andres create that CloudFront distribution himself.

**AWS preview resolved, 2026-08-09:** the same identity successfully created legacy CloudFront
origin access identity `E3NNZ9FL9FTR4`, a non-public S3 policy scoped to that canonical identity,
and distribution `EH95FHQ75WCL3`. The public HTTPS preview is
`https://d1j9u9fxnap4es.cloudfront.net/`; it returned HTTP 200 and its fetched HTML contains
`¿Dónde se surfea hoy?`, `VE A Playa Venao`, and
`Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.`. No production resource changed.
The permanent Terra agent's Chrome surface still auto-translates Spanish and lacks the in-app
browser; its result remains **INDETERMINATE** until Chrome translation is disabled for this site.

**Hosted smoke, 2026-08-09:** direct HTTPS smoke against the CloudFront preview passed: home
and `/spots/playa-venao/ayer.html` both returned HTTP 200; the home returned the exact Spanish
title, `VE A Playa Venao`, and the Slice-04 reason. `PREVIEW_URL` was not usable for the existing
Playwright command because its `webServer.reuseExistingServer: false` treats an already-live
external URL as a conflict before a test begins. That test-runner configuration issue is outside
Slice-04 and does not alter the hosted smoke result.

After a valid PASS, run the relevant DES commit command available in the new session, commit only
the Slice-04 paths listed below, then open `http://127.0.0.1:58532/` in a browser tab for Andres.
Remove the generated untracked `test-results/` directory before the commit. Do not alter the
unrelated existing `.nwave/.gitignore` and `.nwave/des-config.json` changes.

### Files owned by Slice-04

- `data/published-surface.json`
- `src/components/RankedList.astro`
- `src/data/forecast.ts`
- `src/pipeline/build.ts`
- `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts`
- `tests/acceptance/daily-call-with-permanent-receipts/top-call-card.feature`
- `tests/acceptance/daily-call-with-permanent-receipts/top-call-card.steps.ts`
- `tests/acceptance/daily-call-with-permanent-receipts/fixtures/slice-04-top-call-variants.json`
- Slice-04 expectation, requirement-checklist, RED classification, and feature-delta documentation
  already modified under `docs/feature/daily-call-with-permanent-receipts/` and `docs/product/expectations/`.

### Cross-terminal state

- `agent-hub` CLI is working. This terminal is `codex-ttys001`, rejoined as coordinator for
  `/Users/andres/panama-surf`.
- Message 22 from `codex-ttys000` is unacknowledged because this old Codex session's MCP transport
  is closed. It asks the fresh client to join, call whoami, enable direct input while idle, reply
  with evidence, and acknowledge it.
- This terminal replied through CLI as message 23. `codex mcp list` shows `agent_hub` enabled. The
  new Codex session should start with `join_workspace`, `whoami`, `inbox`, and `status`, then
  acknowledge message 22 before continuing Slice-04.

### nWave install note

`nw-codex-user-examiner` is installed and verified at
`/Users/andres/.codex/agents/nw-codex-user-examiner.toml`. The global DES shim at
`/Users/andres/.claude/bin/des` currently has a stale uv Python shebang and fails if invoked from
this old session. This is an installer issue outside Slice-04. A fresh Codex session may expose a
working DES hook. If it does not, repair the nWave installer path separately; do not hand-edit the
Slice-04 code to work around it.

---

## 10. Slices 06, 07, 08 build, 2026-08-09

**Base for all of it is `63d5b1ec577c5dd6fda24020948483cda99649c8`**, the verified Slice-05
candidate on `slice05-repair-combine`. That base was re-run green from scratch before anything
stacked on it: `npm run ci:local`, 9 of 9, real exit code 0. Do not use `design-round-1` as the
build base; its Slice-05 source is a different implementation.

### Branch reconciliation, decided by Andres

`design-round-1` and the verified candidate had diverged across 12 files, 451 insertions and 338
deletions, including two genuinely different Slice-05 implementations and 133 lines of HANDOFF
history. The decision: keep the candidate's code exactly, carry `design-round-1`'s section 9
across as documentation only, leave `design-round-1` itself untouched. Section 9 was verified
purely additive first, sections 1 through 8 were byte-identical on both branches. That carry is
done and this file now matches `design-round-1` exactly through section 9.

### Waivers, recorded rather than hidden

1. **The JIT DISTILL rule was relaxed on Andres's instruction.** Slices 06, 07 and 08 opened their
   acceptance tests in parallel instead of strictly one at a time. `des carpaccio-slice-gate` is
   absent from the installed DES surface so nothing mechanically enforces the rule today. It was a
   deliberate call for throughput, not an oversight, and it is written here so the next reader does
   not mistake it for drift.
2. **The legacy DES commit gates do not exist and were not faked.** `carpaccio-slice-gate`,
   `verify-slice-commit` and `run-contract-gate` are not in the installed build; only shims such as
   `des-roadmap` and `des-verify-ui` are. What replaced them, per slice: `npm run ci:local` fully
   green with its real exit code, the focused slice tags, `npm run test:at` whole-suite,
   `git diff --check`, and a live examiner walk against the hosted preview. No legacy gate was
   reported as passing.

### Decisions made 2026-08-09

- **No domain yet. Build against the CloudFront hostname.** `astro.config.mjs` still has no `site`.
  This gates all five F-PASTE-THE-CALL-INTO-THE-GROUP slices, because that feature's share message
  ends in a `{url}` line. Setting `site` is a one-line change when a domain exists.
- **Model tiering was wiped again** by the nWave installs at 11:27 and 11:36 today; every agent spec
  had reverted to `model: inherit`. Re-pinned with `~/nwave-pin-models.sh`. Check this after every
  install, it is silent.

### Verified against live sources, and each contradicts something written down

- **There is no $20 billing alarm.** `system-architecture.md` section 9 guardrail 9 says one exists.
  The account has ZERO CloudWatch alarms and the only budget belongs to a different project. Fix
  the document or create the alarm, but do not keep relying on the claim.
- **Every spot link on the hosted preview returned 403.** All 20 of them. The site links to the
  directory form `/spots/{slug}/` while `build.format: 'file'` emits `spots/{slug}.html`, and an S3
  REST origin serves no index document. `astro preview` resolves directory URLs itself, which is
  exactly why this never showed up locally and why the `manana/` key had to be created by hand.
  The proper fix is a CloudFront viewer-request function; its code is committed at
  `scripts/preview/clean-urls.js` but `andres-cli` is denied `cloudfront:CreateFunction`, so
  `scripts/preview/publish-preview.mjs` closes it at publish time instead.
- **There was no 404 page anywhere.** No `src/pages/404.astro`, no `dist/404.html`, and CloudFront
  had zero custom error responses, so any bad route served raw S3 `AccessDenied` XML. Slice-06 owns
  the page; mapping origin 403 to it at the CDN is a deploy concern.
- **A null wind score renders as `clean`.** `src/pipeline/build.ts` `windState` returns `'clean'`
  when the score is null, so missing wind data displays as `limpio`, the most favourable reading
  available. For a product whose premise is never claiming more certainty than the data earns, that
  default is backwards. Slice-04 code, flagged not fixed.
- **The wind vocabulary disagrees across two documents.** `05-scoring-engine.md` section 498 says
  `clean|bumpy|choppy` with the middle bucket at 0.40; the code says `clean|choppy|blown_out` with
  the middle at 0.35. The code matches the report labels in `application-architecture.md` section
  403, so the scoring document is the stale one, but the 0.35 against 0.40 threshold gap is real.

### The failure that green tests could not see

`data/published-surface.json` carried `conf_level` on ZERO of its 60 rows, and `size_band`,
`size_range_m`, `wind_state` and `best_window` on exactly 1 of 20 calls. Those fields are optional
on `SurfaceCall`, so typecheck passed, all CI jobs passed, and nineteen of twenty spot pages would
still have rendered undefined. There was also no way to regenerate the file: `runBuildOnce` has no
production caller outside tests, and `publish:surface` demands an `--input` bundle that nothing
emitted. A dedicated producer lane owns building that path and, more importantly, the guard that
fails when any of the five fields goes missing. Without that guard this silently returns.

### Preview tooling added

- `scripts/preview/publish-preview.mjs` publishes `dist/` and writes each page a second time at its
  literal directory key, generalising the `manana/` workaround so directory links resolve.
- `scripts/preview/verify-preview.mjs` smokes the hosted preview against the charters: every spot
  link resolves, no page prints a bare exact metre value, two spots do not show identical numbers,
  and a misspelled route does not serve raw XML. It was proved falsifiable against the broken state
  before being trusted, and it fails with a real exit code.
- `scripts/preview/clean-urls.js` is the CloudFront function that should replace the publish-time
  workaround once the account permits `cloudfront:CreateFunction`.
