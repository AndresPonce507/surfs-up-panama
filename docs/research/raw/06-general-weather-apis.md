# General Weather APIs (wind, rain, gusts, temp, pressure, lightning) — Raw Research

Research date: 2026-08-08. Compiled by research subagent. All prices/limits verified
by WebFetch against live provider pages on this date unless marked UNVERIFIED
(could not retrieve current authoritative figure — JS-rendered price table, 403,
or "contact sales" gate). Do not treat UNVERIFIED numbers as fact.

Scope: general-purpose weather APIs (not marine-specific) evaluated for a Panama
surf-forecast app polling roughly N=20-40 coastal points at hourly-or-better
refresh.

## Core call-volume math (used throughout)

| Scenario | Calls/day |
|---|---|
| N=30 spots, hourly poll | **720** |
| N=30 spots, every 15 min | **2,880** |
| N=40 spots, hourly poll | **960** |
| N=40 spots, every 15 min | **3,840** |

**Architecture note that matters for every row below:** if the backend fetches
each spot ONCE per model run (server-side cron) and caches/serves the result
from a DB to unlimited end users, call volume is capped at the numbers above
regardless of site traffic. This is what makes several "free tier" ceilings
survivable that would otherwise not survive per-user-request traffic. Stated
explicitly per provider.

Status key: USE / MAYBE / REJECT.

---

## Table of contents

1. Open-Meteo
2. OpenWeatherMap (One Call 3.0)
3. Tomorrow.io
4. WeatherAPI.com
5. Visual Crossing
6. Weatherbit
7. Meteosource
8. AccuWeather
9. Meteomatics
10. Pirate Weather
11. Windy Point Forecast API
12. Google Weather API
13. Apple WeatherKit
14. NOAA/NWS api.weather.gov (Panama coverage check)
15. Multi-model ensemble access comparison
16. Cross-cutting call-volume verdict table
17. Open questions / UNVERIFIED items
18. Final summary — cheapest legal stack

---

## 1. Open-Meteo

STATUS: **USE (with a paid Standard plan once the app is commercial)**

- **Free tier ceiling:** 10,000 calls/day, 5,000/hour, 600/minute, 300,000/month.
  Source: https://open-meteo.com/en/pricing (fetched 2026-08-08).
- **Rate limit:** 600 calls/minute (free tier).
- **Commercial use allowed on free tier: NO.** Exact license text from
  https://open-meteo.com/en/terms (fetched 2026-08-08):
  > "Using our service for private or non-profit websites or apps that do not
  > have subscriptions or advertising" is allowed for free.
  > Commercial use is explicitly defined as: "Operating websites or apps that
  > have subscriptions or display advertisements" and "Integrating our service
  > into commercial products or promotional activities."
  > "If you plan to use our service for commercial purposes or require
  > additional API calls, we kindly request you to consider subscribing to
  > our API plans."
  This means the trigger is **commercial status of the app (ads/subscriptions),
  not just call volume** — a surf app that runs ads or paid tiers must pay
  regardless of whether it stays under 10,000 calls/day.
- **First paid tier price:** **Standard plan, $29/month, 1,000,000 calls/month**
  (confirmed via https://openmeteo.substack.com/p/api-subscriptions-for-commercial,
  fetched 2026-08-08 — the official pricing page itself does not display $
  amounts, only call-volume tier names, so this figure is corroborated from
  Open-Meteo's own Substack post about the same subscription product).
  Professional: $99/month, 5,000,000 calls/month (adds Historical, Ensemble,
  Climate Change APIs). Enterprise: custom, contact info@open-meteo.com.
- **Variables:** temperature, wind speed/direction/gusts, precipitation,
  pressure, cloud cover, humidity, solar radiation, CAPE, visibility, soil
  moisture; separate free Marine API for waves/swell (see doc 01).
- **Update cadence:** model-dependent — GFS/HRRR/ARPEGE/AROME/UKMO/Harmonie
  update hourly; ICON/KMA/JMA/GEM/ECMWF every 3-6 hours.
- **Panama coverage:** global gridded models (GFS, ICON, ECMWF) all cover
  Panama at native model resolution (no regional high-res model for Central
  America specifically) — good, not exceptional.
- **Call-math verdict:** 720/day and 2,880/day both comfortably clear the free
  numeric ceiling (10,000/day) — the binding constraint is NOT volume, it's
  the commercial-use clause. **Caching one call per model run does not change
  the legal requirement to pay** once the app has ads/subscriptions — Open-Meteo's
  ToS gates on app monetization status, not on request count. Once monetized,
  $29/mo Standard plan (1M calls/month = ~33,000/day) covers even 15-min
  polling at N=40 (3,840/day) — but see the call-weighting caveat immediately
  below before assuming that headroom is real.
- **Call weighting (multi-model requests are NOT flat-rate — verify before
  committing budget):** Exact quote from https://open-meteo.com/en/pricing
  (fetched 2026-08-08): *"Requests for data covering more than 10 weather
  variables or extending over a period of more than 2 weeks for a single
  location are considered multiple API calls... To calculate the number of
  API calls accurately, fractional counts are used. For example, a request
  for 2 weeks of data with 15 weather variables will be calculated as 1.5
  API calls, while 4 weeks of data equals 3.0 API calls."* This directly
  affects the confidence-score use case: pulling ~6 core wind/wave variables
  x 4 models (`models=gfs_seamless,icon_seamless,ecmwf_ifs04,arpege_europe`)
  for one point is at least 24 variable-model combinations, i.e. likely
  **>10** by whatever counting rule Open-Meteo applies internally — the exact
  fractional formula for "variables x models" (as opposed to "variables x
  weeks") was NOT found in this pass and is **UNVERIFIED**. Worst-case
  illustrative estimate: if each model materially multiplies the "variable
  count" the way weeks do (24 vars/10 ≈ 2.4x), N=30 spots x 24 hourly polls x
  2.4 ≈ 1,728 call-equivalents/day ≈ 51,800/month — still well inside the 1M
  calls/month Standard plan (only ~5% of quota), so the $29/month
  recommendation likely still holds, but the exact multiplier should be
  confirmed with one live multi-model test call against the account's usage
  dashboard before finalizing the budget.

---

## 2. OpenWeatherMap (One Call 3.0)

STATUS: **MAYBE — cheap at low volume with server-side caching, but per-call billing needs a hard cap**

- **Free tier ceiling:** 1,000 calls/day included free ("One Call by Call"
  subscription model). Source: https://openweathermap.org/api/one-call-3
  (fetched 2026-08-08).
- **Rate limit:** documented only as "429 if quota exceeded"; no published
  calls/minute figure for One Call 3.0 specifically (general API plans show
  60 calls/min on the free tier of the older/other product family).
- **Commercial use allowed on free tier:** No explicit prohibition found in
  the One Call 3.0 docs (unlike Open-Meteo, Weatherbit); treat as allowed but
  UNVERIFIED against full ToS — recommend a manual re-check before shipping.
- **First paid tier price:** Beyond the free 1,000 calls/day, additional
  calls are billed pay-as-you-go at **0.15 USD per 100 calls = $0.0015/call =
  $1.50 per 1,000 calls**. Source: https://home.openweathermap.org/subscriptions/unauth_subscribe/onecall_30/base
  (fetched 2026-08-08, exact quote: "One Call 3.0 API subscription, Base
  plan, 0.15 USD per 100 calls (VAT is not included)"). Note: OpenWeatherMap
  also sells a separate, older "Current Weather Data" product family with
  named tiers (Startup/Developer/Professional/Expert) at 600-100,000
  calls/min, but their exact $/month prices did not render via fetch —
  UNVERIFIED, and that product is not One Call 3.0 (fewer combined
  variables/no minutely+daily+alerts bundle).
- **Variables:** current + minutely (1hr) + hourly (48hr) + daily (8-day) +
  government alerts + historical back to 1979, in one call: temp, feels-like,
  pressure, humidity, dew point, cloud cover, UV index, visibility, wind
  speed/gust/direction, precip (rain/snow).
- **Update cadence:** "updated every 10 minutes" per OpenWeatherMap's own
  recommendation for polling frequency.
- **Panama coverage:** global model-based (GFS-derived blend), acceptable but
  not high-resolution regional data for Central America.
- **Call-math verdict:** N=30 hourly (720/day) fits inside the free 1,000/day
  ceiling with ZERO paid calls IF cached once per model run server-side (not
  per user). N=30 every 15 min (2,880/day) blows past free tier by 1,880
  calls/day -> at $0.0015/call that's **$2.82/day = ~$85/month** just for the
  overage, i.e. cheaper to just pay for volume than to under-provision. N=40
  hourly (960/day) still fits free. N=40 15-min (3,840/day) costs
  ~$4.26/day (~$128/mo) in overage. **Caching per model run, not per user, is
  what keeps this on the free tier at hourly cadence** — per-user calls would
  blow the 1,000/day ceiling almost immediately with real traffic.

---

## 3. Tomorrow.io

STATUS: **REJECT for this use case (free tier structurally too small; paid pricing opaque)**

- **Free tier ceiling:** Reported by third-party coverage as up to 500
  requests/day (unable to get first-party confirmation — Tomorrow.io's own
  pricing page at https://www.tomorrow.io/weather-api/pricing/, fetched
  2026-08-08, does NOT show a numeric call limit; it instead lists the free
  tier as **"1 Automatically monitored Location"** with a 5-day forecast).
  That single-location cap alone disqualifies the free tier for a 20-40 spot
  app regardless of the call-count question.
- **Rate limit:** UNVERIFIED — not disclosed on the current pricing page.
- **Commercial use allowed on free tier:** UNVERIFIED — not stated on the
  fetched page.
- **First paid tier price:** UNVERIFIED. The pricing page shows only Free and
  Enterprise ("Contact us for Offer") — Tomorrow.io appears to have moved to
  a sales-gated, non-self-serve pricing model as of this research date; no
  public $/month figure could be retrieved via WebFetch (page renders "..."
  placeholders where numbers would be) or WebSearch (403 on support articles).
- **Variables:** broad — "40+ key weather data fields" on free tier including
  temperature, dewpoint, wind speed; paid/enterprise adds air quality,
  pollen, solar, soil, aviation, fire, flood, **lightning**, maritime.
- **Update cadence:** "by-minute forecasting" mentioned for Enterprise;
  standard cadence UNVERIFIED for free tier.
- **Panama coverage:** UNVERIFIED in detail; Tomorrow.io markets global
  coverage via its own proprietary model blend + radar network, but its
  proprietary radar/nowcast advantage is US/EU-centric — Panama would fall
  back to global NWP blend quality, comparable to competitors.
- **Call-math verdict:** irrelevant at this stage — the free tier's
  1-monitored-location cap and the absence of any public self-serve paid
  price make Tomorrow.io impractical to budget for a 20-40 spot Panama app
  without a sales call. REJECT unless a sales quote comes back competitive.

---

## 4. WeatherAPI.com

STATUS: **USE — cheapest transparent paid tier of the group, explicit commercial-use YES**

- **Free tier ceiling:** 100,000 calls/month (~3,333/day average, but it's a
  hard monthly cap not a daily one). Source: https://www.weatherapi.com/pricing.aspx
  (fetched 2026-08-08).
- **Rate limit:** UNVERIFIED exact calls/second cap; not displayed on the
  pricing table itself.
- **Commercial use allowed on free tier: YES.** The pricing comparison table
  shows a "Commercial Use" row with a checkmark across every plan including
  Free (fetched 2026-08-08 pricing page).
- **Free-tier feature gating (important — this is NOT the full product on
  free):** fetched the full Free-column feature list from
  https://www.weatherapi.com/pricing.aspx (2026-08-08). Free plan gives:
  **Forecast/Future Weather: 3 Day only** (not the 14-day max the product
  supports on paid plans), **Historical Weather: past 1 day only**,
  Frequency: Daily and Hourly (hourly IS included, unlike Weatherbit's free
  tier), but **Marine Weather: 1 Day, daily-interval only, no tide data**.
  For an hourly wind/rain refresh loop keyed off "now + next few hours" this
  3-day cap is fine; it rules out using free-tier WeatherAPI.com for any
  multi-day outlook or as a wave/tide source.
- **First paid tier price:** **Starter, $7/month (or $75/year), 3,000,000
  calls/month.** Next: Pro+ $25/mo (5M calls), Business $65/mo (10M calls),
  Enterprise custom.
- **Variables:** current, forecast, historical, astronomy, alerts, air
  quality, marine (tide/wave add-on — gated to paid plans for full range, see
  above), sports; standard set includes wind speed/gust, precipitation,
  temperature, pressure.
- **Update cadence:** UNVERIFIED exact refresh interval from the fetched
  page; commonly cited elsewhere as hourly-updated forecast data.
- **Panama coverage:** UNVERIFIED in fine detail; global model-based coverage,
  no Panama-specific note found.
- **Call-math verdict:** N=30 hourly = 720/day = ~21,600/month, well inside
  the 100,000/month free cap even WITHOUT model-run caching (i.e. survives
  naive per-user polling at low-to-moderate traffic too). N=30 every 15 min =
  2,880/day = ~86,400/month — still just inside the 100,000/month free cap,
  but with almost no headroom for traffic growth; N=40 at 15-min cadence
  (3,840/day = ~115,200/month) exceeds the free cap and needs Starter ($7/mo)
  at minimum. **This is the best free-tier fit of any provider surveyed for
  the stated volumes**, with the caveat that it's a 3-day wind/rain forecast
  window on free, not a full-featured plan.

---

## 5. Visual Crossing

STATUS: **USE — free tier survives hourly polling at N=30/N=40 IF cached once per model run; does not survive naive 15-min per-poll billing**

- **Free tier ceiling:** **1,000 records/day.** Critically, a "record" is
  NOT one API call — per Visual Crossing's own definition (fetched
  2026-08-08, https://www.visualcrossing.com/resources/documentation/weather-data/what-exactly-is-a-weather-record/):
  > "A full 15-day forecast for one location counts as a single record. This
  > is true even for an hourly forecast... one record is the smallest
  > accounting increment."
  So ONE call fetching a full multi-day hourly **forecast** for ONE location =
  1 record, regardless of how many hours/variables are returned.
  **Forecast vs. historical distinction — resolves an apparent contradiction
  in the docs:** a separate example on the Timeline API page (fetched
  2026-08-08) shows a query against a **specific historical date/time**
  costing `queryCost: 24` when hourly detail is included, i.e. billed
  per-hour, not per-location. The what-is-a-record page explains this
  directly: *"Historical Forecast records do not count as a single record
  for a full 15-day forecast but are billed more typically as a history
  record as 15 records for a 15-day forecast query."* **The 1-record-per-call
  rule applies to forward-looking forecast queries; querying past/historical
  dates bills roughly 1 record per day (or per hour, for the specific-hour
  example) of history requested instead.** Since a live hourly wind/wave
  refresh loop only ever asks for current/forward data (never re-pulls
  yesterday), the cheap 1-record-per-location-per-call rate is the correct
  one for this project's polling pattern — but confirm with a real forecast-only
  test call (checking the returned `queryCost` field directly) before
  finalizing the budget, since this was reconciled from docs text, not from
  a live API response in this pass.
- **Rate limit:** not specified as calls/second on the fetched page; "unlimited
  concurrency" mentioned for metered (paid) plans.
- **Commercial use allowed on free tier: YES.** Fetched pricing page
  (2026-08-08) states the API is "free for commercial and non commercial
  use."
- **First paid tier price:** Pay-as-you-go **$0.0001 per record** beyond the
  free 1,000/day (i.e., $0.10 per 1,000 records). Named monthly/annual plans
  exist but exact $ tiers did not render via fetch — UNVERIFIED beyond the
  per-record rate.
- **Variables:** ~100 elements including temp (max/min/feels-like), wind
  speed AND wind gust, precipitation/snow, humidity, dew point, pressure,
  cloud cover, visibility, solar radiation, UV, air quality, soil
  moisture/temp, and marine/wave data in the same product.
- **Update cadence:** "Certain weather stations update every 15 to 30
  minutes, while others update hourly" — Visual Crossing interpolates for
  hyperlocal coverage.
- **Panama coverage:** model + station interpolation blend; no Panama-specific
  gap noted, but station density in Panama is inherently sparse (issue for
  the interpolation layer, not the API itself).
- **Call-math verdict:** Because 1 forecast call = 1 record regardless of
  forecast length/resolution, N=30 hourly = 720 calls/day = **720
  records/day**, inside the free 1,000/day cap even at naive per-poll
  accounting (no dedupe-by-model-run needed at hourly cadence). N=40 hourly =
  960 records/day, still just inside free (40 records of headroom — thin
  margin, one retry storm could tip it over). N=30 every 15 min = 2,880
  calls/day: since each of those 96 daily re-fetches per location still
  counts as 1 record per call (not per location-day), naive per-poll billing
  at 15-min cadence **exceeds** the 1,000/day free cap by 1,880 records/day.
  Fixing this requires the model-run-cache architecture: fetch ONCE per
  location per actual model refresh (e.g. 4x/day) and serve 15-minute
  granularity to users from a DB/cache — N=30 x 4 model-runs/day = 120
  records/day, trivially free. **This is the strongest case in the whole
  survey for "cache per model-run, not per poll interval" — it's the
  difference between exceeding the free tier by 2-4x and using 12% of it.**
  At the $0.0001/record overage rate, even worst-case 3,840 records/day
  (N=40, 15-min, no caching at all) only costs $0.384/day = **~$11.50/month**
  — so even the "failure" case here is cheap, just not free.

---

## 6. Weatherbit

STATUS: **REJECT free tier (no hourly data, non-commercial only); MAYBE on Standard paid**

- **Free tier ceiling:** **50 requests/day**, 1 request/second, 1 API key max.
  Source: https://www.weatherbit.io/pricing (fetched 2026-08-08).
- **Rate limit:** 1 request/second (free tier).
- **Commercial use allowed on free tier: NO.** Fetched pricing page
  explicitly labels the free plan "Non-Commercial Use" only, and the free
  plan's forecast data is limited to "7 Day / Daily forecasts" — **no hourly
  data at all on free tier**, which alone disqualifies it for an
  hourly-refresh product.
- **First paid tier price:** Standard tier unlocks hourly+minutely forecasts,
  25,000 requests/day, 25 req/sec, and a "Commercial Use License." Exact
  monthly $ price could not be confirmed first-party (JS-rendered, blocked
  from WebFetch text extraction after repeated attempts). A third-party
  aggregator blog (not Weatherbit's own site — treat as unconfirmed
  secondary source) cites **$40/month for the 25,000/day tier**, **$180/month
  for a ~250-300k/day tier**, **$475/month** and **$950/month** for higher
  tiers. Flag: **UNVERIFIED — could not confirm on weatherbit.io itself**;
  before committing, re-check by creating a free account and viewing the
  billing/upgrade screen directly (the marketing pricing page hides numbers
  behind client-side JS this research pass could not execute).
- **Variables:** temp, wind, gust (paid tiers), precipitation, pressure,
  humidity, cloud cover, UV, visibility; Plus/Business tiers add historical
  (5-30 years), Maps, Climate Normals, Air Quality, Ag-Weather, Energy.
- **Update cadence:** UNVERIFIED exact interval; hourly granularity only
  available Standard tier and above.
- **Panama coverage:** model-based global coverage, no Panama-specific
  differentiator found.
- **Call-math verdict:** Free tier's 50/day ceiling is irrelevant to discuss
  further — it's non-commercial-only AND daily-resolution-only, disqualifying
  it outright regardless of the 720-3,840/day target volumes. On Standard
  (25,000 req/day = plenty of headroom for N=40 even at 15-min cadence
  3,840/day), the binding question is the UNVERIFIED ~$40/month price —
  needs manual confirmation before using in the cost model.

---

## 7. Meteosource

STATUS: **USE — cheapest paid entry point with a real commercial license**

- **Free tier ceiling:** **400 calls/day.** Requires "Mention & backlink"
  attribution. Source: https://www.meteosource.com/pricing (fetched
  2026-08-08).
- **Rate limit:** UNVERIFIED for free tier specifically (paid tiers show
  350-700/min).
- **Commercial use allowed on free tier:** Not explicitly addressed as
  YES/NO on the pricing page for the free tier (only that attribution/backlink
  is required) — treat as UNVERIFIED/likely-restricted until confirmed, since
  every paid tier is what's marketed for production apps.
- **First paid tier price:** **Startup, $9/month, 10,000 calls/day** base
  (expandable to 100,000 or 500,000 calls/day at added cost), overage $1 per
  1,000 calls, rate limit 350/min, 98% uptime SLA. Standard: $29/month,
  20,000 calls/day base (expandable to 1,000,000/day), 700/min, 99.5% SLA.
  A specialized "Renewables" tier ($19/location/month, 15-min resolution) is
  aimed at solar/wind power forecasting, not directly relevant here.
- **Variables:** current, minute/hourly/daily forecast, maritime weather;
  exact wind-gust/pressure/lightning field-level detail not itemized on the
  pricing page (see API docs for full schema — not fetched in this pass).
- **Multi-model access:** checked docs at
  https://www.meteosource.com/documentation (fetched 2026-08-08) — **no
  "models=" parameter or multi-model selection found.** Meteosource appears
  to serve a single blended/best-fit forecast per point, not user-selectable
  underlying models.
- **Update cadence:** UNVERIFIED exact interval.
- **Panama coverage:** UNVERIFIED specific detail; Meteosource does list a
  dedicated Panama City weather-API landing page
  (meteosource.com/weather-api-panama-3703443), implying at least baseline
  global-model coverage of the country.
- **Call-math verdict:** Free tier does NOT survive hourly polling at this
  scale, even with model-run caching: N=30 hourly = 720/day and N=40 hourly =
  960/day both exceed the 400/day free ceiling (30-40 spots x 1 call/hour
  already beats 400/day around spot #17, since caching-per-model-run doesn't
  help when the poll interval itself IS the model-run interval here). The
  $9/month Startup tier (10,000/day base) trivially covers even N=40 at
  15-min cadence (3,840/day) with 2.6x headroom — cheapest nominal paid entry
  point of any provider surveyed, just not free at this volume.

---

## 8. AccuWeather

STATUS: **REJECT — permanent free tier being discontinued; no confirmed transparent pricing**

- **Free tier ceiling:** AccuWeather is in the process of **eliminating its
  permanent free tier entirely.** Per a company update tracked at
  https://github.com/home-assistant/home-assistant.io/issues/40106 (fetched
  2026-08-08, quoting AccuWeather's own announcement): "AccuWeather's current
  Free Limited Trials for Core Weather and MinuteCast® will be retired with
  the new portal launch," replaced by a **14-Day Core Weather Trial (up to
  500 calls/day)** and a **14-Day MinuteCast Trial (up to 50 calls/day)** —
  i.e., time-boxed trials, not an ongoing free tier.
- **Rate limit:** UNVERIFIED post-transition.
- **Commercial use allowed on free tier:** N/A — there effectively is no
  ongoing free tier to evaluate; trial terms UNVERIFIED for commercial-use
  language.
- **First paid tier price:** referenced only as a "New Low-Cost Starter
  Package" at an unspecified "competitive monthly rate" in the same
  announcement — no $ figure confirmed. A separate unconfirmed secondary
  source (search-engine snippet, not independently fetched from
  developer.accuweather.com which returned HTTP 403 on every attempt) cites
  Starter $2/mo (15,000 calls/mo), Standard $25/mo (225,000/mo), Prime
  $250/mo (1.8M/mo), Elite $500/mo (2.4M/mo) — **UNVERIFIED, could not
  confirm first-party** (developer.accuweather.com/pricing and /packages
  both 403'd to WebFetch).
- **Variables:** current conditions, forecasts, MinuteCast (hyperlocal
  minute-by-minute precip), severe weather alerts, historical.
- **Update cadence:** UNVERIFIED.
- **Panama coverage:** AccuWeather does publish Panama City forecasts on its
  consumer site (accuweather.com/en/pa/panama-city/...), implying baseline
  global coverage, but API-specific Panama data quality is UNVERIFIED.
  AccuWeather's "MinuteCast" hyperlocal nowcasting advantage is historically
  strongest in the US/EU with dense radar; Panama would fall back to
  standard global-model-quality forecasts.
- **Call-math verdict:** Moot — with no confirmed ongoing free tier and
  first-party pricing pages returning 403, AccuWeather cannot currently be
  budgeted with confidence. REJECT until a first-party quote/screenshot from
  their own developer portal is obtained.

---

## 9. Meteomatics

STATUS: **REJECT for production (no public self-serve pricing, no permanent free tier); MAYBE for one-off dev/model-comparison use during the 14-day trial**

- **Free tier ceiling:** No permanent free tier. **14-day free trial: 500
  queries/day, 50 queries/minute, 10 parallel queries.** (Reported
  consistently across secondary sources; Meteomatics' own pricing page at
  https://www.meteomatics.com/en/pricing/, fetched 2026-08-08, displays no
  numeric limits at all — it is entirely a "contact sales" gate: "Talk to
  our experts to learn more about our pricing.")
- **Rate limit:** 50 queries/min during trial (see above); production rate
  limits are part of the custom contract, UNVERIFIED.
- **Commercial use allowed on free tier:** N/A — no ongoing free tier for
  production use exists.
- **First paid tier price:** **UNVERIFIED — entirely custom/quote-based, no
  published $ figures found anywhere** (official pricing page, TrustRadius,
  G2 all point back to "contact sales").
- **Variables:** exceptionally broad — "over 1,800 parameters," combining
  110+ underlying models plus Meteomatics' own high-res EURO1k/US1k models,
  90m downscaling, and proprietary Meteodrone in-situ measurements. Explicit
  ensemble-forecast support for uncertainty quantification.
- **Multi-model access:** documented "data-source"/model-selection parameter
  (https://www.meteomatics.com/en/api/request/optional-parameters/data-source/)
  — appears to support selecting among the 110+ models, but exact
  multi-model-in-one-call mechanics were not fetched in this pass.
- **Update cadence:** UNVERIFIED exact interval; likely model-dependent
  like Open-Meteo.
- **Panama coverage:** Meteomatics' flagship high-res models (EURO1k, US1k)
  do NOT cover Panama at that resolution — Panama would fall back to their
  110+ global model blend, likely fine but not their headline product.
- **Call-math verdict:** Cannot be costed for this project — no self-serve
  price exists at any volume. REJECT for the production stack; the 14-day
  trial (500/day) could be used once, during development, purely to compare
  model outputs across their 110+ models for calibrating the AI confidence
  score, then discarded.

---

## 10. Pirate Weather

STATUS: **MAYBE — cheap and transparent, but free tier is too small for hourly N=30/N=40; needs a small paid top-up. Use as a secondary source, not the hourly backbone.**

- **Free tier ceiling:** **10,000 calls/month** as the durable/permanent free
  tier ("The free tier is permanent — you only need to upgrade if you exceed
  the free limits"), with an option to raise it to 20,000 calls/month via a
  $2/month recurring donation. Sources: pirateweather.net /
  docs.pirateweather.net (fetched 2026-08-08) and corroborating secondary
  coverage.
- **Rate limit:** UNVERIFIED exact calls/second.
- **Commercial use allowed on free tier:** UNVERIFIED via an explicit ToS
  quote in this pass — Pirate Weather markets itself as a direct drop-in
  replacement for the (now-defunct) Dark Sky API and has historically been
  used commercially by indie developers, but no explicit "commercial use:
  yes" clause was located and confirmed first-party. Flag before shipping.
- **First paid tier price:** effectively donation-based scaling ($2/mo -> 2x
  the free limit); no traditional enterprise tier with a fixed $/month found
  in this pass.
- **Variables:** very complete — temperature, apparentTemperature, dewPoint,
  humidity, pressure, **windSpeed, windGust, windBearing**, cloudCover,
  UVIndex, visibility, ozone, precipIntensity/Probability/Accumulation/Type
  (rain/snow/ice split out), moonPhase, fireIndex, smoke, **CAPE**, solar.
  Confirmed via https://docs.pirateweather.net/en/latest/API/ (fetched
  2026-08-08).
- **Multi-model access:** Pirate Weather **blends** multiple models per
  point automatically — confirmed model list in responses: "hrrr, nbm,
  gefs, gfs, rtma_ru, ecmwf_ifs, dwd_mosmix, ecmwf_aifs, aigefs, aigfs,
  raqdps, silam" — and supports an **exclude** parameter to drop specific
  models from the blend, forcing fallback sources. This is NOT the same as
  Open-Meteo's clean "give me each model's output side by side" — it's a
  single fused forecast per point with the ability to subtract models, not
  cleanly compare them. For an inter-model-disagreement confidence score,
  Open-Meteo's `models=` parameter is the better fit; Pirate Weather is
  better used as a single free Dark-Sky-format data source.
- **Update cadence:** UNVERIFIED exact interval; underlying models (HRRR,
  GFS) update on their native cadence (HRRR hourly, GFS every 6h).
- **Panama coverage:** its primary models (HRRR, NBM, RTMA) are **US/North-America-focused** — HRRR and NBM do not extend to Panama. Panama would fall back to the global-only members of the blend (GFS, ECMWF-IFS, ECMWF-AIFS, GEFS), so effective Panama coverage is **weaker than the US-facing marketing implies** — flag this clearly.
- **Call-math verdict:** N=30 hourly = 720/day = ~21,900/month — **exceeds**
  the 10,000/month free ceiling by roughly 2x even with model-run caching (no
  per-user multiplier needed to blow this budget — pure spot x hourly-poll
  math already does it). N=40 hourly is worse (~28,800/month). To fit inside
  free, polling would need to drop to roughly every 2-3 hours for N=30, or
  the $2/mo tier (20,000/month) still isn't enough for hourly N=30
  (21,900 > 20,000) — would need ~$4-6/month in donation-tier upgrades.
  Cheap, but NOT free at the target hourly cadence for 30+ spots.

---

## 11. Windy Point Forecast API

STATUS: **REJECT free tier (explicitly non-production); MAYBE paid**

- **Free tier ceiling:** **500 requests/day.** Source:
  https://api.windy.com/point-forecast/pricing (fetched 2026-08-08).
- **Rate limit:** UNVERIFIED calls/second; only daily cap published.
- **Commercial use allowed on free tier: NO — explicitly.** Exact quoted
  text from the fetched pricing page: **"Development purpose only, not
  intended for production."** This is one of the clearest explicit
  free-tier-blocks-commercial-use statements found in this whole survey.
- **First paid tier price:** **Professional, €990/year, 10,000 requests/day**
  (expandable by agreement), "includes unlimited forecast models (except
  ECMWF) and parameters."
- **Variables:** temperature, wind (u/v components) + windGust, precip
  (including snow/convective split), pressure, humidity, clouds, plus sea
  state (waves/currents) and air quality in the same product family.
- **Multi-model access:** the `model` parameter takes **one value per
  request** (e.g. `gfs`, `icon`, `iconEu`, `arome`, `namConus`, `canHrdps`) —
  comparing models requires multiple separate calls, not a single
  multi-model response like Open-Meteo. The paid Professional tier's
  "unlimited forecast models (except ECMWF)" means ECMWF itself is
  paywalled/excluded even on the paid tier, while all other models are
  included.
- **Update cadence:** UNVERIFIED exact interval; not documented on the pages
  fetched.
- **Panama coverage:** global GFS/ICON coverage applies; the regional
  high-res models (AROME/France, iconEu/Europe, namConus/canHrdps for
  US/Canada) do NOT cover Panama — same pattern as Pirate Weather, global
  models only for this region.
- **Call-math verdict:** Free tier (500/day) cannot support even N=30 hourly
  (720/day) and is explicitly barred from production use regardless. On paid
  Professional (10,000/day = ~€2.71/day = ~€82.50/month, i.e. roughly
  **$88-90/month** at typical EUR/USD), N=40 at 15-min cadence (3,840/day)
  fits with room to spare — but this is one of the more expensive options
  surveyed and still excludes ECMWF, one of the two best global models for
  marine wind fields.

---

## 12. Google Weather API

STATUS: **MAYBE — real product, good Panama coverage, price plausible but not independently confirmed**

- **Existence/GA status: CONFIRMED.** Part of Google Maps Platform, launched
  April 2025, reached general availability June 2025 (per search-engine
  snippets cross-referencing multiple sources; not independently verified
  against a dated Google changelog in this pass, so treat the exact GA date
  as reported-not-verified, but the API's existence and current
  documentation is directly confirmed via
  https://developers.google.com/maps/documentation/weather/overview,
  fetched 2026-08-08, which is live and fully populated — not a stub/beta
  page).
- **Free tier ceiling:** reported as **10,000 free calls/month** ("Essentials
  SKUs receive 10,000 free monthly billable events" — this is a Google Maps
  Platform-wide free-tier mechanic, not Weather-API-specific language, so
  flag as **UNVERIFIED for the Weather API specifically** even though
  corroborated across two independent search results).
- **Rate limit:** UNVERIFIED.
- **Commercial use allowed on free tier:** UNVERIFIED explicit clause, but
  Google Maps Platform APIs generally permit commercial use under the
  standard Maps Platform ToS (this is the norm for the platform, not
  confirmed specifically re-read for Weather in this pass).
- **First paid tier price:** reported as **$0.15 per 1,000 calls** beyond the
  free allowance (corroborated by two independent secondary sources,
  matching the same per-mille structure as other Maps Platform Essentials
  SKUs) — **UNVERIFIED first-party**: the official SKU pricing page
  (developers.google.com/maps/billing-and-pricing/sku-details) truncated
  before the Weather section when fetched, and mapsplatform.google.com/pricing/
  only showed bundled subscription plans ($275/mo Essentials plan / 100,000
  calls, $1,200/mo Pro / 250,000 calls) that may not be the applicable
  pay-as-you-go path for a small app — **needs a direct re-check against a
  logged-in Google Cloud Console billing page**, not just the public
  marketing site.
- **Variables:** min/max/apparent temperature, wind (average, windchill,
  direction, max speed, **gust**), precipitation (total + type: snow/rain/ice/mix),
  average sea-level pressure. **No lightning strike data** — only "percent
  chance of a thunderstorm."
- **Update cadence:** UNVERIFIED.
- **Panama coverage: CONFIRMED GOOD.** Fetched
  https://developers.google.com/maps/documentation/weather/coverage
  (2026-08-08) directly — Panama shows: Current conditions YES, Daily
  forecast YES, Hourly forecast YES, Hourly history YES, Weather alerts NO.
  This is one of the more explicitly-confirmed-for-Panama entries in this
  survey.
- **Multi-model access:** not documented as a user-facing feature — Google
  blends "AI Weather models and traditional forecasting systems" internally
  and does not expose a models= parameter; not usable for the
  inter-model-disagreement confidence score.
- **Call-math verdict:** IF the $0.15/1,000-calls figure holds, N=30 hourly
  (720/day = ~21,600/mo) costs roughly (21,600-10,000)/1000 x $0.15 ≈
  **$1.74/month**; N=40 at 15-min (3,840/day = ~115,200/mo) costs roughly
  **$15.78/month**. Both trivially cheap IF the price is confirmed — but this
  entire row rests on an unconfirmed price, so treat the dollar figures as
  directional only until checked against an actual GCP billing console.

---

## 13. Apple WeatherKit

STATUS: **USE — best free ceiling of any provider surveyed, but iOS/macOS-ecosystem-coupled auth**

- **Free tier ceiling: CONFIRMED — 500,000 calls/month**, included with an
  Apple Developer Program membership. Source:
  https://developer.apple.com/weatherkit/ (fetched 2026-08-08): "500,000
  calls/month" included with the Program. This directly confirms the figure
  given in the task brief.
- **Apple Developer Program cost: $99/year — CORROBORATED, NOT FIRST-PARTY
  VERIFIED IN THIS PASS.** Sourced from a search-engine snippet, not a direct
  fetch of developer.apple.com/programs/enroll/ in this research session;
  this figure matches long-standing, widely-documented Apple pricing, but
  flag it alongside the $29 Open-Meteo figure as one of the two dollar
  amounts in this document's headline that should get a final first-party
  screenshot-check before the number goes into a budget doc. This $99/year
  is the ONLY cost to unlock the 500k/month free tier — no per-call billing
  below that ceiling.
- **Rate limit:** UNVERIFIED calls/second; only the monthly ceiling is
  documented on the page fetched.
- **Commercial use allowed on free tier:** Not explicitly gated by a
  separate "commercial use" clause the way Open-Meteo/Weatherbit/Windy are —
  WeatherKit is licensed for use in any app built by a paying Apple
  Developer Program member, commercial apps included; UNVERIFIED against the
  full legal terms of service text in this pass, but this is the standard,
  widely-used model (many shipping App Store apps use WeatherKit
  commercially on the free 500k tier).
- **Attribution requirement (real compliance constraint, not optional):**
  exact quote from https://developer.apple.com/weatherkit/get-started/
  (fetched 2026-08-08): *"If your apps, web apps, or websites display any
  weather data from Apple (other than weather alerts or value-added services
  or products, as described below), you must clearly display the Apple
  Weather trademark (Weather), as well as the legal link to other data
  sources."* Value-added/transformed data (e.g. a derived surf-quality score)
  instead requires a notice that "the data provided by Apple has been
  modified." This must be built into the UI wherever WeatherKit-sourced
  numbers are shown, unlike WeatherAPI.com/Visual Crossing/Open-Meteo paid
  tiers which do not require an on-page trademark.
- **Authentication model:** **JWT signed with ES256**, NOT a simple API key.
  Confirmed via search-engine-corroborated developer documentation: the JWT
  header contains `"alg": "ES256"` and a `kid`/`id` field formatted as
  `<TEAM_ID>.<SERVICE_ID>`; the payload's `iss` is the Team ID and `sub` is
  the Service ID. This requires generating a private key in the Apple
  Developer portal (Certificates, Identifiers & Profiles) and signing a
  fresh JWT server-side per request/session — meaningfully more
  implementation work than a static API-key header used by every other
  provider in this survey.
- **First paid tier price:** beyond 500,000/month, additional calls are
  billed — exact overage $/call rate was **not located/confirmed** in this
  pass (UNVERIFIED); given the free ceiling comfortably covers this
  project's entire volume range, overage pricing is low-priority to chase
  down.
- **Variables:** temperature, precipitation (+type), wind, UV index,
  minute-by-minute precip nowcasting (select regions only), severe weather
  alerts; iOS 18+ adds snowfall/sleet totals, max/min visibility,
  cloud-cover-by-layer, historical-average comparisons. Explicit
  **pressure/gust field-level detail not itemized** on the page fetched —
  needs a docs deep-dive before committing to it as sole wind-gust source.
- **Update cadence:** UNVERIFIED exact interval on the page fetched.
- **Panama coverage:** "Some features are available only in select regions"
  — global baseline coverage implied but Panama-specific confirmation was
  NOT found in this pass; flag as UNVERIFIED, follow up before relying on it
  as primary source (minute-by-minute nowcasting in particular is very
  likely US/EU-only and probably NOT available for Panama).
- **Call-math verdict:** 500,000/month free ceiling makes this the largest
  free allowance in the entire survey by a wide margin — N=40 at 15-min
  cadence (3,840/day = ~115,200/month) uses only ~23% of the free allowance,
  with room to run several other spot-grids or a much larger N before
  needing to pay anything. The catch is entirely the JWT/ES256 auth
  complexity and the requirement to enroll as a paid Apple Developer
  ($99/year) even though the API itself would otherwise be free at this
  volume.

---

## 14. NOAA/NWS api.weather.gov

STATUS: **REJECT — confirmed NOT usable for Panama**

- **Free tier ceiling:** unlimited/free — "All of the information presented
  via the API is intended to be open data, free to use for any purpose."
  Source: https://www.weather.gov/documentation/services-web-api (fetched
  2026-08-08).
- **Rate limit:** "not public information, but allows a generous amount for
  typical use" per the same page — effectively unbounded for reasonable use.
- **Commercial use allowed:** YES, open data, no restriction — moot given
  the coverage finding below.
- **Panama coverage: CONFIRMED NOT COVERED.** Directly tested via WebFetch
  against `https://api.weather.gov/points/8.4,-80.12` (near Playa Venao,
  Pacific coast) and `https://api.weather.gov/points/9.37,-82.25` (Bocas del
  Toro, Caribbean coast) — **both returned HTTP 404 Not Found**, both
  fetched 2026-08-08. This is the standard, documented behavior of the NWS
  `/points` endpoint for any coordinate outside NWS/US territorial
  coverage — a 404 from `/points` means the coordinate is outside the
  supported area. **Panama is entirely outside api.weather.gov's coverage
  area.** This directly confirms the task brief's suspicion.
- **Variables/update cadence:** irrelevant given the coverage finding —
  N/A for this project.
- **Call-math verdict: N/A.** Free and unlimited, but 100% unusable for a
  Panama-only app. REJECT outright, no further evaluation needed.

---

## 15. Multi-model ensemble access comparison

The core requirement: pull MULTIPLE underlying NWP models (GFS, ICON, ECMWF,
ARPEGE, etc.) for the SAME point, ideally in ONE call, so inter-model spread
can drive an AI confidence score.

| Provider | Multi-model in one call? | Mechanism | Verified |
|---|---|---|---|
| **Open-Meteo** | **YES — the clear winner** | `models=` parameter accepts a comma-separated list, e.g. `models=gfs_seamless,icon_seamless,ecmwf_ifs04`; response returns per-model arrays for the same point/variables in a single JSON payload. 40+ models available: ECMWF IFS HRES, ICON Global/EU/D2, GFS, JMA GSM, KMA GDPS, GEM, ACCESS, CMA GRAPES, ARPEGE/AROME, HRRR/NAM/NBM, UKMO, MeteoSwiss, GeoSphere Austria, Nordic models, and more. Dedicated **Ensemble API** exists separately (GEFS, ECMWF ENS, ICON-EPS etc. — probabilistic spread from a single model family) documented at open-meteo.com/en/docs/ensemble-api. | CONFIRMED via https://open-meteo.com/en/docs, fetched 2026-08-08. |
| **Meteomatics** | Partial/likely YES | Has a documented data-source/model-selection parameter across 110+ models (meteomatics.com/en/api/request/optional-parameters/data-source/); exact one-call multi-model mechanics not independently fetched in this pass. | UNVERIFIED mechanics, no self-serve price anyway (see §9). |
| **Pirate Weather** | Blend only, not comparable side-by-side | Automatically fuses HRRR/NBM/GEFS/GFS/RTMA/ECMWF-IFS/DWD-MOSMIX/ECMWF-AIFS/AIGEFS/AIGFS/RAQDPS/SILAM into one forecast; supports **excluding** specific models from the blend, but does not return each model's raw output side-by-side in one response. | CONFIRMED via docs.pirateweather.net, fetched 2026-08-08. |
| **Windy Point Forecast** | NO — one model per call | `model` param takes a single value; comparing GFS vs ICON vs ECMWF requires N separate API calls (and ECMWF is excluded even on the paid tier). | CONFIRMED via api.windy.com/point-forecast/docs, fetched 2026-08-08. |
| **Google Weather API** | NO | Blends "AI Weather models and traditional forecasting systems" internally, no user-facing model selector. | Reported, not deeply verified. |
| **OpenWeatherMap, WeatherAPI.com, Visual Crossing, Weatherbit, Meteosource, AccuWeather, Tomorrow.io, Apple WeatherKit, NOAA/NWS** | NO | None of these expose a model-selection parameter in the docs reviewed — each returns a single blended/proprietary forecast per point. | Based on docs reviewed in this pass; not exhaustively re-checked against every changelog. |

**Implication for the AI confidence score:** Open-Meteo's `models=` parameter
is the only provider surveyed that cleanly delivers "GFS vs ICON vs ECMWF vs
ARPEGE for the same point in one call" — exactly the mechanism needed to
compute inter-model spread as a confidence signal. This is a strong reason
to make Open-Meteo (specifically its paid Standard tier once the app is
commercial, or Ensemble API on the Professional tier) the backbone of the
confidence-scoring pipeline, even if a cheaper single-model provider is used
elsewhere for baseline point forecasts.

---

## 16. Cross-cutting call-volume verdict table

Assuming server-side caching of ONE call per model run (not per user) —
this is the realistic production architecture:

| Provider | Free ceiling | N=30 hourly (720/day) | N=30 15-min (2,880/day) | N=40 hourly (960/day) | N=40 15-min (3,840/day) | Commercial-use-clean on free? |
|---|---|---|---|---|---|---|
| Open-Meteo | 10,000/day (non-commercial only) | Fits numerically, but ToS requires paid plan once monetized | Fits numerically, same caveat | Fits, same caveat | Fits, same caveat | NO if app has ads/subs |
| OpenWeatherMap One Call 3.0 | 1,000/day | Fits free | Exceeds (~$85/mo overage) | Fits free | Exceeds (~$128/mo overage) | UNVERIFIED |
| Tomorrow.io | 1 location (not a call count) | Fails structurally | Fails structurally | Fails structurally | Fails structurally | UNVERIFIED |
| WeatherAPI.com | 100,000/month | Fits free (21.6k/mo) | Fits free, tight (86.4k/mo) | Fits free (28.8k/mo) | Exceeds (115.2k/mo) | YES |
| Visual Crossing | 1,000 records/day | Fits free | Exceeds naive; fits if cached per model-run | Fits free | Exceeds naive; fits if cached per model-run | YES |
| Weatherbit | 50/day (free = non-commercial, daily-only) | Fails (free); Standard tier (25k/day, price UNVERIFIED) fits | Fails (free); Standard fits | Fails (free); Standard fits | Fails (free); Standard fits | NO on free |
| Meteosource | 400/day | Exceeds | Exceeds | Exceeds | Exceeds | UNVERIFIED; $9/mo Startup (10k/day) fits everything |
| AccuWeather | No ongoing free tier | N/A | N/A | N/A | N/A | N/A |
| Meteomatics | No ongoing free tier (14-day trial only) | N/A | N/A | N/A | N/A | N/A |
| Pirate Weather | 10,000/month | Exceeds (~21.9k/mo) | Exceeds further | Exceeds (~28.8k/mo) | Exceeds further | UNVERIFIED |
| Windy Point Forecast | 500/day | Exceeds | Exceeds | Exceeds | Exceeds | NO — explicit "dev only" |
| Google Weather API | ~10,000/month (UNVERIFIED) | Exceeds; ~$1.74/mo overage (price UNVERIFIED) | Exceeds; ~$4-5/mo | Exceeds; ~$2.50/mo | Exceeds; ~$15.78/mo | UNVERIFIED |
| Apple WeatherKit | 500,000/month | Fits free easily | Fits free easily | Fits free easily | Fits free easily (23% used) | Standard/widely used commercially |
| NOAA/NWS | Unlimited | N/A — no Panama coverage | N/A | N/A | N/A | N/A — moot |

---

## 17. Open questions / UNVERIFIED items

Flagged explicitly throughout; consolidated here for follow-up before
committing budget:

1. **Weatherbit** Standard/Plus/Business exact $/month — pricing page is
   client-side-rendered and blocked every fetch attempt; only a third-party
   blog figure ($40/$180/$475/$950) was found, unconfirmed first-party.
   ACTION: sign up for a free Weatherbit account and check the upgrade
   screen directly.
2. **AccuWeather** developer.accuweather.com/pricing and /packages both
   returned HTTP 403 to every fetch attempt in this pass — pricing entirely
   unconfirmed first-party. Also unclear if ANY ongoing free tier will exist
   post-transition (as of 2026-08-08 they're mid-migration to trial-only).
   ACTION: check directly from a logged-in developer account or wait for the
   new portal to finish rolling out.
3. **Google Weather API** — the $0.15/1,000-calls and 10,000/month free
   figures are corroborated by two independent secondary sources but never
   confirmed against Google's own SKU pricing table (page truncated before
   the Weather section on fetch) or a live GCP billing console. ACTION:
   check developers.google.com/maps/billing-and-pricing/sku-details#weather-ess-sku
   directly, or provision a GCP project and read the Pricing tab in-console.
4. **Tomorrow.io** — no self-serve $/month figure exists publicly as of this
   research date; the pricing page shows only Free (1-location cap) and
   Enterprise ("Contact us"). ACTION: decide whether a sales call is worth
   it, or drop this provider (current recommendation: drop).
5. **Meteomatics** — same as Tomorrow.io, fully sales-gated, no public price.
   Only useful as a 14-day trial data point for calibrating other models, not
   as a production source.
6. **OpenWeatherMap** — the "Startup/Developer/Professional/Expert" named
   tiers' exact $/month prices never rendered via fetch (only call-limits
   did); these may not even be the correct product line for One Call 3.0
   (that product uses per-call billing, not these named tiers, based on the
   subscribe-page evidence gathered). Needs disambiguation before quoting a
   $/month figure for OWM beyond the confirmed $0.0015/call overage rate.
7. **Panama-specific coverage/quality** for WeatherAPI.com, Meteosource,
   Weatherbit, and Apple WeatherKit was not deeply verified beyond "global
   model-based coverage, no explicit gap found" — none of these were tested
   with an actual live API call against Panama coordinates in this pass
   (only NOAA/NWS and the Google coverage table were directly checked at the
   coordinate/country level). ACTION: before final provider selection, make
   one live test call per finalist provider against both the Pacific
   (~8.40N, -80.12W) and Caribbean (~9.37N, -82.25W) test points used
   elsewhere in this research set (see doc 01) and diff the actual returned
   values/resolution.
8. Rate limits (calls/second or calls/minute) were UNVERIFIED for several
   providers (Tomorrow.io, WeatherAPI.com, Visual Crossing, Weatherbit
   Standard+, Meteosource free, Google, Apple WeatherKit, Pirate Weather) —
   daily/monthly ceilings were the primary figures confirmed; a burst-rate
   check matters if the model-run cache job fires all 30-40 spots
   concurrently rather than staggered.

---

## 18. Final summary — cheapest legal stack

The cheapest LEGAL stack for hourly, multi-model wind+wave data across 30
Panama spots combines two providers, because no single provider is both
free-at-this-volume AND gives clean multi-model comparison:

1. **Open-Meteo Standard plan, $29/month** (1M calls/month) is the backbone —
   it is the ONLY provider with a one-call `models=` parameter (GFS, ICON,
   ECMWF, ARPEGE, etc. in one response), which the AI confidence score needs,
   AND it is the only provider in this stack that also covers the **wave/swell
   half** of "wind+wave" via its free Marine Weather API (see doc 01) — none
   of WeatherKit, WeatherAPI.com free tier, or Meteosource's cheaper $9/mo
   plan bundle marine/wave data, so none of them can replace this line item
   even though they're individually cheaper. Paying is mandatory the moment
   the app carries ads or subscriptions — Open-Meteo's free tier is legally
   non-commercial-use-only regardless of call volume, so don't try to stay
   "under the radar" on volume alone.
2. Layer in **Apple WeatherKit (free, 500,000 calls/month)** as a second,
   independent wind/temp/pressure source for confidence-score comparison and
   redundancy — its free ceiling covers this project many times over; the
   only cost is $99/year for an Apple Developer account plus building the
   ES256 JWT signing flow.
3. **WeatherAPI.com's free tier (100,000 calls/month, explicit commercial-use
   YES)** is a good zero-cost third opinion/fallback at hourly cadence for
   N=30 (21,600/month used, well inside the cap).
4. Skip AccuWeather, Meteomatics, Tomorrow.io, and Windy's free tier entirely
   — all four are either sales-gated, trial-only, or explicitly
   dev-only-non-production as of this research date.
5. **api.weather.gov is fully out — confirmed 404 for both Panama test
   points; US-only, no exceptions.**
6. Actual monthly dollar cost for the full stack at N=30, hourly, multi-model:
   **$29/month (Open-Meteo Standard) + $0/month (WeatherKit, under free
   ceiling) + $0/month (WeatherAPI.com, under free ceiling) + $99/year
   amortized ≈ $8.25/month (Apple Developer account) ≈ $37.25/month total.**
7. Caching one call per model run instead of per user is what keeps
   WeatherAPI.com and WeatherKit at $0 — per-user polling at real traffic
   would blow through both free tiers quickly; this architecture choice, not
   volume negotiation, is what makes the stack cheap.
8. If budget must go to $0 flat: Apple WeatherKit alone (500k free
   calls/month, comfortably covers N=40 at 15-min cadence) plus WeatherAPI.com
   free as a second opinion — but you lose Open-Meteo's clean multi-model
   comparison, which weakens the AI confidence score's core signal.
9. Do not use Weatherbit's free tier (non-commercial, daily-only) or Pirate
   Weather's free tier (10,000/month, mathematically too small for N=30
   hourly at ~21,900/month) as primary sources at this scale — both are fine
   as occasional secondary checks, not as the hourly backbone.
10. Biggest unresolved risk before locking this plan: Weatherbit and
    AccuWeather paid pricing were both UNVERIFIED first-party (client-side
    rendering / 403s blocked confirmation) — if either turns out cheaper than
    assumed, they could displace WeatherAPI.com as the third opinion; the
    $37.25/month figure above does NOT depend on either, so it's a safe
    number to plan around today.

---

## Addendum: non-commercial, open-source, global scope

Added 2026-08-08, same session, in response to a scope change: the product
is now confirmed **free, ad-free, subscription-free, zero-revenue, open
source (public repo), starting in Panama but intended to go global.** This
changes the answer to nearly every "commercial use YES/NO" line in §1-14
above, and changes the call-volume math from N=30-40 to N=500/5,000/50,000.
Everything below is a fresh re-fetch dated 2026-08-08 unless noted.

### A1. Open-Meteo — does the free tier cover us? (the load-bearing question)

**Short answer: YES, this project qualifies as non-commercial under
Open-Meteo's own definition — with the daily/hourly/minute call ceilings
still being the real limit, not the commercial-use clause.**

Full verbatim re-fetch of https://open-meteo.com/en/terms (2026-08-08):

> "Using our service for private or non-profit websites or apps that do not
> have subscriptions or advertising" — listed as an allowed non-commercial
> use.

> Commercial use is defined by three explicit examples: "Operating websites
> or apps that have subscriptions or display advertisements," "Integrating
> our service into commercial products or promotional activities," and
> "Conducting undisclosed research at commercial entities."

> "Non-commercial use is defined as elaborated by [Creative Commons]" — Open-
> Meteo does not write its own definition; it defers to Creative Commons'
> standard NonCommercial definition (not independently re-fetched from
> creativecommons.org in this pass — flag as a secondary confirmation step,
> but Creative Commons' own NC definition is "not primarily intended for or
> directed towards commercial advantage or monetary compensation," which a
> zero-revenue OSS project satisfies on its face).

**Specifically resolved, per the task's sub-questions:**

- **Open-source carve-out:** No explicit clause found. Open-Meteo's terms do
  not mention "open source," "GitHub," or "public repository" anywhere.
  Being open-source is neither a qualifying nor disqualifying factor in
  their own text — what matters to them is the presence/absence of ads and
  subscriptions, not the app's licensing model.
- **Non-profit carve-out:** Explicitly allowed, as quoted above — a
  non-profit website with no subscriptions/ads is the exact non-commercial
  example they give.
- **Number of end users / public availability / audience size:** **No such
  clause found anywhere in the terms.** A public, global, high-traffic
  website is not treated differently from a small private one under the
  *legal* commercial-use test — the only ceiling on traffic is the
  *technical* rate limit (10,000 calls/day, 5,000/hour, 600/minute), which
  is a separate, purely volume-based constraint (see §A4 below for exactly
  where that breaks at global scale).
- **Serving data to third parties / redistribution:** No explicit clause
  found addressing this in the terms page fetched. Not confirmed as either
  permitted or forbidden — flag as a genuine gap, not a "no."
- **Explicit open-source/non-profit discount program:** Re-fetched
  https://open-meteo.com/en/pricing (2026-08-08) specifically for this —
  **no mention of "open source," "non-profit," "community," or "public
  good" anywhere on the pricing page.** No discount program exists beyond
  the free tier itself; for anything beyond the free ceiling, the answer is
  "contact info@open-meteo.com," not a published nonprofit rate.

**Verdict: not ambiguous on the commercial-use question itself** — an
ad-free, subscription-free, zero-revenue public site is squarely inside
their own "non-profit websites... that do not have subscriptions or
advertising" example. **It IS worth one clarifying email** on the single
unaddressed point (whether serving processed/derived data back out to end
users at global public scale counts as "redistribution" in some sense they
care about) before scaling past a few hundred spots — not because the
current wording says no, but because it says nothing either way, and it's
a five-minute email that removes the only remaining unknown.

**Bonus finding, materially changes the earlier recommendation:** Open-
Meteo's server code is **open source under AGPLv3** (their own words, from
https://open-meteo.com/en/pricing, fetched 2026-08-08: "The server code is
open-source under AGPLv3; the weather data is CC BY 4.0") and the GitHub
repo (github.com/open-meteo/open-meteo, fetched 2026-08-08) confirms:
*"Source code available under AGPLv3"* and *"With Docker or prebuilt Ubuntu
packages, it is possible to launch your own weather API within minutes."*
This means once the free daily ceiling is exceeded, the choice is NOT only
"pay $29-99/month" — it's also legally free to **self-host the exact same
open-source engine** against the same free public model data, permanently
removing Open-Meteo's own rate limits (see §A5).

### A2. Commercial-use table — all providers, unmonetized OSS public site

| Provider | Unmonetized, ad-free, OSS public site qualifies for free tier? | Quoted clause | Source (fetched 2026-08-08) |
|---|---|---|---|
| **Open-Meteo** | **YES** | "Using our service for private or non-profit websites or apps that do not have subscriptions or advertising" — allowed; commercial = "have subscriptions or display advertisements" | open-meteo.com/en/terms |
| **Apple WeatherKit** | **YES**, but gated by a mandatory $99/year Apple Developer Program membership regardless of revenue — not avoidable via an open-source/indie exemption. Checked https://developer.apple.com/support/compare-memberships/: the free (no-enrollment) tier gives Xcode/docs/device testing only, explicitly excluding "advanced app capabilities" (the tier WeatherKit requires). The only discount found: *"Your nonprofit, educational institution, or government entity may be eligible for a fee waiver"* — an OSS community project by an individual does not fit "nonprofit institution/educational institution/government entity" as typically defined by Apple's waiver program (a registered 501(c)(3) or equivalent, not an informal open-source project), so **UNVERIFIED whether this specific project would qualify for the waiver — worth applying to check, since it costs nothing to ask.** | developer.apple.com/support/compare-memberships/ + developer.apple.com/support/membership-fee-waiver/ (waiver eligibility page not independently fetched in this pass) |
| **WeatherAPI.com** | **YES, unambiguously** | Pricing page: "Commercial Use" checkmark shown on every tier including Free (re-confirmed 2026-08-08). ToS also states: "You may access, view and make copies of the data in the API for your personal or commercial use" | weatherapi.com/pricing.aspx, weatherapi.com/terms.aspx |
| **Visual Crossing** | **YES** | Pricing page: "free for commercial and non commercial use." No open-source-specific clause exists, but none is needed since commercial use is already unconditionally allowed on free. | visualcrossing.com/weather-api pricing page |
| **Weatherbit** | **NO — disqualified on multiple independent grounds**, not just the commercial question. Free tier is explicitly non-commercial: "This license applies to all subscriptions with a NON-COMMERCIAL usage designation [example: Free, Trial, and Hobbyist subscriptions]," referencing a CC BY-NC-SA-style restriction. Separately and confusingly, the terms also state something that reads as **AMBIGUOUS even for non-profits**: *"Use of Weatherbit data by any non-profit institution in any webpage/application without attribution"* appears in a context implying it **requires a paid subscription** even for non-profits unless attribution is given — the exact scope of this clause was not fully resolved in this pass. Moot regardless: free tier is also capped at 50 req/day and daily-resolution-only, disqualifying it on volume/feature grounds alone. | weatherbit.io/terms |
| **Pirate Weather** | **AMBIGUOUS — UNVERIFIED.** Could not locate a dedicated Terms/License page; https://pirateweather.net/en/latest/terms/ and https://pirateweather.net/en/latest/license/ both returned HTTP 404 on 2026-08-08. Pirate Weather markets itself as a direct Dark Sky-API replacement and is widely used by indie/OSS developers, but no explicit "commercial use: yes/no" clause was found and confirmed first-party in either this pass or the original research pass. **Recommend emailing the maintainer directly** (small open-source-adjacent project — likely to say yes, but unconfirmed in writing). | pirateweather.net (terms/license pages 404) |
| **Windy Point Forecast** | **NO on free tier — explicit and unambiguous.** Re-fetched https://api.windy.com/point-forecast/pricing (2026-08-08): free/testing tier is described as *"Development purpose only, not intended for production"* and additionally *"Returns randomly shuffled and slightly modified data"* — the free tier's data is deliberately degraded and is not licensed for any live public deployment, commercial or not. Paid Professional (€990/yr) would be required regardless of revenue status. No open-source discount found. | api.windy.com/point-forecast/pricing |
| **OpenWeatherMap One Call 3.0** | Carried over from §2, UNVERIFIED — no explicit non-commercial restriction was found on the free tier in the original pass, and no open-source clause exists either way; treat as allowed by default absence of a restriction, not as a confirmed "yes." | openweathermap.org/api/one-call-3 (original fetch) |
| **Meteosource** | Carried over from §7, UNVERIFIED for the free tier specifically (attribution/backlink required; commercial status of free tier not explicitly stated) — not re-checked in this addendum pass. | meteosource.com/pricing (original fetch) |
| **Google Weather API** | UNVERIFIED — not re-checked for a commercial-use clause in this addendum pass; carried over from §12 as presumed-allowed under standard Google Maps Platform ToS but not confirmed specifically for Weather. | Not re-fetched this pass |
| **NOAA GFS / ECMWF Open Data / DWD ICON** (raw public-domain model data, not a commercial API) | **YES, cleanly** — see §A5; these are open government/public data with permissive or public-domain terms, not commercial API products with a "commercial use" gate at all. | See §A5 sources |

### A3. Attribution requirements — footer checklist

For a project that intends to comply fully (open-source community ethos),
here is exactly what must appear, per provider, based on quoted terms text
(all fetched 2026-08-08 unless noted):

- **Open-Meteo:** CC BY 4.0 on the *data* (the code is AGPLv3, separately).
  Quoted: *"This licence mandates giving appropriate credit and indicating
  any modifications made to the data."* Standard CC BY 4.0 practice =
  credit "Open-Meteo.com" with a link, near the data or in a general credits
  page. No specific logo/wordmark mandated in the text found.
- **Apple WeatherKit:** Exact quote from developer.apple.com/weatherkit/get-started/
  (fetched earlier, 2026-08-08): *"If your apps, web apps, or websites
  display any weather data from Apple... you must clearly display the Apple
  Weather trademark (Weather), as well as the legal link to other data
  sources."* This means the literal word/wordmark **"Weather"** (Apple's
  trademarked term) must appear adjacent to the displayed data, plus a link
  to Apple's data-source-attribution page. If displaying a derived/modified
  metric (e.g. a computed surf score) instead of raw Apple data, the
  required text changes to a modification notice.
- **WeatherAPI.com:** Quoted from terms.aspx (fetched 2026-08-08, free tier):
  *"you will credit WeatherAPI.com by name or brand logo as the source of
  the data."* Also requires, wherever data is shown to end users, *"a clear,
  conspicuous, and intelligible disclaimer... conveying... weather
  information... is provided for general informational purposes only."*
  Two separate footer/UI obligations: (1) name-or-logo credit, (2) a
  general-informational-purposes disclaimer.
- **Visual Crossing:** **No attribution requirement found** in the fetched
  terms (visualcrossing.com/weather-services-terms, 2026-08-08) — the only
  related clause is Visual Crossing's own right to list *your* name as a
  customer (opt-out available), not an obligation on you to credit them.
- **Weatherbit:** Quoted: *"You must give appropriate credit, provide a
  do-follow link to Weatherbit.io, and indicate if changes were made... The
  link need not be obtrusive - but it must be visible."* Moot for this
  project regardless per §A2 (free tier disqualified on other grounds).
- **Pirate Weather:** UNVERIFIED — no terms/license page could be located
  (both attempted URLs 404'd). Cannot state a required attribution format;
  flag as an open question for the maintainer email recommended in §A2.
- **Windy:** UNVERIFIED — the pricing page fetched in this pass contained no
  attribution clause, and no separate ToS page was successfully fetched. Not
  materially relevant regardless since the free tier is barred from
  production use entirely (§A2).
- **NOAA GFS/ICON/ECMWF Open Data (raw model data path):** NOAA: *"NOAA
  requests attribution for the use or dissemination of unaltered NOAA data.
  However, it is not permissible to state or imply endorsement by or
  affiliation with NOAA"* (registry.opendata.aws/noaa-gfs-bdp-pds, fetched
  2026-08-08) — attribution is *requested*, not a hard legal requirement
  (U.S. government works are public domain), but "no implied endorsement"
  IS a hard requirement (e.g., don't say "official NOAA app"). ECMWF Open
  Data: CC-BY-4.0, so credit + indicate-modifications is a hard requirement,
  same pattern as Open-Meteo's data license (both ultimately trace back to
  overlapping source data). DWD: license text not fully retrieved in this
  pass (opendata.dwd.de license page 404'd); DWD states data is made
  available "free of charge" under a legal mandate but the exact attribution
  wording is UNVERIFIED — check dwd.de/preisliste and the "conditions of
  use" document referenced on their open-data page before shipping.

**Minimum honest footer for full compliance today:** "Weather data: GFS,
ICON, ECMWF via Open-Meteo (CC BY 4.0) [link]. Wind/temperature data via
Apple Weather [Weather trademark + link]. Additional data via WeatherAPI.com
[link]." Exact final wording should be re-checked against each provider's
live attribution page before launch, since these are marketing/legal pages
that change without notice.

### A4. Global scaling: 500, 5,000, and 50,000 spots, hourly

Math basis: hourly polling, cached once per model-run per spot (the
architecture established earlier) = **N spots x 24 polls/day**, i.e.
500->12,000/day (360,000/mo), 5,000->120,000/day (3.6M/mo),
50,000->1,200,000/day (36M/mo). Note two structurally different pricing
shapes below — call-volume caps vs. Tomorrow.io's location-count cap.

| Provider | Free ceiling | Breaks at (spot count, hourly) | N=500 | N=5,000 | N=50,000 |
|---|---|---|---|---|---|
| **Open-Meteo** | 10,000/day | **~417 spots** | Exceeds free; $29/mo Standard (1M/mo = ~33k/day, covers to ~1,388 spots) | Exceeds Standard's 1M/mo (3.6M needed); $99/mo Professional (5M/mo = ~166k/day, covers to ~6,944 spots) fits | Exceeds Professional's 5M/mo by 7x (36M needed); Enterprise only, custom quote, price UNVERIFIED |
| **Apple WeatherKit** | 500,000/mo | **~695 spots** | **Fits free, $0** (360k < 500k) | Exceeds free by ~3.1M/mo; overage rate UNVERIFIED — this is a real budgeting gap at global scale | Exceeds free by ~35.5M/mo; overage UNVERIFIED, and possible ToS redistribution-at-scale concern not confirmed either way |
| **WeatherAPI.com** | 100,000/mo | **~139 spots** | Exceeds free; $7/mo Starter (3M/mo) fits | Exceeds Starter's 3M/mo; $25/mo Pro+ (5M/mo) fits | Exceeds Business's 10M/mo; Enterprise custom, price UNVERIFIED |
| **Visual Crossing** | 1,000 records/day | **~42 spots** (naive per-poll; much higher if cached per model-run instead of per hour) | Exceeds free; overage ≈$33/month | Exceeds free; overage ≈$357/month | Exceeds free; overage ≈$3,597/month (≈$597/month if cached 4x/day per model-run instead of hourly) |
| **OpenWeatherMap One Call 3.0** | 1,000/day | **~42 spots** | Exceeds free; ≈$495/month overage (flat PAYG, no confirmed bulk discount) | ≈$5,355/month overage | ≈$53,955/month overage — **scales worst of any provider surveyed**; no confirmed enterprise rate |
| **Weatherbit** | 50/day (non-commercial, daily-only — disqualified regardless of scale) | N/A, disqualified at any N | Standard tier (25k/day, price UNVERIFIED) covers to ~1,041 spots | Plus tier (250k/day, price UNVERIFIED) covers to ~10,416 spots | Business tier (2M/day, price UNVERIFIED) covers to ~83,333 spots — all three prices UNVERIFIED first-party |
| **Meteosource** | 400/day | **~17 spots** | $29/mo Standard's highest published band (1M calls/day option) covers to ~41,666 spots — covers N=500 and N=5,000 comfortably | Covered by same $29/mo band | **Does not fit** even the highest published band (41,666 < 50,000) — Enterprise needed, custom price |
| **Pirate Weather** | 10,000/mo | **~14 spots** | No confirmed bulk/enterprise tier exists — only a $2/mo-doubles-the-limit donation model, which does not scale to 500+ spots in any documented way. **Unsuitable at this scale**, UNVERIFIED whether a bulk arrangement exists at all | Same — unsuitable | Same — unsuitable |
| **Windy Point Forecast** | 500/day | **~21 spots** | Exceeds Professional's 10,000/day (416-spot) ceiling; "expandable by agreement," price UNVERIFIED | Same, price UNVERIFIED | Same, price UNVERIFIED — likely the most expensive path given €990/yr only buys 416 spots baseline |
| **Google Weather API** | ~10,000/mo (UNVERIFIED) | **~14 spots** | ≈$52.50/month overage (UNVERIFIED rate, no confirmed volume discount) | ≈$538.50/month | ≈$5,398.50/month |
| **Tomorrow.io** | **1 monitored location** — a location-count cap, not a call-count cap | **Breaks at spot #2, structurally, regardless of whether you're at N=30 or N=50,000** | Fails immediately | Fails immediately | Fails immediately — this provider's free tier literally cannot express "many locations" at any scale; it is fundamentally the wrong shape for this project |

**Key structural note (directly answering the coordinator's question):**
most providers price by **call volume** (a fungible resource — 1,000 calls
can be spent on 1 spot polled 1,000x or 1,000 spots polled once), so their
free tier degrades gracefully as spot count grows — you simply cross a
threshold and start paying incrementally. **Tomorrow.io prices its free tier
by monitored-location-count instead**, which does not degrade gracefully at
all — it is binary-broken the moment you need a second location, making it
structurally unsuited to a many-spot product regardless of call efficiency
or caching cleverness. This is a categorically different failure mode from
every other provider in this table.

### A5. The $0 alternative: raw public-domain model data instead of a commercial API

Checked three sources directly (all fetched/tested 2026-08-08):

- **NOAA GFS (wind/temp/pressure/rain) + GFS-Wave/WAVEWATCH III (wave
  height/period/direction) — CONFIRMED, same free S3 bucket, both
  variables.** `aws s3 ls --no-sign-request s3://noaa-gfs-bdp-pds/` requires
  **no AWS account.** Registry text: *"NOAA data disseminated through NODD
  are open to the public and can be used as desired"*; attribution
  *requested*, not mandated (public domain U.S. government work), with the
  one hard rule being no implied NOAA endorsement. Directly listed the
  bucket structure for a live run (`gfs.20260807/00/`) and confirmed **both
  `atmos/` and `wave/` subfolders exist in the same free bucket** — i.e. the
  exact wind+wave combination this project needs is available in one
  no-cost, no-account source, updated 4x/day (00/06/12/18Z), global
  coverage including Panama.
- **ECMWF Open Data — CONFIRMED, CC-BY-4.0.** *"Their use is governed by the
  Creative Commons CC-BY-4.0 licence and the ECMWF Terms of Use"* — includes
  wave height/period alongside atmospheric variables, 0.25° resolution,
  GRIB2, accessible via plain HTTP (data.ecmwf.int), S3/Azure/GCP, or the
  `ecmwf-opendata` Python client, no account required for basic access.
  Caveat: **rolling ~2-3 day archive only** (not a long historical record)
  and a **500-simultaneous-connection cap** — fine for a live forecast
  refresh pipeline, not for building a historical backtest dataset.
- **DWD ICON open data — CONFIRMED accessible, license text incompletely
  retrieved.** opendata.dwd.de/weather/nwp/icon/grib/ is a live, unauthenticated
  directory listing (00/06/12/18 run folders visible for recent dates). DWD's
  own page states data is made *"available mostly free of charge"* under a
  legal mandate, but the exact attribution/reuse license document (referenced
  as "conditions of use") was not successfully retrieved in this pass —
  **UNVERIFIED exact license terms**, follow up before relying on ICON data
  in a shipped product.

**What you lose by dropping Open-Meteo's hosted API and going direct to raw
GRIB2:**
- Their variable normalization/unit conversion across 40+ models (each
  source names/scales/grids variables differently — this is real, tedious
  work Open-Meteo has already done).
- Their point-interpolation engine (grid-to-point extraction, done
  correctly per model's native projection).
- Their `models=` multi-model-in-one-call convenience — you'd re-implement
  this yourself by orchestrating N separate model pipelines.
- Operational reliability they already run (retry logic for late/missing
  model runs, monitoring, uptime) — becomes your job.
- A completely flat, simple HTTP API — replaced by GRIB2 file management
  (large files, byte-range/partial downloads to avoid pulling whole-globe
  grids, an index-based subsetting workflow like NOMADS' filter scripts or
  `.idx`-file byte-range reads).

**What raw GRIB2 realistically costs in engineering time**, for a capable
developer with AI assistance: a byte-range-subsetted downloader + `wgrib2`/
`eccodes` (cfgrib/pygrib) decode + nearest-neighbor-or-bilinear point
extraction for 2-3 models (GFS, ICON, ECMWF) is a genuinely buildable
weekend-to-two-week project, not a multi-month one — the hard parts (model
availability, grid formats, licensing) are now confirmed and documented
above. But it is still strictly more surface area than one HTTP call, and
every model quirk (grid resolution changes, variable renames, occasional
late runs) becomes an on-call problem for the maintainer.

**The straight recommendation, given the confirmed facts above:**

1. **Don't roll raw GRIB2 decoding from scratch as the first move.** Open-
   Meteo already open-sourced exactly this pipeline (AGPLv3,
   github.com/open-meteo/open-meteo) against these same free public
   sources. Re-implementing it independently duplicates solved work for no
   benefit unless you need something their engine structurally can't do.
2. **Start on Open-Meteo's hosted free tier.** Per §A1, this project
   qualifies as non-commercial under their own terms, so Panama-scale (30-40
   spots) and even a few-hundred-spot global rollout is **genuinely $0** —
   not $29/month as the pre-scope-change version of this document
   concluded. That earlier $29/mo recommendation assumed a monetized app;
   it no longer applies under the corrected, non-commercial scope.
3. **When spot count crosses roughly 400-1,000 spots hourly (the free
   ceiling), the real choice is Open-Meteo's paid tier ($29-99/month) vs.
   self-hosting their AGPLv3 engine ($0 recurring, just your own compute —
   a small VM, plausibly $5-20/month) against the same free NOAA/DWD/ECMWF
   data.** Self-hosting is the more "open source project" -aligned answer
   and removes Open-Meteo's rate limits entirely, at the cost of owning the
   deployment (their own docs describe it as launchable "within minutes"
   via Docker, which lowers this bar substantially versus building from raw
   GRIB2).
4. **Only build a from-scratch GRIB2 pipeline if self-hosting Open-Meteo's
   engine proves insufficient** for some specific need (e.g., a custom
   interpolation method or a variable their engine doesn't expose) — as a
   first move it is the highest-effort, lowest-differentiation option of
   the three.
