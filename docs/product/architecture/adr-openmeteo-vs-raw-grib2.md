# ADR: Wave ingest source — Open-Meteo primary behind an adapter port, raw GRIB2 as verified fallback

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** ingest (nw-system-designer) · **Context:** C1 Forecast Intake

## Decision

1. **MVP wave ingest reads the Open-Meteo Marine API** with
   `models=ncep_gfswave016,ncep_gfswave025,meteofrance_wave,dwd_gwam`: the only four
   members with data at Panama coastal points (research 09 §8.3, measured live). One JSON
   call per spot, zip Lambda, no GRIB2 decode, no container image, no ECR.
2. **Every source sits behind `ForecastSourcePort`**: adapter contract
   `fetch(spots, cycle_hint) -> normalized snapshot rows` + `probe() -> health`, with
   sources declared in a data registry (id, adapter type, endpoint template, cycle
   schedule, latency estimate, freshness threshold). Downstream consumers read only
   `predictions/v1/` rows, which carry a `source` id and nothing provider-shaped.
   **Swapping Open-Meteo out is a registry edit plus one adapter; the pipeline, log
   schema, build, scoring and learning layers do not change.**
3. **Raw NOAA `gfswave` GRIB2 is the named fallback and the phase-2 enrichment**, already
   verified live by the infra lane on 2026-08-08: grib_filter returned a valid GRIB2 for
   the Panama subregion, both Panama grids (`epacif`, `atlocn`) plus `global.0p16` exist
   in `s3://noaa-gfs-bdp-pds` (us-east-1, same-region reads $0), and the GFS Zarr mirror
   carries no wave fields, making GRIB2 the only raw NOAA wave route (System
   Architecture §7).

## Why this is a legal decision as much as a technical one

Precomputing provider data into public static JSON is redistribution (research 08 §5.5,
HANDOFF §6.2). Open-Meteo's data is CC-BY-4.0, which "permits redistribution and
derivative works with attribution" (research 01 §1.8, terms fetched 2026-08-08), and the
free tier's non-commercial condition is satisfied by the unmonetized MIT product. But the
ToS never addresses serving derived data to third parties in those words, and nobody has
emailed them yet (System Architecture §18 decision 7). The adapter boundary exists so that
a vendor "no" is a config-sized event, not a rewrite: the fallback chain (NOAA public
domain waves/wind, CO-OPS or WorldTides tides) is redistribution-safe end to end.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Raw gfswave GRIB2 from day one | Rejected for MVP | Costs eccodes, which does not fit a zip Lambda (research 05 §13): forces the container lane (ECR, 12-month-only free tier) or the Actions dispatch lane into the MVP. Buys exact `run_ts` and legal certainty for one source family, loses `meteofrance_wave` and `dwd_gwam` (not in NOAA data), shrinking the ensemble from 4 members to 2 of the same model. Kept as phase 2. |
| Open-Meteo `best_match` single series | Rejected | Destroys the multi-member spread that feeds the confidence signal and the per-source scorecard; also hides which model said what, which the prediction log exists to record. |
| Stormglass / Windy / Visual Crossing / Tomorrow.io | Rejected | Free tiers unusable for production or data corrupted (Windy free tier is deliberately shuffled); Windy carries an explicit anti-redistribution clause; Stormglass ToS silent on redistribution; all repackage the same underlying models (research 01 §2, §3, §6, §8, §13-licensing-tiering). |
| CMEMS as primary | Rejected for now | Best resolution (~9 km) and real swell partitioning, but commercial-redistribution terms UNVERIFIED (HANDOFF §6.1) and integration is NetCDF/toolbox-shaped, not a JSON fetch (research 05 §6). Named as the `meteofrance_wave` fallback pending a license read. |

## Consequences

- The prediction log's `source` ids stay stable across a source swap (`ncep_gfswave016`
  rows from Open-Meteo and from raw GRIB2 are the same series to every consumer), which
  is what keeps the scorecard and learning history joinable across the migration.
- The one real cost of the JSON path: no model-run metadata in responses (verified live
  2026-08-08), so cycle attribution is inferred — see `adr-ingest-cycle-attribution.md`.
- ECMWF wave data is not a member anywhere in this design: it is null at every tested
  Panama point via Open-Meteo (research 09 §8.3) and its open-data GRIB2 feed
  (`ecmwf-forecasts`, eu-central-1) would be a new cross-region adapter to evaluate on its
  own merits later (research 05 §4), not a silent assumption.
