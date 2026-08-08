# Raw Numerical Weather / Wave Model + Satellite Data for Panama — Raw Research

Research date: 2026-08-08. Compiled by research subagent. All URLs accessed 2026-08-08
unless noted otherwise.

Scope: FREE, OPEN, GOVERNMENT-run raw numerical weather/wave model output and satellite
data we could ingest directly (GRIB2/NetCDF/Zarr) instead of going through a commercial
API wrapper (Stormglass, Windy API, etc — covered in `01-marine-wave-apis.md`). This is
the "many independent model sources" layer for a Panama surf-forecast app — the idea being
that multi-model spread/disagreement is itself a usable signal (confidence, not just a
point forecast).

Test points: Pacific coast ~8.40N -80.12W (Playa Venao / Santa Catalina), Caribbean coast
~9.37N -82.25W (Bocas del Toro).

Status key per source: USE / MAYBE / REJECT. Difficulty is 1 (trivial JSON fetch) to 5
(requires GRIB2 parsing, big files, complex auth, or heavy compute) for a small serverless
app (e.g. AWS Lambda / Vercel function).

---

## Table of contents

1. NOAA WAVEWATCH III / GFS-Wave (NOMADS)
2. NOAA GFS atmospheric (wind, gusts, pressure)
3. NOAA NBM (National Blend of Models)
4. ECMWF Open Data (open-data.ecmwf.int)
5. AI weather models (AIFS, GraphCast, FourCastNet, Aurora)
6. Copernicus Marine Service (CMEMS)
7. Copernicus Climate Data Store — ERA5
8. DWD ICON / ICON-Wave open data
9. Meteo-France MFWAM / AROME open data
10. NOAA CoastWatch / OceanColor / satellite altimetry (Jason-3, Sentinel-6, SWOT)
11. GOES-16/19 satellite imagery
12. AWS Open Data Registry / NOAA Big Data Program — S3 bucket inventory
13. Cross-cutting notes: difficulty of GRIB2 in serverless
14. Open questions / UNVERIFIED items
15. Flags — out of scope items noticed
16. Summary

---

## 1. NOAA WAVEWATCH III / GFS-Wave (NOMADS)

STATUS: USE — this is the single best free raw wave-model source for Panama.

Since March 2021, NCEP retired the standalone "Multi_1" WAVEWATCH III product name; wave
processing was absorbed into the GFS suite and now ships under the `gfswave` product name
(same underlying WW3 engine). ([polar.ncep.noaa.gov notice](https://polar.ncep.noaa.gov/waves/Waves_Changes.pdf))

**Grids relevant to Panama** — both the Pacific and Caribbean test points are covered, but
by *different* regional sub-grids, confirming the brief's expectation:

| Grid | Coverage | Resolution | Naming |
|---|---|---|---|
| `epacif` (Eastern Pacific) | Covers the Pacific coast point 8.40N/-80.12W | 0.16° (sources conflict — NOMADS filter UI shows 0p16; one NCO product page says 0.25°; verified via S3 listing the actual files are named `epacif.0p16`) | `gfswave.t{CC}z.epacif.0p16.f{NNN}.grib2` |
| `atlocn` (Atlantic/Caribbean) | Covers the Caribbean coast point 9.37N/-82.25W | 0.16° | `gfswave.t{CC}z.atlocn.0p16.f{NNN}.grib2` |
| `global.0p16` / `global.0p25` | Global fallback, both points | 0.16° / 0.25° | `gfswave.t{CC}z.global.0p16.f{NNN}.grib2` |
| `wcoast.0p16` | US West Coast — NOT Panama | 0.16° | n/a |
| `gsouth.0p25` | Global South (SH-focused) | 0.25° | possible alt for Pacific |
| `arctic.9km` | Arctic — NOT Panama | 9km | n/a |

So: no single regional grid covers both Panama coasts — the app needs `epacif` for the
Pacific break and `atlocn` for the Caribbean break, exactly the "Atlantic vs Pacific
sub-grid" split the brief anticipated.
([Grib Filter gfswave](https://nomads.ncep.noaa.gov/gribfilter.php?ds=gfswave),
[NCO Wave products](https://www.nco.ncep.noaa.gov/pmb/products/wave/), accessed 2026-08-08)

**Forecast length / cadence**: 4 cycles/day (00/06/12/18Z). Forecast hours run f000 through
f384 (NCO page) — the interactive grib filter UI showed f000–f327 in one view, likely a
display truncation; NCO's own product page states FH00–384. Step interval is hourly out to
~120h then 3-hourly beyond that.

**Model run availability latency**: not separately documented for the wave component (it
now runs inline with the GFS atmospheric cycle). GFS itself: first forecast hour posts
~3.5h after cycle time, full run (16-day equivalent) completes ~4–5h after cycle time (see
Section 2). UNVERIFIED for wave-specific latency, but since gfswave now runs coupled to
GFS, it's reasonable to assume similar ~4h latency. UNVERIFIED — should be confirmed by
polling a real cycle.

**Access — grib_filter subset endpoint** (avoids downloading the full ~500KB–1MB per-file
regional GRIB2, or multi-GB global files): the interactive form is at
`https://nomads.ncep.noaa.gov/gribfilter.php?ds=gfswave`. The underlying CGI (confirmed
pattern from search results, same family as the GFS atmospheric filter):

```
https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl?
  file=gfswave.t{CC}z.epacif.0p16.f{NNN}.grib2
  &all_lev=on&all_var=on
  &subregion=&leftlon={W}&rightlon={E}&toplat={N}&bottomlat={S}
  &dir=/gfs.{YYYYMMDD}/{CC}/wave/gridded
```
UNVERIFIED — I was not able to load an actual successful filter response (only found this
URL pattern via search-engine cache text, not a live fetch); the exact query-param names
should be confirmed against a live request before building against it. The `dir=` path
matches the real S3 layout confirmed below.

**Direct file access (no filter, full regional file, still small)**: confirmed live via S3
listing (see Section 12) — `epacif` regional GRIB2 files are ~510–527 KB each, small enough
that skipping grib_filter and just pulling the whole regional file per forecast hour is
entirely reasonable for a small app. This significantly lowers the difficulty vs. pulling
global files.

**Format**: GRIB2 (+ a `.idx` byte-offset index file alongside each, which enables HTTP
range-request partial reads without the CGI filter at all — fetch just the bytes for one
message using the `.idx` offsets).

**License**: US Government work, public domain, no restrictions.

**Difficulty**: 3/5. Not a JSON API — needs a GRIB2 decoder (eccodes/pygrib/wgrib2/cfgrib).
But regional files are small (~500KB), grid choice is unambiguous per coast, and it's
mirrored on AWS S3 in us-east-1 (see Section 12), which sidesteps NOMADS' CGI entirely and
gives free in-region reads for an AWS-hosted app.

---

## 2. NOAA GFS atmospheric (wind, gusts, pressure)

STATUS: USE

**Format/resolution**: GRIB2, 0.25° global (`gfs.tCCz.pgrb2.0p25.fNNN`), also 0.5°/1° coarser
products exist. 10m wind (UGRD/VGRD), gusts (GUST), and MSLP (PRMSL) are all standard
surface-level fields in the 0.25° product.

**Cadence/latency**: 4 cycles/day (00/06/12/18Z). First forecast hour posts ~3:30 UTC-offset
after cycle time; full run completes roughly 4–5 hours after cycle time (e.g. 00Z cycle's
last hour lands ~04:00–05:15 UTC).
([Weather-Watch forum discussion](https://discourse.weather-watch.com/t/gfs-and-ecmwf-data-availability-stats/71916), accessed 2026-08-08 — UNVERIFIED precision, treat as approximate)

**Access — grib_filter subset endpoint** (confirmed real pattern, this one had a concrete
example surfaced in search results):

```
https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25_1hr.pl?
  dir=/gfs.{YYYYMMDD}/{CC}/atmos
  &file=gfs.t{CC}z.pgrb2.0p25.f{NNN}
  &var_PRMSL=on&var_UGRD=on&var_VGRD=on&var_GUST=on
  &lev_mean_sea_level=on&lev_10_m_above_ground=on
  &subregion=&toplat={N}&leftlon={W}&rightlon={E}&bottomlat={S}
```
This subsets to just the requested variables/levels/lat-lon box, avoiding the full ~500MB+
global GRIB2 file — this is the standard, well-documented NOMADS workflow.
([NOMADS filter examples](https://twister.caps.ou.edu/METR3334/GFS_data/DownloadingModelDataFromNcepServer.pdf), accessed 2026-08-08)

**License**: Public domain (US Gov).

**Difficulty**: 2/5 — same GRIB2-decode requirement as wave data, but the grib_filter
subsetting is well-trodden and the resulting subset files are tiny (a handful of KB for a
single point/variable/timestep). Also on S3 (Section 12) in both raw GRIB2
(`noaa-gfs-bdp-pds`, us-east-1) and cloud-optimized Zarr (`dynamical-noaa-gfs`, us-west-2 —
Zarr access via `xarray`/`fsspec`/`zarr` is materially easier than GRIB2 parsing and worth
strongly preferring if a Lambda can reach us-west-2).

---

## 3. NOAA NBM (National Blend of Models)

STATUS: REJECT for Panama (as anticipated in the brief).

NBM domains: CONUS (2.5km), Alaska (3km), Hawaii (2.5km), Puerto Rico (1.25km), Guam
(2.5km), Oceanic (10km), Global (50km).
([NOAA NBM AWS registry](https://registry.opendata.aws/noaa-nbm/), accessed 2026-08-08)

None of the named high-resolution domains include Panama. The "Global" 50km domain likely
technically covers the coordinates numerically, but NBM's entire value proposition is a
statistically-calibrated blend trained/verified against US observation networks — outside
CONUS/territories it degrades toward being a low-value repackaging of GFS at coarser
resolution than gfswave/GFS themselves provide directly. The exact southern/western extent
of the "Oceanic" 10km domain is UNVERIFIED (could not confirm whether it extends past US
territorial/EEZ waters to Panama) but even if it does, it wouldn't be calibrated for a
non-US coast. Not worth building against.

**Difficulty**: N/A (rejected).

---

## 4. ECMWF Open Data (open-data.ecmwf.int)

STATUS: USE — arguably the best single independent atmospheric+wave counterpart to NOAA's
suite, and genuinely free/open (not just "free tier of a commercial product").

**Datasets**: IFS (physics-based, high-res deterministic + ensemble) and AIFS (ECMWF's own
AI/ML forecasting system, both a deterministic "Single" and an "Ensemble" version).

**Resolution**: 0.25° for both IFS and AIFS (upgraded from 0.4° on 2024-02-01).
([Open-Meteo substack on the 0.25° upgrade](https://openmeteo.substack.com/p/ecmwf-ifs-upgraded-to-025-resolution), accessed 2026-08-08)

**Forecast length**: IFS 00z/12z runs to 360h (15 days); 06z/18z runs to 144h. AIFS runs
6-hourly steps out to 360h.

**Cadence**: 4 cycles/day (00/06/12/18Z).

**Wave variables — CONFIRMED, both physics-based and AI**: the IFS stream includes the
standard wave parameter set (significant wave height swh, mean wave period mwp, mean wave
direction mwd, peak wave period pp1d, partitioned swell heights h1012–h2530). Verified via
direct fetch of the ECMWF open data page: **AIFS (both Single and Ensemble) also lists
wave parameters — mwp, mwd, cdww, swh, h1012, h1214, h1417, h1721, h2125, h2530, wmb** —
meaning ECMWF's AI weather model produces its own independent AI-derived wave forecast,
not just atmospheric fields. This is a genuinely notable finding for a "multi-model
disagreement" product: it gives THREE independently-modeled global wave forecasts for
free (NOAA gfswave/WW3, ECMWF IFS/ecWAM, and ECMWF AIFS/AI-wave), plus DWD GWAM and CMEMS
as further independent estimates (below).
([ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data), fetched
2026-08-08 for parameter confirmation)

**Format**: GRIB2 with CCSDS compression (since July 2023).

**Access**:
- Primary HTTPS portal: `https://data.ecmwf.int/forecasts/`
- **AWS S3 mirror**: bucket `ecmwf-forecasts`, region **eu-central-1** (not us-east-1 — cross-
  region from a US-hosted app, so NOT free in-region egress the way the NOAA buckets are for
  a us-east-1 app; still free to download, just not "free AND same-region").
  `aws s3 ls --no-sign-request s3://ecmwf-forecasts/` ([AWS registry](https://registry.opendata.aws/ecmwf-forecasts/), accessed 2026-08-08)
- Also mirrored on Azure and GCP.
- Python client: `ecmwf-opendata` package, implements a MARS-language-like request
  interface.
- **Retention**: rolling 12-cycle archive (~2–3 days) on the primary/S3 feed — not a long
  archive, fine for live forecasting, not for backfill/hindcast (use ERA5 for that,
  Section 7).

**License**: CC-BY-4.0 + ECMWF Terms of Use — explicitly permits commercial use and
redistribution with attribution. This is materially more permissive than CMEMS's SLA-based
terms (Section 6) and worth leaning on for anything that needs redistribution rights.

**Difficulty**: 3/5 — GRIB2 decode required, cross-region S3 (or HTTPS from `data.ecmwf.int`
which works from anywhere), but the `ecmwf-opendata` Python client abstracts the request
construction well.

---

## 5. AI weather models (AIFS, GraphCast, FourCastNet, Aurora)

STATUS: MIXED — one is directly USE-able free-and-hosted (AIFS, covered in Section 4;
also NOAA's operational GraphCast run, below); the others require self-hosting compute and
are MAYBE at best for a small serverless app.

**ECMWF AIFS**: see Section 4 — freely distributed via ECMWF Open Data, including wave
variables. This is the most directly usable AI model here.

**NOAA-run GraphCast ("GraphCastGFS" / part of the NOAA EAGLE program)**: NOAA operationally
runs a fine-tuned version of Google DeepMind's GraphCast and publishes the output free on
AWS S3.
- **Bucket**: `noaa-nws-graphcastgfs-pds`, region **us-east-1** (same region as most other
  NOAA buckets — good for a us-east-1 app).
- **Format**: GRIB2, 0.25° (~28km).
- **Cadence**: 4x/day (00/06/12/18Z), 6-hourly steps to 16 days.
- **Wave variables**: NOT included — atmospheric/surface only (temperature, wind
  components, geopotential height, specific humidity, vertical velocity). No wave output.
- **Status**: explicitly labeled experimental/developmental by NOAA; as of the page's most
  recent update, NOAA's operational AI replacement models are named AIGFS/AIGEFS and this
  bucket is described as continuing to host developmental versions.
  ([AWS registry: NOAA EAGLE GraphCast](https://registry.opendata.aws/noaa-nws-graphcastgfs-pds/), accessed 2026-08-08)
- **Difficulty**: 2/5 (same GRIB2 handling as GFS, on the same convenient bucket) but
  **no wave data**, so only useful as an independent wind-speed/gust cross-check, not a
  wave-model input.

**Google DeepMind GraphCast (original, open-sourced) / WeatherNext**: Google has
open-sourced GraphCast's code/weights, and separately runs an operational version
("WeatherNext Graph", plus a newer "WeatherNext 2") distributed via BigQuery/Earth Engine.
Access requires filling out a "WeatherNext Data Request" form (gated, not anonymous/
no-sign-request like the AWS buckets) via Google's Analytics Hub. 0.25°, 6-hourly init,
10-day lead. **WeatherNext Graph is scheduled for deprecation 2026-07-15** in favor of
WeatherNext 2 — given today is 2026-08-08, the old dataset may already be gone; this needs
re-checking before building against it. No indication of wave output.
([Google WeatherNext BigQuery guide](https://developers.google.com/weathernext/guides/bigquery), accessed 2026-08-08) UNVERIFIED current dataset name/availability post-deprecation.

**NVIDIA FourCastNet**: open-source model/code (via NVIDIA Modulus / "Earth-2" and the
community `OpenCastKit` repo combining FourCastNet+GraphCast). No confirmed free *hosted*
forecast feed found (unlike GraphCast/AIFS) — you would need to run it yourself. No wave
output.

**Microsoft Aurora**: open-sourced model weights (Hugging Face `microsoft/aurora`), also
offered as a hosted endpoint via Azure AI Foundry (paid/managed, not a free public feed).
Self-hosting requires ~32–40GB GPU VRAM (A100/H100 class) — completely impractical for a
serverless Lambda. Aurora's training data includes ocean data per Microsoft's own
description, but no confirmation found of a free public *wave forecast* output feed.
([microsoft/aurora on Hugging Face](https://huggingface.co/microsoft/aurora), accessed 2026-08-08)

**Bottom line for AI models**: only AIFS (wave-capable) and NOAA's GraphCast (atmospheric
only) are usable as free, already-computed, hosted feeds. FourCastNet and Aurora would
require running the model yourself on a GPU — not viable for this app's serverless
architecture, so REJECT those two for direct ingestion (they're research/self-host only).

**Difficulty**: AIFS 3/5 (as Section 4); NOAA GraphCastGFS 2/5 but no wave payoff; FourCastNet/
Aurora 5/5 (GPU self-hosting) — REJECT.

---

## 6. Copernicus Marine Service (CMEMS)

STATUS: USE — this is the resolution leader and includes swell/wind-sea partitioning that
NOAA's raw gfswave output doesn't give as cleanly.

**Product**: `GLOBAL_ANALYSISFORECAST_WAV_001_027` — global ocean waves analysis and
forecast.

**Resolution**: 1/12° (~0.083°, ~9km) — confirmed via direct fetch of the product page,
which also confirms coverage from -80° to 90° latitude, -180° to 179.92° longitude — both
Panama test points (8.40N/-80.12W and 9.37N/-82.25W) fall well within this global grid.
([CMEMS product description](https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_WAV_001_027/description), fetched 2026-08-08)

**Variables**: full integrated wave spectrum parameters (significant wave height, period,
direction, Stokes drift) PLUS partition into wind-sea, primary swell, and secondary swell
components (each with own height/period/direction) — this is notably richer than the raw
gfswave GRIB2 bulk parameters and closer to what a surf forecast actually wants (separating
groundswell from local windswell).

**Cadence**: updated daily at 00:00 and 12:00 UTC, 10-day forecast, hourly temporal
resolution (from 2022-11-01 onward for the hourly product).

**Format**: NetCDF-4.

**Access**: `copernicusmarine` Python toolbox (`pip install copernicusmarine`), CLI and
Python API, free account registration required at the Copernicus Marine website, then a
one-time `copernicusmarine login` stores credentials. Subsetting (`copernicusmarine
subset`) lets you pull just a bounding box / point / time range without downloading full
global NetCDF files — "without quotas" per their own documentation.
([Copernicus Marine Toolbox docs](https://help.marine.copernicus.eu/en/articles/7949409-copernicus-marine-toolbox-introduction), accessed 2026-08-08)

**License**: Free-of-charge access under a Service Level Agreement (SLA) — I could not find
explicit "commercial redistribution allowed/forbidden" language in the pages fetched.
**UNVERIFIED — the exact commercial-redistribution terms need a direct read of the CMEMS
License Agreement PDF before this is relied on for a paid/commercial product**; the general
EU open-data posture is permissive but this needs primary-source confirmation, not
inference from search snippets.

**Hosting**: Copernicus Marine's own infrastructure (Mercator Ocean International, EU-based
— not confirmed to be on AWS). Cross-cloud egress from CMEMS's own servers into an AWS
Lambda is free to you (no AWS egress *inbound* charges for pulling from the public
internet), just not same-region-free the way S3-to-S3 in us-east-1 would be.

**Difficulty**: 3/5 — requires the `copernicusmarine` Python package (not trivial in a
minimal Lambda but it's pure-Python-ish, no heavy binary deps like eccodes), free account +
login step needed (one-time credential, not per-request friction), NetCDF decode
(`xarray`/`netCDF4` — well-supported, arguably easier than GRIB2).

---

## 7. Copernicus Climate Data Store — ERA5

STATUS: USE (for hindcast/climatology only, not live forecast).

**Purpose for this app**: not a forecast source — this is the reanalysis ("best guess of
what actually happened") dataset, useful for exactly the "is today better than typical for
this month" climatology feature named in the brief.

**Access**: `cdsapi` Python client (`pip install cdsapi`), free registration on the CDS
website, request-based (not instant-subset like grib_filter — CDS queues requests, retrieval
can take from seconds to tens of minutes depending on queue load and dataset size; one
GitHub issue noted a 2.1MB request taking 45 minutes during high load — UNVERIFIED whether
that's typical or an outlier, but budget for latency, not instant response).
([cdsapi GitHub](https://github.com/ecmwf/cdsapi), accessed 2026-08-08)

**Format**: GRIB or NetCDF (selectable in the request).

**Latency**: ERA5T (near-real-time preliminary) updated daily at ~5-day latency behind
present; final QA'd ERA5 follows with additional delay. Not useful for "today's forecast,"
only for backfilling yesterday-and-earlier climatology.

**License**: CC-BY-4.0 as of 2025-07-02 (replaced the older, more restrictive Copernicus
license) — explicitly permits redistribution and commercial use with attribution.
([ECMWF forum announcement on the license change](https://forum.ecmwf.int/t/cc-by-licence-to-replace-licence-to-use-copernicus-products-on-02-july-2025/13464), accessed 2026-08-08)

**AWS mirrors** (multiple, fragmented — check which is current before building):
- `era5-pds` (us-east-1) — **marked deprecated**, provider redirects to NSF NCAR's rehost.
- `nsf-ncar-era5` (NSF NCAR's rehost) — NetCDF4, CF-compliant, 0.25° (31km HRES-based) +
  62km 10-member ensemble.
- `earthmover-icechunk-era5` (us-east-1) — third-party (Earthmover) Zarr/Icechunk format,
  which would be much easier to query from Lambda than GRIB/NetCDF if it covers the needed
  variables and years. UNVERIFIED exactly which variables/years this mirror carries.

**Difficulty**: 3/5 via cdsapi (request-queue latency is the main friction, not format);
2/5 if reading directly from one of the S3-hosted NetCDF/Zarr mirrors (no queue, direct
range-reads).

---

## 8. DWD ICON / ICON-Wave open data

STATUS: MAYBE — global coverage confirmed, but resolution and Panama-specific value are
lower priority than CMEMS/NOAA/ECMWF.

**Atmospheric (ICON)**: DWD's global ICON model, native ~13km resolution, published free on
`opendata.dwd.de` in GRIB2 under DWD's open-data license (CC-BY-4.0).

**Wave**: DWD runs two separate wave models, not an "ICON-Wave" unified product as the
brief's working name suggested:
- **GWAM** — global wave model (WAM-based, 3rd-generation spectral, 36 directions × 30 wave
  periods 1.5–24s), **0.25° resolution**, cycles at **00 and 12 UTC only** (2 cycles/day,
  not 4), forecast to 8 days. Covers global oceans including presumably both Panama coasts
  (global coverage, not restricted like EWAM).
  ([DWD legend PDF](https://www.dwd.de/DE/leistungen/opendata/help/modelle/legend_ICON_wave_EN_pdf.pdf), accessed 2026-08-08)
- **EWAM** — European wave model, higher-res, but restricted to European waters —
  **NOT relevant to Panama**, REJECT that half.

**Access**: directory-listing style HTTPS server, e.g.
`https://opendata.dwd.de/weather/maritime/wave_models/gwam/grib/{HH}/{param}/` — files
named like `GWAM_TM10_{YYYYMMDDHH}_{VVV}.grib2.bz2` (bz2-compressed GRIB2, per-parameter
subdirectories like `swh`, `mwd`, `dd_10m`).

**License**: CC-BY-4.0, DWD open-data license — permissive, commercial use allowed with
attribution.

**Difficulty**: 3/5 — GRIB2 + an extra bz2-decompression step, directory-listing-based
discovery (no query/filter API — you construct the URL yourself from the naming pattern),
no AWS mirror found (all traffic direct to DWD's German servers, cross-Atlantic, no
same-region benefit for a US-hosted app).

---

## 9. Meteo-France MFWAM / AROME open data

STATUS: REJECT for Panama coverage (AROME), MAYBE for MFWAM (needs more verification, low
priority).

**AROME**: 1.3–1.5km resolution — but domain is France/Western Europe only. **Not relevant
to Panama at all.** REJECT.

**MFWAM**: Météo-France's global wave model. Search results surfaced a "MFWAM GLOB01" — a
newer *global* configuration (replacing/alongside "MFWAM GLOB05" and a European "EURAT01")
with satellite-data-assimilation improvements. This would, if global, cover Panama, but I
was not able to fetch the actual Météo-France Open Data product page directly (only a
Confluence changelog snippet) to confirm resolution number, cycle times, license terms, or
exact access URL. **UNVERIFIED** — this is a real candidate (Météo-France is a serious
operational wave-modeling center) but needs a follow-up direct fetch of
`portail-api.meteofrance.fr` product docs before it's actionable. Given CMEMS and DWD GWAM
already give independent global wave estimates and MFWAM's docs are in French with an
unclear open-data license path (Météo-France's open data portal historically required an
API key with usage tiers, unlike DWD's fully anonymous HTTPS listing), I'd deprioritize
chasing this further unless the multi-model-spread feature specifically needs a 4th/5th
wave source.

**Difficulty**: UNVERIFIED, likely 3–4/5 given API-key gating.

---

## 10. NOAA CoastWatch / OceanColor / satellite altimetry (Jason-3, Sentinel-6, SWOT)

STATUS: MAYBE — useful for validation/nowcasting, not primary forecast, and along-track
altimetry has a fundamental sparse-coverage problem near any single coastal point.

**NOAA CoastWatch altimetry products**: Level-3 blended significant-wave-height/wind-speed/
sea-level-anomaly gridded products at **0.25° daily** resolution, built by optimal
interpolation of multiple altimeters (Jason-3, Sentinel-3A/B, CryoSat-2, SARAL, and
Sentinel-6 as it's incorporated). Near-real-time latency **~3–5 hours** for along-track
data.
([NOAA CoastWatch altimetry product page](https://coastwatch.noaa.gov/cwn/products/along-track-significant-wave-height-wind-speed-and-sea-level-anomaly-multiple-altimeters.html), accessed 2026-08-08)

**Access**: ERDDAP (`griddap`/`tabledap` REST endpoints, OPeNDAP-based), e.g.
`https://coastwatch.pfeg.noaa.gov/erddap/griddap/{datasetID}.{fileType}` — supports
`.json`, `.csv`, `.nc` and many other output formats directly via URL query params (no
special client library required — this is one of the easiest formats in this whole
document, genuinely a JSON-capable REST API for gridded satellite data).
([ERDDAP docs](https://coastwatch.pfeg.noaa.gov/erddap/griddap/noaacwBLENDEDsshDaily.html), accessed 2026-08-08)

**Can altimetry validate wave height near Panama?** Partially, with caveats: altimeter
ground tracks are along-track swaths, not a continuous grid — any single satellite only
passes near a specific point every several days (repeat cycle dependent, e.g. Jason-3/
Sentinel-6 ~10-day repeat, others differ), so a "daily blended 0.25°" gridded product exists
specifically to interpolate around this sparsity. Near-coast altimetry is also historically
noisier (land contamination in the radar footprint, shorter effective along-track segments)
— so it's a reasonable coarse cross-check on offshore swell height, not a substitute for a
model, and not useful in real time at a single instant for one exact point. Good candidate
as "does the model's swell height roughly match what satellites saw over the last few days
offshore" sanity check, not as a forecast input.

**Sentinel-6 Michael Freilich / SWOT (raw PO.DAAC access, vs the CoastWatch blended
product)**: Sentinel-6A's Poseidon-4 altimeter reports SSH, SSHA, and significant wave
height directly. Access via NASA PO.DAAC / Earthdata — **requires a free NASA Earthdata
Login account** for protected data (public metadata/some buckets are open without login).
SWOT (Surface Water and Ocean Topography) is primarily a sea-surface-height/hydrology
mission (wide-swath radar interferometry) — I found no confirmation it produces a
significant-wave-height data product comparable to Jason/Sentinel-6's nadir altimeters;
**UNVERIFIED whether SWOT is useful for wave validation at all** — treat as REJECT for wave
height specifically unless a SWOT-specific wave product is confirmed.
([PO.DAAC Sentinel-6 access notes](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/sentinel-6-michael-freilich), accessed 2026-08-08)

**Difficulty**: CoastWatch/ERDDAP 1/5 (genuinely a simple HTTP GET returning JSON/CSV — the
easiest source in this whole report). Raw PO.DAAC/Earthdata access 4/5 (auth flow, along-
track data needs geospatial matching logic to find passes near your point, not a simple
point lookup).

---

## 11. GOES-16/19 satellite imagery

STATUS: USE for cloud/rain context, straightforward access.

**Coverage confirmed**: GOES ABI "Mode 6" (10-minute flex mode, default since April 2019)
provides a **full-disk scan every 10 minutes**, which explicitly includes all of Central
and South America (previously only every 15 min pre-Mode-6). CONUS/PACUS 5-minute sub-scans
do NOT cover Panama (that box is centered on the continental US/Pacific-with-Hawaii), so
**Panama's effective refresh rate is 10 minutes**, from the full-disk product, not 5.
Mesoscale 30–60 second super-fast scans are operator-selected small boxes, not guaranteed
over Panama.
([CIMSS Mode 6 explainer](https://cimss.ssec.wisc.edu/goes/blog/archives/32657), accessed 2026-08-08)

**Access — AWS S3, no auth**:
- GOES-16 bucket: `noaa-goes16`
- GOES-18 bucket: `noaa-goes18`
- GOES-19 bucket: `noaa-goes19`
- Region: **us-east-1** (matches most other NOAA buckets — good for a us-east-1 app,
  genuinely free same-region reads)
- Format: NetCDF4 (ABI L1b radiances, L2 cloud/moisture products, etc.)

**Which satellite covers Panama**: GOES-16/19 (the "GOES-East" position) is the relevant one
for Panama (both coasts); GOES-18 is GOES-West (Pacific/US West Coast focused, not the
primary Panama coverage satellite). Note GOES-16 was slated for replacement by GOES-19 in
the GOES-East operational slot — confirm which is currently operational-East before hard-
coding a bucket name; UNVERIFIED which one is live-operational as of 2026-08-08 (both
buckets exist and are likely both populated, one live-operational and one on standby/spare).

**License**: Public domain, NOAA requests attribution for unaltered data, prohibits implying
NOAA endorsement, and modified data can't be presented as original NOAA data.

**Difficulty**: 3/5 — NetCDF4 decode needed (not exotic, `h5netcdf`/`xarray` handle it fine
in Python), files are per-band/per-product so you fetch specific small products (e.g. just a
cloud-top or rainfall-rate product) rather than a firehose, same-region S3 reads. Actual
cloud/rain-rate *derived products* (ABI L2, e.g. Rainfall Rate) are more directly useful
than raw L1b radiances, which need atmospheric-correction work to become "is it raining"
— pull L2 products where available.

---

## 12. AWS Open Data Registry / NOAA Big Data Program — S3 bucket inventory

STATUS: This is the highest-leverage section for a small serverless app on AWS — same-
region S3 reads are free (no egress charge) and dramatically simpler than any CGI/API.

Confirmed exact bucket names, all **no-sign-request** (fully public, no AWS credentials
needed) unless noted:

| Bucket | Contents | Region | Format |
|---|---|---|---|
| `noaa-gfs-bdp-pds` | GFS atmospheric + gfswave (confirmed: `gfs.{date}/{cycle}/wave/gridded/gfswave.t{cc}z.{grid}.f{nnn}.grib2` — verified live for both `epacif` and `arctic` grids) | us-east-1 | GRIB2 |
| `dynamical-noaa-gfs` | GFS, cloud-optimized Icechunk **Zarr** (4 runs/day, 16-day hourly forecast, dozens of variables) | us-west-2 | Zarr |
| `noaa-gefs` / `noaa-gefs-pds` | GEFS ensemble, 21 members (previously named GENS), 0.25°/0.5° depending on product era, global, 4x/day, out to 16 days — a genuine "spread" product straight out of the box, useful for the multi-model-disagreement feature even from a *single* model family's own ensemble | us-east-1 | GRIB2 |
| `noaa-gefs-reforecast` | GEFSv12 historical reforecasts (5-member daily, 11-member weekly to +35 days) — hindcast/backtesting use | us-east-1 | GRIB2 |
| `noaa-nws-graphcastgfs-pds` | NOAA's operational fine-tuned GraphCast ("EAGLE" program), atmospheric only, no wave | us-east-1 | GRIB2 |
| `noaa-nbm-pds` / `noaa-nbm-grib2-pds` | National Blend of Models (COG / GRIB2) — REJECTed above for Panama coverage | us-east-1 | COG / GRIB2 |
| `noaa-goes16` / `noaa-goes18` / `noaa-goes19` | GOES ABI imagery/products | us-east-1 | NetCDF4 |
| `noaa-nexrad-level2` | NEXRAD radar — **US-only, not relevant to Panama** (no NEXRAD coverage over Panama) | us-east-1 | Level II radar |
| `ecmwf-forecasts` | ECMWF IFS + AIFS open data mirror | **eu-central-1** (cross-region from a us-east-1 app) | GRIB2 |
| `era5-pds` | ERA5 (deprecated, redirects to NSF NCAR rehost) | us-east-1 | NetCDF4 |
| `nsf-ncar-era5` | ERA5 rehost, current | UNVERIFIED region (likely us-east-1, not directly confirmed) | NetCDF4 |
| `earthmover-icechunk-era5` | Third-party ERA5 Zarr/Icechunk mirror | us-east-1 | Zarr |
| `dynamical-ecmwf-ifs-ens` / `dynamical-ecmwf-aifs-ens` / `dynamical-ecmwf-aifs-single` | ECMWF IFS-ENS / AIFS mirrored in cloud-optimized Zarr by dynamical.org | UNVERIFIED exact region (likely us-west-2, matching `dynamical-noaa-gfs`, not individually confirmed) | Zarr |

**Why this matters for cost, concretely**: an app running compute in AWS us-east-1 pulling
from any of the `noaa-*` buckets above (GFS, gfswave, GEFS, GOES, NBM) pays **zero S3 egress
cost** — same-region S3-to-Lambda/EC2 traffic is free, and these are all `no-sign-request`
public buckets, so there isn't even an AWS billing relationship needed to read them (no IAM
credential management for the *read* side, though your own compute still needs its normal
AWS identity to run). The ECMWF and dynamical.org-mirrored buckets require confirming
region before assuming the same "free" story — `ecmwf-forecasts` in eu-central-1 is a
genuine cross-region hop from a us-east-1 Lambda (data transfer within AWS between regions
is billed, though modestly, and dominated by request latency more than cost at small
volumes for a "check every N minutes" forecast app).
([awslabs/open-data-registry GitHub](https://github.com/awslabs/open-data-registry), and
individual `registry.opendata.aws` pages cited inline above, accessed 2026-08-08)

**Difficulty for the S3 route specifically**: 2/5 for GFS/gfswave/GOES (still need a GRIB2/
NetCDF decoder, but no CGI request-construction, no auth, no rate limits, `.idx` files
enable partial byte-range reads of just the message/variable you want without downloading
the whole file) — this is meaningfully easier than the equivalent NOMADS CGI route and
should be the default integration path over NOMADS for anything already on S3.

---

## 13. Cross-cutting notes: difficulty of GRIB2 in serverless

This is the practical blocker across most of Section 1–4 and 8–9, so worth calling out once
rather than repeating per-source.

- **The core problem**: GRIB2 decoding fundamentally depends on ECMWF's `eccodes` C library
  (or the older `wgrib2` Fortran/C tool). Pure-Python GRIB2 parsers exist but are
  incomplete/slow for anything beyond trivial cases; the practical Python ecosystem
  (`pygrib`, `cfgrib`) is a thin wrapper around compiled `eccodes` binaries — meaning you
  cannot `pip install` your way to a working GRIB2 reader in a stock Lambda runtime.
- **AWS Lambda limits**: Lambda layers cap at 50MB compressed / 250MB uncompressed; the
  combined function+layers package is also capped at 250MB uncompressed. `eccodes`
  (including its definition-table data files) plus a Python wrapper commonly exceeds or
  crowds this limit once you add other dependencies (numpy, requests, etc.).
  ([AWS Lambda size troubleshooting](https://medium.com/@davidnsoesie1/building-with-aws-lambda-how-to-troubleshoot-size-issues-with-deployments-92f2611f6f7b), accessed 2026-08-08)
- **The two realistic workarounds**:
  1. **Lambda container images** (up to 10GB) — package `eccodes`/`wgrib2` + Python deps as
     a Docker image instead of a zip+layers deployment. This fully sidesteps the size
     limit and is the standard recommended path for GRIB2-in-Lambda today.
  2. **Skip GRIB2 entirely where a Zarr mirror exists** — `dynamical-noaa-gfs` and the
     dynamical.org ECMWF mirrors serve the *same underlying model output* as cloud-
     optimized Zarr, readable with pure-Python `zarr`/`xarray`/`fsspec` (no compiled binary
     dependency, trivially small Lambda package, and — critically — Zarr's chunked/
     range-readable design means you can pull just the one grid cell + variable + timestep
     you need without downloading anything close to the full array, similar in spirit to
     what grib_filter does for GRIB2 but with a simpler client library). Where available,
     this should be preferred over raw GRIB2 for a serverless app.
  3. A middle path used by NOMADS specifically: use the `grib_filter`/`filter_*.pl` CGI
     endpoints (Section 1–2) to have NOAA's own servers do the subsetting server-side, then
     the Lambda only needs to decode a tiny already-subsetted GRIB2 file — still needs
     *some* GRIB2 decode capability locally, but a minimal single-message file is much
     cheaper to handle than the workaround above suggests, and one could potentially get
     away with an even more minimal pure-Python GRIB2 message reader for single-field files
     (UNVERIFIED whether a pure-Python path is robust enough for production; the
     conservative choice is still a container image with real `eccodes`).
- **NetCDF/HDF5 (CMEMS, ERA5-via-NCAR, GOES) is comparatively easier**: `h5netcdf` and
  `netCDF4`-via-`xarray` are lighter-weight than `eccodes` and more commonly already
  packaged for Lambda (still needs the compiled HDF5 library, but it's a smaller, more
  Lambda-tooling-friendly dependency tree than eccodes' full definitions database).
- **Recommendation for a small serverless app**: prioritize sources reachable via (a) plain
  REST/JSON (CoastWatch ERDDAP — genuinely trivial), (b) Zarr on S3 (GFS via
  dynamical-noaa-gfs), and (c) NetCDF via CMEMS's `copernicusmarine` toolbox, before
  reaching for raw GRIB2 decode. Use GRIB2 (via a container-image Lambda) specifically for
  gfswave/GFS-wind where the regional subset files are small and the S3 route removes the
  CGI-request complexity — this is worth the one-time investment in an `eccodes` container
  image because gfswave is the best wave-specific source in the whole survey.

---

## 14. Open questions / UNVERIFIED items

- Exact `gfswave` grid resolution discrepancy: NOMADS filter UI implies `epacif`/`atlocn`
  are 0.16°, one NCO product-list fetch said 0.25° for `epacif` specifically — the S3-
  confirmed filenames say `epacif.0p16`, so 0.16° is likely correct, treat the 0.25°
  mention as a stale/inconsistent doc snippet. Should be double-checked against
  `Model_Description.pdf` directly (only fetched via search snippet, not read in full).
- Exact latency of `gfswave` specifically after cycle time (assumed similar to GFS's ~4-5h
  based on the products now running coupled, not independently confirmed).
- NOMADS rolling archive retention window in days — not confirmed (matters for "can we
  backfill last week's forecast for a demo" but not for live use, since S3 buckets appear
  to carry their own retention that would need separate confirmation, likely also short).
- Live `filter_gfswave.pl` URL — pattern reconstructed from search-engine snippets, not a
  confirmed live HTTP response; validate parameter names against a real request before
  coding against it.
- CMEMS commercial-redistribution license terms — needs a direct read of the actual CMEMS
  License Agreement document (not fetched), currently only known as "free under an SLA."
- Which GOES satellite (16 vs 19) is the current operational "GOES-East" as of 2026-08-08 —
  both buckets exist; only one is likely the live/primary feed at any given time.
- `nsf-ncar-era5` and `dynamical-ecmwf-*` bucket regions — inferred by pattern-matching
  against sibling buckets, not individually confirmed via a direct registry fetch.
- Météo-France MFWAM GLOB01 — resolution, cycle times, license, and exact access URL not
  confirmed via primary source (only a changelog snippet found).
- SWOT's applicability to wave-height validation — no confirmed SWOT significant-wave-
  height product found; possibly out of scope for SWOT (a sea-surface-topography mission,
  not primarily a wave sensor) rather than merely undiscovered.
- Whether `dynamical-noaa-gfs`'s Zarr mirror includes the wave fields (`gfswave`) or only
  the pure atmospheric GFS fields — the description found only mentioned "atmospheric and
  land-soil variables," suggesting wave may NOT be included in this particular Zarr mirror
  even though it's branded "GFS" — needs direct verification before assuming Zarr-easy-path
  applies to wave data too. If it doesn't, gfswave GRIB2 (Section 1/12) remains the only
  route to wave data and the container-image Lambda investment is not optional.

---

## 15. Flags — out of scope items noticed

- Commercial API wrappers around these same raw sources (Windy API, Stormglass, etc.) are
  covered separately in `01-marine-wave-apis.md` — not duplicated here, but worth noting
  several of those commercial products are themselves just repackaging the exact NOAA/
  ECMWF/CMEMS sources catalogued in this document, at a markup, with less control over
  which grid/variable you get.
- Panama's own national meteorological/hydrological data (ETESA, university buoys, etc.) is
  covered in `04-panama-national-sources.md` — out of scope here, this document is purely
  the international/government raw-model layer.
- Buoy and tide-gauge ground-truth observations are covered in `03-buoys-tides-
  observations.md` — satellite altimetry (Section 10 here) is a *different* kind of
  ground-truth (offshore, remote-sensed) and deliberately kept in this document rather than
  merged with the buoy doc, since it comes from the same government/satellite-program family
  as the rest of this list.
- Did not investigate real-time GNSS-reflectometry (CYGNSS) wind data, which exists as
  another NASA/free wind-speed-over-ocean satellite source — flagging as a possible future
  addition, not investigated in this pass since it wasn't named in the brief.

---

## Summary

NOAA's `gfswave`/GFS suite is the best default: free, public-domain, GRIB2, and mirrored
on AWS S3 (`noaa-gfs-bdp-pds`, us-east-1) with zero-egress same-region reads for an AWS
app — use `epacif` grid for the Pacific coast, `atlocn` for the Caribbean coast, since no
single NOAA grid covers both. ECMWF Open Data is the strongest independent second opinion:
free, CC-BY-4.0 (commercially redistributable, unlike CMEMS's fuzzier SLA terms), and its
AIFS model confirms it outputs real wave variables (swh/mwp/mwd), giving a genuine
physics-vs-AI wave-model disagreement signal, though it's hosted cross-region (eu-central-1)
from a US app. Copernicus Marine (CMEMS) gives the highest resolution (1/12°) and the
best swell/wind-sea partitioning, via a free Python toolbox, but license terms for
commercial use need direct verification. NOAA's GEFS ensemble is a built-in multi-model-
spread source from a single family. GOES-16/19 on `noaa-goes16/18/19` (us-east-1) gives
free 10-minute cloud/rain imagery over Panama. NBM and AROME don't meaningfully cover
Panama; DWD's GWAM does (global, 0.25°, 2x/day) as a fourth wave estimate. The realistic
difficulty of GRIB2 in a serverless Lambda is real but manageable: `eccodes` won't fit in
a standard zip/layers deployment, so budget for a container-image Lambda (up to 10GB) as
the standard path, or use S3-hosted cloud-optimized Zarr mirrors (`dynamical-noaa-gfs`,
though wave-field coverage there is unconfirmed) and NetCDF-based sources (CMEMS, GOES,
CoastWatch ERDDAP) wherever possible to avoid the eccodes dependency entirely — CoastWatch's
ERDDAP is the single easiest source in this whole survey, a plain JSON/CSV REST endpoint.
