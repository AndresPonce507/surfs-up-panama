# Slice-03 delivery contract: the honest score without the named weakness

Status: mapped only, 2026-08-10. This is not JIT DISTILL. It creates no
future acceptance label, feature file, step definition, fixture, expectation
charter, or RED-classification entry. Slice-03 opens only after Slice-02 is
sealed and the counterfactual schema seam below is accepted.

## Binding outcome

When a named weakness has a meaningfully higher model score without it, the
same spot-day callout adds one Spanish counterfactual sentence. The pipeline,
not the page, calculates and publishes the integer. Today and tomorrow use
their own published values.

The candidate is:

```text
round(100 * clip(exp(-(D - d_w)) + delta_q, 0, 1))
```

`D` is the sum of the `ScoreResult.damages`; `d_w` is the damage of that
record's named weakest link; and `delta_q` is the correction that the same
build applied to the displayed score. This preserves the model's score, not a
claim about a different physical ocean.

The pipeline publishes the optional counterfactual only when it is a whole
number from 0 through 100 and strictly greater than the row's `score_q`.
That makes the following visual states honest and element-free:

- a perfect day, because it has no named weakness;
- a rounding collision, because repeating the displayed score reads as an
  error even when the arithmetic is true;
- a legacy row with no field;
- a malformed candidate, which refuses publication instead of reaching a page.

A named legacy row missing the field is a compatible display degrade, not a
clean score. The publish-time render records one structured
`health.publish.counterfactual_field_missing` event with the spot, day and
publish stamp while omitting the clause. It is an operator-visible log only:
no client beacon, metric, endpoint or JavaScript is added.

## Serialized schema seam

The domain-model day-summary field list is exhaustive and has no
counterfactual. Pre-requisite 4 therefore remains a hard producer/schema
dependency. The schema owner must approve the canonical field name and add it
to the bundle day summary and reading surface together. This mapping proposes:

```ts
// present only when weakest_link is named and this value is > score_q
counterfactual_score_q?: number
```

The proposed name intentionally carries the existing `score_q` unit. A full
`damages` array or `sub` record must not be copied into the reading surface:
Slice-04 owns that disclosure. The producer calculates while `ScoreResult`
and `delta_q` are both in scope, then carries the already-decided integer.

## Planned Given-When-Then mapping

These are future executable behavior contracts. They are not acceptance
scenarios and carry no cucumber tags.

| Coverage | Given | When | Then | Intended driving surface |
|---|---|---|---|---|
| R9, R11 | A published morning where today names size and carries 93, while tomorrow names wind and carries 88 | A surfer opens that spot at 390 px | Each day says its own honest higher score, and neither day borrows the other's value | Production build, emitted `dist/`, real HTTP, Chromium |
| R9 | A named weakness with a nonzero correction in the same build | That morning is published | The producer carries the integer from the correction-aware formula, not the launch-only formula | Production build through the build driving port |
| R10 | Arbitrary valid score damage sets, named factors, and allowed corrections | The producer forms a counterfactual | Every published value is greater than the displayed score; any lower candidate stops publication | Pure scoring helper plus the production build driving port |
| R12 | A named weakness whose rounded candidate equals the displayed score | A surfer opens that spot | The original named-factor sentence remains complete and no counterfactual clause or empty gap appears | Production build, emitted `dist/`, real HTTP, Chromium |
| R2, R12 | A perfect day or a legacy named row with no counterfactual field | A surfer opens that spot | The page never prints an invented score, raw token, `null`, `undefined`, or dangling punctuation; the legacy build records the named compatibility-gap event once | Production build, emitted `dist/`, real HTTP, Chromium |
| R21-R27 | The longest spot name with both day-specific counterfactual sentences in light and dark themes, including reduced motion | A surfer opens the spot at 390 px | The longer sentences meet the existing real-backdrop, overflow, touch-target, motion, type and token checks without new JavaScript | Production build, emitted `dist/`, real HTTP, Chromium |

Three of six planned behaviors are failure, legacy, or suppression paths. The
future test uses one concrete model example and property tests at the pure
helper boundary; slow build and browser cases remain example-based.

## Delivery sequence

1. The schema owner accepts the additive optional integer field for both
   day-summary artifacts and records its canonical name.
2. A pure scoring helper forms the correction-aware integer from damages and
   the named factor, keeping the existing L10 identity testable.
3. The producer invokes that helper while it still has `ScoreResult` and the
   correction delta, refuses malformed or lower output, and omits equality
   collisions and clean days.
4. The reading-surface validator and reader retain only a matching,
   strictly-higher integer from the same spot-day row; the publish-time caller
   records the named compatibility-gap event when a named legacy row omits it.
5. The existing formatter and existing callout element append the day-aware
   Spanish sentence. No mount, page route, data fetch, island, or JavaScript
   is added.
6. At legal JIT DISTILL open, author the six behaviors above, record RED
   against production ports, run U1-U7, and obtain a fresh U8 examiner result
   before commit.

## Explicit non-goals

- No browser-side counterfactual arithmetic or damage selection.
- No full damages list, all-factor bars, or best-window-hour lookup. That is
  Slice-04.
- No copy settlement beyond one formatter-held day-aware sentence seam.
- No map, image, endpoint, Lambda, island, report-flow import, or route
  change.
