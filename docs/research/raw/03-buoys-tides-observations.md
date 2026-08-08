# Real Observations Near Panama — Buoys, Tides, Sea Level (Ground Truth Layer)

Research date: 2026-08-08 (all "access date" citations below are 2026-08-08 unless noted).

Scope: NOAA NDBC buoys, NOAA CO-OPS tides/currents, IOC Sea Level Monitoring Facility, UHSLC, ACP (Panama Canal Authority) tide data, PSMSL, XTide harmonics, Argo/Global Drifter Program, and any Latin American ocean observation network — for the purpose of correcting wave/swell model forecasts near Panama with real, measured, ground-truth data. Each source: exact endpoint, format, cadence, latency, license, whether Panama is genuinely covered, and whether it was actually fetched and confirmed live today.

Status: COMPLETE.

Method note: WebSearch budget was exhausted partway through this research (session-wide cap). All findings below after that point come from direct WebFetch/curl calls to the actual endpoints (i.e. primary-source verification, not secondary search results) — arguably higher-confidence than the earlier search-assisted sections anyway.

---

## Quick-reference verdict table

| Source | Panama coverage? | Nearest usable station | Verdict |
|---|---|---|---|
| NOAA NDBC buoys (wave data) | NO — zero live wave buoys within useful range | Nearest live buoy: 42058, ~680km away, Caribbean side, non-wave-relevant for Pacific surf | **DEAD END for wave ground truth** |
| NOAA CO-OPS tides/currents | YES, but predictions-only, no live sensor | 9812501 Balboa (Pacific), 9817583 Cristobal (Atlantic) | **USABLE for harmonic tide predictions**, not real-time observation |
| IOC Sea Level Monitoring Facility | YES — real-time, both on Caribbean coast | bdto (Bocas del Toro), elpo (El Porvenir/Guna Yala) | **USABLE real-time water level** (Caribbean only; Pacific surf coast has nothing) |
| UHSLC | Could not confirm a Panama station | — | UNVERIFIED (portal is JS-driven; not confirmed present or absent) |
| ACP / pancanal.com | YES, PDF tide tables only | Balboa, Cristobal, Amador, Diablo, Limon Bay | PDF-only, no API — use CO-OPS API instead (same underlying station) |
| PSMSL | YES, monthly mean sea level only | BALBOA (id 163), CRISTOBAL (id 169) | Historical/climate record only, not operational ground truth |
| XTide harmonics DB | NO in current free build | — | Current `harmonics-dwf` is US-only; use CO-OPS `harcon.json` directly instead |
| Argo / Global Drifter Program | Not fixed/coastal by design | — | Not useful for coastal wave/tide ground truth (see note) |
| STRI Physical Monitoring (Panama-specific, not in original ask but found) | YES — Pacific (Naos/Punta Culebra) + Caribbean (Bocas, Galeta, San Blas) | Real-time tide/water quality/temperature | Public domain but **explicitly non-commercial license** — flag for legal review |
| CPTEC/INPE, IH Cantabria | Not found | — | UNVERIFIED, likely no dedicated Panama observation network |

---

## Detailed findings

### 1. NOAA NDBC (ndbc.noaa.gov) — buoys

**Method:** Downloaded and locally filtered (not search-summarized) two authoritative NDBC files:
- `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt` — every station currently reporting (fetched 2026-08-08, timestamps in the file confirm same-day data).
- `https://www.ndbc.noaa.gov/data/stations/station_table.txt` — the full station registry (1938 rows), including offline/decommissioned stations, so "exists but dead" can be distinguished from "doesn't exist."

**Result — every registered station within lat -5..15, lon -95..-68 (Panama, Costa Rica, Colombia, Ecuador Pacific and adjoining Caribbean):**

| Station | Owner | Type | Name | Lat | Lon | Live today? |
|---|---|---|---|---|---|---|
| 32411 | NDBC | 2.6m discus, DART payload | WEST PANAMA — 710 NM WSW of Panama City | 4.979N | 90.793W | **NO** — adrift since 2025-06-07, offline. Also: DART buoys measure water-column height for tsunami detection, not wave height/period — would not have been wave-useful even if live. |
| 32489 | Colombia (DIMAR) | 2.6m discus | Colombia, 121NM SW of Buenaventura | 2.998N | 79.101W | NO — not in current reporting file |
| 32487 | DIMAR/CCCP | Offshore buoy | Buenaventura, Colombia | 3.517N | 77.737W | **NO** — station page shows "No Recent Reports," only historical data 2008–2010 |
| 32488 | DIMAR/CCCP | Offshore buoy | Bahia Solano, Colombia | 6.258N | 77.511W | **NO** — same as above, historical only 2008–2009 |
| 32066–32069, 3202520, 3202521 | Ecuador (INOCAR) | Various | Manta, Esmeraldas, Galapagos (San Cristobal, Isabela) | -4.1 to 0.6N | 81–89W | NO — none reporting; also ~900–1100km from Panama's surf coast even if live |
| 41194 | DIMAR | Offshore buoy | Barranquilla, Colombia | 11.161N | 74.681W | NO — not reporting |
| 41193 | DIMAR | Offshore buoy | Puerto Bolivar, Colombia | 12.351N | 72.218W | NO — not reporting |
| 42058 | NDBC | 3m foam buoy | Central Caribbean, 210 NM SSE of Kingston, Jamaica | 14.114N | 75.949W | **YES** — confirmed live, updating every 10 min, WVHT=2.7m as of 2026-08-08 16:20 UTC |
| 42065 | NDBC | 2.3m NOOSS buoy | Near 42058 | 14.926N | 75.046W | NO — not reporting |
| 41018 | NDBC | 3m discus | (unnamed) | 15.0N | 75.0W | NO — not reporting |

**Every single station registered in this entire region is dead except 42058**, which is the only live wave-measuring NDBC buoy anywhere near Panama. It is ~680km from Panama's Caribbean coast (Colón, straight-line est.) and on the wrong side of the isthmus to say anything about Pacific swell. It is USELESS for Panama's actual surf coast (Santa Catalina, Playa Venao, Morro Negrito — all Pacific).

**Format for any live station:** plain-text realtime2 files, e.g. `https://www.ndbc.noaa.gov/data/realtime2/42058.txt` — confirmed working, space-delimited, columns `YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE`, updates ~every 10 min, last ~45 days retained, public domain (NOAA), no auth required. Not usable here only because no Panama-proximate station has this file populated.

**Live-station snapshot API (all NDBC stations, updated hourly):** `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt` — this is the fastest way to programmatically check "is anything near me alive right now" without hitting hundreds of station pages.

Access date for all NDBC checks: 2026-08-08.

---

### 2. NOAA CO-OPS Tides & Currents API

Two Panama stations exist and are queryable through the standard `api.tidesandcurrents.noaa.gov` Data Getter API:

| Station ID | Name | Lat | Lon | Coast |
|---|---|---|---|---|
| **9812501** | BALBOA, CANAL ZONE (PACIFIC) | 8.9667N | 79.5667W | Pacific |
| **9817583** | Cristobal (Colón), Panama Canal | 9.3500N | 79.9167W | Atlantic/Caribbean |

Confirmed live via direct API calls (2026-08-08):

```
GET https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=research&station=9812501&datum=MLLW&time_zone=lst&units=metric&interval=hilo&format=json&begin_date=20260808&end_date=20260809
```
returned real hi/lo predictions for today, e.g. `{"t":"2026-08-08 11:00","v":"4.279","type":"H"}` and `{"t":"2026-08-08 17:33","v":"0.925","type":"L"}` — confirming Panama Bay's large (~3.4m) semidiurnal tidal range on the Pacific side.

Same call against 9817583 (Cristobal) returned a tiny range (~0.03m to 0.46m), confirming the well-known fact that Panama's Caribbean side is essentially microtidal while the Pacific side is macrotidal.

**Critical caveat:** `product=water_level` (the actual observed/live reading) returns `{"error":{"message":"No data was found. This product may not be offered at this station..."}}`, and `GET .../stations/9812501/sensors.json` returns `"sensors": null`. **There is no live sensor at either station** — these are prediction-only "harmonic" stations. Metadata confirms harmonic analysis is from **1912, 1913, 1917, 1927, and pre-1941** USCGS surveys (`harcon.json` includes the full constituent list — M2, S2, N2, K1, M4, etc. — with amplitude/phase, public domain, reusable for offline computation).

- Products available per station: Tide Predictions, Datums, Harmonic Constituents, Inundation Analysis — no Water Level, no Meteorological Observations.
- License: public domain (US federal government data).
- Format: JSON or XML via the standard Data Getter API; predictions can be pulled for any date range.
- Latency/cadence: not applicable (deterministic prediction, computed on request; can be pulled once and cached/interpolated).
- Nearby-station API (`.../stations/9812501/nearby.json`) confirms these are the only two Panama entries in CO-OPS; no others exist.

Access date: 2026-08-08.

---

### 3. IOC Sea Level Monitoring Facility (ioc-sealevelmonitoring.org)

This is the **best real-time ground-truth source found for Panama**, though it only covers the Caribbean coast.

| Code | Name | Coast | Status today (2026-08-08) |
|---|---|---|---|
| **bdto** | Bocas Del Toro | Caribbean | **LIVE** — pressure (prs) + radar (rad) sensors, last reading 2026-08-08 14:34–14:46 UTC (checked ~16:xx UTC, so <2hr lag at fetch time; site claims 5 min delay) |
| **elpo** | El Porvenir (Guna Yala/San Blas) | Caribbean | **LIVE** — three redundant radar sensors (ra2, ra3, rad), last reading 2026-08-08 14:39–14:54 UTC, site claims 13 min delay |
| dpan / dpan2 | DART WSW of Panama City | Deep ocean (Pacific, 710nm out) | **DEAD** — same physical buoy as NDBC 32411, last observation 2025-06-08 (427 days delay at fetch time) |

Data API (confirmed working, JSON, no auth):
```
http://www.ioc-sealevelmonitoring.org/service.php?query=data&code=bdto&period=0.5
```
returns an array of `{"slevel":..., "stime":"YYYY-MM-DD HH:MM:SS", "sensor":"prs"}` records at ~1-minute resolution. `period` is in days (0.5 = last 12 hours). Also a human-readable tabular endpoint:
```
http://www.ioc-sealevelmonitoring.org/bgraph.php?code=bdto&output=tab&period=0.1
```
Station list/search: `http://www.ioc-sealevelmonitoring.org/list.php?searchname=panama&output=general` and `...&country=Panama`.

License: IOC/UNESCO/GLOSS network — data is generally open for research and operational use with attribution; no explicit commercial restriction found on the pages fetched (unlike STRI below), but formal terms should be re-checked before commercial redistribution — UNVERIFIED for commercial-use terms specifically.

Coverage gap: **both live IOC stations are on the Caribbean coast.** Bocas del Toro is a genuine surf zone (Bluff, Silverbacks, Paunch, etc.), so `bdto` water-level data is directly useful there. **Neither station is near the Pacific surf coast** (Santa Catalina, Venao, Morro Negrito are 300+ km away on the other side of the isthmus).

Access date: 2026-08-08.

---

### 4. UHSLC (University of Hawaii Sea Level Center)

Could not confirm or rule out a Panama station — the station explorer (`uhslc.soest.hawaii.edu/stations/`) is a JS-driven interactive tool that didn't return station-level data to WebFetch, and the ERDDAP index URL guessed (`allindex.html`) 404'd. **UNVERIFIED** — do not assume UHSLC has or lacks Panama coverage; would need a follow-up session with browser tooling or a direct ERDDAP query (e.g. `tabledap` with an actual dataset ID) to confirm.

What is confirmed about UHSLC in general: two data tiers — "Fast Delivery" (preliminary, updated ~monthly, by the 15th) and "Research Quality" (QC'd); formats `.dat .csv .nc`; even Fast Delivery is not real-time (monthly cadence) — so even if a Panama station exists in UHSLC, it would not serve the "correct today's forecast" use case; it would only be useful for long-term bias/calibration work.

---

### 5. Autoridad del Canal de Panamá (ACP / pancanal.com)

Confirmed: ACP publishes tide tables for **Amador, Diablo, Balboa** (Pacific) and **Limón Bay, Cristóbal** (Atlantic), years 2014–2026, at `https://pancanal.com/en/tide-tables/`. **PDF only** — no API, CSV, or JSON. No explicit license/usage terms stated on the page itself (only a generic site-wide Terms of Use link).

Because the CO-OPS station 9812501 is literally named "BALBOA, CANAL ZONE (PACIFIC)" and 9817583 is "Cristobal (Colón), Panama Canal," these are almost certainly the same underlying tidal-datum stations ACP's tables are built from (shared USCGS/Panama Canal Commission legacy harmonic analysis). **Recommendation: use the CO-OPS API, not ACP PDFs** — same numbers, machine-readable, no PDF-scraping fragility.

Access date: 2026-08-08.

---

### 6. PSMSL (Permanent Service for Mean Sea Level)

Confirmed two Panama stations:
- **BALBOA** — PSMSL id 163, 8.967N/79.567W, last updated 2021-08-07
- **CRISTOBAL** — PSMSL id 169, 9.350N/79.917W, last updated 2012-01-16

Data URL pattern: `https://www.psmsl.org/data/obtaining/stations/163.php` (and `/169.php`). Offers RLR (Revised Local Reference) and Metric datasets as **monthly and annual mean sea level** — a climate-record product, not a forecasting/nowcasting feed. Useful only for long-term sea-level-rise context, not day-to-day tide/wave correction.

Access date: 2026-08-08.

---

### 7. XTide harmonics database — can we compute Panama tides ourselves offline?

Checked `https://flaterco.com/xtide/files.html` and the current location list (`https://flaterco.com/xtide/locations.html`). The current free harmonics build (`harmonics-dwf-20251228-free.tar.xz`, from US NOS) is described as covering **"the US and associated locales"** and the location list search for Panama/Balboa/Cristobal returned **zero matches**. This appears to be a licensing-driven contraction — NOAA's modern public harmonics feed for foreign/international stations was pulled from the free redistribution some years back.

**This doesn't matter in practice**, because §2 above already shows NOAA CO-OPS serves Panama's harmonic constituents directly and for free via `.../stations/9812501/harcon.json` and `.../stations/9817583/harcon.json` — public domain, no XTide packaging needed. Either compute tide curves from those constituents directly, or just call the CO-OPS `predictions` product and skip the math entirely (recommended — NOAA already does the harmonic synthesis correctly).

A third-party option was surfaced (not independently verified): `github.com/openwatersio/tide-database`, said to merge TICON-4 (CC BY 4.0) with NOAA data — UNVERIFIED whether it includes Panama; not needed given the CO-OPS API already works.

---

### 8. Global Drifter Program / Argo — not applicable, by design

Not independently re-verified station-by-station today (would require plotting current GDP/Argo positions, which drift daily and wouldn't stay valid past this research session anyway). Flagging based on how these programs are designed rather than guessing at today's exact float positions:

- **Argo floats** profile temperature/salinity in open ocean on ~10-day dive cycles: they are not moored, not coastal, and don't measure wave height/period or tide at all. Even one drifting near Panama today would not be "ground truth" for a surf forecast.
- **Global Drifter Program buoys** track near-surface currents and SST; also not moored, not coastal, no wave/tide measurement, and typically stay in open-ocean current systems rather than sitting off a specific surf break.

**Verdict: neither program is a candidate ground-truth source for this product, independent of what happens to be near Panama on any given day.**

---

### 9. STRI Physical Monitoring Program (found during research, not in original source list — flagging because it's directly relevant)

The Smithsonian Tropical Research Institute runs `https://striresearch.si.edu/physical-monitoring/` (redirected from the older `biogeodb.stri.si.edu/physical_monitoring/`), operating real-time environmental monitoring since 1972, including:
- **Pacific side:** Punta Culebra / Naos (Amador Causeway, right at the Panama City / canal-mouth area — not the exposed Pacific surf coast, but real-time Pacific-side tide/water data)
- **Caribbean side:** Bocas del Toro, Galeta, San Blas (overlapping IOC's coverage)
- Plus inland weather/hydrology stations not relevant here.

Measures tide/water level, temperature, salinity/water quality, weather. Data is shown as interactive charts (24hr/4-week views); **could not confirm a CSV/API export** in the time available (page structure suggests one may exist but wasn't located) — UNVERIFIED on machine-readability, would need a follow-up with browser tooling.

**License flag, important:** the site states data is public domain but explicitly **"may be freely used for any non-commercial activities"** with attribution required. A commercial surf-forecast product should get this confirmed/cleared before relying on STRI data — this is a real legal gate, not a formality, if panama-surf ends up monetized.

Access date: 2026-08-08.

---

### 10. CPTEC/INPE, IH Cantabria, other Latin American networks

No Panama-specific coverage found. IH Cantabria's marine-observation page returned 404 on the guessed URL; no further search budget was available to hunt down the correct URL. CPTEC/INPE (Brazil) is not known to operate Panama infrastructure. **UNVERIFIED rather than ruled out** — genuinely didn't get a clean look at either, so treat as "no evidence found," not "confirmed absent."

---

## THE critical question: is there a real wave-measuring buoy usable for Panama's Pacific surf coast?

**No.** This is a clean, well-evidenced negative, not a hedge:

- Every NDBC/DIMAR/INOCAR buoy registered anywhere in the region bounded by Ecuador's Galapagos up through Colombia's Caribbean coast is either dead, decommissioned, or was never a wave buoy to begin with (the one "West Panama" station is a deep-ocean DART tsunami gauge, non-wave, and it's been adrift for over a year anyway).
- The only currently-live NDBC wave buoy anywhere near the isthmus is 42058, ~680km away on the Caribbean side — wrong ocean, wrong swell system, way too far to correct a Pacific-coast model.
- The Pacific surf coast (Santa Catalina, Playa Venao, Morro Negrito, Punta Uva, etc.) has **zero real-time wave measurement of any kind** — no buoy, no wave-radar, nothing found in any network checked.

**Consequence for the product:** model-error correction on the Pacific coast (where essentially all of Panama's real surf breaks are) cannot come from buoy ground truth — there is none to correct against. It has to come from something else: human/webcam observation (as the task brief already anticipated), or possibly a strategy of validating the underlying global wave model (GFS-Wave/WW3 etc., covered in doc 01) against the nearest buoys that DO exist somewhere in the broader Eastern Pacific/Caribbean basin as a sanity check on model skill in general — not as site-specific correction.

---

## Tide data plan (recommended path)

Tide is **not** a dead end, unlike waves — Panama has good options:

1. **Primary: NOAA CO-OPS predictions API**, stations `9812501` (Balboa/Pacific) and `9817583` (Cristobal/Atlantic). Machine-readable JSON, public domain, works today, gives hi/lo times and heights (or full curve via `interval=<minutes>`) for any date. This is harmonic prediction, not observation — but Panama has negligible storm surge (no hurricanes reach it, tropical low pressure systems are rare) so predicted vs. actual tide height should track very closely most of the time. This alone likely covers "what's the tide doing on the Pacific surf coast" adequately.
2. **Supplement on the Caribbean side only:** IOC `bdto` (Bocas del Toro) gives genuine real-time observed water level, useful if/when the product covers Bocas del Toro surf spots specifically — lets you catch actual anomalies (river discharge, wind setup) that a pure harmonic prediction would miss.
3. **Do not bother with:** ACP PDFs (redundant with #1, worse format), PSMSL/UHSLC (wrong cadence — climate record, not operational), XTide's bundled DB (Panama isn't in the current free build; CO-OPS already gives you the constituents directly if you ever want to compute offline).
4. **Legal note carried forward:** if STRI data is ever used (Naos/Punta Culebra Pacific-side tide), get the non-commercial license clause resolved first.

---

## 10-line summary

1. Panama's Pacific surf coast has **zero live wave-measuring buoys** — confirmed by direct download/filter of NDBC's full station registry and live-reporting file, not just search results.
2. Every regional candidate (NDBC 32411 DART, Colombia's DIMAR buoys 32487/32488/32489, Ecuador's INOCAR buoys) is either dead, decommissioned, or non-wave-instrumented.
3. The only live NDBC wave buoy anywhere close is 42058, ~680km away in the Caribbean — wrong coast, wrong swell system, not usable for correction.
4. **This confirms the product's core premise: model-error correction on the Pacific surf coast must come from human/webcam observation, not buoy ground truth, because no buoy ground truth exists.**
5. Tide is a different story — NOAA CO-OPS serves live, machine-readable harmonic tide predictions for Balboa (Pacific, station 9812501) and Cristobal (Atlantic, 9817583), confirmed working today via direct API calls.
6. Neither CO-OPS Panama station has a live water-level sensor (both are prediction-only), but Panama's negligible storm surge makes harmonic prediction a solid stand-in for real tide height.
7. The IOC Sea Level Monitoring Facility has two genuinely live, real-time water-level stations in Panama — bdto (Bocas del Toro) and elpo (El Porvenir) — but both are on the Caribbean coast, not the Pacific surf zone.
8. ACP's own tide tables are PDF-only with no API; use the CO-OPS API instead since it's the same underlying station data, already machine-readable.
9. PSMSL and UHSLC have Panama data but at monthly/climate cadence — useless for day-to-day forecast correction, fine only for long-term calibration.
10. A bonus find, STRI's Physical Monitoring Program, has real Pacific-side (Naos) and Caribbean-side tide/water data, but its license is explicitly non-commercial-only — flag for legal review before any commercial use.
