# DISCUSS wave — decisions log

Site: **Surfs Up Panama** (name kept for now; architecture stays global-ready, rename is
branding only and carries no structural cost)
Date: 2026-08-08

---

## Round 1 — the core answer

| # | Question | Decision |
|---|---|---|
| 1 | What do you see first at 5:40am | **Ranked list of every spot**. ~~both coasts~~ → **SUPERSEDED by decision 15**: launch is Pacific coast only, ~20 spots. Caribbean is a second launch. |
| 2 | How opinionated | **Make the call, show the work.** Names a best spot, every score breaks down into why |
| 3 | How the two combine | **Top spot is visually the call** — oversized with plain-language reason, compact rows below |
| 4 | How people report back | **Three taps, no photo required.** Good/bad, size vs forecast, wind |
| 5 | WhatsApp connection | **Share card built for pasting.** One tap copies the formatted daily call plus link |

## Round 2 — trust, language, name

| # | Question | Decision |
|---|---|---|
| 6 | Name | **Keep Surfs Up Panama** for now. Revisit if it outgrows Panama |
| 7 | Confidence display | **Always shown, three levels** (high/medium/low) with the reason on tap |
| 8 | Language | **Spanish first, English toggle.** Defaults to the community it starts with |

## Round 3 — the loop and the habit

| # | Question | Decision |
|---|---|---|
| 9 | Photos | **Optional, after the three taps.** Required flow stays fast, photo prompt follows |
| 10 | Forecast horizon | **Today and tomorrow only.** Refusing to show 7 days is itself an honesty statement |
| 11 | Identity to post | **Anonymous now, claim a name later.** Zero friction at the moment that matters |
| 12 | Notifications | **Web push, opt-in per spot** (iOS requires add-to-home-screen first) |

## Round 4 — the differentiator, scope, and the community

| # | Question | Decision |
|---|---|---|
| 13 | Accuracy scorecard | **Inline, on every spot.** Track record sits right where you read the forecast |
| 14 | Skill personalization | **None. One honest score.** Score the wave, not the surfer |
| 15 | Launch scope | **Pacific coast only, ~20 spots.** Caribbean is a second launch |
| 16 | Localism | **Only well-known spots.** No secret break ever gets added |

## Round 5 — the page, the words, the empty state

| # | Question | Decision |
|---|---|---|
| 17 | Spot detail page | **The breakdown.** Every sub-score exposed, weakest link called out |
| 18 | Units | **Body-height words first** ("chest to head high"), metres secondary |
| 19 | Day one with no data | **Say it plainly, show the counter.** "7 / 30 reports" per spot |
| 20 | Map | **Small static map on the spot page only.** Shows the break and its orientation |

## Round 6 — build, data, defense

| # | Question | Decision |
|---|---|---|
| 21 | Frontend stack | **Astro.** Near-zero JS by default, islands for the interactive bits |
| 22 | Spot parameters | **Seed from human knowledge, learn a correction layer on top.** Never overwritten, always auditable |
| 23 | Report prompting | **Persistent button on every spot.** No notification nagging |
| 24 | Bad data | **Statistical only.** Outliers down-weighted, no moderation queue |

## Round 7 — mobile is the product

**Hard constraint from the owner: this is a mobile web site, not an app. Most people will
only ever see it on a phone.**

| # | Question | Decision |
|---|---|---|
| 25 | Mobile priorities | **All four:** thumb-zone report button, sunlight-readable contrast, works on bad signal, add-to-home-screen prompt |
| 26 | Offline | **Cache the last forecast AND queue reports offline.** Signal is worst exactly where reports happen |
| 27 | Performance | **Under 100KB, loads on 3G in under 2 seconds.** Enforced as a build budget |

## Round 8 — data quality, licensing, launch

| # | Question | Decision |
|---|---|---|
| 28 | What the three taps ask | ~~**Compare to the forecast.** "We said 82, chest to head, clean. Were we right?"~~ → **SUPERSEDED by the RESOLVED section below**: ask cold and absolute first, reveal after. Screen one shows no prediction at all. |
| 29 | License | **MIT** |
| 30 | Who posts the WhatsApp card | **Anyone, from any spot page** |
| 31 | Domain | **Wait.** Register surfsuppanama.com when there is something to host |

---

## ✅ RESOLVED — anchoring in the report flow

Decision 28 originally showed the user our prediction before asking whether it was right.
That introduced **anchoring bias**: once someone reads "chest to head," they are measurably
more likely to answer "spot on" than they would have describing it cold. The learning loop
would then train partly on our own prior, inflating the accuracy score and slowing real
correction.

**Resolution (owner, 2026-08-08): ask absolute first, reveal after.**

The report flow is therefore two screens:

1. **Screen one — cold.** No score, no prediction, no hint of what we said. Just: how big,
   how was the wind, was it worth it. This screen produces the label.
2. **Screen two — the reveal.** "We said 82, chest to head, clean. You saw waist to chest,
   bumpy. We were 14 too high." This screen produces trust and teaches people to read
   conditions.

This is strictly better than the original: it removes the bias AND the reveal is a more
satisfying moment than a confirmation prompt. Screen two is also where the share prompt
naturally lives.

**Build implication:** the label must be captured and committed before screen two renders.
Never let the reveal round-trip back and allow an edit, or the bias comes straight back in.

**Known cost, recorded 2026-08-08. The decision stands; this is not a reopening.**

"Strictly better" above is too strong, and the cost was not priced when the call was made.
`docs/research/raw/09-ai-forecast-methodology.md` §13.2 calls the comparative field ("were we
too big or too small?") the single most valuable field in the whole report, because asking one
person to compare against a number cancels out *that person's own* size-inflation habit. Two
surfers who both call chest-high "head-high" still both answer "a bit over" correctly. Cold
absolute capture removes that field, so their personal offsets no longer cancel and instead land
in the data as noise.

The signal is recoverable server-side by differencing the cold label against what we predicted,
which we have in the prediction log. What is **not** recoverable is the per-person offset
cancellation. The learning layer therefore has to estimate a per-reporter bias term from
accumulated history rather than getting it for free per report, which means it needs more
reports per person before a correction is trustworthy.

Net: the anti-anchoring call is still right, because training on our own prior is a
self-reinforcing error and a noisy honest signal beats a clean contaminated one. It just is not
free. Whoever designs the learning layer must budget for the per-reporter bias term.

---

## Consequences worth tracking

- **Confidence at three levels on every row** means the ranked list carries two signals per
  spot. Density is a real design risk on mobile. Needs care in DESIGN.
- **Spanish first** means the AI narration is generated twice per run, or generated once and
  translated. Doubles that part of the LLM cost, still trivial in absolute terms.
- **Today and tomorrow only** shrinks the precompute surface, which helps the $0 target.
- **Anonymous reporting** means per-person bias calibration keys on a device id, and there is
  no cross-device reputation until someone claims a name. Spam mitigation needed.
- **Optional photo** keeps the vision model in play but it will run on a minority of reports.
  Vision is a bonus signal, not the primary one. The three taps are the primary labels.
- **Web push opt-in per spot** implies a per-spot subscription store and a threshold rule per
  user, which is the first genuinely stateful thing in an otherwise static architecture.
