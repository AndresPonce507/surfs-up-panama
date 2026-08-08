# Live Visual Ground Truth for Panama Surf Spots — Raw Research

Research date: 2026-08-08. Compiled by research subagent.

Scope: the user's core insight is that numerical forecasts lie and that human spotters in a
WhatsApp group are the real signal for Panama surf conditions. This doc investigates every
plausible way to get LIVE VISUAL ground truth — existing public webcams, webcam aggregator
APIs (esp. Windy Webcams API), satellite visible imagery, and user-generated phone photos —
as a path to replacing (or augmenting) human spotters with vision-model analysis.

Status key per source: USE / MAYBE / REJECT / UNVERIFIED. Feasibility 1 (trivial) to 5
(not practical). Every entry needs URL + access date; ToS-forbidden capture sources are
flagged explicitly and NOT recommended for automated capture.

---

## Table of contents

1. Existing public webcams at/near named Panama surf spots
2. Webcam aggregators covering Panama (Surfline, WorldCam, SkylineWebcams, EarthCam, YouTube live, Insecam note)
3. Windy Webcams API — free tier, Panama coverage, license
4. Satellite visible imagery — GOES-16/19 ABI, Sentinel-2/Planet sun glint
5. User-generated imagery (UGC) as primary vision source — EXIF, moderation, storage cost
6. Prior art — Surfline Cam Rewind/AI, Argus, CoastSnap, SurfRCaT, academic coastal video monitoring
7. Open questions / UNVERIFIED items
8. Flags — ToS-forbidden or out-of-scope items noticed

---

## 1. Existing public webcams at/near named Panama surf spots

STATUS: MAYBE (1-2 real cams exist; the rest of the requested spot list has none)

Bottom line up front: of the 16 named spots, only **2 have an actual live camera anywhere**
online (Playa Venao and Santa Catalina, both via SkylineWebcams), and one of those was
**OFFLINE at time of check** (2026-08-08). Everything else — Rio Mar, Playa Malibu, Serena,
Playa Teta, all three Bocas del Toro breaks, Isla Grande, Playa Blanca, Farallon, Cambutal,
Morrillo, Coiba, Punta Chame (surf-specific) — has **no dedicated surf-facing webcam** as of
this research date. This is a much thinner camera landscape than California/Hawaii/Bali surf
markets; do not assume Panama looks like Surfline's home turf.

### Playa Venao (Pedasí) — the one real, live, working cam

- **URL:** https://www.skylinewebcams.com/en/webcam/panama/los-santos/pedasi/panama-pedasi.html
- **Owner/source:** SkylineWebcams itself, sourcing the feed description as "view of the beach
  from Beach Break Surf Camp" (per the WorldCam mirror listing: https://worldcam.eu/webcams/north-america/panama/17565-pedasi-playa-venao
  — Beach Break Surf Camp is a real surf hostel in Playa Venao). Hosting/CDN entity is
  **VisioRay S.r.l.** (SkylineWebcams' operator), copyright 2011-2026.
- **Live verification:** WebFetch on 2026-08-08 confirmed the page is live (no "OFFLINE" banner,
  showed a "36 online" viewer counter and a real-time clock reading matching the fetch time).
  No independent confirmation the underlying camera itself hasn't gone stale — SkylineWebcams
  pages can show a frozen last-frame while claiming "live" — treat as **PROBABLY LIVE, not
  100% verified at the source**.
- **Stream type:** Not confirmed from static HTML fetch (JS player, likely HLS/m3u8 given
  SkylineWebcams' standard tech stack across their network — UNVERIFIED for this specific cam,
  would need a browser/network-trace to confirm the manifest URL).
- **Refresh rate:** Presented as continuous live video with a time-lapse/archive feature, not a
  slow-refresh still image.
- **ToS on automated capture: EXPLICITLY FORBIDDEN.** See section 8 — SkylineWebcams' own
  Terms of Use (VisioRay S.r.l.) prohibit reproducing frames "extracted or captured through
  photography, screenshots or any other device" without prior written authorization. **Do NOT
  scrape/capture this cam without contacting info@visioray.com first.**

### Santa Catalina — cam exists but was OFFLINE at check time

- **URL:** https://www.skylinewebcams.com/webcam/panama/veraguas-province/santa-catalina/santa-catalina.html
- **Owner/source:** SkylineWebcams (VisioRay S.r.l.). Description: "panoramic view of the
  area's coastline... gentle waves lapping the shore, framed by towering palm trees" —
  this reads as a general coastal/resort view, **not confirmed to be framed on the actual
  La Punta surf break** (Santa Catalina's famous point break). Treat spot-accuracy as UNVERIFIED.
- **Live verification:** WebFetch on 2026-08-08 showed an **"OFFLINE"** label under the player.
  Camera is not currently broadcasting. This is exactly the kind of silent failure a vision
  pipeline needs to detect and gracefully degrade around — a webcam-based system cannot assume
  100% uptime even for its best sources.
- **ToS:** Same SkylineWebcams/VisioRay terms as above — automated capture forbidden without
  written authorization.

### Punta Chame

- **URL found:** https://spotcameras.com/en/cams/North-America/Panama/278-Punta-Chame-Beach-Panama
  (SpotCameras aggregator listing).
- **Live verification: UNVERIFIED.** WebFetch returned HTTP 403 Forbidden (site blocks the
  fetcher's user agent) both on first and retry. Could not confirm live status, owner, stream
  type, or ToS from this research pass. Flag for a follow-up check with a real browser
  (claude-in-chrome) if Punta Chame is high priority — it's a kitesurf/wind destination that
  may have a kite-school-operated cam not surfaced by search.

### Rio Mar, Playa Malibu, Serena — NO CAM

- Surfline's own listing pages for **Playa Malibú, Playa Serena, and Rio Mar all explicitly
  show "No cam"** (confirmed via search result text off surfline.com/surf-report/... pages,
  accessed 2026-08-08).
- **surf-forecast.com is NOT a camera source** — checked directly via WebFetch for Playa
  Malibu (https://www.surf-forecast.com/breaks/Playa-Malibu_2/webcams/latest) and Playa Venao
  (https://www.surf-forecast.com/breaks/Playa-Venao/webcams/latest): both are **placeholder
  pages with no actual embedded feed**, carrying the boilerplate text "We link you straight to
  cams owned by locals — we never install our own cameras" and a form asking users to *suggest*
  a webcam URL. Every Panama break checked on surf-forecast.com showed this same empty
  placeholder. **Do not treat surf-forecast.com/breaks/*/webcams/latest as a working camera
  source for Panama** — it is a directory shell, not live infrastructure, at least for these
  spots today.

### Bocas del Toro (Paunch, Bluff, Carenero/Careneros) — NO CAM

- No dedicated webcam found for any Bocas del Toro break via web search (Playa Bluff, Playa
  Paunch, Careneros, Dumpers, Silverbacks). Surf guide sites (deepswell.com, stormrider.surf,
  mywavefinder.com, thesurfatlas.com) all provide spot guides/forecasts with no live-cam
  mentions. Surfline lists "La Playita (Bocas del Toro)" surf-report page but no cam is
  referenced.

### Isla Grande, Playa Blanca, Farallon, Cambutal, Morrillo, Playa Teta, Coiba — NO CAM

- Checked via WebFetch: https://es.surf-forecast.com/breaks/Isla-Grande/webcams/latest — same
  empty placeholder pattern, no actual feed.
- Surfline explicitly lists **Playa Morrillo and Punta Teta as "no cam."**
- No webcam found in search for Playa Blanca (Rio Hato/Coronado region), Farallon, Cambutal
  (Hotel Playa Cambutal has a website but no live cam found), or Coiba (a national park —
  remote, no infrastructure expected; UNVERIFIED but very unlikely).

### Practical read for the app

Building a "live camera grid" feature on existing public Panama surf webcams is **not
currently viable** — there are effectively 1-2 real feeds, one of which was down when checked,
and the one live one legally forbids automated capture without a licensing conversation. This
strongly supports the user's own instinct that human spotters (WhatsApp) or user-submitted
photos are the actual path to visual ground truth, not scraping existing infrastructure.

---

## 2. Webcam aggregators covering Panama

STATUS: REJECT for automated capture on all commercial aggregators checked; MAYBE as a
manual-link/embed layer only.

### Surfline

- URL: https://www.surfline.com/surf-reports-forecasts-cams/panama/3703430
- Surfline does show cams for *some* Panama spots (title metadata for the Playa Venao page
  reads "...Surf Cam", implying a cam exists there — likely the same or a licensed feed).
  Santa Catalina's Surfline page title has no "Surf Cam" suffix, consistent with no cam.
- **ToS: automated capture explicitly prohibited.** Confirmed via
  https://www.surfline.com/terms-of-use (accessed 2026-08-08 via search-result text, direct
  WebFetch returned 403): Surfline's terms prohibit "robots, spiders, scrapers, or other
  automated means" and any "manual, automated, or programmatic methods to crawl or extract
  data, including scraping, web harvesting, or web data extraction." Live cam video and "Cam
  Rewind" content is explicitly called out as copyrighted. **No public API** — Surfline told
  its own support forum that business/partnership access requires emailing
  support@surfline.com. **FLAG: do not build any automated capture against Surfline. If their
  Panama coverage is wanted, it requires a commercial partnership conversation, not scraping.**

### WorldCam (worldcam.eu)

- URL: https://worldcam.eu/webcams/north-america/panama/
- Functions as a mirror/directory of other providers' cams (its Playa Venao listing is itself
  a re-embed of the SkylineWebcams feed, crediting "provider website: skylinewebcams.com").
  Does not appear to be an independent source — inherits SkylineWebcams' ToS restrictions.
  35,267 recorded visits on the Venao listing suggests some public usage/traffic but not
  independent licensing.

### SkylineWebcams

- Already covered in detail in section 1. Largest actual presence in Panama generally
  (https://www.skylinewebcams.com/en/webcam/panama.html lists multiple Panama cams, mostly
  Panama City / Canal / general tourism, plus the two surf-adjacent ones found). **ToS forbids
  automated frame capture without written authorization from VisioRay S.r.l.**

### SpotCameras

- URL: https://spotcameras.com/en/cams/North-America/Panama/ — lists Punta Chame. Blocked
  WebFetch with 403 both attempts; ToS UNVERIFIED. Given it's a small aggregator in the same
  category as WorldCam/WebcamGalore, assume similar "ask permission before automated use"
  posture until verified otherwise — do not build against it without checking its terms
  directly (ideally via a real browser session, not a bot-blocked fetch).

### Webcam Galore, LiveBeaches, Webcamtaxi, opencctv.org, meteoblue webcams

- All function as directories/mirrors of the same small set of underlying feeds
  (SkylineWebcams, Windy, or local operators), not independent Panama surf infrastructure.
  meteoblue's "Webcams around Panama City" (https://www.meteoblue.com/en/weather/webcams/panama-city_panama_3703443)
  covers Panama City proper, not surf breaks. Not separately investigated in depth — low
  expected marginal value given the pattern above; flag as low priority for follow-up.

### EarthCam

- URL: https://www.earthcam.com/ — searched specifically for Panama coverage. **No Panama
  surf-coast coverage found.** EarthCam's "Panama" results are all **Panama City Beach,
  Florida** (a same-named but unrelated US Gulf Coast beach town) plus Panama Canal
  infrastructure cams (Centennial Bridge, Pedro Miguel Locks) via a different aggregator
  (cruisingearth.com), not EarthCam's own Panama-country product. **Do not confuse "Panama
  City Beach FL" results with the country of Panama** — this is an easy and important mixup
  a naive search/agent could make.

### YouTube live streams

- Searched directly; found only **Surfline TV's global 24/7 live cam channel**
  (https://www.youtube.com/watch?v=hm9iAviOZ20), which cycles through Surfline's global camera
  network wherever it's daylight — not a dedicated Panama channel, and inherits Surfline's
  copyright/ToS restrictions if captured. No standalone Panama-beach 24/7 YouTube live stream
  found. UNVERIFIED whether one exists but wasn't surfaced by search — worth a follow-up search
  in Spanish for specific hotels ("Playa Venao en vivo YouTube", "Bocas del Toro en vivo").

### Insecam — explicitly REJECTED, do not use

- URL: insecam.org (not linked further intentionally). This is a directory of **unsecured /
  default-password IP cameras streamed without their owners' knowledge or consent** — described
  by CBS News and multiple security outlets as exposing a security failure, not a legitimate
  camera network (https://www.cbsnews.com/news/site-exposes-security-weakness-in-thousands-of-webcams/,
  https://en.wikipedia.org/wiki/Insecam). **Per the task rules and basic legality: never use
  Insecam as a data source.** Flagging explicitly per the user's instruction to note it and not
  use it.

---

## 3. Windy Webcams API

STATUS: MAYBE — real, well-documented, genuinely free-tier-usable product, but **Panama
surf-spot coverage looks thin-to-none** based on what surfaced in this research pass; treat
Panama camera *count* as UNVERIFIED without an authenticated API call (search/WebFetch alone
couldn't enumerate Windy's actual Panama webcam inventory — their interactive map is JS-driven
and the docs pages are gated behind partial content in a plain fetch).

- **Docs:** https://api.windy.com/webcams/docs and https://api.windy.com/webcams/api/v3/docs
  (accessed 2026-08-08).
- **Auth:** API key required, sent as header `x-windy-api-key: API_KEY`. Get a free key from
  the Windy API key manager.
- **Endpoints (v3):** `/webcams/api/v3/webcams` (search/list) and
  `/webcams/api/v3/webcams/{webcamId}` (single webcam detail). Search supports filtering by
  country, category, and location per the docs summary — exact query parameter syntax
  (bounding box vs radius-from-point) wasn't fully retrievable via plain WebFetch; would need
  to actually call the API with a key to confirm (`GET .../webcams?bbox=...` or similar).
- **Free tier limits (confirmed from pricing page,** https://api.windy.com/webcams/pricing,
  accessed 2026-08-08):
  - Image URLs (returned tokens) expire after **10 minutes** on free tier vs **24 hours** on
    Professional.
  - Free tier: **"Image size is limited"** (only low-res images, not full resolution); Player
    embed size is unlimited.
  - Free tier: pagination **offset capped at 1,000** results (Professional: 10,000).
  - Free tier explicitly carries **ads** in the embedded player; Professional is ad-free.
  - **Professional tier price found: $9,990/year** — this is a meaningful signal that Windy's
    business model assumes commercial users pay a lot; the free tier is meant for
    hobby/low-volume use, not a production app's primary camera backbone.
  - Daily/monthly request-count rate limit: **not found in the fetched pages** — UNVERIFIED,
    would need Windy Community forum confirmation or a support ticket.
- **License/attribution:** Free tier requires crediting Windy as the image provider (per a
  Windy Community forum thread surfaced in search:
  https://community.windy.com/topic/32556/webcams-api-free-tier-usage-in-an-app). Full terms
  live at a `/webcams/terms` page not independently re-fetched in this pass — UNVERIFIED,
  read before shipping.
  Community relevant threads found: https://community.windy.com/category/31/webcams-api and
  https://community.windy.com/topic/30130/offset-is-over-free-api-tier-limit-10000/2
- **Third-party MCP wrapper exists:** https://github.com/Cyreslab-AI/windy-webcams-mcp-server
  — an unofficial Model Context Protocol server wrapping this API, evidence the API is at
  least stable/usable enough for a side project to build on, but not evidence of Panama
  coverage specifically.
- **Panama coverage:** Search results for "Windy webcams Panama" surfaced only **Panama City
  urban/canal cameras** — Miraflores Locks, Pedro Miguel Locks, Centennial Bridge, Calidonia/
  Avenida Balboa/Punta Paitilla. **No surf-beach camera in Windy's Panama listing surfaced in
  this search pass.** This is consistent with section 1's finding that Panama's surf coast
  webcam infrastructure is very thin generally — Windy is an aggregator, it can't show cameras
  that don't exist. **Recommend a direct authenticated API call** (`GET /webcams/api/v3/webcams?near=8.40,-80.12,50` — syntax to confirm) to get a definitive Panama Pacific-coast count
  before ruling this out completely; this research pass could not do that without a key.
- **Streams vs still images:** Docs describe an "images" object (current/preview/thumbnail
  URLs) and a "player" embed; the free tier's image is a still frame with the URL token
  refreshing over time, not a raw HLS manifest handed to you — a poll-the-still-image pattern,
  not video ingestion. This matters for a vision-model pipeline: still-image polling is
  actually a GOOD fit for periodic (e.g. hourly) vision-model rating, cheaper than video.
- **Cost implication:** $0 to start (free key), degrades to token-refresh friction (10-min
  expiry means you can't cache a URL long-term, must re-hit the API each time you want a fresh
  frame) and low resolution. If Panama coverage turns out to be zero for surf spots, this API
  is not useful for THIS app regardless of price — verify coverage before investing integration
  time.

---

## 4. Satellite visible imagery

STATUS: REJECT for wave-quality ground truth. MAYBE (low value) for cloud/rain-squall context
only. Sentinel-2 sun-glint wave detection is a real scientific technique but not deployable as
an operational "is it good today" signal for this app. See also `05-model-and-satellite-data.md`
section 11 for the numerical/model side of GOES data — this section covers only the visible
(human-eye-like) imagery angle relevant to "seeing" the coast.

### GOES-16 / GOES-19 ABI visible imagery

- Source: NOAA GOES-R series, ABI (Advanced Baseline Imager). Docs:
  https://www.goes-r.gov/spacesegment/abi.html, https://www.noaa.gov/jetstream/goes_east,
  beginner's guide PDF: https://www.goes-r.gov/downloads/resources/documents/Beginners_Guide_to_GOES-R_Series_Data.pdf
  (all accessed 2026-08-08).
- **Resolution:** Visible red band (Band 2) = **0.5 km/pixel at nadir** (best case, directly
  under the satellite — Panama is not at nadir for GOES-East so effective resolution is
  somewhat coarser off-angle). Other visible/near-IR bands run 1-2 km/pixel.
- **Refresh rate:** Full disk every **10 minutes** (default Mode 6 flex mode since April 2019).
  CONUS/regional sector every **5 minutes**. Mesoscale sector (a small, selectable ~1000km box)
  every **60 seconds**, or **30 seconds** if running two overlapping mesoscale sectors. A
  mesoscale sector CAN be pointed at Panama and would give near-real-time (30-60s) visible
  imagery, but at that refresh rate you're still capped at the same 0.5-2km spatial resolution.
- **Honest assessment — what 0.5-2km pixels physically can and cannot show:**
  A wind swell wave is on the order of **1-3 meters high with a wavelength of tens of meters**.
  A single GOES visible pixel covers **500m x 500m minimum** — roughly the area of ~10 football
  fields. Individual waves, whitewash lines, or even the difference between clean vs blown-out
  conditions are **physically far below what this instrument can resolve**. What GOES visible
  imagery CAN legitimately tell you: cloud cover over the coast (sunny vs overcast — useful for
  "is it a nice day," not "is it good surf"), large-scale storm systems and rain bands
  approaching (useful for the "storm swell inbound" narrative days in advance, which is really
  a proxy for the wave *model* forecast, not a visual read of the ocean), and fog/haze. It
  **cannot** show wave height, wave period, cleanliness, wind texture on the water, or crowd —
  the things surfers actually care about and what the WhatsApp spotters currently provide.
  **Do not market or build anything that implies "we can see the waves from space" — this would
  be misleading users about resolution physics.**
- **Access:** Free via NOAA CoastWatch, AWS Open Data (`noaa-goes16`/`noaa-goes19` S3 buckets),
  or the STAR imagery viewer (https://www.star.nesdis.noaa.gov/GOES/). No cost, but per doc 05
  this requires GRIB2/NetCDF-style handling for the raw data or simple PNG pulls for the
  pre-rendered STAR viewer images — the pre-rendered PNGs are the low-effort path if only a
  "here's today's cloud picture" widget is wanted.

### Sentinel-2 / Planet — sun glint wave detection

- **Feasibility: scientifically real, operationally impractical for this app.** Multiple
  peer-reviewed sources confirm sun glint imagery from Sentinel-2's MSI instrument (10m/pixel)
  can extract **directional wave spectra and surface roughness** under favorable sun-glitter
  geometry: ESA's own explainer (https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Glitter_helps_to_monitor_ocean_waves),
  and the Kudryavtsev et al. method exploiting Sentinel-2's staggered multi-detector offset to
  derive 2D wave spectra for wavelengths >20m (accessed via search results, 2026-08-08,
  including https://www.sciencedirect.com/science/article/pii/S0034425718300105 on
  ASTER-equivalent multi-angle sun glitter).
- **Why it doesn't fit this app:** (1) Sentinel-2 revisit time over any given point is
  **~5 days** (10m constellation of two satellites) — nowhere close to "what's it doing right
  now" cadence surfers need. (2) The technique only works under specific sun-angle/glint
  geometry — not every pass is usable. (3) It resolves swell WAVELENGTH/direction in open
  water, not breaking-wave height or rideability at a specific reef/beach break — the
  nearshore bathymetry interaction that actually determines surf quality is a totally
  different, much higher-resolution problem. (4) Processing this requires real remote-sensing
  expertise (multi-band offset correlation), far beyond a "pull an image and look at it"
  pipeline. **Verdict: interesting science, not a product feature. Do not pursue for v1 or
  probably ever for this app's scale.**
- SAR-based alternatives (Sentinel-1) were also surfaced: SAR has a **150m wavelength cutoff**
  in azimuth, meaning it also cannot resolve the wind-wave/wind-swell scales (tens of meters)
  that matter for surf — only longer-period ground swell in open ocean, and only for spectral
  analysis, not a visual "check the cam" experience.

### Cost implication

Free (all sources above are open government/ESA data), but the cost isn't the blocker — the
**physics is the blocker**. No satellite visible-imagery source, free or paid, gets close to
the resolution needed to assess surf quality at a specific break. This is the most important
finding of this section: satellite imagery is not a substitute for webcams or human eyes for
this use case, full stop. It's a legitimate input to the *forecast* side of the app (cloud
cover, storm tracking — see doc 05) but not the *live visual ground truth* side.

---

## 5. User-generated imagery (UGC) as primary vision source

STATUS: USE — this is the most practically viable "vision replaces spotters" path given
section 1's finding that Panama has almost no usable existing camera infrastructure. Feasibility
4/5 (straightforward engineering, main risk is getting enough submission volume/habit, not tech).

### The pipeline

1. User in the water or on the beach takes a phone photo/video of the lineup, uploads via app.
2. Extract EXIF metadata: GPS lat/lon, capture timestamp, device orientation.
3. Match GPS to nearest known surf spot (same geocoding problem the app already has to solve
   for named breaks).
4. Run a vision-capable LLM (Claude/GPT-4V/Gemini) on the image with a structured prompt asking
   for: estimated wave face height (using surfers/objects in frame as a reference scale — see
   prior art section 6), general condition tags (clean/blown-out/glassy/onshore-chop), crowd
   count, and a confidence score.
5. Store the image + extracted structured data + timestamp + geotag, surfaced as a "recent
   visual report" for that spot, decaying in relevance over a few hours (surf conditions move
   fast — a 6-hour-old photo is closer to useless than a 6-hour-old wind reading).

### EXIF geotag/time extraction — accuracy and caveats

- Modern smartphone GPS EXIF is genuinely reliable: **3-5m accuracy in open sky** (iPhone),
  Android flagships with dual-frequency GPS can hit sub-meter, budget Android phones **5-10m**.
  Degrades to 10-15m in dense urban/tree cover (source: aggregated from
  https://exifreader.org/blog/gps-exif-data-guide-interpret-photo-location-protect-privacy and
  https://fast.io/resources/geolocation-metadata-extraction-from-photos/, accessed 2026-08-08).
  For matching "which beach is this" that's more than accurate enough — surf spots are
  typically hundreds of meters to kilometers apart.
- **Caveats that matter for product design:** (1) GPS EXIF is only present if the user's OS
  location permission was granted to the camera app AND a GPS fix was acquired — **many users
  will have this off**, especially privacy-conscious ones, so the app needs a manual
  "pick your spot" fallback, not a hard dependency on EXIF GPS. (2) EXIF is trivially editable/
  stripped — don't treat it as tamper-proof for anything adversarial (e.g. contest/leaderboard
  gaming), only as a UX convenience. (3) Many social apps and messaging clients (WhatsApp
  itself included) **strip EXIF data on send/compression** — if users share via WhatsApp
  forwarding before it reaches your app, geotag may already be gone. Capture directly in-app
  (native camera intent) to preserve EXIF; don't rely on re-shared images.
- Timestamp: EXIF capture time is generally reliable but is in the device's local clock, not
  guaranteed UTC — normalize on ingest.

### Vision-model rating — feasibility

- No published research found specifically on "LLM rates surf conditions from a lineup photo."
  Adjacent, informative prior art: a "FloodDepth-GPT" approach uses GPT-4V with known reference
  objects (cars, people, street signs) to estimate flood depth from photos — same reference-
  scale trick applicable to wave height using surfers as the ruler (surfers/boards are a
  well-known consistent reference in real surf forecasting — surf reports are traditionally
  measured "waist high," "head high," "overhead" against a person). Source: search results
  referencing arxiv papers on GPT-4V for street-view/quantitative estimation tasks (accessed
  2026-08-08) — treat specifics as UNVERIFIED, this is inference from adjacent work, not a
  direct study of surf photos.
  One relevant caveat from that adjacent literature: GPT-4V **"showed limited accuracy" on
  building-height estimation** with inconsistent results on unclear/occluded views — expect
  the same class of error on wave height from amateur photos (bad angle, no clear reference
  person, backlighting). **Design for a coarse categorical output (small/waist/chest/head/
  overhead + clean/choppy/blown-out) rather than a precise meter figure** — that's both more
  honest about the model's real precision and matches how surfers actually talk anyway.
- A hobbyist project (Medium, "Surf Smarter: Building a Wave Height Detector with Computer
  Vision," https://medium.com/@jose_82797/surf-smarter-building-a-wave-height-detector-with-computer-vision-72d9a2e29743,
  accessed 2026-08-08) trained a custom YOLOv5 model on webcam footage with a fixed 1.7m
  reference height, and reported **weak results specifically on wave detection** ("not that
  good results for the waves," attributed to insufficient training data, low video quality,
  and camera-angle variety) despite good results on static objects like rocks. Read this as a
  caution: purpose-built small CV models struggle here too, not just general LLMs — this is a
  genuinely hard visual estimation problem, not a solved one. A modern multimodal LLM
  (Claude/GPT-4V/Gemini) with good prompting is a more promising and much lower-effort starting
  point than training a custom detector, given no large Panama-specific labeled dataset exists.

### Moderation needs

- Public-facing UGC upload needs baseline content moderation (nobody wants a beach-photo app
  to become an unmoderated image host). AWS Rekognition content moderation: **$0.001/image**
  (first 1M/month), with a free tier of 5,000 images/month for 12 months
  (https://aws.amazon.com/rekognition/pricing/, accessed 2026-08-08). Google Cloud Vision:
  ~$1.50/1,000 images (~$0.0015/image), first 1,000/month free. Either is trivially cheap at
  any realistic Panama-surf-app volume (even 10,000 uploads/month = $10 or less). Cost is a
  non-issue; just don't skip it — one inappropriate-image incident is worse than the entire
  moderation budget for a year.

### Storage cost

- Cloudflare R2: **$0.015/GB/month storage, free egress** (vs S3's $0.023/GB/month + $0.09/GB
  egress after the first 100GB) — sources: https://mecanik.dev/en/posts/cloudflare-r2-pricing-explained-real-costs-vs-s3-and-backblaze/,
  https://www.buildmvpfast.com/api-costs/cloud-storage (accessed 2026-08-08). For a
  photo-serving app where users repeatedly view recent shots, **R2's free egress makes it the
  clearly better choice over S3** — at even modest scale (100GB stored + 500GB/month served)
  the illustrative comparison found was ~$1.50/month on R2 vs ~$47/month on S3. A typical
  phone photo (2-8MB) means thousands of images cost cents/month to store on R2; the real cost
  driver would be video if that's ever added, not photos.
- Recommend: downsize/re-encode uploads server-side (e.g. cap at 1920px longest edge, WebP) to
  keep both storage and the vision-model API's per-image token/cost footprint down — full-res
  phone photos are overkill for both the vision model and the display use case.

### Cost implication summary

Cheapest and most controllable of everything investigated in this doc: no licensing
negotiation (unlike Surfline/SkylineWebcams), no physics ceiling (unlike satellite), and the
per-unit costs (moderation ~$0.001-0.0015/image, storage ~$0.015/GB/month, vision-model API
call — see doc 02 for LLM API pricing specifics) are all cents-scale. The real cost is product/
growth work: getting surfers to actually open the app and submit a photo when they're at the
beach, which is a UX and incentive-design problem, not an infrastructure one.

---

## 6. Prior art — automated surf-cam / coastal video analysis

STATUS: USE (as design inspiration/reference, not as infrastructure to build on top of).
CoastSnap in particular is a strong structural model for the UGC flow described in section 5.

### CoastSnap — the closest analog to what this app needs, ★ strongest model

- URL: https://www.coastsnap.com/ (project home), background:
  https://www.coastsnap.com/explore/background, academic write-up:
  https://www.sciencedirect.com/science/article/pii/S0278434322001492 ("CoastSnap: A global
  citizen science program to monitor changing coastlines"), Spanish-network paper:
  https://www.sciencedirect.com/science/article/pii/S0964569124002655. All accessed 2026-08-08.
- **What it is:** A physical stainless-steel phone cradle bolted to a fixed point overlooking a
  beach. Passers-by (not necessarily surfers — general beachgoers) drop their phone into the
  cradle, which forces a **consistent camera position and angle every time**, snap a photo, and
  upload it (originally via email/social tag, now via a dedicated app run by SPOTTERON:
  https://www.coastsnap.com/explore/about-the-project/about-the-coastsnap-app).
- **Why the fixed cradle matters:** because every photo is taken from the *exact same physical
  vantage point*, CoastSnap can apply **photogrammetric rectification** to convert 2D photos
  into geometrically accurate shoreline position data — turning a crowd of untrained phone
  photos into scientific-grade coastal-change measurement, described as achieving accuracy
  "similar to professional coastal survey teams."
- **Scale/adoption:** Grew from one station in Sydney (2017) to **200+ monitoring stations
  across 21 countries** by ~2022; the Australian sub-network alone logged **10,000+ images from
  4,000+ community participants**.
- **Direct lesson for this app:** CoastSnap's core insight — constrain the *capture geometry*
  (fixed physical mount, or at minimum a fixed known camera bearing) rather than accepting
  fully arbitrary phone angles — is what makes their data quantitatively useful, not just
  qualitatively nice. **This app almost certainly does NOT need physical cradles** (that's
  infrastructure/install cost this app shouldn't take on for v1), but it suggests a cheap
  software equivalent: prompt users to shoot from a known landmark/angle at popular breaks
  ("stand at the palapa, face the point"), or at minimum use device compass/orientation
  metadata to tag roughly which direction the photo faces, which both helps the vision model's
  prompt context and could support rough rectification later if ambitious. **This is the single
  best piece of prior art for the product's UGC design** — recommend reading the CoastSnap app
  UX directly (SPOTTERON's app on iOS: https://apps.apple.com/us/app/-/id1529921850) before
  designing the panama-surf upload flow.
- **What CoastSnap does NOT do:** it measures shoreline *position* (erosion/accretion), not
  wave height or surf quality — it's a geomorphology tool, not a surf-conditions tool. The
  photogrammetry technique is reusable; the actual measurement target is different from what
  this app needs (which is closer to "is it good to surf" than "did the beach erode").

### Argus Coastal Monitoring — the academic-grade original

- URL: https://www.coastalwiki.org/wiki/Argus_video_monitoring_system,
  https://en.wikipedia.org/wiki/Argus_Coastal_Monitoring (accessed 2026-08-08).
- Pioneered 1990 by the Oregon State University Coastal Imaging Lab. A full Argus station is
  **4-5 fixed cameras spanning 180°, covering 4-6km of coastline**, sampling pixel intensities
  at up to 2Hz to build "Timex" (time-exposure averaged) images, from which shoreline position,
  bathymetry, wave period/direction, and longshore currents can be derived.
  ~30 stations / 120 cameras operating globally across 8 countries per sources found.
- **Relevance:** This is heavyweight, purpose-built, expensive fixed infrastructure — the
  opposite of this app's constraint (no capital for camera installs in Panama). Useful as
  the scientific baseline showing what's *possible* with dedicated infrastructure, and as the
  intellectual ancestor of both CoastSnap and SurfRCaT below. Not directly actionable for a
  bootstrapped app.
- **Technique worth borrowing:** "Timex" (time-averaged) images make breaking-wave zones
  visually obvious (whitewater blurs into a bright band) even from a single ordinary camera
  frame sequence — a cheap, well-validated way to visually estimate the surf zone width/breaker
  line from ordinary video without expensive equipment, referenced in
  https://www.mdpi.com/2072-4292/12/2/204 ("Breaking Wave Height Estimation from Timex Images:
  Two Methods for Coastal Video Monitoring Systems"). If this app ever ingests short video
  clips instead of single photos, computing a Timex-style average frame before running vision
  analysis is a well-established, cheap preprocessing trick.

### SurfRCaT — remote calibration of existing (non-purpose-built) cameras

- URL: https://www.sciencedirect.com/science/article/pii/S2352711020302971 (ScienceDirect),
  USGS listing: https://www.usgs.gov/publications/surfrcat-a-tool-remote-calibration-pre-existing-coastal-cameras-enable-their-use,
  SECOORA announcement: https://secoora.org/new-open-source-tool-to-remotely-calibrate-web-camera-data/
  (accessed 2026-08-08).
- **What it is:** Open-source Python tool (by Matthew Conlin, USGS/SECOORA) that takes a
  **pre-existing, non-scientific webcam** (e.g. a random tourism/hotel cam not designed for
  coastal research — exactly the SkylineWebcams/Beach Break Surf Camp situation this app
  actually faces in Panama) and calibrates it using airborne lidar-derived ground control
  points, producing a rectified bird's-eye-view transform without needing camera specs or
  installer cooperation.
- **Real-world use:** Applied at 6 southeast-US sites for tasks including counting migrating
  right whales, identifying rip currents, and validating wave runup models.
- **Direct relevance:** This is the exact tool category for "we found one existing webcam
  (Playa Venao) and want to extract quantitative data from it" — **if** the ToS/licensing
  question with SkylineWebcams is ever resolved (written authorization obtained), SurfRCaT-style
  calibration could turn that single cam into a real rectified surf-zone view rather than just
  a qualitative "does it look good" glance. **Blocked on the same ToS issue flagged in section
  1/8** — worth revisiting only after a licensing conversation, not before.
- Related USGS paper worth noting: "Automated wave runup monitoring using coastal CCTV cameras
  for tsunami detection" (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12738557/) — shows the
  same calibrate-an-existing-CCTV-cam approach applied to hazard monitoring, reinforcing this
  is a mature, reusable technique, not experimental.

### Surfline "Cam Rewind" / SurfZone AI

- Search surfaced a headline — "Surfline revolutionizes beach monitoring with SurfZone AI"
  (https://www.surfertoday.com/surfing/surfline-revolutionizes-beach-monitoring-with-surfzone-ai)
  — but the source article itself returned **HTTP 403 on WebFetch**, so technical details
  (what the model actually does, whether it's wave-height estimation, crowd counting, or
  something else) are **UNVERIFIED** from this research pass. What IS independently confirmed:
  Surfline's Terms of Use explicitly protect "Cam Rewind" content as copyrighted material
  (section 2/8), meaning whatever SurfZone AI does, it operates on Surfline's own
  proprietary/licensed camera network under their own ToS — not a technique available to scrape
  or replicate against their cams. Treat as evidence that "vision-model-rates-the-cam" is a
  validated product direction (a well-funded incumbent is building the same idea), not as a
  technical blueprint — no method details were retrievable.

### Overall prior-art takeaway

The field splits into two lineages: (1) **fixed-infrastructure academic coastal video
monitoring** (Argus → SurfRCaT for retrofitting existing cams) aimed at shoreline/geomorphology
science, and (2) **citizen-science crowdsourced photo** (CoastSnap) aimed at the same
measurement goal but via volunteers instead of fixed cameras. Nobody found in this research
has published a general-purpose "rate today's surf quality from any random photo" system —
that specific product doesn't appear to exist yet outside of Surfline's opaque internal
SurfZone AI. That's actually a point in favor of building it: CoastSnap proves crowdsourced
phone photos + centralized processing works operationally at scale (200+ stations, thousands of
users), and this app's target output (coarse categorical "how's it looking" ratings, not
scientific-grade shoreline geometry) is a *lower* precision bar than what CoastSnap already
achieves for a harder problem (rectified position measurement).

---

## 7. Open questions / UNVERIFIED items

- Punta Chame webcam (spotcameras.com) — live status, owner, and ToS could not be verified;
  WebFetch was 403-blocked. Needs a real-browser check (e.g. claude-in-chrome) if this spot
  matters (it's more a kitesurf destination than a surf-break priority).
- Whether SkylineWebcams' Playa Venao stream is actually HLS/m3u8 or another transport —
  not confirmed from static HTML; would need network-trace via a browser tool.
- Whether the Windy Webcams API v3 actually returns ANY Panama surf-coast camera when queried
  by lat/lon near Venao (8.40N, -80.12W) or Santa Catalina — search/plain-fetch could not
  enumerate Windy's live inventory; requires an authenticated API call with a real key.
  This is the single most actionable follow-up if Windy is being seriously considered.
- Windy Webcams API daily/monthly request rate limit on the free tier — not found in the
  pages fetched.
- Windy Webcams API full terms of service (`/webcams/terms`) — not independently re-fetched;
  read before any production integration.
- Surfline's actual Panama cam list (does it cover Playa Venao, and does Surfline's cam happen
  to be the SAME Beach Break Surf Camp feed licensed from SkylineWebcams, or an independent
  one?) — direct WebFetch to surfline.com returned 403 both times; only search-snippet
  evidence available.
- Whether the SkylineWebcams Santa Catalina camera being offline on 2026-08-08 is a permanent
  shutdown or a temporary outage — worth rechecking on a different day before concluding it's
  dead.
- No Spanish-language search specifically surfaced anything beyond what English search found
  (tried "en vivo," "cámara," "camara playa" — same small set of aggregator sites kept
  recurring). This is reasonably strong (not conclusive) evidence the thin-coverage finding
  isn't an English-search-bias artifact.
- Surfline SurfZone AI / Cam Rewind AI technical method — article source blocked (403),
  genuinely unknown what technique they use.

---

## 8. Flags — ToS-forbidden or out-of-scope items noticed

- **Surfline**: Terms of Use explicitly prohibit automated/robotic/scraping access and treat
  live cam + Cam Rewind content as copyrighted. No public API exists; partner access requires
  contacting support@surfline.com. **Do not scrape.**
- **SkylineWebcams / VisioRay S.r.l.** (covers the Playa Venao and Santa Catalina cams found):
  Terms of Use explicitly forbid reproducing "frames that are generated by the webcams,
  extracted or captured through photography, screenshots or any other device" without prior
  written authorization from VisioRay. **The one live, working Panama surf cam found in this
  entire research pass is legally off-limits for automated capture without a licensing
  conversation.** This is a genuinely important finding for the app's roadmap — flagging it
  prominently rather than burying it.
- **Insecam**: unauthorized/unsecured camera directory, exposes cameras without owners' consent.
  Explicitly instructed not to use, and would not use regardless — flagging per task
  instructions.
- **Out of scope but noticed**: the Panama Canal Authority (pancanal.com) runs its own official
  webcam ("New Web Cam Invites All to Experience the Panama Canal") — not remotely relevant to
  surf, noting only because it kept surfacing in "Panama webcam" searches and could confuse a
  future search pass.
- **Out of scope but noticed**: "Panama City Beach, Florida" (a US Gulf Coast town, unrelated
  to the country of Panama) dominates English-language "Panama beach webcam" search results by
  sheer volume (Sandpiper Beacon Resort, pcbeach.org, EarthCam, etc.) — a real risk of a future
  research/build pass accidentally wiring up the wrong country's cameras if not careful with
  query specificity.

---

## Summary

Panama's surf coast has almost no usable existing camera infrastructure: of 16 named spots,
only Playa Venao and Santa Catalina have any live webcam at all (both via SkylineWebcams), and
Santa Catalina's was offline when checked (2026-08-08). Worse, the one working cam's owner
(VisioRay/SkylineWebcams) explicitly forbids automated frame capture in its ToS without written
permission — same story for Surfline, which also has no public API. Windy's Webcams API is a
real, well-documented, genuinely free-tier-usable product ($0 to start, still-image polling
model, 10-min token expiry), but this pass found zero evidence of Panama surf-coast coverage in
its inventory — only Panama City canal/urban cams — and that needs a direct authenticated API
call to confirm definitively. Satellite visible imagery (GOES 0.5-2km/pixel, Sentinel-2 sun
glint 10m/pixel but ~5-day revisit) is honestly a dead end for wave quality: the physics simply
can't resolve meter-scale waves, useful only for cloud/storm context, not a webcam substitute.
The realistic and genuinely promising path is user-generated phone photos: EXIF GPS is accurate
enough (3-10m) to auto-match a spot, moderation and storage costs are trivially cheap
(cents/image, cents/GB on Cloudflare R2), and CoastSnap proves at 200+ stations and thousands of
users worldwide that crowdsourced phone photos plus centralized processing works operationally
— its fixed-cradle-for-consistent-angle trick is directly reusable as a lighter software
equivalent here. Verdict: build the UGC-plus-vision-model pipeline, not a webcam scraper.
