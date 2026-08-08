# 12 — Community Layer: WhatsApp Integration, UGC, Auth, Push

Research date: 2026-08-08. Topic: connecting to the existing 500-person WhatsApp surf group, accepting user-submitted photos/videos/reports, and the lowest-friction auth/notification path for a Panama surf community ("Surfs Up Panama").

---

## 1. WhatsApp Business Platform (Cloud API) — official Meta docs

### Can a Business API number join/read/post to an existing WhatsApp GROUP?

**No — not the existing 500-person group.** This needs a precise answer because Meta shipped something new in 2026 that is easy to mis-read as "groups are now supported."

Meta launched a **Groups API** on the WhatsApp Business Platform, open to all businesses with an Official Business Account (OBA) as of documentation dated June 16, 2026 (developers.facebook.com/documentation/business-messaging/whatsapp/groups, accessed 2026-08-08). But read the mechanics carefully — they rule out the use case in the brief:

- The API can only **create a brand-new group** via `POST` to the group-management endpoint ("Use this endpoint to create a new group and generate a group invite link") — it cannot attach to, join, or read a pre-existing consumer-created group. The docs explicitly do not address connecting to groups created outside the API (developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference, accessed 2026-08-08). This alone rules out the use case regardless of size limits.
- Maximum **8 participants** per API-created group — confirmed via a direct, re-verified quote from the overview page's own "Quick facts" box: **"Max group participants: 8"** (developers.facebook.com/documentation/business-messaging/whatsapp/groups, accessed 2026-08-08). Two other "8"s and a "1024" appear elsewhere in the docs but are unrelated limits, not the membership cap — worth naming explicitly since secondary blog sources conflate them: the reference page's "Maximum 8 participants" is a *per-request* limit on the remove-participants endpoint's array (how many can be removed in one call), and "Max: 1024" on the "Get active groups" endpoint is a *pagination* limit (how many groups can be listed per API response page), not a membership size. The real, confirmed cap for total group size is 8. A business can run up to 10,000 such groups per number, but each one is capped at 8 people. This is nowhere near a 500-person community.
- Joining is **invite-link only** — "Simply send a message with your invite link to WhatsApp users who you would like to join the group." Users must click the link and accept; a business cannot add existing WhatsApp users directly without their action.
- Only text, media, and template messages are supported inside groups; no calling, disappearing messages, view-once, interactive messages, commerce, or authentication templates.
- A phone number already onboarded to "Multi-solution Conversations" or a regular **WhatsApp Business app** number cannot use Groups API at all — only Cloud API OBA numbers.

**Bottom line: the existing 500-person community WhatsApp group is not reachable via any official Meta API.** There is no mechanism — old or new — for a Business API account to attach to, read, or post into *that specific pre-existing group*, or to enumerate/message its members. (To be precise about what the new Groups API *does* support: for a group the business itself creates via the API, inbound member messages do arrive via webhook and the business can post into it — full 1:1-style bidirectional messaging, just capped at 8 participants and only for groups the API created. None of that extends to a group that already exists and that the business didn't create.) The only "official" way to leverage the existing 500-person group is the low-tech one: someone who is already a human member/admin of the group posts a link to the site into the group manually, same as any person would share a link. That is outside any API and carries zero integration cost or ban risk, and is the single highest-leverage move available.

### What IS supported (1:1 layer)

- **1:1 messaging**: full send/receive of text, media, interactive, and location messages between the business number and individual WhatsApp users who have messaged in or opted in.
- **Template messages**: pre-approved, structured messages required for any business-initiated contact outside the 24-hour window. Categories: Marketing, Utility, Authentication, Service. Templates require Meta approval before use (developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform, accessed 2026-08-08).
- **Opt-in requirement**: "You must obtain user opt-in before sending message templates" — official, non-negotiable (same source). Practically: a user must message the business first, or explicitly opt in through a documented flow (website form, checkbox, etc.) before the business can push template messages at them.
- **24-hour customer service window**: once a user messages the business, the business can send free-form (non-template) replies for 24 hours. Outside that window, only approved templates can be sent. The window resets on every inbound user message (business.whatsapp.com/policy; www.twilio.com/docs/whatsapp/key-concepts, accessed 2026-08-08).
- **Click-to-WhatsApp ads / call-to-action button click-through**: per the primary Meta pricing page fetched directly in this session (developers.facebook.com/documentation/business-messaging/whatsapp/pricing, accessed 2026-08-08), an ad- or CTA-originated chat opens the normal 24-hour window, and if the business responds within that window, an additional **72-hour free-form messaging window** activates, allowing any message type at no cost during that period. This came from the primary source, not a secondary aggregator — reasonably solid, though worth a final visual confirmation against the live page given the small-model summarization step in this fetch pipeline.

### Pricing (2026, per-message model)

Meta moved to **per-message pricing effective July 1, 2025**, replacing the old per-conversation model (developers.facebook.com/documentation/business-messaging/whatsapp/pricing, accessed 2026-08-08). Key points confirmed against the official pricing page:

- Businesses are charged **per delivered template message**. Rate depends on template category (Marketing / Utility / Authentication) and the recipient's country code.
- **Marketing** templates: always charged when delivered.
- **Utility** and **Authentication** templates: charged only *outside* the customer-service window; free when sent within an open window.
- **Service** (free-form, non-template) messages: confirmed directly from the primary pricing page — "Effective November 1, 2024 – Service conversations are now free for all businesses." A direct re-fetch of that same page in this session found **no mention of any future date to end that free status**; it does not corroborate a widely-repeated secondary-source claim (from WebSearch aggregator summaries, not the primary page) that Meta will start charging for service messages on October 1, 2026. Treat that October 2026 date as **UNVERIFIED / secondary-source only** — don't budget against it without checking the live rate card closer to the date.
- Volume discounts: lower Utility/Authentication rates unlock as monthly volume grows, aggregated across the whole WhatsApp Business Account.
- **Country-specific rate for Panama**: not confirmed in this session — the live rate-card table did not render through the fetch tool (it's a large per-country data table, likely client-rendered). Representative published rates elsewhere in the 2026 cycle: ~$0.01–$0.03 for Marketing in large markets like India/US, higher in Europe (EUR 0.11+ in Germany per secondary sources). **Panama-specific figure: UNVERIFIED — pull the live rate card from the Meta Business Manager / WhatsApp Manager rate card before budgeting**, since secondary aggregator numbers vary and Meta's page states rates "change frequently."

### WhatsApp Channels — broadcast one-to-many

**No public API exists for Channels.** Checked three official/primary sources directly (whatsapp.com/channels, developers.facebook.com/docs/whatsapp/, developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform, all accessed 2026-08-08): Channels are described only as a creator/consumer-app feature ("Share updates with a global audience... unlock a reliable way to engage and grow your following on WhatsApp"). None of the WhatsApp Business Platform developer documentation sections (Marketing/Utility/Authentication/Service messages, Groups) mention a Channels API. A Channel today has to be run manually through the WhatsApp/WhatsApp Business consumer app UI — fine as a low-effort manual broadcast ("Venao is firing") but not automatable from the app's backend without an unofficial/reverse-engineered approach (see §2).

### Click-to-WhatsApp / wa.me links and QR codes

Well-established, simple, and official: a `https://wa.me/<countrycode+number>?text=<prefilled message>` deep link, or a QR code encoding the same, opens a chat with the business number and optionally pre-fills a message. This is the correct tool for the *opposite* direction of the brief's ask — pulling **website visitors into a 1:1 WhatsApp conversation** with the business (e.g., "Get a WhatsApp alert when Venao is firing" button), not for extracting the existing group's membership. Use it to grow a new opt-in 1:1 contact list from site traffic; combine with a Click-to-WhatsApp Meta ad if paid acquisition is ever used.

---

## 2. Unofficial WhatsApp libraries (whatsapp-web.js, Baileys, whatsmeow) — ToS and ban risk

These libraries (whatsapp-web.js and Baileys in Node.js, whatsmeow in Go) reverse-engineer the WhatsApp Web/multi-device protocol to drive an ordinary consumer WhatsApp account programmatically — including full group read/write, which is exactly what would be needed to pull content from or post into the existing 500-person group.

**Official ToS is explicit and directly on point.** Fetched WhatsApp's Business Terms of Service directly (whatsapp.com/legal/business-terms/, accessed 2026-08-08) and found clauses that squarely prohibit this:

- "reverse engineer any aspect of our Business Services or do anything that may discover source code"
- "scrape or extract data from our Business Services"
- "develop or use any applications that interact with our Business Services without our prior written consent"
- "create software or APIs that function substantially the same as our Business Services and offer them for use by third parties in an unauthorized manner"
- A general catch-all against using the service "directly, indirectly, or through automated or other means" to violate the above.

That is a verbatim, on-point match for what Baileys/whatsapp-web.js/whatsmeow do. Secondary sources corroborate the practical consequence: "Unofficial libraries like Baileys and whatsapp-web.js violate WhatsApp's ToS and can get the linked number banned permanently without warning," with typical survival time before detection cited as "2–8 weeks" (blog.pallysystems.com, whatsapp.checkleaked.cc — both secondary, directional not authoritative, accessed 2026-08-08).

**Verdict: this is a ban waiting to happen, not a viable foundation for a real product.** Concretely for this app: connecting an unofficial client to the existing 500-person group to auto-post surf reports or scrape member content risks (a) an unappealable ban of whichever real phone number is used, which — if it's an admin's personal number or the group's own number — burns a phone number and Meta account with no recourse, and (b) zero SLA/support, since Meta owes nothing to a ToS-violating integration. Do not build product infrastructure on it. If a founder wants a personal, manual, low-volume WhatsApp automation for their own workflow (not customer-facing, not scaled), that's a materially different risk profile than shipping it as an app feature — but even then, expect account death within weeks to a couple of months per the pattern above.

---

## 3. Alternative community rails

### Telegram Bot API — best technical fit for "group-native" community features

- **Cost: $0.** Telegram's Bot API has been free since 2015 — no subscription, no per-message fee, no bot-count limit (multiple 2026 sources agree; Telegram's business model is user-funded via Telegram Premium, not API monetization). The only real cost is hosting the bot process (a few dollars/month VPS, or run it inside the app's existing backend for free).
- **Group support: full and native.** Telegram groups scale to 200,000 members (vs. WhatsApp Cloud API's 8-person cap above); a bot can be added as a group member/admin, read all messages, post messages, react to commands, and manage membership — all via the standard Bot API, no reverse engineering, no ToS violation. This is the mirror image of WhatsApp's Cloud API limitation.
- **Fit for Panama surfers: weak on current adoption, strong on cost/capability.** Panama's messaging landscape is WhatsApp-first (see below) — there's no evidence Panama's surf community already lives on Telegram, so a Telegram community would likely need to be built from scratch rather than plugged into the existing 500-person group. It's the right tool if the plan is "start a new, fully-integrated bot-driven community," wrong if the plan is "tap into the WhatsApp group that already exists."

### Discord — poor fit

Strong free-tier bot ecosystem and full group/server support technically, but Discord skews toward gaming/tech demographics and has negligible standing adoption among Latin American beach-town surf communities generally, and specifically no evidence of use in Panama's surf scene. Would face the same "build from zero" adoption problem as Telegram, with a worse demographic match. Not recommended as a primary rail; possible only as a niche "hardcore users" channel later.

### Instagram Graph API — usable for UGC surfacing, not for group messaging

Confirmed via developers.facebook.com/docs/instagram-platform/instagram-graph-api (accessed 2026-08-08): a **Professional (Business or Creator) Instagram account** can, via the Graph API, moderate comments and replies, discover mentions (`@surfsuppanama`), find hashtagged media (`#surfsuppanama`), publish content, and read engagement metrics. It explicitly **cannot access personal/consumer Instagram accounts** — so it can only pull content from users who tag/mention the business's own professional account, not passively scrape the wider community. This is a legitimate, low-friction way to surface user photos already being posted to Instagram (a very likely behavior for surfers) without needing users to upload anywhere new — "repost with permission" workflows are well-trodden. Good complementary channel, not a substitute for direct UGC upload (§5).

### PWA + Web Push — the owned, zero-marginal-cost channel

Covered in depth in §4. Relevant here: unlike WhatsApp/Telegram/Discord/Instagram, this channel requires no third-party platform relationship, no per-message fee, and no risk of policy changes from an external company — it's the only rail fully owned by the app.

### Panama messaging app usage — WhatsApp dominance, but not total

Panama-specific hard numbers are thin in what's publicly indexed; best available (secondary, Spanish-language marketing sources, accessed 2026-08-08, treat as **directional not precise**):

- Facebook ~72% active-user penetration, Instagram ~44%, WhatsApp ~40%, YouTube ~37% (leonkadoch.net, "Estadísticas de Redes Sociales Panamá 2025").
- WhatsApp is described as the most popular messaging platform among Panamanian youth (12–17) and as the country's "main form of online communication" more broadly, consistent with WhatsApp's ~85% penetration in comparable LatAm markets like Brazil (infobip.com/blog/whatsapp-statistics, accessed 2026-08-08).
- These figures are social-network-usage surveys, not messaging-specifically, and are secondary marketing-agency sources rather than a national statistics body or Meta's own disclosure — **treat the exact percentages as UNVERIFIED-precision, WhatsApp-dominance-as-directional-fact as reasonably solid** given convergence with broader LatAm patterns.

Net: WhatsApp is almost certainly the default channel Panama surfers already use (hence the existing 500-person group), which is exactly why the Cloud API's group limitation in §1 matters so much — the community's home turf is the one platform whose official API cannot reach it.

---

## 4. Web Push notifications from a PWA — iOS Safari vs Android Chrome, 2026

This is the mechanism for "Venao is firing right now" alerts at zero marginal cost.

- **Android Chrome**: full, unrestricted Web Push support, has worked for years, no install step required — push can be requested from an ordinary browser tab.
- **iOS Safari**: supported, but **only for PWAs added to the Home Screen** — an open Safari tab (or any other iOS browser, since all iOS browsers use WebKit) cannot request push permission. Confirmed via multiple 2026 sources (mobiloud.com, magicbell.com, pushpad.xyz, accessed 2026-08-08): "Push notifications on iOS work exclusively for PWAs installed via Safari → Share → Add to Home Screen... An open tab in Safari or any other browser does not have access to PushManager."
  - Minimum iOS version: **iOS 16.4** (March 2023) — safe to assume met for any 2026 user base.
  - **No automatic install prompt** — the user must manually do Share → Add to Home Screen; this is a real friction point and needs explicit onboarding UI ("Add to Home Screen to get surf alerts") since iOS gives no native nudge.
  - Secondary-source claim that "web push is not available in EU countries (iOS 17.4+)" due to EU-specific browser-engine regulatory carve-outs — **not relevant to Panama** (non-EU), but flagged as **UNVERIFIED** and worth re-checking if the app ever serves EU users.
  - Safari 18.4 added "Declarative Web Push," a simpler push mechanism not requiring a service worker — a nice-to-have implementation detail, not a capability change.

**Implication for the build**: push works on both platforms in 2026, but iOS requires a deliberate "install the app to your home screen" conversion step that Android doesn't. Design the onboarding flow around getting users through that one extra tap on iOS — it's the single biggest lever for making push notifications actually reach the iPhone-heavy expat/tourist segment of the user base.

---

## 5. User-generated content mechanics

### Presigned S3 upload from browser

Standard, well-established pattern, no new research needed to establish feasibility: backend issues a short-lived presigned `PUT` URL scoped to one object key (typically via AWS SDK `getSignedUrl` for S3, or the newer `createPresignedPost` for stricter content-type/size-limit enforcement); the browser uploads directly to S3, bypassing the app server for the (often large) file bytes. This keeps server compute/bandwidth cost near zero regardless of upload volume — the app server only handles small JSON metadata requests, not the media bytes.

### EXIF geolocation/time extraction

Standard capability, not something that needs external verification: JPEG (and many HEIC) files from phone cameras embed EXIF metadata including GPS coordinates and capture timestamp. Client-side JS libraries (e.g., `exifr`) or server-side processing (e.g., Sharp/libvips, Python Pillow + piexif, ExifTool) can extract this. Practical caveats worth flagging: (a) many users have location-tagging disabled in their camera app or share via apps that strip EXIF (Instagram, WhatsApp forwarding all strip EXIF), so **do not build a feature that assumes GPS is always present** — treat it as an enrichment signal with a manual location-tag fallback; (b) EXIF timestamps use the camera's local clock, which can be wrong/unset — validate against upload time as a sanity check, don't trust blindly.

### HEIC handling from iPhones

iPhones default to capturing photos as HEIC (and HEVC for video) since iOS 11. HEIC is **not natively renderable in most non-Safari browsers** (Chrome, Firefox, Edge on desktop/Android all lack native HEIC decode as of 2026) — a raw HEIC file uploaded straight to a public URL will show as broken/unviewable to the majority of non-Apple visitors. Standard mitigation: convert server-side on upload (Sharp with libheif bindings, or a managed pipeline like AWS Lambda + `sharp`/`heic-convert`, or a hosted image CDN like Cloudinary/imgix that transcodes on the fly) to JPEG/WebP/AVIF before serving. Build this conversion step into the upload pipeline from day one — it is not an edge case for an iPhone-heavy surfer user base, it is the majority case.

### Video (the brief also asks for video, not just photos)

The brief covers "photos/videos/reports" — video needs its own line, and it changes the cost/complexity picture materially:

- **Same container problem, worse**: iPhones capture video as HEVC (`.mov`)/`.mp4` with H.265, which (like HEIC) isn't universally playable in every browser without transcoding; budget for a transcode-to-H.264/MP4 or WebM step (e.g., AWS Elastic Transcoder/MediaConvert, or a Lambda + ffmpeg pipeline) the same way HEIC needs conversion.
- **Rekognition moderation for video is priced per MINUTE, not per image** — a materially different cost driver than the photo model below, and not something to casually fold into "same as photos." If video UGC is in scope for v1, get the current AWS Rekognition Video moderation per-minute rate before committing to it as the default moderation path; consider gating video uploads to a short max length (e.g., 15–30 seconds) to keep both transcode and moderation cost predictable, or defer video UGC moderation to manual/spot-check review at low volume rather than paying for automated per-minute scanning on day one.

### Image moderation

- **AWS Rekognition Content Moderation**: confirmed current pricing directly from aws.amazon.com/rekognition/pricing/ (accessed 2026-08-08): **$0.0010 per image** for the first 1M images/month, tiering down to $0.0008 (next 4M), $0.0006 (next 30M), $0.00025 (beyond 35M/month). AWS's free tier includes 1,000 images/month free for 12 months from account creation for Group 1/2 APIs (moderation falls in "Group 2"). At low volume (a few hundred UGC uploads/day), this is trivially cheap — see cost model below.
- **Open-source alternatives**: self-hosted NSFW/moderation classifiers (e.g., `nsfwjs` running client-side or server-side on TensorFlow.js, or open CLIP-based classifiers) avoid per-image API cost entirely at the expense of hosting/inference compute and generally weaker accuracy/coverage (no violence/weapons/drugs/hate-symbol detection out of the box the way Rekognition's moderation taxonomy provides). Reasonable for a v1 budget-constrained build with light human-review backstop; Rekognition is the safer choice once volume or liability risk grows (a public surf-report feed with photos is genuinely low-risk content compared to, say, a dating app, which supports starting cheap here).

### Storage/bandwidth cost model — 200 photos/day

Assumptions: average phone photo post-compression ~2–4 MB (post HEIC→JPEG/WebP conversion and reasonable resizing for web, e.g., capped at 2000px longest edge); 200 photos/day.

- Volume: 200/day × 3 MB avg ≈ 600 MB/day ≈ **~18 GB/month new storage added**.
- **S3 storage cost**: the live per-GB rate table did not extract cleanly from aws.amazon.com/s3/pricing/ in this session (client-rendered table) — **treat the commonly-published S3 Standard rate (historically ~$0.023/GB/month for the first 50 TB in us-east-1) as UNVERIFIED for this session and re-confirm against the live console/pricing calculator before finalizing a budget.** At that indicative rate, 18 GB/month of *new* storage costs roughly $0.40/month in the first month, growing slowly and cumulatively as older photos aren't deleted (e.g., after 12 months of accumulation, ~216 GB stored ≈ ~$5/month at that same indicative rate) — storage cost is not the concern at this volume.
- **Data transfer out**: AWS gives **100 GB/month always-free** data transfer out to the internet, aggregated across all services (confirmed directly from aws.amazon.com/ec2/pricing/on-demand/, accessed 2026-08-08: "AWS customers receive 100 GB of free data transfer out to the internet free each month"). Serving 200 photos/day plus repeat views by other users will likely exceed 100 GB/month once the app has real traffic (each photo viewed by hundreds of users adds up fast) — put a CDN (CloudFront) in front of the bucket regardless, both for cost (CloudFront's own free tier and lower per-GB egress than raw S3 in many pricing structures) and for latency to Panama-based users.
- **Rekognition moderation** at 200 images/day ≈ 6,000/month: at $0.0010/image (post free-tier) that's **~$6/month** — negligible.
- **Overall**: at 200 photos/day, this entire UGC pipeline (storage + moderation + reasonable CDN egress) is a low-tens-of-dollars-per-month line item, not a cost driver for the product. The real cost centers elsewhere (WhatsApp per-message fees, SMS OTP — see §6).

**If the hosting target is a strict $0.00/month** (flagged mid-task, but noted here since it bears directly on this section's numbers): the binding constraint stops being storage/moderation cost and becomes the **100 GB/month always-free data-transfer-out allowance** — that's the one figure above confirmed as genuinely perpetual, not a 12-month trial. AWS's Rekognition and S3 "free tier" numbers cited above (1,000 free Rekognition images/month, any S3 free allowance) are **12-month-from-account-creation trial credits, not always-free** — after month 12 they're billable. For a true always-$0 UGC pipeline: use client-side moderation (`nsfwjs` in-browser before upload, $0 forever) instead of Rekognition, and watch the 100 GB egress figure as the real tripwire — at ~200 photos/day plus repeat views, that ceiling is crossed once the app has meaningful traffic, at which point either CloudFront's own free tier (separate 1 TB/month allowance historically, not confirmed live in this session) or a paid egress bill becomes unavoidable. This deserves its own full pass in a dedicated hosting-cost doc rather than being resolved here.

---

## 6. Auth — lowest-friction, cheapest path for a surf community

### Phone OTP cost reality check — Panama SMS is expensive

Confirmed directly from Twilio's own pricing page (twilio.com/en-us/sms/pricing/pa, accessed 2026-08-08): **outbound SMS to Panama costs $0.1836 per message** — roughly 20x the ~$0.0079 Twilio charges for a US-bound SMS, and among the more expensive corridors Twilio publishes. This confirms the brief's suspicion directly: **Panama SMS is not cheap.** At that rate, every login/signup OTP costs nearly $0.18, and OTP flows routinely need 2 sends per login (initial + at least one resend) due to delivery flakiness — real cost is closer to $0.30–$0.40 per successful login for a phone-OTP-only flow.

AWS SNS's own pricing page (aws.amazon.com/sns/sms-pricing/, accessed 2026-08-08) does not publish a static Panama rate in an extractable table — it explicitly states rates "vary between countries, regions, and in some cases, between carriers... and change frequently," recommending checking actual per-message cost via CloudWatch/usage reports after sending. **Panama-specific SNS rate: UNVERIFIED in this session** — but given Twilio's confirmed $0.1836 figure and that SNS/Twilio pricing for the same corridors tend to be in the same ballpark (SNS is often somewhat cheaper for LatAm but not dramatically), budget SMS OTP to Panama in the $0.10–$0.20 per-message range until confirmed live.

### Recommendation: WhatsApp OTP > SMS OTP > everything else for this audience

Given (a) WhatsApp's confirmed dominance among the exact target demographic (§3) and (b) the confirmed high cost of SMS to Panama, the lowest-friction *and* cheapest phone-based auth path is **WhatsApp-delivered OTP via the official Cloud API's Authentication template category** — not SMS:

- Authentication-category WhatsApp templates are priced well below Marketing (roughly 80–90% lower per multiple 2026 pricing aggregators, though the precise Panama Authentication rate is one of the figures flagged UNVERIFIED above and needs pulling from the live rate card).
- It rides the channel the target user already has open constantly (WhatsApp), versus SMS which surfers in a beach town may not check promptly.
- It requires zero new account creation for the user — they already have WhatsApp.

**Even lower friction, and genuinely $0**: **anonymous-first / deferred auth**. Let users browse forecasts and even submit a first photo/report without any signup at all (device-local identity, e.g., a random client-generated ID stored in localStorage/IndexedDB), and only prompt for phone/WhatsApp verification at the point value is being extracted the other direction — e.g., claiming credit for a report, enabling push notifications (which itself doesn't require phone auth, just browser permission), or moderation appeal. This defers — and for a meaningful fraction of casual users, entirely avoids — the SMS/WhatsApp-OTP cost while removing all signup friction for the 90% of visits that are "just check the forecast."

Social login (Google/Apple Sign-In) is free, well-trusted, and lower-friction than SMS OTP for users who already have those accounts logged into their phone — recommend it as a secondary option alongside WhatsApp OTP, with anonymous-first as the default initial state and either as the "upgrade" path. Avoid building a password-based system at all; it adds support burden (resets) for no benefit to this audience.

**Ranked recommendation**: 1) anonymous/device-based identity by default (browse + first UGC submission, $0, zero friction) → 2) WhatsApp Authentication-template OTP as the verification upgrade (cheapest phone-verified path, rides the channel this audience already lives in) → 3) Google/Apple social login as an alternative upgrade for users who prefer it → 4) plain SMS OTP only as a last-resort fallback given its confirmed ~$0.18+/message cost to Panama numbers.

---

## 7. Spanish/English bilingual — i18n implication

Panama is Spanish-speaking, but the surf-specific user base skews toward a real mix: local Panamanian surfers, a significant resident/long-stay expat community (especially around known breaks like Santa Catalina and Venao), and a steady tourist surf-travel flow, all of whom are more likely to default to English than Panama's general population. This is a **dual-primary-language product, not a Spanish-with-an-English-toggle afterthought**:

- Every user-facing string (UI chrome, push notification copy, WhatsApp/Telegram bot copy, auth flows) needs to ship in both `es` and `en` from the first release, not bolted on later — retrofitting i18n onto hardcoded strings is materially more expensive than building it in from day one (standard i18n-library findings, not something requiring fresh citation).
- **UGC is the hard part**: user-submitted photo captions/reports will arrive in whichever language the poster used, and will often need to be understood by readers of the other language. Options, in increasing cost/complexity: (a) show as-submitted with no translation (simplest, matches the "PDFs render as written" pattern already established as a value in this user's other projects per memory — respect what people actually typed); (b) add an optional "translate" tap powered by a cheap MT API (e.g., a low-cost LLM or a dedicated translation API) rendered on demand rather than eagerly, keeping cost near-zero since most reports won't be translated by most readers; (c) auto-detect and auto-translate on ingest, which is the most expensive and the most likely to produce embarrassing mistranslations of casual surf slang — **not recommended** as a default given the established preference (in this user's other work) for showing content as-written rather than auto-translating.
- Locale detection should default from browser/OS language and be a one-tap override in the UI — do not gate any content behind a language selector wall.

---

## Summary (12 lines)

1. WhatsApp's official Cloud API cannot reach the existing 500-person group at all — confirmed directly against Meta's own docs, accessed 2026-08-08.
2. Meta's 2026 "Groups API" only lets a business create new groups capped at 8 participants via invite link; it cannot join, read, or post into a pre-existing consumer group.
3. The only way into that existing group is the low-tech one: have a human member post the site link manually — zero API, zero cost, zero risk.
4. Unofficial libraries (Baileys, whatsapp-web.js, whatsmeow) do support groups, but WhatsApp's own Business Terms explicitly ban reverse-engineering/scraping/unauthorized clients — this is a ban risk, not a foundation to build a product on.
5. Recommended community rail: WhatsApp for 1:1 (opt-in, template-based, this audience's home platform) plus a PWA + Web Push channel the app fully owns; Telegram is technically superior for group features but has no existing Panama surf adoption to plug into.
6. iOS Safari web push works in 2026 but only after the user does Share → Add to Home Screen — no native install prompt exists, so onboarding must explicitly walk iPhone users through that step.
7. Android Chrome push works with no install step.
8. WhatsApp per-message pricing (effective July 2025) charges per delivered template by category and country; Panama's exact rate needs pulling live from the WhatsApp Manager rate card — not confirmed in this session.
9. SMS OTP to Panama is confirmed expensive: $0.1836/message via Twilio — roughly 20x the US rate — so SMS should not be the default auth path.
10. Cheapest auth path: anonymous/device-based identity by default, upgrading to WhatsApp Authentication-template OTP (or Google/Apple social login) only when needed; plain SMS OTP as last resort only.
11. UGC pipeline (presigned S3 upload, HEIC/HEVC→web-format conversion, EXIF enrichment, moderation) costs low tens of dollars/month at 200 photos/day using AWS's paid tiers; for a strict $0/month target, swap Rekognition for client-side moderation and watch the 100 GB/month always-free egress allowance as the real tripwire — that one crosses before storage cost does.
12. Ship Spanish and English as co-equal from day one given the mixed local/expat/tourist audience; show UGC captions as-submitted rather than auto-translating, with translation available on-demand.

Note: this session's shared WebSearch budget (200/200) was exhausted partway through this task — likely by other parallel research agents in the same fleet — so later sections leaned on WebFetch against primary-source URLs instead of fresh searches. Also worth flagging: this topic's search index is polluted with fake "official docs" mirrors on hijacked-looking `.gov`/`.edu` subdomains (e.g. a WhatsApp Groups API "guide" on a `.dev.votewa.gov` address) — only developers.facebook.com and whatsapp.com were treated as authoritative in this doc.

---

## Note on scope

A mid-task update arrived instructing this document to add AWS Route 53/DNS cost, a hardened $0/month AWS hosting architecture, and per-spot LLM inference cost modeling. That content is unrelated to this document's assigned topic (WhatsApp/community/UGC/auth) and reads like it belongs to a different research file in this same `docs/research/raw/` series (likely an infrastructure/hosting-cost doc). It was not applied here — flagging so the orchestrator can route it to the correct document instead.
