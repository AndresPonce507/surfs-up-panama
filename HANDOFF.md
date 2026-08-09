# HANDOFF: Surfs Up Panama

**This file is the truth.** If it disagrees with a transcript, a memory, or anyone's
recollection, this file wins. Update it before you stop working.

- **Rewritten:** 2026-08-08 (second write of the day; the first is in git history)
- **Repo:** https://github.com/AndresPonce507/surfs-up-panama (public, MIT)
- **Local:** `/Users/andres/panama-surf`
- **Branch:** `design-round-1`; Slice-02 shipped through DES in `592d660`.
- **nWave:** 4.0.0 experimental (atdd-pure). This matters, see §8.

---

## 1. Where we are

| Wave | Status |
|---|---|
| RESEARCH | ✅ 15 files, every claim cited with an access date |
| DISCUSS | ✅ 31 product decisions + an 11-feature epic plan |
| DESIGN | ✅ 8 documents, ~30 ADRs, **two full review rounds and two fix rounds** |
| DEVOPS | ✅ `08-devops.md` |
| DISTILL | 🟡 Slices 01 and 02 are shipped. Slice-03 is now legally next for JIT DISTILL; its spot-list data prerequisite remains pending. |
| DELIVER | 🟡 Slice-01 is committed through DES (`0f04f07`) and Slice-02 through DES (`592d660`). Slice-03 through Slice-08 tests remain absent. |

**There is a working Slice-01 site** (16 pages, zero JS) and **a real spot data file** (23 spots).
Its pipeline, scoring, Spanish reading surface, permanent receipt and mobile journey are committed
in `0f04f07`. Slice-02 adds the pre-deploy CI guardrail. Its eight scenarios now drive the
production-owned local-CI entry green against real CDK guardrails and credential-free synth. The
default local gate passes all nine jobs, including the documented narrow OSV exception. Slice-02
shipped through DES in `592d660`. Slice-03 is now legally next for JIT DISTILL, while its
spot-list data prerequisite remains pending. DISTILL writes each slice's acceptance test before
DELIVER writes that slice's production behavior.

---

## Restart checkpoint for Codex

**Slice-02 is shipped in `592d660`. Slice-03 is legally next for JIT DISTILL, but its spot-list data prerequisite remains pending.**

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
   and `des run-contract-gate --repo . --commit HEAD --verify-gate-scope` passed. Begin Slice-03
   JIT DISTILL next. Its launch spot-list data prerequisite remains open for seed-file content;
   Slice-04 through Slice-08 tests remain absent.
6. Codex nWave assets were reinstalled. `~/.agents/skills/nw-ui-quality-mandates/SKILL.md` now
   exists. Restart Codex to load the changed skill and agent specifications. In
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

**Begin Slice-03 JIT DISTILL.** Slice-02 is shipped; Slice-03's launch spot-list data prerequisite remains pending for its seed-file content. Current facts:

1. The eight charters are filled and pass their charter checks. The requirement checklist and
   red-classification record live under `docs/feature/daily-call-with-permanent-receipts/distill/`.
2. Slice-01 and Slice-02 scenarios are on disk and green. Slice-03 is legally next for JIT
   DISTILL; its scenarios remain absent until that work starts, and Slice-04 through Slice-08
   scenarios remain absent. The delivered acceptance suite covers durable prediction writes,
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
   and `des run-contract-gate --repo . --commit HEAD --verify-gate-scope` passed. Slice-03 is
   legally next for JIT DISTILL; its launch spot-list data prerequisite remains pending.

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
   verification, and contract gate are recorded. Slice-03 is legally next for JIT DISTILL; its
   spot-list data prerequisite remains pending.

**Needs Andres for launch, but not for the remaining local build:**

5. **Email Open-Meteo** (`info@open-meteo.com`). Their terms are silent on serving derived data to
   third parties, and precomputing to public static JSON *is* redistribution. Fallback is raw NOAA
   GRIB2, live-verified working. Not sent

**Needs AWS console access, deliberately not attempted (owner asked to leave AWS alone):**

6. Account Lambda concurrency quota. If ≤102, the rate-limit design does not exist and the attack
   ceiling is ~$130/mo
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
