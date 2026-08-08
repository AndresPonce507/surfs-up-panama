# HANDOFF: Surfs Up Panama

**This file is the truth.** If it disagrees with a transcript, a memory, or anyone's
recollection, this file wins. Update it before you stop working.

- **Rewritten:** 2026-08-08 (second write of the day; the first is in git history)
- **Repo:** https://github.com/AndresPonce507/surfs-up-panama (public, MIT)
- **Local:** `/Users/andres/panama-surf`
- **Branch:** `design-round-1`, 10 commits ahead of `main`, not pushed
- **nWave:** 4.0.0 experimental (atdd-pure). This matters, see §8.

---

## 1. Where we are

| Wave | Status |
|---|---|
| RESEARCH | ✅ 15 files, every claim cited with an access date |
| DISCUSS | ✅ 31 product decisions + an 11-feature epic plan |
| DESIGN | ✅ 8 documents, ~30 ADRs, **two full review rounds and two fix rounds** |
| DEVOPS | ✅ `08-devops.md` |
| DISTILL | ⬜ **Next.** Charters, then acceptance tests |
| DELIVER | ⬜ Not started |

**There is a site that builds** (16 pages, zero JS) and **a real spot data file** (23 spots).
There is **no feature code and no test** yet. That is correct at this point: DISTILL writes
every acceptance test before DELIVER writes the code that satisfies it.

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

**DISTILL for `daily-call-with-permanent-receipts`.** In order:

1. `des charter-scaffold --feature-id daily-call-with-permanent-receipts` gives one charter per
   observable slice, Intent seeded from the slice's Value statement
2. A **fresh** `nw-product-owner` context fills each charter (start recipe, expected observations
   including at least one negative, session log). Independent of AT authoring, both derive from
   the same Value statement, neither reads the other
3. `des verify-charter-filled --charter <path>` on each
4. Extract the requirement checklist to `docs/feature/{id}/distill/requirement-checklist.md`
5. `nw-acceptance-designer` authors every AT as an **active-RED scaffold**: it runs and fails on
   the missing behaviour, never `@skip`. Current slice's scenarios on disk, future slices absent
6. Final wave review gate: four reviewers in parallel over the whole four-wave chain

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

**Needs Andres, blocking nothing today:**

1. **His cousin.** Three questions, one conversation: the spot list (is Punta Duarte in Mariato the
   "Playa Duartes" he meant?), the metre ranges behind the body-height words, and the seven Spanish
   size band strings the report form uses. Slice-01 cannot be honestly examined without the size words
2. **Email Open-Meteo** (`info@open-meteo.com`). Their terms are silent on serving derived data to
   third parties, and precomputing to public static JSON *is* redistribution. Fallback is raw NOAA
   GRIB2, live-verified working. Not sent

**Needs AWS console access, deliberately not attempted (owner asked to leave AWS alone):**

3. Account Lambda concurrency quota. If ≤102, the rate-limit design does not exist and the attack
   ceiling is ~$130/mo
4. Whether AWS meters egress for a 429 emitted before the function runs. Can move the whole abuse answer
5. DynamoDB 25 WCU/RCU perpetuity. **Marked UNVERIFIED after a reviewer found the repo's own research
   contradicts the "always free" claim.** $0 if perpetual, ~$14.24/mo from month 13 if not
6. Bucket versioning on `predictions/` (see §3)

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
