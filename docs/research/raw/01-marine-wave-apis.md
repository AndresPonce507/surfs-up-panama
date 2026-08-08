# Marine / Wave Forecast APIs for Panama — Raw Research

Research date: 2026-08-08. Compiled by research subagent.

Scope: free and freemium marine/wave forecast APIs usable for a Panama surf-forecast
web app, covering both the Pacific coast (test point ~8.40 N, -80.12 W, near
Playa Venao / Santa Catalina, Gulf of Chiriquí/Panama area) and the Caribbean
coast (test point ~9.37 N, -82.25 W, near Bocas del Toro).

Status key for each source: USE / MAYBE / REJECT.

**NOTE ON THE BRIEF'S TEST COORDINATES**: this doc uses the Pacific test point given in the
research brief (8.40 N, -80.12 W) for every source's example requests, as instructed. Live
geocoding during this research (OpenStreetMap Nominatim, accessed 2026-08-08) found that point
is NOT actually Playa Venao or Santa Catalina — it reverse-geocodes to an inland village near
Antón, Coclé, roughly 100+ km from both real surf spots. Real coordinates: Playa Venao
≈7.4325 N, -80.1933 W; Santa Catalina ≈7.6342 N, -81.2546 W. See section 1, item 7 for the
full evidence and a corrected live data pull. Recommend fixing this in the brief before further
work builds on it.

---

## Table of contents

1. Open-Meteo Marine Weather API
2. Stormglass.io
3. Windy API (Point Forecast API / Map Forecast API)
4. WorldTides API
5. Meteomatics
6. Visual Crossing
7. Weatherbit (marine)
8. Tomorrow.io
9. StormGeo / DHI / others
10. Other free/open marine model APIs discovered
11. Cross-cutting notes: Panama coastal grid coverage risk
12. Open questions / UNVERIFIED items
13. Flags — out of scope items noticed

---

## 1. Open-Meteo Marine Weather API

STATUS: **USE** — best free option found; real hourly wave/swell/SST/current/sea-level data confirmed at both Panama test points, no key needed, generous free-tier ceiling, CC-BY 4.0 licensing permits redistribution with attribution. Also covers approximate tide (sea level) data, weakening the case for a separate tide vendor — see item 6.

### Fact table

1. **Base URL + example requests**
   - Base: `https://marine-api.open-meteo.com/v1/marine`
   - Pacific (Playa Venao/Santa Catalina area, 8.40 N, -80.12 W) — TESTED LIVE 2026-08-08:
     `https://marine-api.open-meteo.com/v1/marine?latitude=8.40&longitude=-80.12&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period&forecast_days=3`
     → API snapped the request to grid point **8.375 N, -80.04166 W** (i.e. it does NOT interpolate to exact coords, it returns the nearest native grid cell — roughly 8-9 km off in this case). Elevation returned was 46.0 m — see item 7 below for why this is NOT reliable evidence of a bad grid cell (a corrected-coordinate retest showed the same positive-elevation pattern), and for the more important finding that 8.40 N, -80.12 W is not actually Playa Venao/Santa Catalina at all.
   - Caribbean (Bocas del Toro area, 9.37 N, -82.25 W) — TESTED LIVE 2026-08-08:
     `https://marine-api.open-meteo.com/v1/marine?latitude=9.37&longitude=-82.25&hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,wind_wave_height&forecast_days=2`
     → Snapped to **9.375 N, -82.29166 W** (elevation 19.0 m). All fields populated, no nulls. Wave height 0.56–0.92 m, swell period 5.6–7.05 s, swell direction 38–50°, wind-wave height near 0 (swell-dominated), which is physically plausible for the sheltered Bocas del Toro archipelago in early August.
   - Actual raw JSON returned for the Pacific point (truncated arrays):
     ```json
     {
       "latitude": 8.375, "longitude": -80.04166,
       "hourly_units": {"wave_height":"m","wave_direction":"°","wave_period":"s",
         "swell_wave_height":"m","swell_wave_direction":"°","swell_wave_period":"s",
         "wind_wave_height":"m","wind_wave_direction":"°","wind_wave_period":"s",
         "secondary_swell_wave_height":"m","secondary_swell_wave_direction":"°","secondary_swell_wave_period":"s"},
       "hourly": {
         "time": ["2026-08-08T00:00","2026-08-08T01:00", "..."],
         "wave_height": [0.34, 0.34, 0.32, "..."],
         "swell_wave_height": [0.14, 0.14, 0.14, "..."],
         "swell_wave_period": [4.15, 4.60, 5.20, "..."],
         "wind_wave_height": [0.26, 0.24, 0.24, "..."],
         "secondary_swell_wave_height": [0.10, 0.10, 0.10, "..."]
       }
     }
     ```
2. **Auth model**: No API key, no signup required for the free public endpoint (`marine-api.open-meteo.com`). Paid customers get a dedicated key + `customer-api.open-meteo.com` endpoint for higher/unmetered limits.
3. **FREE TIER limits** (open-meteo.com/en/pricing, accessed 2026-08-08): 600 calls/minute, 5,000 calls/hour, 10,000 calls/day, 300,000 calls/month. **Free tier is explicitly NON-COMMERCIAL only** — see licensing section below; this is the single biggest catch for a product that might ever charge or run ads.
4. **Paid tier entry price**: "API Standard" plan ≈ **$29/month for 1,000,000 calls/month**, which is the plan that grants the commercial-use license. Higher tiers: Professional (5M calls/mo, adds historical/ensemble/climate datasets), Enterprise (50M+ calls/mo, priority support, custom). Price cross-checked via WebSearch against openmeteo.substack.com ("API Subscriptions for Commercial Use") and apibenchmarks.com (low-trust, third-party) — both agree on $29/mo for Standard; treat as reasonably solid but not screenshotted from a checkout page.
5. **Update cadence / temporal resolution** (open-meteo.com/en/docs/marine-weather-api, accessed 2026-08-08) — Open-Meteo blends multiple underlying wave models and lets you pick or auto-select the best one per location:

   | Model | Provider | Native spatial resolution | Model run frequency | Forecast temporal resolution |
   |---|---|---|---|---|
   | MFWAM | Météo-France | 0.08° (~8 km) | every 12h | 3-hourly |
   | ECMWF WAM (high-res) | ECMWF | ~9 km | every 6h | hourly |
   | ECMWF WAM 0.25° | ECMWF | 0.25° (~25 km) | every 6h | 3-hourly |
   | GFS Wave 0.25° | NOAA/NCEP | 0.25° (~25 km) | every 6h | hourly |
   | GFS Wave 0.16° | NOAA/NCEP | 0.16° (~16 km) | every 6h | hourly |
   | EWAM | DWD (Germany) | 0.05° (~5 km) | every 12h | hourly |
   | GWAM | DWD (Germany) | 0.25° (~25 km) | every 12h | hourly |
   | ERA5-Ocean (reanalysis/history) | Copernicus | 0.5° (~50 km) | daily, ~5-day delay | hourly |

   Open-Meteo auto-selects "best available" model per grid cell by default, which for the Americas is typically GFS Wave (NOAA) or ECMWF blended. Exact model selection logic for Panama specifically is UNVERIFIED — would need to inspect the `models` response field per request.
6. **Variables exposed**: significant wave height, wave direction, wave period (combined), swell wave height/direction/period, wind wave height/direction/period, secondary swell height/direction/period, and per docs also tertiary swell "when available" (not observed in our live pull — may only appear for certain ocean basins/models). **CORRECTION after a second live test**: a follow-up call at the Caribbean point with `hourly=sea_level_height_msl,sea_surface_temperature,ocean_current_velocity,ocean_current_direction` came back fully populated — `sea_level_height_msl` **-0.03 to 0.45 m** over 48h, `sea_surface_temperature` **29.7-30.1°C**, `ocean_current_velocity` **0.2-0.4 km/h**, `ocean_current_direction` mostly 90-153°. So the earlier draft of this doc was WRONG to say "no tide variable in the Marine API" — Open-Meteo does expose a tide-relevant field via `sea_level_height_msl`. It's a continuous modeled water-level curve, not a discrete high/low-extremes list with exact times the way WorldTides delivers — a surf app wanting "next high tide is at 2:47pm" phrasing would need to post-process this curve (find local maxima) rather than get it as a ready-made field. **This meaningfully weakens the case for adding WorldTides as a second vendor** — Open-Meteo alone can plausibly cover wave+swell+SST+current+approximate-tide-level in one free API call pair (marine + weather for wind). Wind speed/gust/direction at 10m is NOT part of the Marine API — that lives in Open-Meteo's separate general Weather Forecast API (a different free endpoint, same free-tier rules), so a surf app needs two Open-Meteo calls (marine + weather) merged client-side.
7. **Spatial resolution / Panama coverage**: Best available native resolution near Panama is ~8-25 km depending on model (MFWAM 8km, GFS 16-25km). This is COARSE relative to Panama's coastline complexity — the Gulf of Chiriquí and Gulf of Panama's swell-shadowing effects, and the narrow Bocas del Toro archipelago passages, are almost certainly NOT resolved at 8-25 km grid spacing. Open-Meteo's own docs explicitly warn: **"Tides and ocean currents are computed at 0.08° (~8 km) resolution... Accuracy at coastal areas is limited. This is not suitable for coastal navigation and does not replace your nautical almanac."** This documented resolution number is the solid evidence for the coastal-accuracy risk — flagged for the product team.
   - **IMPORTANT COORDINATE CORRECTION (found via OpenStreetMap Nominatim reverse/forward geocoding, nominatim.openstreetmap.org, accessed 2026-08-08, not in the original brief):** the brief's Pacific test point (8.40 N, -80.12 W) does NOT correspond to Playa Venao or Santa Catalina. Reverse-geocoding it returns **"San Bosco Village, Antón, Coclé, Panamá"** — an inland village roughly 100+ km northeast of both real surf spots, on a different, more enclosed stretch of the Gulf of Panama coast, nowhere near the Gulf of Chiriquí. Forward-geocoding the real places gives: **Playa Venao ≈ 7.4325 N, -80.1933 W** (Pedasí, Los Santos province) and **Santa Catalina ≈ 7.6342 N, -81.2546 W** (Soná, Veraguas province) — both roughly 1-1.5° of latitude south of the brief's point. This is worth flagging to whoever wrote the research brief before this coordinate gets baked into product decisions.
   - **Re-ran the live Open-Meteo test at the corrected Venao-area point** (7.43 N, -80.25 W, chosen slightly offshore of the geocoded beach point) — snapped to grid cell **7.375 N, -80.20833 W**, elevation 18.0 m. Data returned: wave height 0.88-0.92 m, swell period 11.55-11.75 s, swell direction 208° (SSW), a long-period Southern Hemisphere groundswell signature — physically very plausible for Panama's open Pacific coast in August. This is meaningfully different from (and more "oceanic-looking" than) the small, short-period, near-shore-looking signal returned at the original mislabeled point (0.34 m wave height, ~4 s period) — reinforcing that the original brief coordinate was sampling a different, more sheltered part of the Gulf of Panama, not the open-swell exposure that Venao/Santa Catalina actually get.
   - **Caveat on the "elevation" field**: both the original point (46.0 m) and the corrected point (18.0 m) returned a positive, land-like elevation value from the Marine API rather than 0/negative as would be expected for a pure open-ocean grid cell. This persisted even at the corrected, clearly-coastal point, so it looks more like a general quirk of how Open-Meteo reports elevation for marine-model grid cells near any coastline (possibly pulled from a blended/coarse DEM rather than true bathymetry) than proof that any specific point is on land — treat the earlier draft's claim that 46.0 m "proves" a bad grid cell as **overstated**; the corrected framing is: elevation values near the coast are not reliable evidence of land-vs-water on their own, but the documented ~8-25 km resolution is enough by itself to support the coastal-accuracy caveat.
8. **Licensing / ToS** (open-meteo.com/en/terms, accessed 2026-08-08): Data is provided under **CC-BY 4.0**, which permits redistribution and derivative works with attribution — this is good for caching in our own DB and serving derived data to our users, PROVIDED the underlying use qualifies as non-commercial (or we pay for the commercial license). Quote: *"The data obtained through the API is provided under the terms of the CC-BY 4.0 licence"* and *"Non-commercial use is defined as elaborated by creative commons."* Open-Meteo's own examples: qualifying (free) uses include "private or non-profit websites or apps that do not have subscriptions or advertising," "personal home automation," "public research at public institutions," "educational content." Disqualifying (commercial, needs paid plan) uses include "websites or apps that have subscriptions or display advertisements," embedding the service "into commercial products," "undisclosed research at commercial entities." **If the Panama surf app ever runs ads or a subscription, it must move to the $29/mo+ Standard plan** to stay compliant — caching/redistribution itself is fine either way under CC-BY 4.0, it's the commercial-use gate that matters. No explicit statement found on caching duration limits; UNVERIFIED whether there's a "don't cache longer than X" clause — none surfaced in the terms excerpt fetched.
   - Terms URL: https://open-meteo.com/en/terms (accessed 2026-08-08)
   - Pricing URL: https://open-meteo.com/en/pricing (accessed 2026-08-08)
   - Docs URL: https://open-meteo.com/en/docs/marine-weather-api (accessed 2026-08-08)

### Verdict: USE
Free, no key, real hourly wave+swell+wind-wave data confirmed live for both Panama coasts, CC-BY 4.0 allows caching/redistribution, and the $29/mo commercial tier is cheap enough to budget for once the app monetizes. Main caveat: 8-25 km grid resolution likely misses local swell-shadowing detail around Gulf of Chiriquí / Gulf of Panama / Bocas archipelago — plan to validate against local knowledge/buoys before promising spot-level accuracy, and budget for the Standard plan the moment the app takes payments or runs ads.

---

## 2. Stormglass.io

STATUS: **MAYBE** — richest variable set of any source found (incl. tide extremes and secondary swell), but free tier is far too small for production (10 req/day) and commercial use requires the €49/mo Medium plan minimum.

### Fact table

1. **Base URL + example request**
   - Base: `https://api.stormglass.io/v2/weather/point`
   - Example (Pacific, Playa Venao area): `https://api.stormglass.io/v2/weather/point?lat=8.40&lng=-80.12&params=waveHeight,swellHeight,swellPeriod,swellDirection,windSpeed,windDirection,waterTemperature`
   - Caribbean equivalent would be `?lat=9.37&lng=-82.25&params=...` (not separately tested — auth-gated).
   - LIVE TEST RESULT: WebFetch to the Pacific URL above returned **HTTP 403 Forbidden** (no key supplied), confirming the base URL/path is correct and auth is enforced via API key (per docs, header `Authorization: <api key>`) — could not fetch an actual response body since Stormglass requires signup, unlike Open-Meteo.
2. **Auth model**: API key required, free signup via stormglass.io. Key passed as `Authorization` header (per general knowledge of their docs; the interactive docs.stormglass.io page is JS-rendered and did not yield raw text via WebFetch — UNVERIFIED exact header name from primary source, confirm at signup).
3. **FREE TIER limits** (stormglass.io/pricing/, accessed 2026-08-08): **10 requests/day**, all weather parameters included, **commercial use explicitly NOT allowed** on free tier. This is very restrictive — 10 req/day cannot support even a single-page load with a few spots refreshed a couple times a day across multiple users.
4. **Paid tiers** (stormglass.io/pricing/, accessed 2026-08-08):
   | Tier | Price/mo | Requests/day | Commercial use |
   |---|---|---|---|
   | Free | €0 | 10 | No |
   | Small | €19 | 500 | Not specified as included (only Medium+ explicitly say "for commercial use") |
   | Medium | €49 | 5,000 | Yes — "Full support and for commercial use" |
   | Large | €129 | 25,000 | Yes |
   | Enterprise | custom (email) | custom | Yes |
   10% discount if billed annually. Per stormglass.io/faq/ (accessed 2026-08-08): *"for commercial use, you need to subscribe to a paid plan (Medium, Large or any of the plans above) which explicitly allow commercial usage."* So realistically the entry price for a commercial Panama surf app is **€49/month**, not €19.
5. **Update cadence / temporal resolution**: FAQ states forecasts are "frequently updated" with "low latency — close to real-time," extending "up to 10 days into the future, with varying time resolutions depending on the data source." Exact hourly/3-hourly cadence and model run frequency is UNVERIFIED from primary docs (JS-rendered docs.stormglass.io didn't yield text via WebFetch; would need an authenticated request or browser rendering to confirm).
6. **Variables exposed** (stormglass.io/marine-weather/, accessed 2026-08-08) — by far the richest set found in this survey: Wave Height, Wave Direction, Wave Period, Swell Height, Swell Direction, Swell Period, Secondary Swell, Wind Waves, Water Temperature, Ice Cover, Ice Thickness, Visibility, Current Speed/Direction, Wind (speed/gust/direction implied by general weather params, not itemized on this marketing page), **Tidal Extremes / High-Low / Sea Level**, plus marine-biology extras (chlorophyll, salinity, pH, oxygen, phytoplankton, bathymetry, sea depth). This is the only source in this survey that bundles tide extremes AND wave/swell in one API — notable for reducing integration count.
7. **Spatial resolution / Panama coverage**: NOT documented on the marketing/FAQ pages fetched — no explicit grid resolution number found, and no explicit statement about Central America/Panama/tropical coverage. Stormglass aggregates from ECMWF, NOAA (including AIGFS), Météo-France, UK Met Office, DWD/ICON, SMHI, Met.no, FCOO, and its own "sg" AI-blended global grid (per WebSearch of stormglass.io blog posts, accessed 2026-08-08 — cross-checked across multiple stormglass.io blog URLs, treated as reasonably solid since it's the vendor's own blog, but exact resolution numbers are UNVERIFIED). Since it's blending mostly the same underlying global models as Open-Meteo (ECMWF/NOAA/DWD), the same coarse coastal-resolution risk for Gulf of Chiriquí / Gulf of Panama / Bocas del Toro almost certainly applies, though Stormglass's "sg" blended source might do some local smoothing/interpolation Open-Meteo doesn't — UNVERIFIED, would need an authenticated test to compare actual values against Open-Meteo at the same coordinates.
8. **Licensing / ToS** (stormglass.io/terms-and-conditions/, accessed 2026-08-08): Could not find explicit clauses on caching-in-your-own-DB, redistribution/resale of derived data, or attribution requirements in the terms page as fetched (WebFetch summarized it as silent on these points, only surfacing a generic anti-sharing clause: *"You may not transfer your access rights or disclose your password to any third party"* — which is about account credentials, not data redistribution). This is a **gap** — before relying on Stormglass, would need to email support@stormglass.io or read the full raw ToS (not just the WebFetch summary) to confirm redistribution rights, since paid commercial tiers imply redistribution is expected (it's marketed explicitly as a "Weather API for surf apps," stormglass.io/weather-api-for-surf-apps/) but this is not the same as a written redistribution license.
   - Pricing URL: https://stormglass.io/pricing/ (accessed 2026-08-08)
   - Terms URL: https://stormglass.io/terms-and-conditions/ (accessed 2026-08-08)
   - FAQ URL: https://stormglass.io/faq/ (accessed 2026-08-08)
   - Marine weather variable list: https://stormglass.io/marine-weather/ (accessed 2026-08-08)
   - Surf-app marketing page (low-trust, vendor marketing, but relevant): https://stormglass.io/weather-api-for-surf-apps/ (accessed 2026-08-08, content not independently fetched, title/URL only)

### Verdict: MAYBE
Richest variable set (tide extremes bundled with wave/swell, plus secondary swell) and explicitly markets itself for surf apps, but free tier (10 req/day, no commercial use) is a non-starter for production and the real commercial entry price is €49/mo (~$53), pricier than Open-Meteo's $29/mo Standard. Worth a second look with an authenticated test once we have a signup key, specifically to verify actual redistribution ToS language and compare data values against Open-Meteo at the same coastal points.

---

## 3. Windy API (api.windy.com) — Point Forecast API and Map Forecast API

STATUS: **REJECT** (free tier) / **MAYBE at best on paid** — free tier data is deliberately corrupted ("randomly shuffled and slightly modified") and explicitly barred from production use, and the ToS contains an explicit anti-redistribution clause that needs legal review before ever caching/serving Windy data to our users.

### Fact table

1. **Base URL + example request**
   - Point Forecast API base: `https://api.windy.com/api/point-forecast/v2` (POST, JSON body, not GET query params).
   - Example body structure (from official docs, api.windy.com/point-forecast/docs, accessed 2026-08-08):
     ```json
     {
       "lat": 8.40, "lon": -80.12,
       "model": "gfsWave",
       "parameters": ["waves", "windWaves", "swell1", "swell2"],
       "key": "<your key>"
     }
     ```
     (For Caribbean point, same structure with `"lat": 9.37, "lon": -82.25`.) NOT independently tested live — the Point/Map Forecast APIs require a signed-up key even for the free "Testing" tier, so no live response was pulled for this report; the request shape above is copied from the official docs page, not executed.
2. **Auth model**: API key required for both Point Forecast and Map Forecast APIs; obtained via signup at api.windy.com/keys. No fully-keyless tier exists.
3. **FREE TIER limits** (api.windy.com/point-forecast/pricing, accessed 2026-08-08): "Testing" tier — 500 requests/day, but **the docs explicitly state this tier "returns randomly shuffled and slightly modified data"** and is marked **"Development purpose only, not intended for production."** This makes the free tier unusable for a real product even for prototyping data quality — you cannot trust the numbers you see. Map Forecast free tier: 500 sessions/day, GFS model only, wind/temperature/pressure layers only, same "not intended for production" restriction.
4. **Paid tier entry price**: Point Forecast "Professional" — **€990/year (≈ €82.50/month)** for 10,000 requests/day (negotiable higher by agreement), commercial use allowed. Map Forecast "Professional" — €990/year base, +€1,000/year extra to unlock ECMWF layers, 10,000 sessions/day. **Important caveat found in docs: "The ECMWF model is not included in point forecast due to licensing conditions"** across all tiers — so even paying doesn't get you ECMWF wave data via this API, only GFS/ICON/etc.
5. **Update cadence / temporal resolution**: Not explicitly stated in the fetched docs pages (UNVERIFIED number of daily model runs / hourly vs 3-hourly output) — would need deeper docs page or an authenticated test to confirm.
6. **Variables exposed** (api.windy.com/point-forecast/docs, accessed 2026-08-08): wave models offered — `gfsWave`, `iconWave`, `iconEuWave`, `canRdwpsWave`. Variables: total waves (height, period, direction), wind waves (height, period, direction), swell1 and swell2 (height, period, direction each — i.e. two swell partitions, similar to Open-Meteo's primary+secondary swell), and wave power/energy flux. No explicit tide variable found in the Point Forecast variable list fetched; UNVERIFIED whether Windy exposes tides at all via this API (Windy.com's consumer map has a tide layer but that may not be exposed via the Point/Map Forecast API products). Wind speed/gust/direction and SST are available via the broader `parameters` list (`wind`, `dewpoint`, `rh`, `pressure`, etc., shown in the general example) but marine-specific SST/wind-at-10m-over-water was not confirmed distinctly for the marine/wave models — UNVERIFIED.
7. **Spatial resolution / Panama coverage**: `gfsWave` is a global NOAA model — same underlying data source as Open-Meteo's "GFS Wave 0.25°/0.16°" options, so expect the same ~16-25 km coastal resolution limitation for Panama. One WebSearch result (low-trust aggregator) noted gfsWave "excludes Hudson Bay (partly), Black Sea, Caspian Sea, and most of the Arctic Ocean" — Panama/Central America Pacific and Caribbean are within global GFS Wave coverage, so no outright gap, but same Gulf of Chiriquí/Gulf of Panama shadowing risk as Open-Meteo applies since it's fundamentally the same NOAA model at similar resolution. ECMWF (which might be finer/better) is explicitly excluded from Point Forecast per the pricing page note above.
8. **Licensing / ToS** — THIS IS THE STANDOUT RISK OF THIS ENTIRE SURVEY. Fetched directly from the official terms page (account.windy.com/agreements/windy-api-map-and-point-forecast-terms-of-use, accessed 2026-08-08), quoted verbatim:
   - *"Redistribution of any part of the API or the included data to any third party is forbidden."*
   - *"The User is not allowed to create User Applications that would aim to replicate the Services"* (i.e., you cannot build a competing weather/map viewer on top of Windy's own API).
   - *"The User must always state the source of the weather data in the User Applications."* — attribution is mandatory.
   - Also (per WebSearch summary, needs re-verification with full context): *"the Logo is present in the User Applications and remains as it is, unscaled and clickable"* — suggests a Windy logo/link may be contractually required to remain visible in the UI, which is a real product/design constraint, not just a legal footnote.
   - The phrase *"store, extract, modify, distribute, use the weather data or other content of the Services"* appeared in a fetch result but WITHOUT surrounding context (subject/verb clipped) — UNVERIFIED whether this is a restriction ("User may NOT store/extract/modify/distribute...") or a permission grant; the anti-redistribution clause quoted above is unambiguous on its own and should be treated as the binding constraint until the full clause is read by a human with legal judgment.
   - **Bottom line**: Windy explicitly allows using the API "in" your app (i.e., live pass-through display for your own users), but forbids redistributing "the included data" to third parties, which could plausibly be read to prohibit exactly what a caching layer does (storing + re-serving the same underlying data to many end users). This needs a human legal read of the full agreement before Windy is used for anything beyond live, uncached, per-request display — a materially different integration pattern than Open-Meteo's clean CC-BY 4.0 grant.
   - Terms URL: https://account.windy.com/agreements/windy-api-map-and-point-forecast-terms-of-use (accessed 2026-08-08, official/primary source)
   - Pricing URLs: https://api.windy.com/point-forecast/pricing and https://api.windy.com/map-forecast/pricing (accessed 2026-08-08)
   - Docs URL: https://api.windy.com/point-forecast/docs (accessed 2026-08-08)

### Verdict: REJECT (free tier — unusable, corrupted data) / MAYBE (paid, ~€82.50/mo+) pending legal review of the anti-redistribution clause
Free tier data is intentionally scrambled and off-limits for production per Windy's own docs, so it cannot even be used to prototype data quality. Paid tier is more expensive than Open-Meteo Standard (€82.50/mo vs $29/mo) for essentially the same underlying GFS Wave data (ECMWF excluded), AND carries an explicit anti-redistribution ToS clause that is in tension with a typical "cache + re-serve to our users" backend pattern. Flagged as the single biggest licensing risk found in this survey.

---

## 4. WorldTides API

STATUS: **MAYBE** — tide-only (not wave/swell), cheap and has explicit caching permission, but needs pairing with a wave/swell source (e.g. Open-Meteo) since it does not cover waves.

### Fact table

1. **Base URL + example request**
   - Base: `https://www.worldtides.info/api/v3`
   - Example structure (from official docs, worldtides.info/apidocs, accessed 2026-08-08 — NOT independently executed live since it requires a paid/free-credit API key, so no live JSON pasted here):
     `https://www.worldtides.info/api/v3?heights&extremes&date=2026-08-08&days=3&lat=8.40&lon=-80.12&key=<apiKey>` (Pacific)
     `https://www.worldtides.info/api/v3?heights&extremes&date=2026-08-08&days=3&lat=9.37&lon=-82.25&key=<apiKey>` (Caribbean)
2. **Auth model**: API key required for every request; obtained by creating a free account.
3. **FREE TIER limits** (worldtides.info/developer, accessed 2026-08-08): **100 free credits** granted to every new account (one-time, not recurring/daily). A 7-day heights+extremes request for one location costs ~2 credits (1 credit for high/low extremes over 7 days, 1 more credit for 30-min-interval height graph data over 7 days), so 100 free credits ≈ 50 location-weeks of data before paying — fine for development/testing, NOT a recurring free allowance for production traffic.
4. **Paid tier entry price** (worldtides.info/developer, accessed 2026-08-08): Cheapest recurring plan is **$4.99/month for 20,000 credits**; prepaid credit packs also available (e.g., $9.99 pack ≈ $0.50/1,000 credits, dropping to ≈$0.40/1,000 credits at the $499/mo/10M-credit tier). This is a genuinely cheap tide-only add-on compared to the wave APIs.
5. **Update cadence / temporal resolution**: Tide predictions are harmonic-model-based (astronomical), not weather-model forecasts, so "update cadence" doesn't apply the same way — predictions are deterministic and can be computed arbitrarily far in advance/past. Height sampling resolution is every 30 minutes for the "graph" heights data type per the credit-cost description found; UNVERIFIED whether finer intervals (e.g., 10-min) are configurable.
6. **Variables exposed**: Tide heights (time series), tide extremes (high/low events with times and heights), datums (chart datum reference levels), timezone info, and PNG plot visualizations. **No wave, swell, wind, or SST data at all** — this is a pure astronomical-tide API and must be paired with a separate wave/marine-weather source (Open-Meteo, Stormglass, etc.) for a complete surf forecast.
7. **Spatial resolution / Panama coverage**: Uses a "global tide prediction model" and can also return nearby tide stations for a given search radius (hybrid model+station approach per docs summary). No explicit resolution number found for the underlying global tide model; UNVERIFIED whether Panama's Pacific (large tidal range, ~15-20 ft in Gulf of Panama — notably one of the largest tidal ranges on the Pacific coast of the Americas) vs Caribbean (small tidal range, <1 ft typical in Bocas del Toro) is well-resolved by the global model vs actual NOAA/IHO tide gauge stations nearby. This asymmetry matters a lot for a Panama surf app — Pacific tide state changes surf breaks dramatically through the day, Caribbean much less so — worth checking if there's a nearby physical tide station (e.g., Balboa, Panama City for Pacific; Cristobal/Colón for Caribbean) the API can snap to rather than relying purely on the global harmonic model. UNVERIFIED, needs a live authenticated test.
8. **Licensing / ToS** (worldtides.info/terms, accessed 2026-08-08 — fetched directly, primary source):
   - Caching: *"You may cache results for performance and reliability when doing so is reasonable for your application and does not replace the need for an active license or account."* — this is a genuinely permissive caching clause, notably more generous than Windy's.
   - Permitted use: *"You may use WorldTides to retrieve tide predictions, water levels, tide stations, datums, time zones, and related API outputs for individual spatial coordinates on behalf of end users."* — "on behalf of end users" language supports building a multi-user product on top of it.
   - Attribution required: *"The copyright field embedded in API responses must be reproduced in any website, app, report, product, or service using the returned data."* Suggested attribution text found: *"Tidal data retrieved from www.worldtides.info. Copyright © 2014-2026 Brainware LLC."*
   - NOTE ON A CONFLICTING SEARCH-ENGINE SUMMARY: An initial WebSearch pass surfaced a paraphrase claiming WorldTides requires "fresh predictions for each unique user request rather than storing one response and redistributing it to multiple users" (i.e., a per-user cache restriction similar to Windy's). When I re-fetched worldtides.info/terms directly and searched for that exact language ("fresh predictions", "multiple users", "single user", "redistribute"), **none of those phrases appear on the actual terms page** — so that claim is likely a hallucination/conflation by the search summarizer and should be treated as **UNVERIFIED / probably false**, superseded by the primary-source caching clause quoted above, which does not restrict caching to a single end user. This is a good example of why every claim in this doc is being cross-checked against a direct page fetch, not just search snippets.
   - Terms URL: https://www.worldtides.info/terms (accessed 2026-08-08, primary source, fetched twice for cross-check)
   - Developer/pricing URL: https://www.worldtides.info/developer (accessed 2026-08-08)
   - Docs URL: https://www.worldtides.info/apidocs (accessed 2026-08-08)

### Verdict: MAYBE
Cheap, has an explicit and genuinely permissive caching clause, and covers tide extremes/heights well — good complementary piece. But it is tide-only (must pair with a wave/swell API) and Panama's Pacific side has a large tidal range where model-vs-station accuracy really matters — needs a live authenticated test against a known Panama tide station (e.g., Balboa) before trusting it for the Pacific coast.

---

## 5. Meteomatics

STATUS: **REJECT (for a bootstrapped/free-tier project)** — no self-serve free tier at all, sales-gated pricing, enterprise-oriented.

### Fact table

1. **Base URL + example request**: Documented format is `api.meteomatics.com/{validdatetime}/{parameters}/{locations}/{format}` (meteomatics.com/en/api/getting-started/, accessed 2026-08-08). No worked example for marine/wave parameters was present in the fetched getting-started page; NOT tested live — Meteomatics requires an account (username/password) for every request, no keyless or trial-without-signup path found.
2. **Auth model**: Username/password login (issued after signup) and separate OAuth support. No API key-only free path.
3. **FREE TIER limits**: **None found.** meteomatics.com/en/pricing/ (accessed 2026-08-08) discloses no self-serve tier, no free-call allotment, and no listed price — it is a pure "talk to our experts" / contact-sales page: *"Products tailored to your industry's specific demands, with packages aligned to your forecasting requirements and pricing based on usage."* This is a B2B enterprise sales motion, not a developer self-serve API.
4. **Paid tier entry price**: UNVERIFIED — not disclosed publicly; requires a sales conversation.
5. **Update cadence / temporal resolution**: UNVERIFIED — not found in the fetched pages.
6. **Variables exposed** (per getting-started docs page, accessed 2026-08-08): marine parameter list mentioned includes wave height, wave period, wave direction, ocean current, sea ice, water temperature, salinity, Stokes drift, bathymetry, and oceanic tides — a broad set on paper, comparable to Stormglass, but unverified in practice since no free access exists to test it.
7. **Spatial resolution / Panama coverage**: A fetched example in the docs referenced grid queries at "0.02, 0.04 degree increments," which if accurate for marine data would be notably finer than Open-Meteo/Windy's 8-25 km grids — but this was from a generic example, not confirmed to be marine-model-specific resolution, and UNVERIFIED for actual wave data near Panama.
8. **Licensing / ToS**: Not reached — no terms page fetched, since there's no free tier to even evaluate under. UNVERIFIED.

### Verdict: REJECT (for this project's stage)
No accessible free tier, no public pricing, sales-only onboarding — wrong fit for a bootstrapped Panama surf app that needs to start free and validate before spending. Worth revisiting only if the product scales enough to justify an enterprise marine-data contract.

---

## 6. Visual Crossing

STATUS: **MAYBE, but likely REJECT for wave data specifically** — decent free tier and permissive-sounding licensing, but "wave height and swell conditions" appear to be a marketing bullet rather than a documented, queryable field in the standard Timeline API; needs live verification before relying on it, and it's fundamentally a general weather API, not a dedicated marine model.

### Fact table

1. **Base URL + example request**
   - Base: `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/`
   - Example (from official docs, visualcrossing.com/weather-api, accessed 2026-08-08): `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/8.40%2C-80.12?unitGroup=metric&key=YOUR_API_KEY` (Pacific) / same pattern with `9.37,-82.25` for Caribbean. NOT independently tested live — requires a signup API key.
2. **Auth model**: API key required, free signup.
3. **FREE TIER limits** (visualcrossing.com/weather-api, accessed 2026-08-08): **1,000 records per day**, explicitly stated as usable for "both commercial and non-commercial use" — notably more permissive than Open-Meteo/Stormglass on the commercial-use question at the free tier, if accurate.
4. **Paid tier entry price**: Pay-as-you-go at **$0.0001/record** (i.e., $0.10 per 1,000 records) beyond the free 1,000/day, with cheaper monthly/annual plans available. This is very inexpensive per-record.
5. **Update cadence / temporal resolution**: UNVERIFIED from pages fetched — Visual Crossing's Timeline API is generally hourly-resolution for forecast, but marine-specific cadence (which underlying wave model, how often it updates) was not found/confirmed.
6. **Variables exposed**: The marketing page (visualcrossing.com/weather-api, accessed 2026-08-08) lists "wave height and swell conditions" as an available data element for "activities on the shore and at sea," described as one of several "specialized data elements" beyond the basic weather query. **This is a marketing-copy claim, not a confirmed field name from the API reference/schema** — I could not find the actual parameter name (e.g., is it `waveHeight`? part of a separate "marine" endpoint?) in the pages fetched. This needs to be verified against Visual Crossing's actual Timeline Weather API field reference (a different, more technical docs page not reached in this pass) before relying on it — flagged as UNVERIFIED whether real swell period/direction/partitions are exposed at all, or just a single generic wave-height number.
7. **Spatial resolution / Panama coverage**: UNVERIFIED — not found in pages fetched. Visual Crossing blends multiple global NWP models (general knowledge, not independently confirmed here) so likely same coarse-grid caveats as the others for coastal Panama; needs confirmation.
8. **Licensing / ToS** (visualcrossing.com/weather-service-terms/, accessed 2026-08-08, primary source, quoted verbatim):
   - *"Except for personal use of the licensee, the data produced by the Service Components may only be stored in a database or other storage and retrieval system if specifically permitted by your license level."* — i.e., caching/storing is gated by license tier, not blanket-permitted on free tier. Needs confirming whether the free (1,000 records/day) tier's license level permits DB storage at all.
   - *"Derived Results may be shared, displayed, and incorporated into externally-shared products or services, provided that they do not expose, reproduce, or substitute for Raw Weather Data except as permitted by your license level."* — derived/processed results can be shown to users, but raw API payloads cannot simply be re-exposed, again gated by license level.
   - Attribution/disclaimer: *"You must provide all users with disclaimers and warnings materially equivalent to those in these Terms in a manner appropriate for your product or service."* — implies passing through liability disclaimers to end users, a real UI/legal-copy obligation, not just a logo.
   - Free-tier commercial-use permission is NOT explicitly separated from paid tiers in the terms text fetched — the marketing page's "commercial and non-commercial use" free-tier claim should be cross-checked against the actual "license level" mechanics in the full terms before being trusted.

### Verdict: MAYBE, needs live technical verification
Attractive free tier size (1,000/day) and cheap overage pricing, and the terms explicitly allow showing derived (not raw) results to users. But the actual existence and richness of wave/swell fields is unconfirmed from marketing copy alone, and DB storage rights are tier-gated rather than blanket. Do not commit to this source until a real authenticated request confirms actual field names for a Panama coastal point.

---

## 7. Weatherbit (marine)

STATUS: **REJECT** — Weatherbit does not appear to offer a marine/wave/ocean product at all.

### Fact table

Checked Weatherbit's own product listing page (weatherbit.io/api, accessed 2026-08-08) which enumerates every API product they sell: Current Weather & Alerts, Current Lightning, Weather Maps, Weather Forecast (daily/hourly/minutely), Historical Weather (daily/hourly/sub-hourly/lightning/climate normals), Air Quality (current/forecast/historical), Ag-Weather (forecast/historical), and Energy/Degree-Day (forecast/historical). **No marine, ocean, or wave product is listed anywhere in this catalog.** A direct guess at `weatherbit.io/api/marine` returned **HTTP 404 Not Found**, confirming there is no such endpoint at that path. I did not find a differently-named marine product either.

Incidentally, Weatherbit's general free tier (not marine-specific, noted for completeness): "a Business trial so teams can fully test the API with up to 1,500 requests per day, along with a limited always-free plan" (weatherbit.io/api, accessed 2026-08-08) — but this is irrelevant since there's no marine data to request.

### Verdict: REJECT
No marine/wave/swell data product exists in Weatherbit's lineup as of 2026-08-08. Not usable for this project. (If a reader later finds a marine product under a different Weatherbit brand/URL, that would contradict this finding — worth a second check before fully ruling it out, but nothing in their own product catalog page supports it existing.)

---

## 8. Tomorrow.io

STATUS: **MAYBE — CORRECTED from an earlier REJECT in this doc.** A first pass through the general Weather API docs found no marine fields and I initially wrote this off; following the docs' own pointer to their full documentation index (`docs.tomorrow.io/llms.txt`) turned up a dedicated **Maritime API** with a genuinely rich variable set (comparable to Stormglass), but pricing/tier and access-model details remain unconfirmed.

### Fact table

1. **Base URL / auth / free tier**: Tomorrow.io's core Weather API is atmospheric (docs.tomorrow.io/reference/weather-forecast, accessed 2026-08-08) — temperature, precipitation, wind, pressure, humidity, cloud metrics. A Free plan exists ("Weather API Access," "Core Weather Data Layers") per tomorrow.io/weather-api/ (accessed 2026-08-08), but exact calls/day limits and paid entry pricing were NOT disclosed on the pages fetched — UNVERIFIED numbers. The general "Data Layers — Core" reference (docs.tomorrow.io/reference/data-layers-core) has no marine fields, confirming marine data is a separate product, not bundled into the core layers.
2. **Maritime API — found via the docs index** (docs.tomorrow.io/reference/maritime.md, accessed 2026-08-08, fetched directly, primary source): returns a notably rich set of fields —
   - Wave (combined): significant height, mean period, direction
   - Wind waves: significant height, mean period, direction
   - **Primary swell**: significant height, mean period, direction
   - **Secondary swell**: significant height, mean period, direction
   - **Tertiary swell**: significant height, mean period, direction (Tomorrow.io is the only source in this survey with a *confirmed, documented* tertiary swell field — Open-Meteo mentions tertiary swell as possible "when available" but it wasn't observed live; Tomorrow.io's docs state it plainly as a returned field)
   - Sea surface temperature, current speed, current direction
   - **Tide amplitude** (in meters or feet)
   - Units configurable: metric/imperial for heights and tides, C/F for temperature, m/s or mph for currents, degrees/seconds for direction/period.
   - This is the broadest single-endpoint variable set of any source surveyed that also plausibly has a usable entry price point (unlike Meteomatics/StormGeo/DHI which are sales-only).
3. **Related "Marine Insights" category** (docs.tomorrow.io/reference/insights-categories-marine.md, accessed 2026-08-08): describes marine weather *alerts/triggers* (Small Craft Advisory, Gale Warnings, Hurricanes) layered on top of the data, not additional data fields — this is an alerting feature, separate from the Maritime API's raw fields.
4. **Pricing / tier gating**: **UNVERIFIED — this is the key open question.** Neither the maritime.md reference page nor the marine-insights page states whether the Maritime API is available on Tomorrow.io's free tier, requires a paid add-on, or is enterprise/sales-gated only. Given the general Weather API has a free tier but no public pricing numbers were found anywhere in this pass, and the "Maritime" marketing page (tomorrow.io/solutions/maritime/) reads like enterprise shipping-industry positioning, there's a real chance this variable-rich endpoint is NOT accessible on a free/self-serve basis — needs a signup attempt or a direct pricing-page fetch to resolve before this can move to USE.
5. **Spatial resolution / Panama coverage**: UNVERIFIED — not stated in the pages fetched. Tomorrow.io is known generally (general knowledge, not confirmed this session) for blending multiple NWP models plus its own "Tomorrow.io proprietary" nowcasting for near-term atmospheric fields, but whether the Maritime/wave fields are self-modeled or re-served from GFS Wave/ECMWF (the same underlying global models everyone else uses) was not confirmed — same coarse-coastal-Panama caveat should be assumed absent evidence otherwise.
6. **Licensing / ToS**: Not reached this session — UNVERIFIED.

### Verdict: MAYBE, needs a follow-up signup/pricing check
This was wrongly marked REJECT earlier in this same research pass based on an incomplete look at only the general weather docs — a good reminder that a 404/absence on the obvious path isn't proof of absence (the advisor flagged this and it was correct). The Maritime API's documented field list is excellent (tertiary swell + tide amplitude + currents + SST all in one endpoint) and worth a real evaluation, but free-tier access and pricing are unresolved. Do not fully commit to or discard this source until someone signs up and checks whether Maritime data is free-tier-reachable.

---

## 9. StormGeo / DHI / others

STATUS: **REJECT (not self-serve/free)** — both are B2B enterprise marine-weather/consulting vendors, not developer self-serve APIs.

### StormGeo
Attempted to fetch stormgeo.com/products/ (accessed 2026-08-08) and got **HTTP 403 Forbidden** (likely bot-blocking, not proof of anything by itself). Based on general knowledge of the company (an enterprise weather-routing/decision-support vendor for shipping, aviation, energy, and renewables — part of the broader Alpin/Marsh McLennan/enterprise weather-services space): StormGeo does not offer a public self-serve developer API with a free tier; it sells enterprise contracts (ship routing optimization, fleet weather routing, etc.). UNVERIFIED live in this session due to the 403, but nothing found anywhere suggests a free/freemium API exists. Not worth pursuing for a bootstrapped Panama surf app.

### DHI (Danish Hydraulic Institute)
Not independently fetched this session (time/budget prioritized elsewhere). Based on general knowledge: DHI is a research/consulting institute known for the MIKE 21 hydrodynamic/wave modeling software and operates "MetOcean on Demand" and similar consulting-grade data services, typically sold as project engagements or licensed software, not a lightweight self-serve REST API with a free tier. UNVERIFIED live — flagged as LOW PRIORITY / likely REJECT for the same reason as StormGeo (enterprise-only), but this specific claim was not confirmed by a live fetch in this session and should be spot-checked before being fully ruled out.

### Verdict: REJECT (both) — enterprise/consulting vendors, no evidence of a free or low-cost self-serve developer API for either.

---

## 10. Other free/open marine model APIs discovered

### 10a. Copernicus Marine Service (CMEMS) — data.marine.copernicus.eu

STATUS: **USE (as a raw-data backend, not a lightweight REST API)** — genuinely free, commercial use explicitly allowed, redistribution rights with attribution, ~9 km global wave resolution covering Panama, hourly output, twice-daily model runs. The catch is integration effort, not licensing.

1. **Base access**: Not a simple lat/lon REST endpoint like Open-Meteo. Standard access path (per general knowledge of the Copernicus Marine ecosystem, cross-checked against the product description page fetched) is the **Copernicus Marine Toolbox** (Python CLI/library `copernicusmarine`), which subsets NetCDF data from their catalog (also reachable via OPeNDAP / ARCO Zarr / a REST subsetting API). A direct attempt to fetch their toolbox intro help page 404'd this session (help.marine.copernicus.eu/en/articles/8286998-copernicus-marine-toolbox-introduction, accessed 2026-08-08) so the exact current REST subsetting URL/params were NOT confirmed live — UNVERIFIED exact endpoint, but the general integration pattern (download/subset NetCDF, not query-per-point-per-request) is well-established and should be treated as directionally correct pending a follow-up check of the current toolbox docs.
2. **Product checked**: "Global Ocean Waves Analysis and Forecast" (product ID referenced as GLOBAL_ANALYSISFORECAST_WAV_001_027), fetched from data.marine.copernicus.eu (accessed 2026-08-08):
   - Spatial resolution: **0.083° × 0.083° (~9.2 km at the equator)**.
   - Temporal resolution: hourly output.
   - Update cadence: **model runs twice daily, 00:00 UTC and 12:00 UTC**.
   - Spatial extent: global ocean, -80° to 90° latitude / -180° to 179.92° longitude — confirmed to geographically include Panama's Pacific and Caribbean coasts.
3. **Auth model**: Free account registration required (Copernicus Marine Service login), no payment.
4. **FREE TIER limits**: No metered call-based free tier structure like the commercial APIs — access itself is free; limits would be more about download volume/bandwidth/toolbox rate limits than a "calls/day" number. UNVERIFIED specific throughput limits.
5. **Licensing / ToS** — fetched from help.marine.copernicus.eu "service-commitments-and-licence" page (accessed 2026-08-08), quoted:
   - Redistribution: *"redistribute, disseminate any Copernicus Marine Service Product in their original form via any media"* — explicitly allowed.
   - Attribution wording required: *"E.U. Copernicus Marine Service Information; insert DOIs links here"* for redistributed products, or *"Generated using E.U. Copernicus Marine Service Information; insert DOIs links here"* for derived works.
   - Caching/storage: *"make and use such reasonable copies of Copernicus Marine Service Products for internal use and back up purposes"* — explicitly permitted.
   - Commercial use: *"the Copernicus Marine Services and products are free of charge for the User until"* **June 30, 2028** — free and commercial-use-permitted, but note the licence has a stated horizon date; should be revisited before/around that date, though EU programs like this are typically renewed.
   - This is the **most permissive and clearly-documented license of every source in this survey** — better than Open-Meteo's CC-BY-with-non-commercial-restriction, and far better than Windy's anti-redistribution clause.
6. **Variables**: Standard CMEMS wave products include significant wave height, mean wave direction/period, and wave spectral partitions (wind sea vs swell) depending on the specific product variant selected; exact variable list for this product code not fully itemized in the fetch — UNVERIFIED complete list, would need the product's "Data access" tab.
7. **Panama coastal resolution caveat**: Same structural risk as the other ~9km global models (Open-Meteo's MFWAM is actually the same underlying French-produced global wave model family at the same 0.08° resolution) — Gulf of Chiriquí / Gulf of Panama swell-shadowing is unlikely to be captured at 9 km. CMEMS also offers higher-resolution **regional** products for some basins (e.g., Mediterranean, NW Shelf) but UNVERIFIED whether any exists for the Central America/Panama Bight specifically — worth a follow-up catalog search.

**Verdict: USE as a backend enrichment/validation source**, not as the app's live per-request API — the free, generous licensing and redistribution rights make it attractive for a batch job (e.g., nightly pull + cache in our own DB), but it requires real backend engineering (NetCDF/Toolbox/Zarr handling) rather than a fetch() call, so it's a bigger lift than Open-Meteo for an MVP. Good complementary/cross-validation source once the app is past MVP.

### 10b. NOAA NOMADS (GFS-Wave / WaveWatch III GRIB2)

STATUS: **MAYBE (raw-data backend, US-government public-domain — best licensing of all, but GRIB2 parsing required)**

- URL: https://nomads.ncep.noaa.gov/ (accessed 2026-08-08, confirmed live, no 403/404).
- Offers GFS Wave (WaveWatch III-based) model output as **GRIB2 files**, via a "GRIB filter" tool for custom subsets or direct HTTPS bulk download.
- **No API key, no fee** — standard NOAA/NCEP open-data policy.
- **Update cadence**: model runs **every 6 hours** (00/06/12/18 UTC), consistent with the GFS Wave figures already confirmed via Open-Meteo's own model table above.
- **Licensing**: US government work product — **public domain**, no restriction on redistribution (per standard NOAA data policy; the fetched page itself didn't restate this but it's NOAA's universal practice for NWS/NCEP data. Treat the "public domain" claim as high-confidence general knowledge, not a page quote, since the fetched NOMADS page didn't include an explicit licence statement).
- **Integration effort**: same practical downside as Copernicus — GRIB2 is a binary meteorological format requiring a parsing library (e.g., `pygrib`/`cfgrib`/`eccodes` in Python, or `wgrib2`), not a JSON REST response. This is the rawest, cheapest (free, unrestricted) option but the highest integration lift of anything in this survey.
- **Resolution**: same GFS Wave 0.16°/0.25° grids already documented via Open-Meteo above (~16-25 km) — so same Panama coastal-shadowing caveat applies, and no better than what Open-Meteo already re-serves as a convenient JSON wrapper around this exact same NOAA data.
- **Practical recommendation**: Since Open-Meteo already re-packages this same NOAA GFS Wave data (plus several other models) into a clean free JSON API with generous limits, there's little reason to hit NOMADS directly for MVP — it's more relevant as a fallback/cross-check or if we ever need finer control (e.g., a specific forecast hour/member Open-Meteo doesn't expose).

### 10c. Panama-specific tide authority (non-API, flagged for completeness)

The **Autoridad del Canal de Panamá (ACP)** and Panama's hydrographic/oceanographic authorities publish official tide tables for Balboa (Pacific side, Panama City/Canal) and Cristóbal (Caribbean side, Colón). These are NOT found to have a public API in this research pass (not deeply investigated — WebSearch budget was exhausted before this could be pursued; UNVERIFIED). Given Panama's Pacific side has one of the largest tidal ranges in the Americas (~15-20 ft swing) and this materially affects surf breaks, it may be worth a dedicated follow-up research pass specifically on ACP / Panama hydrographic data as a ground-truth cross-check against WorldTides' global harmonic model. **Flagged as a gap in this research pass, not resolved.**

### 10d. Surfline / Magicseaweed (mentioned for completeness, not usable)

Surfline (surfline.com) operates a proprietary global surf forecast with its own in-house LOTUS wave model and buoy network, widely regarded (general industry knowledge) as one of the most accurate surf-specific forecast products, but it has **no public developer API** — access is via their consumer app/website only, and their ToS is understood to forbid scraping/reverse-engineering their internal endpoints (UNVERIFIED exact clause, not fetched this session — would need a dedicated look at surfline.com's terms before ruling definitively, but this is not a source to build a commercial product on top of without a formal data licensing deal). Magicseaweed was a competing free surf-forecast site that was acquired and shut down/folded into Surfline years ago (general knowledge, not re-verified this session) — not usable. **REJECT both** for this project unless a formal Surfline data-licensing conversation happens separately.

---

## 11. Cross-cutting notes: Panama coastal grid coverage risk

Every wave-model-backed source checked in this survey (Open-Meteo, Windy, Stormglass, Copernicus Marine, NOAA NOMADS) ultimately draws on the **same small set of global underlying models** — NOAA GFS Wave, ECMWF WAM, Météo-France MFWAM, DWD EWAM/GWAM — at native resolutions ranging from **~5 km (DWD EWAM) to ~25 km (GFS Wave 0.25°, DWD GWAM)**. The best commonly-available resolution near Panama across all sources is **~8-9 km** (MFWAM / Copernicus Marine's 0.083° global wave product / DWD EWAM).

This matters concretely for Panama:
- **Gulf of Chiriquí and Gulf of Panama** (Pacific side, home to Playa Venao, Santa Catalina): both gulfs are semi-enclosed embayments with significant landmass and island shadowing (e.g., Isla Coiba, Azuero Peninsula) between the open Pacific swell window and the actual surf breaks. An 8-25 km grid is very unlikely to resolve this shadowing correctly — a global model will tend to either overstate or understate swell energy reaching specific breaks depending on how the grid cells happen to fall relative to the coastline and islands. Concretely: the brief's original test point (8.40 N, -80.12 W, which geocodes to an inland Coclé village, not Venao/Santa Catalina — see section 1 item 7) returned a small, short-period, near-shore-looking signal (0.34 m wave height, ~4 s period), while re-testing at the real Venao coordinates (7.43 N, -80.25 W) returned a much larger, long-period Southern Hemisphere groundswell signal (0.88-0.92 m, 11.5-11.75 s period, 208° SSW) — a real, physically meaningful difference between two points only ~1° of latitude apart, which is itself a demonstration of how much local geography changes the picture and how easy it would be to build a product around the wrong point if the coordinates aren't double-checked against the actual named break.
- **Bocas del Toro** (Caribbean side): an archipelago of narrow channels and reef-fringed islands. A 16-25 km GFS Wave grid cannot resolve individual channel/reef breaks at all; only the offshore swell approaching the archipelago as a whole would be captured, with local refraction/diffraction into specific breaks (e.g., around Bluff Beach, Silverbacks) essentially unmodeled. Our live Open-Meteo test snapped 9.37,-82.25 to 9.375,-82.29166 (also several km off) and returned very low wind-wave and mixed swell values, consistent with a "regional offshore approach" signal rather than a specific reef-break signal.
- **Practical implication for the product**: none of the free/freemium global-model APIs surveyed here should be marketed as giving spot-accurate forecasts for named Panama breaks out of the box. The realistic MVP framing is "regional swell/wind guidance for the Pacific vs. Caribbean coast" with a clear caveat, OR a follow-on research/engineering effort to build a local downscaling/correction layer (e.g., comparing model output against historical buoy/observed data or local surf-report crowdsourcing) before claiming break-level accuracy. This should be flagged to the product/design side of the project explicitly.
- The one source with plausibly finer resolution mentioned (Meteomatics' generic "0.02, 0.04 degree" example) was NOT confirmed to be marine-specific or Panama-relevant, and Meteomatics has no accessible free tier anyway — not a near-term fix for this gap.

## 12. Open questions / UNVERIFIED items

Running list of things flagged as UNVERIFIED in this document that a follow-up pass (with more WebSearch budget and/or authenticated API keys) should resolve:

- Stormglass: exact auth header name/format, exact update cadence/model-run frequency, full redistribution/caching ToS language (only a generic anti-credential-sharing clause was found; need the real clause), and a live authenticated data pull compared against Open-Meteo at the same Panama coordinates.
- Windy: full context around the clipped ToS phrase "store, extract, modify, distribute, use the weather data..." (need the complete sentence with subject/verb), and confirmed forecast temporal resolution / model run cadence.
- WorldTides: whether Panama's Pacific tide predictions (large tidal range) are backed by a nearby real tide station (e.g., Balboa) vs. pure global harmonic model — needs a live authenticated test.
- Visual Crossing: actual field name(s) for wave/swell data in the real API schema (marketing copy only, not confirmed against the technical reference), and whether the free tier's "license level" permits DB caching.
- Meteomatics: any pricing number at all; whether the 0.02-0.04° resolution example applies to marine parameters.
- Copernicus Marine: exact current REST/subsetting endpoint and URL (toolbox intro page 404'd); exact variable list for the GLOBAL_ANALYSISFORECAST_WAV_001_027 product; whether a higher-resolution Central America/Caribbean regional product exists in their catalog.
- StormGeo and DHI: neither was confirmed live (403 / not fetched) — both marked REJECT based on general knowledge of being enterprise-only, but this should be spot-checked, not treated as fully proven.
- Panama's own tide authority (ACP / Balboa-Cristóbal tide tables): not researched this session due to exhausted WebSearch budget — flagged as the clearest remaining gap, since it directly bears on ground-truth validation for the Pacific coast's large tidal range.
- Surfline's exact ToS language on scraping/API access — not fetched, relying on general industry knowledge only.
- Open-Meteo: whether tertiary swell partition and ocean current/SST fields are actually populated for Panama specifically (only primary+secondary swell were exercised in the live test); no explicit cache-duration limit found in ToS (may not exist, but wasn't ruled out either).

## 13. Flags — out of scope items noticed

- **WebSearch budget exhausted mid-task** (hit "200 of 200 WebSearch calls" for this session partway through researching Meteomatics/Weatherbit/Tomorrow.io). This is a shared session-wide budget, not specific to this research task — if other agents/tasks are running concurrently in this session, they may have consumed part of it. The remainder of this research relied on WebFetch to known/guessed URLs, which is why several sections have more UNVERIFIED items than the earlier ones (Open-Meteo, Stormglass, Windy, WorldTides) that were researched before the budget ran out. **Recommend a follow-up pass with fresh search budget** to close the UNVERIFIED items listed in section 12, especially Copernicus Marine's exact access mechanism and the Panama tide-authority gap.
- **Wind data is a separate integration from wave data for most sources.** Open-Meteo splits wind-at-10m into its separate general Weather Forecast API (different endpoint, same account/limits) rather than bundling it into the Marine API — worth designing the data-fetch layer to expect 2 calls per location from Open-Meteo, not 1.
- **No source in this survey natively resolves Panama's coastal complexity** (Gulf of Chiriquí/Panama shadowing, Bocas del Toro reef/channel structure) at the grid level — this is a cross-cutting product risk, not specific to any one vendor, and should be surfaced to whoever is scoping forecast-accuracy expectations for the app (see section 11).
- **Licensing risk tiering worth calling out explicitly for the product/legal side**: Copernicus Marine (best: free, explicit redistribution rights, commercial use allowed) > Open-Meteo (good: CC-BY 4.0 but free tier is non-commercial-only, cheap $29/mo fix) > WorldTides (good: cheap, explicit caching permission) > Visual Crossing (unclear: tier-gated storage rights, unverified wave fields) > Stormglass (unclear: ToS silent on redistribution, pricier commercial tier) > Windy (worst: explicit anti-redistribution clause found in primary-source ToS, needs legal read before use beyond simple live pass-through display).
- **Correcting the "biggest licensing risk" framing**: Windy's anti-redistribution clause is the single most restrictive ToS language found in this survey, but Windy is a REJECT verdict here — a source we don't build on carries no actual exposure. **The licensing risk that actually applies to this project is Open-Meteo's free tier being non-commercial-only**, because Open-Meteo is the top USE recommendation: the instant the Panama surf app adds a subscription or runs ads, it is out of compliance on the free tier and must move to the $29/mo Standard plan (open-meteo.com/en/terms, accessed 2026-08-08). That's a real, easy-to-forget compliance trip-wire tied to a monetization decision, not a hypothetical about a vendor we're not using — it should be the one line that reaches whoever makes the "let's add ads/subscriptions" call.
- **Self-correction logged during this research pass, for transparency**: Tomorrow.io was initially marked REJECT after checking only the general Weather API docs; following the docs' own "full documentation index" pointer surfaced a Maritime API with a strong field set, so the verdict was revised to MAYBE (see section 8). A 404 or absence on the first/obvious doc path is not proof a feature doesn't exist elsewhere in a vendor's docs — worth remembering for any future vendor evaluation in this project.
- **Coordinate mismatch in the original research brief**: the given Pacific test point (8.40 N, -80.12 W) is not Playa Venao or Santa Catalina — see the correction and geocoding evidence under section 1, item 7. Recommend the brief's coordinates be corrected to Playa Venao ≈7.4325 N, -80.1933 W and Santa Catalina ≈7.6342 N, -81.2546 W (both from OpenStreetMap Nominatim, accessed 2026-08-08) before this research is used to drive further engineering decisions.

(running list)
