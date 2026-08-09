# ADR: Tide source — NOAA CO-OPS harmonic predictions primary, WorldTides the global fallback

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** ingest (nw-system-designer) · **Context:** C1 Forecast Intake

## Context, including a round-1 discrepancy this ADR resolves

The two round-1 documents disagree: the Domain Model's component diagram names "NOAA
CO-OPS harmonics" as the tide source; the System Architecture's context diagram and
secrets list name WorldTides (an SSM key is provisioned for it). The ingest lane owns the
source decision. Facts (research 03, all live-verified 2026-08-08):

- CO-OPS serves Panama through two prediction-only harmonic stations: **9812501 Balboa**
  (Pacific, ~3.4 m range confirmed by live call) and **9817583 Cristobal** (Caribbean,
  microtidal). JSON, no auth, US public domain, deterministic for any date range.
- Neither station has a live water-level sensor; Panama's negligible storm surge makes
  harmonic prediction a solid stand-in (research 03 §2, §summary 6).
- WorldTides: $4.99/mo entry after a one-time 100 free credits, **explicit caching
  permission** and "on behalf of end users" language, attribution string required
  (research 01 §4.8). Global coverage.
- ACP publishes the same Balboa/Cristobal data as PDFs only; rejected as scraping
  fragility for identical numbers (research 03 §5).

## Decision

1. **Launch: NOAA CO-OPS `predictions` product**, fetched once daily per referenced
   station with an 8-day hourly window, cached to S3. The fetch Lambda computes `tide_m`
   per `(spot, valid_ts)` from the cached curve; a dark CO-OPS degrades nothing for
   >= 7 days.
2. **Tide stations are per-spot data, not code.** Each spot references a tide source +
   station id (exact field home is the domain lane's seed schema; flagged there). Panama
   is two rows of data. Nothing keys on country.
3. **WorldTides ships as a specified fallback adapter** behind the same port, activated
   per spot/region by registry data when a coast has no usable CO-OPS station. Its
   attribution string obligation renders in the UI when active.
4. Optional later, Caribbean launch only: IOC `bdto` real-time water level as an
   observation cross-check (research 03 §3), not a forecast input; commercial-use terms
   UNVERIFIED there.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| WorldTides from day one | Rejected | Spends money and adds a key dependency for numbers CO-OPS serves free at the two stations Panama actually has; kept as the global-scale adapter where it earns its fee |
| Open-Meteo `sea_level_height_msl` | Rejected as primary | A modeled continuous curve, not station harmonics; Open-Meteo's own docs warn coastal accuracy is limited (research 01 §1.6-1.7); also concentrates yet another product surface on the one vendor with the open ToS question |
| Compute harmonics ourselves from CO-OPS `harcon.json` | Rejected | CO-OPS already synthesizes the curve correctly on request; re-implementing harmonic synthesis buys a defect surface and saves one cached call per day (research 03 §7) |
| ACP PDF tables | Rejected | Same underlying stations, PDF-scraping fragility (research 03 §5) |

## Consequences

- The SSM `worldtides-api-key` parameter provisioned by the infra lane stays defined but
  empty until the WorldTides adapter first activates; no key, no cost, no code path at
  launch.
- Tide join semantics: `tide_m` is denormalized onto every prediction-log row at write
  time (Domain Model §5.1 field consumers), so a replay needs no tide re-fetch.
- The domain lane owes the seed (or ingest-config) field carrying the station reference;
  named consumer: the tide adapter, join key `spot_id` (flagged in 04-ingest-pipeline §11).
