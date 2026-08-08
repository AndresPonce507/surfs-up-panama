# HANDOFF — Surfs Up Panama

**This file is the truth.** If it disagrees with a transcript, a memory, or anyone's
recollection, this file wins. Update it before you stop working.

- **Written:** 2026-08-08
- **Repo:** https://github.com/AndresPonce507/surfs-up-panama (public, MIT)
- **Local:** `/Users/andres/panama-surf`
- **Branch:** `main`, clean and pushed
- **Reason for handoff:** Andres upgraded nWave on this machine and wants to continue the build
  in a fresh terminal session on the new version.

---

## 1. Where we are

| Wave | Status |
|---|---|
| RESEARCH (cross-wave) | ✅ **Done.** 12 parallel agents, ~8,400 lines, every claim cited with an access date |
| DISCUSS | ✅ **Done.** 31 binding product decisions, one open risk raised and resolved |
| DESIGN | ⏸️ **Round 1 dispatched, then killed on request.** Only empty skeletons exist |
| DISTILL | ⬜ Not started |
| DELIVER | ⬜ Not started |
| DEVOPS | ⬜ Not started |

**No code has been written. There is no application yet.** The repo is research plus decisions.

---

## 2. Read these, in this order

1. `BRIEF.md` — scope, the hard constraints, and the one non-negotiable design decision
2. `docs/DISCUSS-decisions.md` — all 31 decisions with reasoning and consequences
3. `README.md` — the public-facing explanation of the whole idea
4. `docs/research/raw/09-ai-forecast-methodology.md` — **the most important research file.**
   The scoring maths, the learning loop, the honest ceiling analysis, the feedback hazards
5. `docs/research/raw/08-aws-architecture-and-cost.md` — sourced AWS pricing, the two cost
   models, the eleven cost guardrails, the global scaling curve
6. The other ten research files as needed (data sources, spot physics, competitors, WhatsApp)

`docs/surfs-up-panama-vision.html` is the vision deck. Open it in a browser.

---

## 3. The single most important thing

**Every model prediction must be written down at the moment it is made, from day one.**

Forecast archives are not retrievable after the fact. You cannot go back and ask what GFS said
last Tuesday. If today's forecast overwrites yesterday's, there is nothing to compare reality
against and the learning loop becomes impossible, permanently.

It costs almost nothing (writing files to S3). It cannot be added later. If the first slice that
ships does only one thing, it should be this.

---

## 4. Exact next step

**Re-dispatch DESIGN round 1.** Three parallel agents, then round 2, then a coherence review.

The two-round split is deliberate. The fastest way to wreck a parallel design is to let seven
agents each invent their own schema. Round 1 settles the foundations everything else agrees to.

### Round 1 — foundations (3 agents, parallel)

Each writes to `docs/design/`. Skeletons already exist with the intended section headings.

**`01-data-architecture.md`** — the foundational one. The other four depend on it.
- The immutable prediction log: exact schema, S3 key layout, partitioning, format, idempotency
  natural key, volume math at 20 / 500 / 5,000 spots. Lead time must be a first-class dimension.
- The observation record: two-screen report flow where **the label is committed before the reveal
  screen renders** (anti-anchoring, hard constraint). Body-height categories mapped to metre
  *ranges*, not points.
- Anonymous device identity that can later be claimed and merged into a named identity without
  losing history.
- The offline report queue and its server-side dedup on re-sync.
- The per-source per-spot scorecard, updated incrementally rather than recomputed.
- Spot definition: **human seed file + separate learned-correction file**, seed never overwritten,
  effective value computed from both, both auditable.
- The write-path store (DynamoDB key design derived from enumerated access patterns).
- The exact published static JSON payloads with byte sizes, inside the 100KB page budget.

**`02-frontend-architecture.md`**
- Astro, static, **under 100KB, 3G in under 2s, enforced in CI**. Show the byte arithmetic and
  state what it rules out (webfonts? map tiles? islands?).
- Route map, language routing (Spanish first, English toggle), island inventory with a KB cost
  per island and a hard push toward zero-JS.
- The two-screen report flow as real wireframes, including how screen one avoids leaking the
  forecast (from the page it opened from, and from the back stack). Exact copy in both languages.
- Sunlight-readable contrast as a functional requirement with measured ratios, both themes.
- Service worker strategy per route, staleness stamp, offline report queue, PWA manifest, and
  what iOS actually supports in 2026 versus Android.
- The WhatsApp share card, including the Open Graph strategy for link previews.
- ASCII wireframes at 390px for: home, spot detail, report screen 1, report screen 2, offline,
  day-one empty state.

**`03-infrastructure.md`**
- Resource inventory with each always-free allowance and our usage as a percentage.
- **Evaluate GitHub Actions as the primary ingest runner** (free and unlimited on public repos,
  sidesteps both the GRIB2 container-image problem and ECR storage cost). Research its actual
  cron reliability for public repos, including whether scheduled runs get delayed or dropped and
  whether workflows are disabled on inactivity. Give a fallback.
- Lambda Function URLs for writes (no API Gateway, it has no perpetual free tier). Abuse
  protection without buying WAF.
- S3 layout, CloudFront behaviors, TTLs, and an invalidation strategy that mostly avoids paid
  invalidations on the hourly republish.
- **The eleven cost guardrails from research 08 section 10, each as a concrete IaC-enforced
  value.** Log retention especially, since it defaults to never-expire.
- IaC choice with a real skeleton and a zero-to-deployed path. Secrets handling for a PUBLIC repo.
- Zero-budget observability including a dead-man's-switch for the ingest job.
- us-east-1 (NOAA data lives there, same-region transfer is free). External DNS to avoid the
  Route 53 hosted-zone charge.

### Round 2 — the pipeline (4 agents, after round 1 lands)

Each is handed round 1's schemas so they agree instead of inventing their own.

- **`04-ingest-pipeline.md`** — the hourly job. Source-by-source fetch, the Open-Meteo versus
  raw-GRIB2 call, failure handling, partial-failure behavior, idempotency, what happens when a
  source goes dark.
- **`05-scoring-engine.md`** — implement the physics in research 09 section 7 exactly. The
  `S_dir` gate, `H_eff = H·√(T/10)`, the asymmetric wind penalty, the tide window. Pure
  functions, property-testable. Wind is weighted equal to size on purpose, do not "fix" that.
- **`06-learning-layer.md`** — bias correction, the 10–30 report threshold, hierarchical partial
  pooling for cold start, outlier down-weighting, and the three feedback hazards in research 09
  section 13.5 (selection bias, the explore/exploit trap, trolling).
- **`07-write-path.md`** — report submission, anonymous identity, offline sync, spam handling at
  ingest, push subscription management.

### Round 3 — coherence review

Standing rule: a parallel authoring fleet always closes with a reviewer pass. Check that all
seven design docs agree with each other and with all 31 DISCUSS decisions.

---

## 5. Decisions already made — do not relitigate

Full list with reasoning in `docs/DISCUSS-decisions.md`. The load-bearing ones:

- **Mobile web only, not an app.** Nearly every visit is a phone, outdoors, one-handed.
- Astro, static output, under 100KB, offline-capable PWA.
- Home = ranked list of ~20 **Pacific coast** spots. Top spot is visually the call.
- Confidence always shown, three levels, on every row.
- **Accuracy scorecard shown inline on every spot.** This is the differentiator.
- Body-height words primary ("chest to head high"), metres secondary.
- **Spanish first**, English toggle.
- **Today and tomorrow only.** No 7-day forecast, on purpose.
- Report flow is **two screens: cold capture, then reveal.** The label commits before the reveal.
- Anonymous reporting, optional name claim later.
- Photos optional, offered after the three taps.
- Spot params: human seed + learned correction on top. Seed never overwritten.
- Statistical outlier down-weighting only. No moderation queue in v1.
- Only well-known spots. No secret break ever gets added.
- WhatsApp: a share card anyone can copy. The official API cannot post into an existing group.
- Web push, opt-in per spot.
- MIT license. Unmonetized, which is what keeps us inside Open-Meteo's non-commercial terms.
- Domain: **not registered yet.** `surfsuppanama.com` was available on 2026-08-08.
- Name kept as Surfs Up Panama for now even though the product is global by design. Renaming is
  branding only and carries no structural cost, because nothing is hardcoded to Panama.

---

## 6. Open items and flagged risks

None of this blocks DESIGN. All of it should be resolved before the thing it affects ships.

**Verification gaps in the research.** The shared web-search budget ran out partway through the
fleet, so later findings lean on direct fetches rather than fresh searches.

1. **Copernicus Marine commercial redistribution terms — UNVERIFIED.** Read the actual license
   PDF before depending on CMEMS.
2. **Open-Meteo redistribution clause — a genuine gap.** Their terms are silent on serving derived
   data to third parties, and precomputing to public static JSON *is* redistribution. Worth an
   email to info@open-meteo.com before launch.
3. **Cloudflare and Vercel free-tier numbers — UNVERIFIED.** Every AWS figure in research 08 is
   sourced and dated. The competitor comparison in its section 17 is not.
4. **Windy webcam API Panama coverage** — one authenticated call would settle whether it carries
   any surf-coast cams or only canal and city cams.
5. **ACP AQUARIUS hydro portal** — a public API may exist, unconfirmed. Would beat the PDF tide
   tables.
6. **The `gfswave` grib_filter URL pattern** was never live-tested. Test it before building ingest.
7. **Whether the GFS Zarr mirror carries wave fields** or only atmospheric ones.
8. **Apple's $99/yr developer fee and Open-Meteo's multi-model call-weighting formula** — both
   corroborated but not read first-party.

**Product level.**

9. **Playa Duartes could not be located** under that name in any English or Spanish source. Needs
   a human check with the cousin before it goes in the spot list.
10. **Playa Serena has two directly contradictory sources on its best season.** Several surf guides
    also conflate "% clean days" with "biggest swell", producing contradictions the app must not
    copy naively.
11. **Surfline's actual Panama spot and cam coverage is unverified** — their site blocks automated
    fetches. Someone should just look.
12. **No accuracy claim is earnable at launch.** It becomes valid at 10–30 reports per spot, not
    before. Do not let copy get ahead of the data.

**Process.**

13. Three `nw-researcher` agents appeared in the agent list during the research wave that this
    session did not dispatch and that never reported. Unexplained. Worth a look if agent
    accounting matters.
14. The research fleet lost 3 of 12 agents to a transient auth error near the end. All three had
    already written the bulk of their files, so almost nothing was lost, but the closing sections
    of `06`, `08` and `09` may be slightly truncated. They read complete.

---

## 7. How Andres wants this run

From his global CLAUDE.md and his twin memories. The ones that mattered most this session:

- **Short answers.** Findings go in a file. Chat gets the headline and the path.
- **No em dashes, plain contractor voice.** He reacts strongly to AI-sounding text.
- Lead with **👉 YOUR TURN** and fire a macOS notification when blocked on him.
- **Check the data before answering.** Never state a fact from memory. This session I handed the
  research fleet a Panama coordinate from memory that turned out to be an inland village about
  100km from the coast. An agent caught it. Look things up.
- **Flag everything out of scope**, fix only what was asked.
- **Challenge risky calls before acting**, then let him choose. He changed two decisions this
  session because the risk was raised properly.
- Dispatch parallel agents for independent work. Always close a fleet with a reviewer pass.
- Effort and tokens are not a constraint. Spinning without progress is the only sin.

---

## 8. Environment notes

- nWave was upgraded on this machine on 2026-08-08. The new version moves DISTILL and DELIVER to
  an **ATDD-pure / carpaccio-slice** model, so DELIVER will not look like the older version's
  flow. RESEARCH and DISCUSS outputs are version-agnostic and carry over unchanged. **Re-read the
  current `nw-distill` and `nw-deliver` skills before planning those waves** rather than assuming
  the old flow.
- There is a `/nwave-switch` skill on this machine for moving between the experimental 4.0.0
  preview and the stable 3.15.1 release.
- The repo is public. Never commit credentials. `.gitignore` already excludes `.nwave/`,
  `.claude/`, env files and keys.
- A worktree-isolation guard blocks writes to `main` in the primary checkout. Branch first, or
  use a worktree. This file was written on a `handoff` branch and merged.
- Git identity here is `Andres Ponce <andresponce0001@gmail.com>`, which attributes correctly on
  the `AndresPonce507` GitHub account.
