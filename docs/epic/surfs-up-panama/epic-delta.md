# Epic Delta: surfs-up-panama

## Wave: DISCUSS / [REF] Epic Job & Intent

**Persona (primary).** A Pacific-coast Panama surfer with a car, a narrow pre-work window, and up
to two hours of driving between him and the good waves. His current correction layer is a
500-person WhatsApp group of human spotters posting photos all day, because the forecast trackers
lie often enough that nobody trusts them alone.

**Persona (secondary).** The same surfer walking off the beach at 8am, who knows what the waves
actually did and has fifteen seconds of patience for telling anyone about it.

**Persona (operator).** Andres, who pays the bill. His constraint is $0.00 per month, permanently,
because nothing will ever offset the cost.

**Job story.**

> When I wake up at 5:40am and have to commit to one beach before my window closes, I want one
> honest ranked call that says which Pacific spot is actually good today and how much to trust it,
> so I can stop burning mornings on a forecast that lied and stop scrolling a WhatsApp group hoping
> somebody already drove out there.

**Supporting job (the loop).**

> When I just surfed a spot and the forecast was wrong about it, I want to say so in three taps and
> see how wrong we were, so the call gets better for the next person instead of the knowledge dying
> in a chat thread.

**Intent.** Free, unmonetized, open source, mobile web only. The differentiator is not a better
model, it is honesty that is checkable: the site publishes its own track record next to its own
forecast. That is only possible if every prediction is written down at the moment it is made, from
day one, which is why the keystone feature is the one that stands up the immutable prediction log
end to end.

Product decisions are already settled and are not relitigated here. They live in
`docs/DISCUSS-decisions.md` (31 decisions, plus the RESOLVED anchoring section). Rows below cite
that file by path and number rather than restating it.

## Wave: DISCUSS / [REF] Feature Plan

| Feature | Value statement | Status | Annotation | Justification |
|---------|-----------------|--------|------------|---------------|
| F-DAILY-CALL-WITH-PERMANENT-RECEIPTS | A surfer opens the site at 5:40am and sees today's twenty Pacific spots ranked, with the top one called out and a plain-language reason in Spanish. The next morning, yesterday's numbers are still readable, unchanged, in an append-only archive. | pending | @walking_skeleton | Keystone per HANDOFF.md section 3. Forecast archives are not retrievable after the fact, so if the prediction log is not written from day one the learning loop becomes permanently impossible. Thin on purpose: one source, physics scoring only (research 09 section 7), learning term wired in and set to zero (research 09 section 7.4). The spot list ships as a seed data file, not code, so nothing is hardcoded to Panama (BRIEF.md constraint 5). Scope per `docs/DISCUSS-decisions.md` 1, 2, 3, 8, 15, 18, 21, 27. |
| F-BILL-STAYS-ZERO-AND-STAYS-UP | The hourly ingest stops overnight and Andres hears about it within the hour instead of finding a frozen forecast days later, and the month still closes at $0.00 on the AWS bill. | pending |  | Serves BRIEF.md constraint 1. The eleven cost guardrails are research 08 section 10. Their VALUES land with the resources in the keystone row (log retention defaults to never expire, which research 08 section 10.3 calls the number one way free serverless starts costing money). What this row owns as an observable is the dead-man's switch on the hourly ingest, with the budget actions deny policy as the backstop that email alerts alone cannot be. |
| F-KNOW-HOW-MUCH-TO-TRUST-IT | A surfer sees a confidence level on every row and taps it to read why in plain Spanish, for example that the models agree on size but split badly on period, so if it is the 15 second swell it is on. | pending |  | `docs/DISCUSS-decisions.md` 7. Needs two or more usable models, so this is where the second and third sources and their partial-failure handling land. Ships as a qualitative flag only, never a calibrated error bar, per the self-correction in research 09 section 3.6. The percentile form that section recommends needs the keystone's log to have accumulated a spot's own spread history first, and if the term fails the research 09 section 10.2 calibration check it gets removed rather than shown. |
| F-SEE-WHAT-KILLED-IT | A surfer taps a spot and sees the one thing that ruined it named outright, for example wind at 0.18, with the size in body-height words and a small map showing which way the break faces. | pending |  | `docs/DISCUSS-decisions.md` 17, 18, 20. Naming the weakest sub-score is the entire point of the gate times weighted geometric mean shape in research 09 section 7.3, which exists so a great swell can never average away a ruined wind. |
| F-PASTE-THE-CALL-INTO-THE-GROUP | A surfer taps once on a spot page, pastes the day's call and a link straight into the 500-person WhatsApp group, and the link previews with the spot name and its score. | pending |  | `docs/DISCUSS-decisions.md` 5, 30. Placed before the report flow on purpose: the WhatsApp group is the distribution channel, so this row brings the audience that the next row then turns into submissions, and submission volume is the binding constraint on every learning feature after that (research 09 section 13.2). |
| F-TELL-US-WHAT-YOU-SAW-COLD | A surfer walking off the beach answers three taps about what they actually saw, and only after that answer is locked in does the site show what it had predicted and how far off it was. | pending |  | `docs/DISCUSS-decisions.md` 4, 9, 11, 28 and the RESOLVED anchoring section. Hard constraint: the label is committed before the reveal screen renders, and the reveal never round-trips back to allow an edit, or the anchoring bias returns and the loop trains on our own prior. |
| F-WORKS-WITH-NO-SIGNAL | A surfer parked at Venao with one bar still sees the last forecast that loaded, and a report filed with no signal at all sends itself once, and only once, when they get back into coverage. | pending |  | `docs/DISCUSS-decisions.md` 25, 26. Signal is worst exactly where reports happen, so the queue needs server-side dedup on re-sync rather than client-side trust. |
| F-SHOW-OUR-TRACK-RECORD | A surfer reads, right under the forecast, how often we have actually been right at this spot lately, and where there are not enough reports yet the site shows the count instead of inventing a number. | pending | depends-on F-TELL-US-WHAT-YOU-SAW-COLD | `docs/DISCUSS-decisions.md` 13, 19. Non-adjacent dependency: the scorecard is the prediction log joined to the observation record, so it cannot exist until reports are being collected. Research 09 section 13.3 bars displaying any bias claim smaller than twice its standard error, which is what the honest counter state is for, and HANDOFF.md section 6 item 12 warns no accuracy claim is earnable at launch. |
| F-FORECAST-LEARNS-FROM-THE-BEACH | Once enough different people have reported a spot, its forecast visibly moves toward what people actually saw, and where the evidence is still too thin the site refuses to correct it and says so. | pending | depends-on F-TELL-US-WHAT-YOU-SAW-COLD | `docs/DISCUSS-decisions.md` 22, 24. Non-adjacent dependency: the stage 1 correction is fitted on observations joined to the prediction log. Research 09 section 13.4 gates it at roughly 10 to 30 reports from at least 5 distinct reporters per spot, with shrinkage always on and the applied correction clamped, so a troll or a mis-keyed report cannot produce an absurd public number. The human seed values are never overwritten. |
| F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE | A surfer who asked about Playa Venao gets one push on the mornings it is worth the drive, and afterwards gets asked how it went, including on the mornings it was bad. | pending | depends-on F-TELL-US-WHAT-YOU-SAW-COLD | `docs/DISCUSS-decisions.md` 12, 23. Non-adjacent dependency: the solicited report posts into the same observation record the report flow creates. Soliciting reports regardless of outcome is the primary fix for selection bias in research 09 section 13.5a, which is the hazard most likely to make the learning loop confidently wrong, so the ask-afterwards half is not a nice-to-have bolted onto push. |
| F-READ-IT-IN-YOUR-LANGUAGE | A visitor who does not read Spanish flips one toggle and gets the same call, the same reasons and the same report flow in English, and that choice still holds on the next visit. | pending |  | `docs/DISCUSS-decisions.md` 8. Placed last on purpose so one translation pass covers settled copy instead of translating the same strings twice. This is also the seam that proves copy is not bound to one locale, which is what a second country needs later (BRIEF.md constraint 5). |

Row order is dependency order, backward-only. An empty Annotation cell means the row declares no
extra non-adjacent dependency and is parallel-safe once the rows above it have landed.

Status tokens are `pending`, `in-flight`, `shipped`. Every row starts `pending`. On pick-up, one
atomic edit flips the row to `in-flight` and turns the Feature cell into a `docs/feature/{id}/`
link. No feature workspace exists until its row is picked up.

## Open Questions

Each names what it blocks. None of these are resolved here.

1. **Which model sources the launch actually ingests, and whether Open-Meteo's terms permit
   republishing derived data as public static JSON.** HANDOFF.md section 6 item 2 records their
   terms as silent on serving derived data to third parties, and precomputing to public static
   JSON is redistribution. **Blocks** F-DAILY-CALL-WITH-PERMANENT-RECEIPTS, whose whole input this
   is, and F-KNOW-HOW-MUCH-TO-TRUST-IT, which needs two or more usable sources. Needs an email to
   info@open-meteo.com before launch, not after.
2. **The actual launch spot list.** `docs/DISCUSS-decisions.md` 15 fixes the count at roughly 20
   Pacific spots but never names them, and HANDOFF.md section 6 items 9 and 10 flag Playa Duartes
   as unlocatable in any source and Playa Serena as having two directly contradictory sources on
   its season. **Blocks** F-DAILY-CALL-WITH-PERMANENT-RECEIPTS, since the seed file is its input.
   Needs a human check with the cousin.
3. **How an anonymous write path gets rate-limited without buying WAF.** See contradiction C3
   below. **Blocks** F-TELL-US-WHAT-YOU-SAW-COLD and the $0 half of
   F-BILL-STAYS-ZERO-AND-STAYS-UP.
4. **Whether the optional photo ships in the launch report flow.** `docs/DISCUSS-decisions.md` 9
   offers the photo after the three taps, while research 08 section 9.3 identifies photos as the
   specific thing that breaks the $0 target. **Blocks** the scope of F-TELL-US-WHAT-YOU-SAW-COLD
   and, if photos ship, the cost model in F-BILL-STAYS-ZERO-AND-STAYS-UP.
5. **What actually triggers a push.** `docs/DISCUSS-decisions.md` 12 settles opt-in per spot, but
   no decision sets the threshold rule, and that file's own consequences section notes a per-user
   threshold is implied and never chosen. **Blocks** F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE.
6. **Whether the name-claim flow ships in this epic.** `docs/DISCUSS-decisions.md` 11 says
   anonymous now and claim a name later, without saying whether later is inside this epic.
   **Blocks** the identity scope of F-TELL-US-WHAT-YOU-SAW-COLD and the cross-device half of the
   per-reporter offset estimate in F-FORECAST-LEARNS-FROM-THE-BEACH.

### Contradictions found, flagged not fixed

- **C1. Coast scope, inside `docs/DISCUSS-decisions.md`.** Round 1 decision 1 reads "Ranked list of
  every spot, both coasts". Round 4 decision 15 reads "Pacific coast only, ~20 spots". Decision 15
  is later and HANDOFF.md section 5 records Pacific only, so this plan follows 15. The round 1 row
  was never edited.
- **C2. The report question, inside `docs/DISCUSS-decisions.md`.** Round 8 decision 28 still reads
  "Compare to the forecast" with the example prompt that shows our number first, while the RESOLVED
  section further down the same file mandates cold absolute capture before any reveal. The round 8
  row was never edited. Worth naming alongside it: research 09 section 13.2 calls the comparative
  field "the single most valuable field" precisely because it cancels each reporter's personal
  size-inflation constant, and the anti-anchoring resolution removes exactly that field. The
  residual can be computed server-side instead, which trades the per-reporter offset cancellation
  for an unbiased label. That trade is a DESIGN call and is not made here.
- **C3. Auth-gated write path versus anonymous reporting.** Research 08 section 10.4 builds its
  entire free rate-limiting story on "the write path is auth-gated" plus a per-user DynamoDB quota,
  and section 8.3 recommends magic-link auth. `docs/DISCUSS-decisions.md` 11 makes reporting
  anonymous with zero friction. The research's abuse model assumes an identity the product decision
  refuses to require.
- **C4. Research 09 corrects itself on confidence.** Sections 8.4 and 14.3 build the confidence
  term on inter-model spread. Section 3.6 then demonstrates from four cited studies that spread is
  a weak predictor of skill, says the term must be treated as a qualitative flag rather than a
  calibrated error bar, and says that if it fails calibration it should be removed. Carried into
  the F-KNOW-HOW-MUCH-TO-TRUST-IT justification. Anyone reading only section 14.3 will build the
  wrong thing.
