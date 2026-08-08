# 04 — Panama National & Regional Official Data Sources

Research pass for Panama surf-forecast app. Topic: national/regional meteorology, hydrology,
marine warnings, and tide data sources for Panama. Searched in Spanish and English.

Access date for all findings below (unless noted): **2026-08-08**.

Status legend: ✅ CONFIRMED LIVE (verified via WebFetch/WebSearch today), ⚠️ PARTIAL/UNCLEAR,
❌ BLOCKED/UNREACHABLE, ❓ UNVERIFIED (not checked directly — do not treat as fact).

---

## 1. IMHPA — Instituto de Meteorología e Hidrología de Panamá
*(EN: Panama Institute of Meteorology and Hydrology)*

- URL: https://www.imhpa.gob.pa/
- ❌ **BLOCKED to automated fetch.** Every page tried (`/`, `/es/documentos`, `/es/aviso-vigilancia`,
  `/es/actualizacion-del-pronostico-del-tiempo`) returned **HTTP 403 Forbidden** to the WebFetch
  tool, both with and without a browser User-Agent via `curl` (curl itself got HTTP 302 redirects
  that didn't resolve further in this sandbox — inconclusive, but WebFetch's 403 is the more
  reliable signal of bot-blocking, likely Cloudflare or similar). Access date 2026-08-08.
- What we know from WebSearch snippets only (⚠️ not independently confirmed on-page):
  - IMHPA was created by Law 209 (April 22, 2021) as Panama's official body for weather/hydro
    warnings and forecasts (replacing ETESA-Hidromet's forecasting role, though ETESA still runs
    the station network — see below).
  - Publishes a "Documentos" section, an "Actualización del Pronóstico del Tiempo" (forecast
    update) page, and an "Aviso y Vigilancia" (watch/warning) page. Also a Climatology
    Directorate publishing monthly/seasonal rainfall and climate-outlook bulletins.
  - No evidence in search results of a dedicated "boletín marítimo" (maritime bulletin) product —
    SINAPROC and AMP appear to be the ones who *distribute* IMHPA's marine/wave warnings, not
    IMHPA publishing a standalone maritime bulletin page.
  - No evidence found of tide tables (tabla de mareas) published by IMHPA — see ACP/Panama Canal
    Authority below, which is the actual official tide-table publisher.
  - No JSON/CSV/RSS/API found or referenced anywhere in search results.
- YouTube channel exists (@imhpapanama) for video bulletins — not machine-readable data.
- **Ingestibility verdict: NOT realistically ingestible today.** The site blocks automated
  fetching outright (403), nothing indicates a public API, and no tide data lives here. A small
  app could not reliably scrape this source without a headless browser + IP/UA workaround, which
  is fragile and may violate the site's terms. Would need a human to check robots.txt/ToS and
  possibly request direct API/data access from IMHPA directly.

---

## 2. ETESA Hidrometeorología (hidromet.com.pa)
*(EN: ETESA Hydrometeorology Directorate — Panama's national power-transmission utility, which
historically also ran the national hydro-met station network)*

- URL: http://www.hidromet.com.pa/ (and https://www.hidromet.com.pa/)
- ❌ **UNREACHABLE from this research environment.** Both HTTP and HTTPS, via WebFetch and via
  direct `curl`, returned **connection refused** (`ECONNREFUSED` / curl exit with no response).
  This is consistent across multiple attempts and multiple tools, which rules out a transient
  blip on our end — access date 2026-08-08. Cause is UNVERIFIED: could be (a) the site is
  genuinely down/decommissioned, (b) DNS points to a dead host, or (c) it's geo/IP-restricted to
  Panama-origin traffic (plausible for aging .gob.pa-adjacent infra). Do not assume any of these
  — flag as unresolved.
- What we know from WebSearch snippets only (⚠️ not independently confirmed on-page):
  - ETESA's Hydrometeorology Directorate operates a "Red Nacional" of hydrometeorological
    stations, historically including automatic stations with GOES-12 satellite telemetry (2 of
    them feeding an early-warning system for the Cabra and Pacora rivers).
  - ETESA is Panama's official representative to the WMO and the Central American Climate Forum
    (FCAC).
  - The site had a page `red_nacional.php` listing the station network (content unknown — could
    not be reached to check format).
- ETESA does appear as a registered organization on Panama's open data portal
  (`empresa-de-transmision-electrica-sa-etesa` — see datosabiertos section below), and separately,
  ETESA-operated weather stations appear in an ArcGIS FeatureServer (see §7) as "Layer 0" —
  that ArcGIS layer may currently be the only realistically reachable window into ETESA station
  data.
- **Ingestibility verdict: UNKNOWN/BLOCKED today.** Site unreachable outright from our tooling.
  If Andres or a Panama-based tester can confirm it loads from a Panama IP, worth re-investigating
  directly; otherwise treat as dead for now and prefer the ArcGIS FeatureServer proxy for ETESA
  station metadata.

---

## 3. SINAPROC — Sistema Nacional de Protección Civil
*(EN: Panama's National Civil Protection System — issues public safety warnings, incl. coastal/
wave hazard warnings)*

- URL: https://www.sinaproc.gob.pa/
- ✅ **CONFIRMED LIVE** (WebFetch succeeded on homepage and on individual aviso pages), access
  date 2026-08-08.
- What it publishes: **"Avisos de Prevención"** (prevention notices) as individual news-style
  blog posts — e.g. "Aviso de Prevención – Oleajes en el Caribe panameño," "Aviso de Prevención
  Mareas máximas en el Pacífico panameño." These are SINAPROC's public restatement of warnings
  that originate at IMHPA (SINAPROC's posts explicitly cite "según el Instituto de Meteorología e
  Hidrología de Panamá (IMHPA)").
- Confirmed real recent example (2026): a Pacific-coast prevention notice valid July 23–27, 2026
  for elevated wave frequency/period coinciding with spring tides and elevated rip-current risk;
  and an earlier notice (mid-July 2026) for maximum tides up to 16.9 ft (5.15 m) on the Pacific
  coast, peaking July 16 at 5:29 p.m.
- Format: **plain HTML news posts only.** No RSS feed found, no JSON/API, no structured feed of
  any kind. Social share buttons exist (Facebook/Twitter/WhatsApp/etc.) but that's manual sharing,
  not a machine feed. Social presence confirmed on Twitter/X, Facebook, Instagram, YouTube — none
  of which are structured/reliable enough for programmatic ingestion without a bespoke scraper
  (and scraping social media ToS is generally restrictive).
- No single "current avisos" index page was found in this pass — avisos appear to live as
  individual dated posts under "Notas de Prensa" (press releases). A scraper would need to poll
  the press-releases listing and parse post titles/bodies for keywords (oleaje, marea, aviso).
- **Ingestibility verdict: MARGINALLY ingestible only via a custom HTML scraper** (poll the news
  listing, regex/keyword-match for oleaje/marea/aviso posts). Fragile — no structured feed, page
  layout could change — but the site itself is reachable and posts are plain HTML, so this is
  more feasible than IMHPA or hidromet. This is the best available proxy for **official** Panama
  coastal-hazard alerting.

---

## 4. AMP — Autoridad Marítima de Panamá
*(EN: Panama Maritime Authority)*

- URL: https://www.amp.gob.pa/
- ✅ **CONFIRMED LIVE** (HTTP 200 via curl and WebFetch), access date 2026-08-08.
- Homepage navigation checked directly: Servicios, Consultas, Nosotros, Transparencia,
  Normatividad, Iniciativas, Sala de Prensa, Pagos, REN. **No dedicated meteorology,
  oceanography, tide-table, or maritime-bulletin section found in the main nav.** A footer link
  to COCATRAM (Central American maritime transport commission) exists but is about port
  statistics/shipping routes, not weather.
- AMP does issue ad hoc advisory alerts to small craft (outboard motorboats, pleasure yachts)
  about adverse weather, but these are downstream restatements of IMHPA warnings (per news
  search), issued as press notices — same non-structured format problem as SINAPROC, and no
  dedicated page for them was located in this pass.
- AMP is party to tide-gauge (mareógrafo) installation projects together with IMHPA and Fundación
  Natura for continuous sea-level monitoring and tsunami early warning — this is infrastructure,
  not yet a confirmed public data feed.
- **On Panama's open data portal**, AMP is a registered organization
  (`autoridad-maritima-de-panama-amp`) with **175 datasets published** (checked directly via CKAN
  page), but every dataset found in the "Puertos"-tagged group is **port/cargo/fuel-commerce
  statistics** (container movement, marine fuel sales by barge, species landing records,
  maritime-port indicators) in XLSX/CSV/PDF — **zero tide, weather, or wave datasets** among them.
- AMP publishes a "Boletín Estadístico Marítimo Portuario" (statistical bulletin, e.g.
  `amp.gob.pa/transparencia/estadistica/boletin-estadistico/`) — this is shipping/port statistics,
  not meteorological.
- **Ingestibility verdict: NOT a marine-weather data source in practice**, despite the name. Good
  for shipping/port stats, not for surf forecasting. Its open-data datasets are machine-readable
  (CSV/XLSX via CKAN API) but irrelevant to this app.

---

## 5. Autoridad del Canal de Panamá (ACP) — Meteorología e Hidrología
*(EN: Panama Canal Authority — Meteorology and Hydrology Branch)*

This is the standout finding of this research pass — **ACP runs the most serious, and most
useful, met/hydro data infrastructure of any Panama national source**, and meaningful parts of it
are public.

### 5a. Official annual tide tables (Tabla de Mareas) — ✅ CONFIRMED, the real Panama tide-table source
- ACP's **"Vicepresidencia de Administración del Recurso Hídrico, Sección de Meteorología e
  Hidrología"** (Water Resources VP, Meteorology & Hydrology Section) publishes an **official
  annual PDF tide table**, covering both the **Pacific Ocean** and the **Caribbean Sea** sides of
  Panama, with reference levels, astronomical data (sunrise/sunset, moonrise/moonset), and the
  Beaufort/Douglas sea-state scales.
- **2026 edition confirmed to exist** via WebSearch:
  `https://pancanal.com/wp-content/uploads/2026/05/TABLA-DE-MAREA-2026-FINAL.pdf`
  (titled "Tabla de Mareas 2026 — División de Hidrometeorología, Sección de Hidrología").
- **2023 edition fetched and visually confirmed** (cover + table of contents read directly):
  "Tabla de Mareas 2023 — Vicepresidencia de Administración del Recurso Hídrico, Sección de
  Meteorología e Hidrología," covering "Mareas del Océano Pacífico" (p.5) and "Mareas del Mar
  Caribe" (p.14), plus astronomical/oceanographic info (p.23) and canal navigation info (p.32).
  URL: `https://pancanal.com/wp-content/uploads/2023/01/TABLA-DE-MAREA-2023.pdf` (4.6MB PDF,
  HTTP 200, access date 2026-08-08).
- **Format: PDF only**, published **annually** (each year gets a new `/wp-content/uploads/YYYY/`
  path). No CSV/JSON tide table found. This is Panama's canonical, most authoritative tide
  reference — likely the ultimate source that all the third-party tide sites (tides4fishing,
  tideschart, tidetable.net) either scrape or independently compute against, but ACP is the
  primary authority worth citing.
- **Ingestibility verdict: ingestible with work.** It's a stable, predictable URL pattern
  (`pancanal.com/wp-content/uploads/{year}/{month}/TABLA-DE-MAREA-{year}[-FINAL].pdf`), openly
  downloadable, no auth. A small app could parse this PDF once a year (PDF table extraction, e.g.
  via `pdfplumber`/`camelot`) to get authoritative Pacific/Caribbean tide reference data, or more
  practically, use it as a **cross-check/citation** while relying on a harmonic tide model (e.g.
  NOAA/XTide-style) for actual daily predictions.

### 5b. Live weather radar — ✅ CONFIRMED LIVE, image only
- URL: https://pancanal.com/radar-meteorologico/ (Spanish) / https://pancanal.com/en/weather-radar/ (English)
- Confirmed live page showing "Última imagen" (latest image) and "Última animación" (latest
  animation) of weather radar, sourced from `radar-meteorologico.delcanal.com/current_image2.gif`
  — **confirmed to return a real GIF89a image (166.7 KB)** via direct fetch, access date
  2026-08-08.
- No stated update cadence found on-page. No coverage-area statement found on-page (presumed
  centered on the Canal watershed/Panama City area based on ACP's mission, not the wider coastline
  — UNVERIFIED).
- Page also links out to NOAA satellite imagery as a supplementary external resource.
- **Format: static image/GIF only — no API, no raw radar data (no NEXRAD-style volume data
  found).** Fine for a "here's a picture" widget, not useful as a structured data feed for wind/
  rain-model ingestion.

### 5c. Real-time station network via AQUARIUS WebPortal — ✅ CONFIRMED LIVE, rich data, no public API found
- URL: https://panama.aquaticinformatics.net/ (described by STRI as ACP's "uncurated data
  portal")
- Confirmed live (WebFetch succeeded), running **"AQUARIUS WebPortal v2026.2.57"** (Aquatic
  Informatics' commercial hydro-data platform), access date 2026-08-08.
- Data coverage confirmed on-page: precipitation, river stage/discharge, reservoir elevation (**Alhajuela, Gatún, Miraflores**),
  air temperature, atmospheric pressure, relative humidity, water temperature, evaporation, wind
  speed/direction, solar radiation — plus **tidal observations on both the Atlantic and Pacific
  sides** of the canal. Dashboards organized as: Embalses (reservoirs), Meteorología,
  Precipitación, Ríos, Salidas de Agua (water discharge).
- **No public REST/API endpoint was found or documented on the fetched page** (no
  `/AQUARIUS/Publish/v2/` or similar surfaced in the content WebFetch returned). AQUARIUS
  WebPortal deployments *often* expose a Publish API at a path like
  `/AQUARIUS/Publish/v2/GetTimeSeriesData` — this is a common pattern for this commercial product
  — but **this was NOT independently confirmed reachable/enabled for this instance**; treat as ❓
  UNVERIFIED and worth a follow-up direct check (e.g.
  `https://panama.aquaticinformatics.net/AQUARIUS/Publish/v2/GetTimeSeriesDescriptionList` or the
  in-portal export button) rather than assumed.
- Data export via CSV/Excel and in-browser charting confirmed available (manual export, not
  necessarily programmatic).
- **Ingestibility verdict: high-value if the Publish API is actually open — needs direct
  follow-up check.** Even without an API, ACP's own tidal-observation stations (Atlantic + Pacific
  side) are a strong signal source, since they are real coastal water-level gauges near the canal
  mouths (Cristóbal/Colón on the Caribbean, Balboa on the Pacific) — useful as calibration/
  ground-truth points even if not directly "surf coast" locations.

### 5d. Historical station data via STRI (Smithsonian) mirror — ✅ CONFIRMED
- URL: https://striresearch.si.edu/physical-monitoring/panama-canal-authority-with-direct-links/
- Confirmed live, STRI hosts ACP data under a collaborative agreement: downloadable historical
  datasets for precipitation (many stations A–Z), **20 meteorological stations**, lake levels,
  and river discharge, in `.zip` or DOI-linked repository files. Meteorological parameters said
  to update at **15-minute intervals** (presumably on ACP's live systems, not the STRI historical
  mirror). Water-quality sampling is monthly across ~40 watershed stations (~30 variables).
  Yearly Spanish-language reports published. Attribution requirement: must credit "the
  Meteorology and Hydrology Branch, Panama Canal Authority, Republic of Panama." Data provided
  "as is," no accuracy guarantee. Curated data/summaries available on request via
  patons@si.edu.
- **Ingestibility verdict: good for historical/archival research**, not real-time ingestion — but
  legitimate, citable, and has a named human contact for direct data requests, which is valuable
  for a small app that wants to ask ACP directly for a data-sharing arrangement.

### ACP is NOT listed with datasets on the open data portal
- Checked `datosabiertos.gob.pa` for organization `autoridad-del-canal-de-panama-pancanal` — the
  org exists in the org list, but the dataset listing returned **"Conjuntos de datos no
  encontrados"** (no datasets found), confirmed 2026-08-08. So the open-data-portal route to ACP
  is currently empty; the live portals above (pancanal.com PDFs, AQUARIUS portal, STRI mirror) are
  the only real avenues.

---

## 6. Tocumen / Panama airports — METAR/TAF (aviationweather.gov)
*(EN: this is the single most reliable, structured, free, unlimited data source found in this
entire pass)*

- API confirmed live and working: **`https://aviationweather.gov/api/data/metar`**
  (NOAA Aviation Weather Center Data API), query params `ids` (comma-separated ICAO codes),
  `format=json` (or `raw`), `hours` (lookback window). No API key required. Tested directly
  2026-08-08 and got real, current (same-day) observations back in JSON with fields: `icaoId`,
  `rawOb`, `obsTime`/`reportTime`, `temp`, `dewp`, `wdir`, `wspd`, `visib`, `altim`, `clouds[]`,
  `fltCat`, `wxString`, `lat`/`lon`/`elev`.
- **Confirmed LIVE/reporting Panama METAR stations (5 total, verified with real current obs on
  2026-08-08):**

  | ICAO | Name | Region/coast relevance |
  |---|---|---|
  | **MPTO** | Tocumen Intl (Panama City) | Central, not coastal — reference station |
  | **MPMG** | Marcos A. Gelabert / Albrook Intl (Panama City) | Central, near Panama City bay |
  | **MPDA** | Enrique Malek Intl (David, Chiriquí) | Pacific — closest METAR to Chiriquí Pacific surf breaks (Boca Chica, Morro Negrito area) |
  | **MPBO** | Bocas del Toro / Isla Colón Intl | Caribbean — Bocas del Toro surf area (Bluff, Paunch, etc.) |
  | **MPSM** | Scarlett Martínez Intl (Río Hato, Coclé) | Pacific — closest METAR to the Coronado/Playa Blanca/Farallón stretch, and a reasonable proxy for the approach to the Santa Catalina/Veraguas coast |

  Sample raw obs pulled live: `METAR MPTO 081600Z 02009KT 340V060 9000 SCT018 33/24 Q1009 NOSIG`,
  `METAR MPSM 081600Z 19006KT 9000 FEW030 32/25 Q1010`, `METAR MPDA 081600Z 25005KT 9999 FEW018
  31/24 Q1009 NOSIG`, `SPECI MPBO 081626Z 30006KT 270V350 8000 -RA SCT015 OVC070 25/24 Q1012`.

- **Checked but NOT reporting (empty response = no active METAR feed found for these ICAO
  codes), access date 2026-08-08:**
  - MPCH — Capitán Manuel Niño Airport, Changuinola, Bocas del Toro
  - MPSA — Rubén Cantú Airport, Atalaya, Veraguas (would have been the best proxy for the
    Santa Catalina / Playa Venao surf coast — its absence is a real gap)
  - MPOA — Puerto Obaldía Airport (Guna Yala/Darién Caribbean)
  - MPJE — Jaqué Airport (Darién Pacific)

  These are small regional airstrips that most likely never had automated ASOS/AWOS weather
  equipment installed — their absence from the METAR network is plausible and unsurprising, not
  necessarily a fetch error (retried with multiple format variants, consistently empty).
  ⚠️ Station identity for MPSA/MPCH/MPOA/MPJE and their IATA pairings came from WebSearch snippet
  summaries only (not cross-checked against an authoritative ICAO registry) — treat exact
  naming/location as UNVERIFIED even though the "no METAR" finding itself is directly confirmed.

- Update cadence: **hourly** routine METARs, plus **SPECI** special reports on significant
  changes (confirmed: a SPECI was issued for MPBO same-day). **Free, unlimited, no auth, official
  NOAA/US government data**, redistributing internationally-shared aviation weather (Panama's
  civil aviation authority feeds these into the global METAR network per ICAO Annex 3
  obligations).
- Also available: legacy NOAA TGFTP-style mirrors and `aviationweather.gov/data/api/` TAF
  endpoint (`/api/data/taf?ids=...`) for terminal forecasts — not tested in this pass but same
  API family, presumed to work identically for the 5 live stations (❓ not independently tested).
- **Ingestibility verdict: ✅ BEST SOURCE IN THIS ENTIRE REPORT.** Structured JSON, no key, no
  rate-limit friction encountered, hourly cadence, official. Wind (`wdir`/`wspd`), visibility, and
  pressure (`altim`) from MPBO (Caribbean), MPDA (Chiriquí Pacific) and MPSM (central Pacific) are
  directly useful as coastal-wind ground-truth/nowcast inputs for a Panama surf app, despite none
  of the 5 stations sitting exactly on a surf break.

---

## 7. ArcGIS FeatureServer — "Estaciones Meteorológicas en Panamá" (STRI GIS)
*(a byproduct find while researching ACP/ETESA — genuinely useful)*

- URL: https://services2.arcgis.com/HRY6x8qt5qjGnAA9/arcgis/rest/services/Estaciones_Metereologicas_Panama/FeatureServer
- ✅ **CONFIRMED LIVE**, queryable REST API (Esri ArcGIS FeatureServer), maintained by "Laboratorio
  de GIS de STRI" (Smithsonian Tropical Research Institute GIS Lab), 2018 copyright date on the
  service description (⚠️ station coverage/metadata itself could be stale — last-updated date for
  the actual station list not confirmed).
- **Three layers, one per operating agency:**
  - Layer 0 — ETESA weather stations
  - Layer 1 — ACP weather stations
  - Layer 2 — STRI weather stations
- Query pattern (returns JSON, no auth needed):
  `.../FeatureServer/{0|1|2}/query?f=json&where=1=1&outFields=*`
  Max 1000 records per request (won't be a constraint here — station counts are small).
- **Ingestibility verdict: genuinely useful as a station-metadata index** (names, coordinates,
  operating agency) even though it does not appear to carry live observation values itself — it's
  a locator/catalog, not a live-data feed. Good for building a station picker or for cross-
  referencing which agency owns which physical station before reaching out for real data access.

---

## 8. Panama Open Data Portal — datosabiertos.gob.pa
- URL: https://www.datosabiertos.gob.pa/
- ✅ **CONFIRMED LIVE**, and confirmed to be a working **CKAN** instance with a live JSON API at
  `/api/3/action/package_search` and `/api/3/action/organization_list` (both tested directly and
  returned valid JSON, access date 2026-08-08).
- Registered organizations relevant to this app's domain (confirmed via
  `organization_list`): `ministerio-de-ambiente-de-panama-miambiente`,
  `autoridad-maritima-de-panama-amp`, `autoridad-de-los-recursos-acuaticos-de-panama` (ARAP),
  `autoridad-del-canal-de-panama-pancanal`, `universidad-maritima-internacional-de-panama-umip`,
  `empresa-de-transmision-electrica-sa-etesa`.
- **IMHPA and SINAPROC do NOT appear as registered organizations** on this portal (checked
  directly) — confirming they don't publish structured open data here.
- Direct dataset searches for **"clima"** and **"mareas"** returned **zero results**
  (`"count": 0"` in both cases, confirmed via live API call). AMP's own 175 datasets (checked
  directly, see §4) are 100% port/cargo statistics, not weather. ACP/pancanal has **zero**
  datasets published on this portal (checked directly, see §5). ARAP and MiAmbiente were not
  individually enumerated for datasets in this pass (time-boxed) — worth a follow-up
  `package_search?q=...&fq=organization:autoridad-de-los-recursos-acuaticos-de-panama` /
  `...ministerio-de-ambiente-de-panama-miambiente` check specifically for anything tagged
  oleaje/marea/pesca/costa.
- **Ingestibility verdict: technically excellent (real CKAN API, real JSON, no auth) but
  currently EMPTY for this app's domain.** Worth periodic re-checking (government portals add
  datasets over time) but not usable today for marine/weather.

---

## 9. ARAP — Autoridad de los Recursos Acuáticos de Panamá
*(EN: Panama Aquatic Resources Authority — fisheries/coastal-resource regulator)*

- ❓ Not independently WebFetched in this pass (time-boxed); findings are WebSearch-snippet only.
- Registered on `datosabiertos.gob.pa` (org slug `autoridad-de-los-recursos-acuaticos-de-panama`)
  per the organization_list check, but dataset contents not individually verified.
- Panama (via ARAP/ACP/University of Panama/STRI/AMP) is reported to participate in UNESCO-IOC's
  International Oceanographic Data Exchange (IODE) program — this is a data-sharing *agreement*,
  not a confirmed public data feed for this app to consume today.
- **Ingestibility verdict: UNVERIFIED / likely not directly useful** without further direct
  investigation. Flagging as a follow-up, not resolved.

---

## 10. CATHALAC (Centro del Agua del Trópico Húmedo para América Latina y el Caribe)
*(EN: Water Center for the Humid Tropics of Latin America and the Caribbean — HQ'd in Panama City,
hosts the SERVIR-Mesoamérica regional node)*

- URL: https://cathalac.int/ (note: also historically cathalac.org — cathalac.int is the current
  live domain, confirmed via direct fetch 2026-08-08)
- ✅ **CONFIRMED LIVE**, and confirmed to link out to several real data products:
  - WRF numerical weather/precipitation forecast: `https://cathalac.int/pronostico-numerico-del-tiempo-wrf/`
  - Monthly Panama climate bulletin: `https://cathalac.int/boletin-climatico-de-panama/`
  - SERVIR regional monitoring/alert platform: `https://www.servir.net/servir_alertas/index-new.php`
  - Watersheds hydrology/climate portal: `http://cuencas.cathalac.org/`
  - GOES GRB satellite receiver system description (infrastructure, not a public download):
    `https://cathalac.net/sistema-receptor-de-imagenes-goes-grb/`
- None of these were individually fetched/verified for machine-readable formats in this pass
  (time-boxed) — flagging `cuencas.cathalac.org` and the WRF forecast page as the two most
  promising follow-ups, since CATHALAC explicitly does regional WRF modeling (potentially
  wind/precip fields at higher resolution than global models) and a watershed data portal that
  may expose station data similarly to ACP's AQUARIUS portal.
- **Ingestibility verdict: PROMISING BUT UNVERIFIED.** CATHALAC is a legitimate regional
  scientific body (UN-SPIDER regional support office, SERVIR hub) with real modeling
  infrastructure — worth a dedicated follow-up pass specifically on `cuencas.cathalac.org` and the
  WRF product page before concluding either way.

## 10b. SERVIR-Mesoamérica / SERVIR-Amazonía
- SERVIR's Mesoamerica regional hub is hosted at CATHALAC (see above) — same organization, not a
  separate site to check. SERVIR's broader value proposition (per WebSearch) is a large catalog of
  geospatial environmental data (Data Portal, real-time image visualizer, "SERVIR Viz") and fire
  monitoring (SIGMA-1, MODIS-based) — these are regional/Central-America-wide products, generally
  more useful for land/fire/flood applications than for a surf-wind-forecast app. SERVIR-Amazonía
  is a *different* regional hub (South America-focused, not Panama-relevant) — not investigated
  further as out of scope.
- **Ingestibility verdict: low priority for this app** — interesting infrastructure, wrong data
  types (fire/land/flood, not wind/wave) for a surf-forecast use case.

---

## Summary (10 lines)

Panama's national sources are mostly a bust for machine-readable ingestion: IMHPA
(imhpa.gob.pa, the actual met/marine-warning authority) blocks automated fetches outright (403
on every page tried) and shows no tide tables or API; ETESA-Hidromet (hidromet.com.pa) was
completely unreachable from this environment (connection refused, cause unconfirmed); SINAPROC
and AMP only redistribute IMHPA warnings as unstructured HTML news posts with no feed. The one
standout is the **Autoridad del Canal de Panamá (ACP)**: it publishes an official annual PDF
tide table for both Pacific and Caribbean coasts (`pancanal.com/wp-content/uploads/2026/05/
TABLA-DE-MAREA-2026-FINAL.pdf`), runs a live AQUARIUS hydro-data web portal
(panama.aquaticinformatics.net) with Atlantic/Pacific tidal gauges and 15-min-interval weather
stations (public API existence unconfirmed, worth a direct follow-up check), and a live radar
image feed. Panama's CKAN open-data portal (datosabiertos.gob.pa) has a real, working JSON API
but zero weather/marine/tide datasets today. By far the best confirmed source for this app is
**NOAA's aviationweather.gov METAR API** — free, keyless, hourly, JSON, and currently reporting
live from 5 Panama stations: **MPTO** (Tocumen), **MPMG** (Albrook), **MPDA** (David/Chiriquí
Pacific), **MPBO** (Bocas del Toro/Caribbean), and **MPSM** (Río Hato/central Pacific) — MPCH,
MPSA, MPOA, and MPJE were checked and are NOT reporting (likely no ASOS/AWOS equipment). CATHALAC
(cathalac.int, HQ'd in Panama City, runs SERVIR-Mesoamérica) is confirmed live with a regional WRF
forecast product and a watershed hydrology portal (cuencas.cathalac.org) that weren't
individually format-checked in this pass — flagged as the top follow-up alongside ACP's AQUARIUS
Publish API.
