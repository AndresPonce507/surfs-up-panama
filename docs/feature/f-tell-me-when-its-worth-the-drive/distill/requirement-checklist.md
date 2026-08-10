# Requirement checklist: f-tell-me-when-its-worth-the-drive

Extracted 2026-08-09 at slice-01's JIT DISTILL open, from `feature-delta.md` (Slice Plan
slice-01 row, Definition of Done, the cross-feature seam section, Pre-requisites),
`docs/product/architecture/07-write-path.md` §8 (§8.1 wire contract, §8.2 notify rule,
§8.3 solicitation, §8.4 abuse controls, §8.5 cost and VAPID handling, §8.6 sequence),
`adr-push-vapid-direct.md` (send lane, allowlist, send rules, consequences),
`application-architecture.md` §7 P6 (no false green), §10 (settled copy), §11 (contrast,
targets, reduced motion, 390 px), §12 (iOS versus Android from the research corpus, PWA
manifest, the two refused-to-depend-on unknowns), §14 (the wireframe mount point), and the
U1-U7 UI mandates (`nw-ui-quality-mandates`). One row per requirement. Category from the
closed set {ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body. Rows
whose slice has not entered DISTILL are expected-uncovered by design (per-slice JIT); they
are visible from day one so no requirement is silently dropped.

## Two constraints that shape every row below

**The threshold is undecided and stays undecided here.** Pre-requisite 1 is open: no
document fixes the score at which a push fires, and `07-write-path.md` "What I am unsure
about" item 4 says so in its own words, that `threshold_score` default 70 "is an unfit
prior; no research names the right default". No requirement row and no scenario pins 70 or
any other value. What IS settled and therefore testable is the **shape of the rule**:
`07-write-path.md` §8.2 and the ADR both read "score ≥ subscriber's `threshold_score`", so
the inequality direction and its inclusivity at the bar are the oracle. Every threshold
scenario supplies the bar as a declared fixture input and asserts the boundary law around
it. Whatever value Andres ratifies, no acceptance test needs an edit.

**No write path is deployed.** Pre-requisites 2, 3, 5 and 6 are open: no CloudFormation
stack, no `push` Function URL, no mint credential, no concurrency headroom answer, no VAPID
keypair. Rows marked **deploy-blocked** below are authored now, run now, and fail now at
their behaviour oracle, but they cannot reach GREEN in DELIVER until those Pre-requisites
close. No scenario stands up a stand-in endpoint to make a deploy-blocked oracle pass: a
scenario satisfied by a fake endpoint proves nothing about the real one, and per
`adr-push-vapid-direct.md`'s own consequences row an AT against a fake push service attests
protocol framing only, never real FCM/APNs acceptance or aes128gcm interop.

## Slice-01 requirements

| # | Requirement | Category |
|---|---|---|
| R1 | The Playa Venao spot page carries the avisos affordance at the settled mount point ("▸ Avisos de este spot", §14 wireframe), rendered at 390 px in both themes; the island's script loads only on tap, and with JavaScript off no avisos control is offered at all (§6 island inventory row 3) | functional |
| R2 | Tapping it asks the browser for notification permission and, when granted, obtains a real `PushSubscription` from the browser's push manager before anything is sent to the server (§8.6 sequence) | functional |
| R3 | "listo" renders only after the server's `{"status":"subscribed"}` ack, never before and never on the strength of the browser subscription alone (P6 no false green, §8.1) — **deploy-blocked** | validation |
| R4 | No notifications-on state renders anywhere without BOTH a real browser `PushSubscription` and a stored `(spot_id, endpoint_hash)` item; on a return visit the rendered state derives from `PushManager.getSubscription()` plus stored state, never a remembered client flag (feature-delta DoD row 2, this plan's requirement filling the settled design's silence) | validation |
| R5 | A permission the phone does not concede leaves the spot without avisos, says so plainly in Spanish, offers no second prompt, and shows no avisos-on state (decision 23; browsers forbid re-prompt anyway). Harness limit recorded in `red-classification.md`: Playwright surfaces a non-granted permission as a dismissal, not as a hard denial, so the oracle is "no concedido"; a hard operating-system denial is only observable on the real-device smoke (Pre-requisite 10) | validation |
| R6 | Where the current context cannot request push at all, the subscribe affordance does not render as an action: no dead button, no control that leads nowhere. Absence is the honest state (research 12 §4 as quoted in §12: an open Safari tab cannot request push) | validation |
| R7 | A 429 or 5xx from the server leaves the spot at "not subscribed" and offers a retry; the subscription is never queued offline, because subscribe is interactive by contract (§8.1 last row) — **deploy-blocked** | validation |
| R8 | An `endpoint_not_allowed` rejection is said to the surfer in plain Spanish with no jargon: no hostname, no status code, no JSON, no English on the Spanish surface — **deploy-blocked** | validation |
| R9 | One tap removes the avisos, and off means off: the removed subscriber receives nothing from the next run onward (feature-delta DoD row 6) — **deploy-blocked** | functional |
| R10 | Subscribe upserts on the settled identity `(spot_id, endpoint_hash)` where `endpoint_hash = sha256(endpoint)` hex-truncated to 128 bits; subscribing twice from the same device to the same spot leaves exactly one subscription (§8.1) | functional |
| R11 | The stored subscription carries `lang`, `threshold_score`, `last_notified_date`, `followup_date` and `device_id`; `lang` ships from day one because the notify job composes the push copy from it (§8.1 stored item; feature-delta Language note) | functional |
| R12 | Endpoint host allowlist: HTTPS only, and the host must match the configured push-service list. A rejection is loud and names the host, why (relay and SSRF abuse) and how (subscribe from a supported browser) (§8.4, ADR decision 3) | security |
| R13 | Quota of 20 subscription writes per day per device is enforced at the write surface (§8.4, guardrail 7 amendment owned by F-TELL-US slice-02) | security |
| R14 | Unsubscribe deletes the item and is idempotent: a second unsubscribe of an already-removed subscription is still an ordinary success, never an error (§8.1) | functional |
| R15 | Inside the morning window 06:00 to 09:00 spot-local, with the spot's own timezone read from the spot seed and nothing Panama-shaped in the rule, a morning whose current bundle score is at or above that subscriber's configured bar plans exactly one aviso for that subscriber (§8.2) | functional |
| R16 | The boundary law, asserted without pinning a number: a morning exactly at the subscriber's bar sends, and a morning one point below the same bar does not. The rule reads `score ≥ bar` and the bar is per-subscription data (§8.2, ADR decision 4; Pre-requisite 1 leaves the VALUE open) | functional |
| R17 | Outside the morning window no aviso is planned, however good the morning is (§8.2) | functional |
| R18 | At most one aviso per spot per subscriber per day: a subscriber whose `last_notified_date` is already today gets none (decision 23, §8.2) | functional |
| R19 | The aviso names the spot and its score in that subscriber's own `lang`, deep links to the spot page, carries `tag` = `spot_id`, and expires after 4 hours because a stale surf call is worthless (§8.2, seam payload contract) | functional |
| R20 | A per-run send cap with a LOUD skip event naming what was deferred; the cap is the binding control under abuse, not a dollar meter (§8.4). The scenario asserts the LAW against a declared cap, never the literal 10,000: that number is ADR D5's *proposal* and is configuration, so pinning it in an acceptance test would fake a ratification | nfr |
| R21 | A 404, 410 or 403 from the push service prunes that subscription on the first failed send (§8.4, ADR decision 4) | validation |
| R22 | The notify core takes its clock as a declared input; nothing in the core reads the ambient clock, which is what makes the morning window testable without waiting for dawn (`src/pipeline/ports.ts` rule, §10 `Clock` row, clause `contract:declared-inputs-not-ambient-reads`) | build |
| R23 | A subscriber who chose no bar is governed by the same boundary law as one who chose it: some server-side bar applies, and the same at-or-above rule decides the morning. Neither the default's VALUE nor whether it is stamped at subscribe time or applied at send time is asserted anywhere (Pre-requisite 1; open mechanic named in the Slice Plan) | functional |
| R24 | Every push received while subscribed shows a notification; a silent push is never acceptable, because browsers answer silent pushes by revoking the subscription and a revoked subscription is a silent broken promise (seam contract obligation 1) | functional |
| R25 | `tag` = `spot_id`, so a second aviso for the same spot replaces the first in the tray rather than stacking (decision 23 carried into the notification tray; seam obligation 2) | functional |
| R26 | The push handler is stateless: no fetch, no cache read or write, no IndexedDB, no Background Sync, no storage of any kind, no analytics and no network call. This is what makes the two iOS unknowns of §12 irrelevant to push correctness (seam obligations 3 and 4) | security |
| R27 | Tapping the aviso closes the notification, then focuses an existing client at the payload's url if one exists, else opens a window there (seam `notificationclick` obligation) | functional |
| R28 | U1: every avisos surface string clears WCAG AA against the real rendered backdrop in both themes, measured against the background the token actually sits on (§11) | ui |
| R29 | U2: no horizontal scroll, clipping or overlap at 390 px with the avisos affordance present, in either theme | ui |
| R30 | U3: the avisos control measures at least 44 by 44 px and stays reachable for a thumb (§11, decisions 23 and 25) | ui |
| R31 | U4: reduced motion is honoured, and nothing about the avisos affordance delays first meaningful content (§11) | ui |
| R32 | U5: the designed states exist and are honest, each as a real scenario: not subscribed, permission denied, context cannot request push, server refused with retry offered, subscribed, and removed. None is a framework default | ui |
| R33 | U6: avisos type comes from the declared scale and survives the Spanish strings at 390 px without truncation | ui |
| R34 | U7: avisos surfaces use named tokens for colour, spacing, radius, elevation and motion; no raw hex outside `src/styles` | ui |
| R35 | Zero technical text on the Spanish surface anywhere on the avisos path: no model names, no JSON, no placeholder tokens, no English, no raw timestamps, no status codes, and no em dashes | validation |
| R36 | No push string is invented by a build lane: every rendered avisos string traces to §10 verbatim copy or to the Pre-requisite 8 settlement through the cousin's crew channel | validation |
| R37 | Byte discipline: the push island stays at or under 2.0 KB gz and loads only on tap; the spot route stays inside the 14 KB gz document and 100 KB gz first-visit ceilings (§5, §6) | nfr |
| R38 | No PII anywhere on the push path: VAPID private key only in SSM SecureString, public key in the client by design, `sub` = the repo URL and never an email (§8.5, `adr-secrets-public-repo.md`) | security |

## Later-slice requirements, visible now, expected-uncovered

| # | Requirement | Category | Slice |
|---|---|---|---|
| R39 | An open iPhone Safari tab never shows a dead subscribe affordance, and from the installed icon the same one-tap flow completes end to end | e2e | slice-02 |
| R40 | The A2HS hint renders the §10 words verbatim as a 0 JS `<details>` disclosure. **Ownership is a live conflict** between this feature's slice-02 and F-WORKS-WITH-NO-SIGNAL slice-05 (Pre-requisite 4(b), unruled). No slice-01 scenario asserts the hint's presence or its absence, in either direction | functional | slice-02, contested |
| R41 | On pushed days only, one afternoon follow-up between 14:00 and 17:00 spot-local asks "¿Cómo estuvo?" and deep links `/spots/{slug}/reportar?t=ps` | functional | slice-03 |
| R42 | A report filed through that deep link is stored with `trigger: push_solicited`, satisfying the learning lane's one required field end to end | e2e | slice-03 |
| R43 | A surfer raises their own bar for a spot with one choice, and from then on the push respects their number instead of the default; the displayed choice on a return visit renders from stored subscription state | functional | slice-04 |
| R44 | U1: the exact iPhone route text clears WCAG AA against its real backdrop in both themes at 390 px | ui | slice-02 |
| R45 | U2: the iPhone route has no horizontal scroll, clipping, or overlap at 390 px in either theme | ui | slice-02 |
| R46 | U3: Safari offers no unusable avisos target, and the installed capable path keeps the real avisos target reachable for a thumb | ui | slice-02 |
| R47 | U4: the iPhone route honours reduced motion and does not defer its essential instruction behind animation or delayed script | ui | slice-02 |
| R48 | U5: the no-capability Safari state, the capable installed state, and the not-yet-subscribed return state are designed outcomes, not framework defaults | ui | slice-02 |
| R49 | U6: the exact Spanish route survives 390 px in the declared type scale without truncation | ui | slice-02 |
| R50 | U7: the iPhone disclosure and nearby avisos state use named colour, spacing, radius, elevation, and motion tokens | ui | slice-02 |

## Open questions that deliberately have no oracle

| Open | Why no test pins it |
|---|---|
| The value of the bar at which a push fires (Pre-requisite 1) | Undecided by Andres. `07-write-path.md` §8.1's default 70 is an architecture lane's placeholder and its own §"What I am unsure about" item 4 calls it an unfit prior. R16 and R23 assert the boundary LAW, never a number, so no acceptance test needs editing when the value is ratified |
| Whether an omitted `threshold_score` is stamped into the item at subscribe time or applied at send time when the attribute is absent | Named in the Slice Plan as a mechanic `07-write-path.md` leaves unstated, "so DESIGN fixes it rather than a crafter guessing". R23 asserts only that some server-side bar governs, which is true under either mechanic |
| A2HS hint ownership | Pre-requisite 4(b), claimed by two committed plans, unruled. R40 records it; no slice-01 scenario depends on owning it |
| Where this feature's `push` and `notificationclick` handler code lives | The seam grants a structural seat only ("where the listener goes", not "what module supplies it"). The scenarios assert the handler OBLIGATIONS of the feature-delta seam contract; the module's home is a DELIVER decision inside that contract, and the append itself is seam-gated on Pre-requisite 4(a), whose payload-contract acknowledgement from the SIGNAL lane is still owed |
| Real delivery through FCM or APNs, aes128gcm interop, TTL semantics on a real device | `adr-push-vapid-direct.md` consequences: an AT can attest protocol framing only. The real-device smoke is Pre-requisite 10, on the launch checklist, not a slice gate |
| The push-service host allowlist contents | Pre-requisite 7. R12 asserts that a host off the list is refused loudly with WHAT, WHY and HOW; the hostnames themselves are authored in DELIVER against current vendor documentation, never from memory |

## Current DISTILL coverage

Slice-01 is the only slice in DISTILL. Coverage is by `@covers-Rn` Gherkin tags in
`tests/acceptance/f-tell-me-when-its-worth-the-drive/*.feature`. Observed 2026-08-09:
37 scenarios, 416 steps, all 37 failing at a `Then`, every one classified
`MISSING_FUNCTIONALITY`. Full record in `red-classification.md`.

| Requirement | Active acceptance evidence | Status |
|---|---|---|
| R1, R2 | `avisos-de-este-spot.feature` walking skeleton | RED, oracle reached |
| R3 | `avisos-de-este-spot.feature` walking skeleton | RED, deploy-blocked |
| R4 | `avisos-de-este-spot.feature`, two scenarios (first visit and return visit) | RED, oracle reached |
| R5 | `avisos-de-este-spot.feature` denied-permission scenario | RED, oracle reached |
| R6 | `avisos-de-este-spot.feature` cannot-request scenario | RED, oracle reached |
| R7 | `avisos-de-este-spot.feature` server-refused scenario | RED, deploy-blocked |
| R8 | `avisos-de-este-spot.feature` unknown-destination scenario | RED, deploy-blocked |
| R9 | `avisos-de-este-spot.feature` removal scenario | RED, deploy-blocked |
| R10, R11 | `la-suscripcion-guardada.feature` upsert scenario | RED, oracle reached |
| R12 | `la-suscripcion-guardada.feature` refused-destination scenario | RED, oracle reached |
| R13 | `la-suscripcion-guardada.feature` daily-quota scenario | RED, oracle reached |
| R14 | `la-suscripcion-guardada.feature` twice-removed scenario | RED, oracle reached |
| R15, R19, R22 | `el-aviso-de-la-manana.feature` morning scenario and other-timezone scenario | RED, oracle reached |
| R16 | `el-aviso-de-la-manana.feature` below-the-bar scenario | RED, oracle reached |
| R17 | `el-aviso-de-la-manana.feature` outside-the-window scenario | RED, oracle reached |
| R18 | `el-aviso-de-la-manana.feature` once-a-day scenario | RED, oracle reached |
| R20 | `el-aviso-de-la-manana.feature` run-cap scenario | RED, oracle reached |
| R21 | `el-aviso-de-la-manana.feature` pruning scenario | RED, oracle reached |
| R23 | `el-aviso-de-la-manana.feature` no-bar-chosen scenario | RED, oracle reached |
| R24, R25, R26, R27 | `el-aviso-en-el-telefono.feature`, four scenarios | RED, oracle reached |
| R28 to R34 | `avisos-de-este-spot.feature` visual outline, both themes | RED, oracle reached |
| R35 | `avisos-de-este-spot.feature` unknown-destination and visual scenarios | RED, deploy-blocked in part |
| R36 | Not covered by an executable oracle in slice-01. The strings do not exist yet (Pre-requisite 8); the rule is enforced at authoring, and R35 catches the observable half | expected-uncovered, flagged |
| R37 | Not covered by a slice-01 scenario. The island does not exist, so there are no bytes to measure; the keystone byte gate measures it the moment it ships | expected-uncovered by construction |
| R38 | Not covered by a slice-01 acceptance scenario: key material is a human apply step, never agent-held, and there is no deployed path to observe. Verified at deploy against `adr-secrets-public-repo.md` | expected-uncovered, deploy-blocked |
| R39, R40, R44 to R50 | `avisos-en-el-iphone.feature`, five slice-02 scenarios | RED, awaiting classification |
| R41 to R43 | Later slices, JIT | expected-uncovered by design |
