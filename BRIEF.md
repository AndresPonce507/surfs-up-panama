# Surfs Up Panama — project brief

**Owner:** Andres Ponce
**Started:** 2026-08-08
**Status:** RESEARCH wave in flight (12 parallel agents)

## The problem (in the owner's words)

His cousin, a long-time Panama surfer, runs a WhatsApp group with ~500 people. All day
they post photos and videos of the waves at different beaches so everyone knows which
spot is worth driving to. That group is the real product today.

The reason it exists: **forecasts lie.** A tracker can say conditions are perfect, you
drive two hours, and it is garbage. Human spotters are the correction layer.

## The idea

A community website — **Surfs Up Panama** — that pulls weather, swell, wind, and tide
data from many sources, has AI combine them, and instantly tells you which Panama
beaches are best today. Replace (or feed) the spotter chain with data plus AI plus
community reports.

## Hard constraints from the owner

1. **Hosting must be essentially free.** Design target is $0.00/month, not "cheap".
   No revenue will ever offset cost, so this is permanent.
2. **AWS for frontend and backend.** He has a personal AWS account with a $20 billing alarm.
3. **Not monetized.** No ads, no subscriptions, no paid tiers. Free community tool.
4. **Open source.** Public repo. License TBD.
5. **Global eventually, Panama first.** Nothing may be hardcoded to Panama. Panama is
   the beachhead; the goal is a free tool for surfers worldwide.
6. **The learning loop is the foundation** (his words). The system must learn from
   community-posted observations and get more accurate over time.
7. Full nWave process for the MVP.
8. Research first, with a large parallel agent fleet.

## Non-negotiable design decision, decided during research

**Snapshot every model's prediction at prediction time, from day one.** Forecast archives
are not retrievable after the fact — you cannot reconstruct what GFS said last Tuesday.
Without an immutable prediction log there is no way to compute error later, and the entire
learning loop is impossible. This costs almost nothing (writing files to S3) and is
irreversible if skipped.

## Open questions the research must answer

- Which weather/marine data sources give hourly-or-better Panama coverage, free, and legally?
- Is there any real observational ground truth (buoys) near Panama, or is it models only?
- What does "use AI" actually mean here that is real and not hype?
- What is the true $0 AWS architecture, and what is the unavoidable monthly floor?
- Do we replace the WhatsApp group or feed it?

## Research output

Raw agent findings: `docs/research/raw/`
Synthesis: `docs/research/surfs-up-panama-research.md` (written after fleet returns)
