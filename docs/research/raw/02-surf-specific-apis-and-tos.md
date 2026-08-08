# Surf-Specific Data Providers — APIs, ToS, and Legal Access (Panama Surf App)

Research date / access date for all citations below: **2026-08-08**, unless a different date is shown next to a specific quote (e.g. "Last Updated" dates published on the source page itself).

Scope: for each provider — documented public API?, undocumented endpoint + ToS risk (quoted verbatim), pricing/partner program, Panama spot coverage, verdict (LEGALLY USABLE / GREY / PROHIBITED). Plus open community surf-spot geodata, and embeddable widgets/affiliate links as a legitimate alternative to scraping.

Method note: some ToS pages blocked direct fetch. For each, a follow-up `curl` with a browser User-Agent was attempted directly against the raw HTML (not through WebFetch) to independently confirm or refute the proxy-derived quotes:
- **Surfline** (`surfline.com/terms-of-use`): `curl` confirmed a genuine **HTTP 403** at the network level (not a WebFetch-specific block) — bot-blocked regardless of tool. The quoted clauses below came from a text-extraction proxy (r.jina.ai) and could **not** be independently re-verified against raw HTML; flagged accordingly.
- **Windguru** (`windguru.cz/help.php?sec=terms` / `sec=distr`): `curl` returned HTTP 200, but the page is a client-rendered SPA shell (`WG.loadAjaxContent(...)`) — the actual terms text is injected by JS after load and is not present in the raw HTML curl receives (confirmed: both `sec=terms` and `sec=distr` raw HTML are byte-identical shells, 46,562 bytes, differing only in the JS parameter). The terms quote below came from a text-extraction proxy that renders JS; the widget/distribution page's actual terms text could **not** be extracted by any method tried and is reported as unresolved.
- **Stormrider Surf Guides** (`stormrider.surf/terms-conditions`): `curl` succeeded directly (HTTP 200, 212,894 bytes) and the quoted clauses below were confirmed present verbatim in the raw HTML — **fully verified against primary source**, no proxy needed.

Elsewhere, quotes are marked **UNVERIFIED** where a claim could not be checked against any primary source at all (not even via proxy).

---

## Quick-reference verdict table

| Provider | Public API? | Verdict | Panama coverage |
|---|---|---|---|
| Surfline | No (private/internal only; undocumented JSON endpoints exist but ToS explicitly bans use) | **PROHIBITED** | Yes — has Panama spot pages (e.g. Santa Catalina) |
| Magicseaweed | Dead — site now 301-redirects to Surfline | **PROHIBITED / DEFUNCT** | N/A (dead) |
| Surf-Forecast.com (Meteo365 Ltd) | No public API found | **GREY** (browsing OK, reuse needs a license) | Yes — 44 named Panama breaks confirmed via direct fetch of `/countries/Panama/breaks` |
| Windguru | No public consumer API; has a narrow **upload** API for station owners only (not a data-out API) | **PROHIBITED** for pulling forecast data; widgets are a legitimate alternative | Global forecast coverage (any lat/lon), not spot-curated |
| Windfinder | Commercial "Windfinder for Business" API exists (paid, contact-only) | **LEGALLY USABLE via paid contract**; scraping is **PROHIBITED** | Global station network; Panama-specific coverage unconfirmed (UNVERIFIED) |
| Wisuki | No public API found | **PROHIBITED (default — unconfirmed ToS)** | Claims global coverage; Panama spots UNVERIFIED |
| Glassy | No public API found | **PROHIBITED (default — unconfirmed ToS)** | Claims 18,000+ spots worldwide; Panama UNVERIFIED |
| Surfr / Wavy / Seabreeze / Spot-check apps | No public API found for any | **PROHIBITED (default — unconfirmed ToS)**; Seabreeze is Australia-focused | UNVERIFIED |
| Willyweather | Yes, documented paid API (v2) | **LEGALLY USABLE via paid contract — but Australia-only, not usable for Panama** | **None** — Australia-focused data source |
| Stormrider Surf Guides (Low Pressure Ltd) | No public API | **PROHIBITED** (explicit anti-scraping + commercial-use clauses, verified against raw HTML) | Yes — strong coverage: 27 Southern Panama, 15 Panamá Oeste, 6 Bocas del Toro breaks (region counts); full named lists not itemized on Stormrider's own site in this pass |
| Wannasurf | No public API | **PROHIBITED** for bulk/automated reuse; manual browsing fine | Yes — 53 named Panama spots confirmed via direct fetch (El Palmar Point, Malibu, P Land, Santa Catalina, etc. — full list in body) |
| OpenStreetMap (`sport=surfing` etc.) | Yes — Overpass API, fully open | **LEGALLY USABLE** (ODbL — attribution + share-alike on the database) | Confirmed live via query: 3 tagged features found (see below) — sparse |
| Wikidata | Yes — SPARQL endpoint, fully open (CC0) | **LEGALLY USABLE** but **no surf-break entities found for Panama today** (5 surf-tourism lodging businesses found instead) | 0 break-type results in live query; 5 unrelated lodging results |
| Open-Meteo Marine API | Yes, documented, free | **LEGALLY USABLE** (CC BY 4.0, free non-commercial; paid key for commercial/high-volume) | Global model coverage, includes Panama coastal waters |
| Stormglass.io | Yes, documented, paid | **LEGALLY USABLE via subscription** | Global marine data, worldwide oceans/seas |
| Copernicus Marine Service (CMEMS) | Yes, documented, free w/ registration | **LEGALLY USABLE**, commercial reuse permitted with attribution | Global ocean model coverage including Panama |

---

## Detailed findings

### 1. Surfline (surfline.com)

**Public API:** None documented for third parties. Support Center confirms: *"Surfline currently doesn't provide a public API, but if you are interested in business opportunities, you can contact support@surfline.com."* — [Does Surfline have a forecast API?](https://support.surfline.com/hc/en-us/articles/13883685219227-Does-Surfline-have-a-forecast-API), accessed 2026-08-08 (via search snippet; direct fetch returned HTTP 403).

**Undocumented endpoints:** A private/internal JSON API exists and is widely reverse-engineered by hobbyist developers (see [mpiannucci/surfpy issue #6](https://github.com/mpiannucci/surfpy/issues/6), accessed 2026-08-08 — endpoints for wind/wave/conditions forecasts, two different spot-ID formats). This is evidence the endpoints are technically reachable, **not** evidence they are authorized for third-party use.

**ToS verdict — PROHIBITED.** Fetched [surfline.com/terms-of-use](https://www.surfline.com/terms-of-use) (Last Updated: **October 1, 2024**), accessed 2026-08-08. Direct fetch (both WebFetch and a follow-up `curl` with a browser User-Agent) returned HTTP 403 — this is a genuine network-level bot-block, not a tool artifact. The quotes below came from a text-extraction proxy (r.jina.ai) and **could not be independently re-verified against raw HTML** — flagged accordingly, though the proxy output is internally consistent (correct "Last Updated" date, coherent legal language, cross-references elsewhere on the confirmed-live support site):

> "use any robot, spider, scraper or other automated means to access the Services or portion thereof"

> "use any manual, automated or programmatic method to crawl or extract data, Outputs, or portion of the Services or Content or to circumvent limits on Services, including scraping, web harvesting, or web data extraction"

> "use any data mining, data gathering or extraction method"

> "allows unauthorized API access" — listed among prohibited activities

> Users agree to access the Services "for your own internal, personal use, and not on behalf of or for the benefit of any third party, including without limitation for research, as part of any business, reselling of the Services, or other commercial use." The Services "are not permitted to be used for any commercial purposes."

This is about as unambiguous as a ToS gets: automated access is explicitly named and banned, and commercial use of any kind is separately banned. Building a commercial-ish Panama surf app on top of Surfline's undocumented endpoints would violate this ToS in at least three independent ways (scraping ban, API-access ban, commercial-use ban).

**Partner program:** The **Surfline Compatible Program** exists but is **not a data/API partner program** — it's a device-sync program for session-tracking hardware/apps (Dawn Patrol on Apple Watch/iOS, Rip Curl Search GPS watches, Garmin Surf Activity). Quoted from [support article](https://support.surfline.com/hc/en-us/articles/11996368127387-What-is-the-Surfline-Compatible-Program), accessed 2026-08-08 via proxy: *"The Surfline Compatible Partner Program was created in order to accommodate surfers who want to track using other services/devices and drive innovation in this area."* It syncs session data (e.g. wave clips) into a user's Surfline account — it does not grant forecast-data API access. Not applicable to what we need.

**Pricing:** No public API pricing exists because there is no public API. Business inquiries go through support@surfline.com — outcome unknown/UNVERIFIED (would require direct outreach).

**Panama coverage:** Yes — Surfline has spot pages for Panama (e.g. [Santa Catalina - La Punta](https://www.surfline.com/surf-report/santa-catalina-la-punta/645eb633d296ec83323b094d), found via search, accessed 2026-08-08). Irrelevant to legality since access is banned regardless of coverage quality.

**Verdict: PROHIBITED.** Do not scrape or hit undocumented endpoints. Only path in would be a negotiated commercial data deal via support@surfline.com — unexplored/unverified, and likely to be expensive/restrictive given how aggressively the ToS is worded.

---

### 2. Magicseaweed (MSW)

**Status: dead.** Acquired by Surfline in **2017** (not 2020 — corrected via search: *"In 2017 Magicseaweed was bought by Surfline"*, [Boardsport SOURCE](https://www.boardsportsource.com/newsletter/magicseaweed-acquired-surfline/), accessed 2026-08-08). The public API was closed following acquisition; the *website* kept running until **May 15, 2023**, when it redirected fully to Surfline ([Duke Surf](https://dukesurf.com/en/magicseaweed-will-cease-to-exist/), [Shacked Mag](https://www.shackedmag.com/2023/04/surfline-kills-off-magicseaweed.html), accessed 2026-08-08).

**Direct confirmation:** fetched `https://magicseaweed.com/docs/developers/59/querying-the-api/9909/` (an old MSW API-docs URL) on 2026-08-08 — it now **301-redirects** to `https://www.surfline.com/?referral=msw`. The old developer docs no longer exist at any URL; there is nothing left to legally or illegally access.

**Historical note (secondary source, UNVERIFIED against primary text since the docs are gone):** search results describe the old MSW API as requiring registered API keys and mandating attribution (*"required that any app using them carried various logos and links back to their site, copyright notices and such"*) — consistent with a normal restricted-commercial-API model, now moot.

**Verdict: PROHIBITED / DEFUNCT.** There is no MSW API to use, legally or otherwise. Any code, tutorial, or GitHub repo referencing `magicseaweed.com/api/...` is stale and will only hit the Surfline redirect.

---

### 3. Surf-Forecast.com (operated by Meteo365 Ltd)

**Public API:** None found. No developer/API page discovered on the site; fetched the homepage directly (accessed 2026-08-08) and confirmed: *"No mention of an API for developers appears anywhere on this webpage."*

**Company / copyright:** Footer reads *"© 2026 Meteo365 Ltd. All rights reserved."* (fetched homepage, 2026-08-08).

**ToS:** Fetched [surf-forecast.com/pages/terms](https://www.surf-forecast.com/pages/terms) directly, accessed 2026-08-08. Verbatim:

> "You must not use any part of our Content for commercial purposes without obtaining a licence to do so from us or our licensors."

> "You must not attempt to gain unauthorised access to our Services, the servers on which our Services are stored or any server, computer or database connected to our Services."

Also fetched [surf-forecast.com/pages/acceptable_use](https://www.surf-forecast.com/pages/acceptable_use), accessed 2026-08-08:

> "Not to access without authority, interfere with, damage or disrupt: any part of our site; any equipment or network on which our site is stored; any software used in the provision of our site"

Neither page contains an explicit "no bots/scrapers" clause the way Surfline's does, but the commercial-use clause is unambiguous: **any commercial use of their Content requires a license from Meteo365 Ltd.** Since this app is described as "real commercial-ish," scraping surf-forecast.com's data or spot pages without a licensing conversation would breach this clause.

**Panama coverage — verified directly.** Fetched `es.surf-forecast.com/countries/Panama/breaks` via `curl` (HTTP 200, 111,161 bytes) and parsed the raw HTML for break links, accessed 2026-08-08. **44 unique named Panama breaks** are listed, including: Bluff, Cambutal, Careneros Point Break, Corto Circuito, Cuango, Destiladeros, Dumpers, El Palmer, Esmeralda, First Beach, Hawaiisito, Isla Grande, La Zurda, Lagart Point, Las Bovedas, Maria Chiquita, Mariatos, Modrono, Morro Negrito (+ Rivermouth), Nuevo Loco, Palenque, Panama La Vieja, Paunch Reef, Playa Guanico, Playa Malibu, Playa Mojon, Playa Santa Catalina, Playa Serena, Playa Teta, Playa Venao, Playon, Punta Brava, Quatro Once (411), Rinconsito, Rio Mar, Rocky Point, San Carlos Point, Silva Island (P-Land), Silva Island (Nestles), Silverbacks, Stanleys, V-Land. Individual spot page example: [Playa Santa Catalina](https://www.surf-forecast.com/breaks/Playa-Santa-Catalina).

**Verdict: GREY.** Browsing/reading manually is fine; any automated pull or redistribution of their forecast/spot data for a product is a licensable use per their own ToS — contact them, don't scrape.

---

### 4. Windguru

**Public API:** Windguru's only documented API is an **upload API** for station owners to push their own weather-station data in ([Upload API docs](https://stations.windguru.cz/upload_api.php), accessed 2026-08-08) — this is the opposite direction from what a surf-forecast consumer app needs. There is no documented data-out/forecast-pull API for third parties.

**ToS:** Fetched [windguru.cz/help.php?sec=terms](https://www.windguru.cz/help.php?sec=terms), accessed 2026-08-08. Confirmed via direct `curl` that this URL serves a client-rendered SPA shell — the terms text is injected by JavaScript (`WG.loadAjaxContent(...)`) and is **not present in the raw HTML** delivered to a plain HTTP client. The quote below came from a text-extraction proxy that renders JS, and **could not be independently re-verified against raw HTML** — flagged accordingly:

> "It is forbidden to download website content by automated scripts."

> "All information on this server can only be used for your own personal use and reproduction, republishing, reformatting or any other use of this information without prior agreement is strictly prohibited."

> "Gathering data and information by private person or other legal subject for later study, educational, research, commercial or other applications is not considered private use and prior agreement is required."

This directly bans scraping and bans exactly the "gather Windguru forecast data to power our product" use case without a prior agreement.

**Widget program:** Windguru does offer an official embeddable forecast widget — the page ([windguru.cz/help.php?sec=distr](https://www.windguru.cz/help.php?sec=distr)) is confirmed to exist and is referenced in Windguru's own navigation ("Add to your website" / `share_widget` string found directly in the page's raw JS, confirmed via `curl`, accessed 2026-08-08). However, the actual widget terms text (same SPA-shell problem as above) could **not** be extracted by direct fetch, `curl`, or the text-extraction proxy in this pass — it remains unread. Given the general ToS quote above bans "any other use of this information without prior agreement," and a widget embed is plausibly "other use," **this is a possible legitimate path, not a confirmed one** — do not treat it as cleared. Confirm the actual widget terms with support@windguru.cz before using it on a commercial-ish product.

**Panama coverage:** Windguru is not spot-curated the way Surfline/MSW/Stormrider are — it forecasts for *any* lat/lon globally (model-driven), so Panama "coverage" exists in the sense that any Panama coordinate can be forecast, but there's no curated Panama spot list to speak of.

**Verdict: PROHIBITED** for pulling forecast data programmatically without a prior agreement. **Widget embed is a legitimate alternative** — pending confirmation of exact commercial-use terms of the widget itself (contact support@windguru.cz to confirm before using on a commercial-ish product).

---

### 5. Windfinder

**Public API — legitimate paid path exists.** "Windfinder for Businesses" is a real commercial API offering: fetched [windfinder.com/about/windfinder-for-businesses](https://www.windfinder.com/about/windfinder-for-businesses), accessed 2026-08-08 — provides "weather and wind forecast as well as real time weather reports," global coverage from "more than 20,000 weather stations worldwide," contact-only pricing ("at very attractive prices"), with an [API preview PDF](http://downloads.windfinder.com/api/api_sample.pdf) and a public [API Blueprint/Apiary doc](https://windfinder.docs.apiary.io/). **Panama-specific station coverage is UNVERIFIED** — the page emphasizes worldwide coverage and historical data back to 1999 but doesn't list Panama specifically, and doesn't mention wave/swell data (this looks like a wind/weather API, not necessarily a full surf/swell API).

**ToS (for the free/consumer site, not the paid API):** Fetched [blog.windfinder.com/terms.htm](https://blog.windfinder.com/terms.htm), accessed 2026-08-08. Verbatim:

> "Commercial use of our data and services, such as distribution or other use for the purpose of obtaining income therefrom, is not allowed without our written consent." (§1.5.3)

> "When publishing our data in the context of non-commercial possibilities offered by us, for example on a website, a clearly visible indication of our ownership has to take place, making note of our company name and (if possible) providing a hyperlink." (§1.5.4)

> "The data may be used without our consent only for the intended use as part of the services / products offered by us." (§1.5.2)

**Widgets:** Confirmed via search — website widget embedding is allowed (up to 3 per page), but *"embedding them in apps is not allowed; for weather data for apps or customized weather data, you should contact them at info@windfinder.com."* ([Windfinder Help/FAQ: Weather widgets](https://www.windfinder.com/help/other/widgets), accessed 2026-08-08).

**Verdict: split.** Free-tier consumer data/widgets: **PROHIBITED for commercial app use** without written consent (§1.5.3 is explicit). The dedicated **paid Windfinder-for-Business API is LEGALLY USABLE** — this is the correct channel, not the public website. Governed by German law per §-referenced terms (secondary characterization from search, UNVERIFIED against a full governing-law clause quote).

---

### 6. Wisuki

**Public API:** None found. Searched extensively; found only consumer app store listings ([Wisuki - Wind and Waves](https://apps.apple.com/us/app/wisuki-wind-and-waves/id646750653), [wisuki.com](https://www.wisuki.com/), accessed 2026-08-08) describing rich forecast features (wind, wave, tide, best-spot-finder) but no developer/API page surfaced in search.

**Verdict: GREY/UNVERIFIED.** No evidence of a public API or explicit ToS text reviewed (would need to visit wisuki.com/terms directly, not done in this pass — flag as unexplored rather than cleared). Treat as **PROHIBITED-by-default** (standard industry pattern across every comparable site checked in this report) until their actual ToS is read.

---

### 7. Glassy, Surfr, Wavy, Seabreeze, Spot-check-style apps

**Glassy** (glassy.pro): consumer session-tracking + forecast app, claims *"over 18,000 spots worldwide"* ([Huck Mag](https://www.huckmag.com/article/glassy-pro), [glassy.pro](https://glassy.pro/), accessed 2026-08-08). No public API surfaced in search; ToS not independently fetched in this pass. **UNVERIFIED.**

**Seabreeze** (seabreeze.com.au): Australia-focused ("go-to site for reliable coastal weather forecasts" covering "over 20,000 locations around Australia" per [seabreeze.com.au](https://www.seabreeze.com.au/), accessed 2026-08-08). No public API found. Not relevant to Panama coverage regardless.

**Surfr / Wavy / "Spot-check" apps:** searches for these specific names surfaced no dedicated, identifiable public API or company (search results returned unrelated hits — a GitHub script literally named `spotCheck.py` that itself just wraps the now-dead Magicseaweed API, and various generically-named apps). **UNVERIFIED / could not positively identify these as distinct services with public data programs.** If these are specific real apps you have in mind with different URLs, they need a follow-up pass with the exact company name.

**Verdict for this whole group: GREY/UNVERIFIED — treat as PROHIBITED by default.** None showed evidence of a documented public API or an explicit license to reuse their spot databases. Given every single comparable, better-documented competitor in this report (Surfline, MSW-era, Windguru, Wannasurf, Stormrider, surf-forecast.com) explicitly prohibits scraping/reuse in its ToS, the reasonable prior for these smaller apps is the same restriction, not an exception.

---

### 8. Willyweather

**Public API:** Yes, real and documented — v2 REST API, JSON responses, with a paid tier (referenced cost around "$1.20 a month, depending on your configuration" per secondary source — treat that specific number as **UNVERIFIED**, it looked like a marketing teaser rather than a full price sheet) and an Enterprise tier with 24/7 support and unlimited requests. Fetched [willyweather.com.au/info/api.html](https://www.willyweather.com.au/info/api.html), accessed 2026-08-08 — confirms wind, tide, rainfall, swell, sunrise/sunset, moon-phase, UV data, "over 17,000 locations."

**Geographic coverage — this is the disqualifier.** Confirmed via search (accessed 2026-08-08): *"the coverage appears to be limited to Australia... WillyWeather processes and fine-tunes forecast data to the specific coordinates of over 17,000 Australian locations."* The v2 docs URL (`willyweather.com.au/api/docs/v2.html`) returned HTTP 404 when fetched directly, consistent with this being a niche/Australia-only product without a broad public docs landing page.

**Verdict: LEGALLY USABLE in principle (has a real paid API and clear commercial terms) but NOT APPLICABLE — it has no Panama data.** Do not pursue for this project.

---

### 9. Stormrider Surf Guides (operated by Low Pressure Ltd)

**Public API:** None. Consumer website + paid per-country apps ($1.99 individual country apps per search result, [Stormrider Passport](https://www.stormrider.surf/passport), accessed 2026-08-08).

**ToS — PROHIBITED, explicit, fully verified.** WebFetch on [stormrider.surf/terms-conditions](https://www.stormrider.surf/terms-conditions) returned HTTP 403, but a direct `curl` with a browser User-Agent succeeded (HTTP 200, 212,894 bytes), accessed 2026-08-08. The quotes below were confirmed present verbatim in the raw HTML — this is the one ToS in this report checked against true primary-source HTML, not a proxy render:

> "Use any robot, spider, other automatic device, or manual process to extract, 'screen scrape,' monitor, 'mine,' or copy any static or dynamic web page on the site contained on any such web page for commercial use without our prior express written permission" (Clause 1.2)

> "Use any high volume automatic, electronic or manual process to access, search or harvest information from the site (including without limitation robots, spiders or scripts)" (Clause 1.2)

> "Reproduce, duplicate, copy, sell, resell or exploit any portion of the site, for any purpose other than for which the site is being provided to you" (Clause 1.2)

> All Stormrider e-products are "strictly for personal use and are subject to Copyright law and any form of copying or distributing without the consent of Low Pressure Ltd is strictly prohibited." (Clause 2.1)

**Panama coverage — this is the best curated Panama surf database found in this whole research pass:** confirmed via search of [stormrider.surf/country/panama](https://www.stormrider.surf/country/panama), [stormrider.surf/region/southern-panama](https://www.stormrider.surf/region/southern-panama) (27 breaks), [stormrider.surf/region/panama-oeste-province](https://www.stormrider.surf/region/panama-oeste-province) (15 breaks), [stormrider.surf/region/bocas-del-toro](https://www.stormrider.surf/region/bocas-del-toro) (6 breaks) — accessed 2026-08-08. Their entire global database is reported at ~5,000 spots with wave-type/size/wind/tide/swell-window ratings — exactly the kind of structured metadata a Panama surf app would want.

**Verdict: PROHIBITED for scraping/reuse.** This is simultaneously the most tempting and most explicitly locked-down source found (48 curated Panama breaks with rich metadata, banned in the clearest possible contract language). Worth a direct licensing/partnership inquiry to Low Pressure Ltd given how good their Panama data specifically is — not worth touching without one.

---

### 10. Wannasurf

**Public API:** None. Wiki-style, community-contributed surf spot atlas, LAMP-stack site, ~9,000 spots worldwide claimed (per site marketing, accessed 2026-08-08).

**ToS — PROHIBITED for bulk reuse.** Fetched terms page via `wannasurf.com/help/index.html?wdaction=lib.WDPageHelp.termsofuse`, accessed 2026-08-08. Verbatim:

> "You may not reproduce or store in or transmit to any other web site, newsgroup, mailing list, electronic bulletin board, server or other storage device connected to a network or regularly or systematically store in electronic or print form, all or any part of the Wannasurf Content"

> "You may not reproduce, modify or in any way commercially exploit any of the Content."

Copyright footer: *"© Wannasurf.com ltd - All right reserved."* Per the fetched summary, the terms treat all database content — including GPS coordinates and spot data — as protected material owned by Wannasurf.com Ltd, with no separate carve-out for "just the coordinates." Requests for other uses can reportedly be directed to the webmaster and may incur fees (per site's contribute/help pages).

**Panama coverage — verified directly.** Fetched `wannasurf.com/spot/Central_America/Panama/index.html` via `curl` (HTTP 200, 133,291 bytes) and parsed the raw HTML for spot links, accessed 2026-08-08. **53 unique named Panama spots** are listed, including: 411 (Quatro Once), Chame Banks, Cimarron, Corto Circuito, El Chumical, Estero Beach, Kuna An, La Caja, Lagart Point, Lajas, Las Bovedas, Leftovers, Maria Chiquita, Rio Tabasara, Roca Chica, San Marino, San Pedrillo, Super Boquita, Bluff, Cambutal, Carenerro Point Break, Costa Esmeralda, Dumpers, El Morro, El Palmar Point, El Playon, Gruta Azul, Isla Grande, Isla Mamey, La Barqueta, La Zurda, Las Lajas, Los Olivos, Madrono, Malibu, Manzanillo, Nestles, P Land, Playa Guanico, Playa Venao, Punch Reef, Punta Brava, Punta del Palmar, Punta Roca, Riomar, San Carlos Point, Santa Catalina, Sebaco, Serena, Silver Back, Skully's, Tetas, The Point, The Rock, Wizard Beach.

**Verdict: PROHIBITED for systematic/automated reuse.** Manual, individual lookups by a human are fine (that's just browsing); scraping their spot atlas into your own database is explicitly banned as "systematically stor[ing]... all or any part of the Wannasurf Content." Since their whole value is a *community-contributed* spot atlas, a legitimate parallel path is to build your own Panama spot database from scratch using open sources (OSM, direct field knowledge, your own contributor community) rather than importing theirs.

---

## Open surf-spot geodata sources

### OpenStreetMap — `sport=surfing` / related tags

**Fully open, license = ODbL (Open Database License).** Confirmed live by directly querying the Overpass API for Panama on 2026-08-08:

```
Query: area["ISO3166-1"="PA"][admin_level=2]; (node["sport"="surfing"](area); way["sport"="surfing"](area); node["natural"="beach"]["surfing"](area);); out body;
```

Live results returned (2026-08-08):
1. Unnamed surfing pitch (`leisure=pitch`, sport=surfing) — lat 9.6342674, lon -79.5567446
2. "Surf Dojo" — lat 7.4328393, lon -80.2000995, website `http://www.surfdojo.com/`
3. "Pucha Surf Club" — lat 7.4323598, lon -80.1923320, near Playa Venao

This confirms the OSM data model exists for surfing and is queryable, but **actual Panama tagging coverage is currently sparse** (3 features, and 2 of those are businesses/clubs, not wave/break geometry) — it is not yet a usable substitute for a curated break database (no swell/wind orientation, bottom type, skill level, etc. tagged on these). It is a legitimate, zero-risk foundation to build on and contribute to, not a ready-made dataset.

**License terms:** ODbL requires attribution ("© OpenStreetMap contributors") and, if you redistribute a *produced database* built substantially from OSM data, share-alike obligations can apply to that derived database (not to your own original additions layered on top, under the "collective database" provisions) — see [OpenStreetMap Wiki: Open Database License](https://wiki.openstreetmap.org/wiki/Open_Database_License), accessed 2026-08-08 for full text (not independently re-quoted here; standard, well-documented open license).

**Related tag docs found:** [Tag:sport=surfing](https://wiki.openstreetmap.org/wiki/Tag:sport=surfing), [Tag:amenity=surf_school](https://wiki.openstreetmap.org/wiki/Tag:amenity=surf_school), [Tag:shop=surf](https://wiki.openstreetmap.org/wiki/Tag:shop=surf), accessed 2026-08-08.

**Verdict: LEGALLY USABLE.** Best long-term foundation for an open, redistributable Panama spot database — but expect to have to *add* most of the actual break data yourselves (via OSM edits) rather than pull a complete dataset out.

### Wikidata

Fully open (CC0, no restrictions). Ran two live SPARQL queries against `query.wikidata.org`, accessed 2026-08-08:
1. First attempt constrained by a specific "surf break" class QID (`Q1385120` under `wdt:P31/wdt:P279*`) plus country=Panama (`wd:Q804`) — **zero results.** This is not strong evidence of absence on its own, since it depends on that specific class ID being the right (or only) modeling choice in Wikidata.
2. Follow-up, broader query: all items with country=Panama (`wdt:P17 wd:Q804`) whose label contains "surf" (no class constraint) — **5 results, all confirmed real**: Surfcamp Guanico (Q111114195), Hostel Villa Vento Surf (Q111117252), El Ranchito Surfcamp (Q112023251), Beach Break Hotel & Surf Camp de Playa Venao (Q111885718), Hotel Oasis & Surf Camp (Q111885723).

These 5 are **surf-tourism accommodation businesses** (camps/hostels), not surf-break/wave-spot geodata. **Verdict: Wikidata is legally usable (CC0) but, as far as this pass of querying could determine, has no surf-break/spot entries for Panama today — only surf-adjacent lodging businesses.** Absence of a break-specific entity is not fully proven (a different, unfound class ID could still hold data), but two different query strategies turned up nothing spot-shaped. Not a usable source of Panama break data right now; could be seeded by the project itself later.

### GitHub community datasets

No ready-made "Panama surf spots, open license" dataset was found. What exists on GitHub in this space is mostly **API client wrappers** around the (now largely dead or ToS-restricted) commercial APIs — e.g. `mhelmetag/surflinef` (Surfline v1/v2 client), `jjgonecrypto/msw-api` and `jcconnell/python-magicseaweed` (both wrap the dead MSW API), `swrobel/meta-surf-forecast` (aggregates Surfline + Spitcast) — none of these are themselves open spot databases; they're code that (mostly no longer) talks to the restricted/dead APIs above. Using any of them for Surfline data inherits the same ToS problem documented in section 1. **Verdict: no shortcut found here — build the Panama spot database originally, or source it via OSM contributions / stormrider licensing conversation / your own fieldwork.**

---

## Legitimate data-API alternatives (not surf-spot-database, but forecast data)

These aren't surf-brand-name providers but are the clean, ToS-safe way to get the underlying wind/wave/swell numbers to power forecasts once you have your own Panama spot list (from OSM + your own curation):

- **Open-Meteo Marine API** — [open-meteo.com/en/docs/marine-weather-api](https://open-meteo.com/en/docs/marine-weather-api), accessed 2026-08-08. Free, no API key/signup for non-commercial use; data licensed **CC BY 4.0 — "free to use and redistribute, including for commercial purposes, with attribution."** Global wave models (DWD 28km global, 5km European), wave height/direction/period, swell height/direction/period, wind-wave height, ocean temperature. Fully open-source server (AGPLv3), self-hostable for unlimited calls. **Best single legitimate alternative found in this research pass.**
- **Stormglass.io** — [stormglass.io](https://stormglass.io/), accessed 2026-08-08. Paid (€16/month up to €172/year per tier, usage-based, free to sign up), aggregates NOAA/MetOffice UK/Meteo France/DWD/ICON/SMHI/YR. Explicitly marketed for surf apps ([stormglass.io/weather-api-for-surf-apps](https://stormglass.io/weather-api-for-surf-apps/)). Global marine coverage including tide.
- **Copernicus Marine Service (CMEMS)** — [marine.copernicus.eu](https://marine.copernicus.eu/), accessed 2026-08-08. EU-operated, free with registration, wave products since April 2017. Commercial use permitted; redistribution permitted with attribution to the specific product DOI. Global ocean model coverage.
- **Swellcloud API** (api.swellcloud.net) — surfaced in search as a "Surf Forecast API / Marine Weather API," but the site was **unreachable at fetch time (connection refused)** on 2026-08-08. **UNVERIFIED** — could not confirm pricing, coverage, or legitimacy. Worth a follow-up check, not a confirmed source today.
- **NOAA/NDBC buoys** — public-domain US government data, but the nearest-named stations ("PCBF1", "PACF1") are **Panama City, Florida**, not Panama the country — a naming false-positive worth flagging so nobody on the team gets confused. No NDBC buoys were confirmed near actual Panama in this pass; NOAA's global WaveWatch III model output (also public domain) is the more relevant NOAA asset for Panama coastal wave data, not the buoy network.

None of these give you curated "this is a surf break, here's its orientation/bottom/skill-level" metadata — that part still has to come from OSM + your own fieldwork/community, or a paid licensing conversation with Stormrider (best existing Panama-specific curated data found) or surf-forecast.com/Windfinder.

---

## Embeddable widgets / affiliate links (legitimate deep-linking alternative to scraping)

- **Windguru** — has an official forecast-widget embed program (`windguru.cz/help.php?sec=distr` exists, confirmed live and referenced in their own site JS/nav). **Unresolved, not cleared**: the page's actual widget terms are delivered by client-side JS and could not be extracted by any method tried (direct fetch, `curl`, or text-extraction proxy); their general ToS separately bans "any other use of this information without prior agreement," which a widget embed may or may not fall under. Confirm directly with support@windguru.cz — including explicit commercial-use permission — before relying on it for a commercial-ish product.
- **Windfinder** — official website widgets are explicitly allowed (up to 3 per page) **for non-commercial, website use only** — *"embedding them in apps is not allowed"* per their own Help/FAQ, and attribution (company name + hyperlink) is required. For app use or commercial use, contact info@windfinder.com — this is effectively an invitation to the paid Windfinder-for-Business channel, not a free widget loophole.
- **Surfline** — no widget or affiliate program found. The only named "partner program" (Surfline Compatible) is device-sync, not content embedding or an affiliate/referral link program. A direct check of [surfline.com/privacy-policy](https://www.surfline.com/privacy-policy) for mentions of an affiliate program was attempted (2026-08-08) but blocked with HTTP 403, same as the Terms of Use page — **UNVERIFIED**, could not confirm or rule out an affiliate program from that specific page; none surfaced anywhere else in this research pass. Deep-linking to a Surfline spot page (i.e., just a plain outbound hyperlink, not embedding their content) is not restricted by normal linking law and is the safe way to say "see more on Surfline" without touching their data.
- **Stormrider, Wannasurf, surf-forecast.com** — no widget/affiliate programs surfaced in this research. Plain outbound links to their spot pages (not embeds, not scraped content) remain a legally safe way to send users to them for more detail/credit, same logic as Surfline above.

---

## DO NOT TOUCH list (final)

1. **Surfline** — scraping, hitting undocumented endpoints, or any automated/API use is explicitly banned (Terms of Use, updated Oct 1 2024) — three independent, unambiguous prohibitions (anti-bot, anti-API, anti-commercial-use).
2. **Magicseaweed** — moot; the API and docs no longer exist (301-redirects to Surfline since the 2023 shutdown).
3. **Stormrider Surf Guides / Low Pressure Ltd** — explicit anti-scraping (Clause 1.2) and personal-use-only (Clause 2.1) language, despite having the best curated Panama break data found in this research.
4. **Wannasurf** — explicit ban on systematic/automated storage or reproduction of "all or any part of" their content, despite being a community-built atlas.
5. **Windguru** — explicit ban on automated downloading and on any use beyond "personal use" without prior agreement.
6. **Windfinder (free/consumer site)** — explicit ban on commercial use of data/services without written consent; app-embedding of widgets is explicitly disallowed. (Their *paid business API* is the legitimate door in — different product, different terms.)
7. **Surf-forecast.com (Meteo365 Ltd)** — commercial use of Content requires a license; don't scrape their Panama breaks listing or spot pages for product use without contacting them.
8. **Glassy / Wisuki / Surfr / Wavy / Seabreeze / other consumer surf apps** — no evidence of a public API or reuse license found for any of them; treat as prohibited by default until each is individually confirmed, consistent with the pattern across every better-documented competitor above.

---

## 10-line summary

1. Every named surf-brand provider checked (Surfline, Magicseaweed/MSW, Stormrider, Wannasurf, Windguru, Windfinder's free tier, surf-forecast.com) either bans scraping/automated access outright or requires a commercial license we don't have — nothing here is a free scrape target for a commercial-ish app.
2. Surfline's Oct-2024 ToS is the most explicit: bans bots/scrapers, bans "unauthorized API access" by name, and separately bans all commercial use — three independent violations if scraped.
3. Magicseaweed is dead — its old API URL now 301-redirects straight to Surfline; any tutorial or GitHub repo referencing it is stale.
4. Stormrider has the best curated Panama break data found (48 breaks across 3 regions with wave/wind/tide metadata) but its ToS bans scraping just as explicitly — worth a direct licensing email, not worth touching otherwise.
5. Two real, legitimate paid B2B APIs exist: Windfinder-for-Business (global wind/weather, Panama coverage unconfirmed) and Willyweather v2 (great API, but Australia-only — not usable for Panama).
6. Windguru and Windfinder both offer official embeddable widgets as non-scraping alternatives to pulling raw data, but neither is fully cleared as-is: Windguru's widget terms were unreachable and its general ToS may still cover embeds (confirm with support first); Windfinder's widget is confirmed website-only/non-commercial, with app or commercial use requiring their paid business channel instead.
7. Open, zero-risk geodata does exist: OpenStreetMap (`sport=surfing`, ODbL license) is queryable today and returned 3 real Panama features live via Overpass, but coverage is sparse — it's a foundation to build on, not a ready dataset.
8. Wikidata is open (CC0) but two live queries turned up no surf-break entities for Panama — only 5 unrelated surf-tourism lodging businesses — nothing spot-shaped to pull today.
9. For the actual wind/wave/swell numbers (not spot metadata), Open-Meteo Marine API is the standout legitimate free option (CC BY 4.0, redistributable, commercial use allowed with attribution), with Stormglass.io and Copernicus Marine Service (CMEMS) as solid paid/registered alternatives.
10. Bottom line: don't touch any named surf site's data pipe without a license; build your own Panama spot database (OSM + fieldwork + community contributions, maybe a Stormrider licensing conversation) and power the forecast numbers with Open-Meteo/Stormglass/CMEMS.
