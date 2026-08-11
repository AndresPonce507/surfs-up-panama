# Slice-02 delivery contract: the named factor carries its published value

Status: mapped only, 2026-08-10. X7 schema authority accepted 2026-08-10 in
`adr-weakest-link-scalar-and-counterfactual-projections.md`. This is not JIT DISTILL. It deliberately
creates no future acceptance label, feature file, step definition, fixture,
or RED classification entry. Those artefacts are authored only after Slice-01
has its sealed commit and Slice-02 is legally opened.

## Binding outcome

For each named weakest link on a spot page, the same one visible sentence also
shows that factor's published raw sub-score, for example `Lo que lo tumba: el
viento, a 0.18.` The page must consume a scalar the publish pipeline placed on
that exact spot-day row. It must not select a lower factor, recompute a score,
or inspect the hourly series in the browser.

`weakest_link: null` remains a complete day and renders no callout. A legacy
row that has a named factor but no new scalar preserves the existing named
sentence and omits only the `, a 0.18` suffix. It must never print an invented
number, `null`, `undefined`, a dangling comma, or an empty element.

The settled display form is a decimal with two places in the inclusive raw
range 0.00 to 1.00. This follows the accepted product example `0.18`; the
stored scalar remains the pipeline's unrounded number and the page has no
other rounding or rescaling rule.

## Serialized schema seam

The domain-model day-summary list is explicitly exhaustive. X7 now authorizes
this additive scalar on both the day summary and reading surface; it does not
authorize a full four-factor record:

```ts
// present only when weakest_link is a named factor
weakest_link_subscore?: number // finite, 0 <= value <= 1
```

The pipeline selects `call.sub[call.weakest_link]` while the complete
`ScoreResult` is still in scope. Every freshly produced named row carries the
finite inclusive-range scalar; a fresh clean row carries none. A named weakest
link with a null or non-finite matching score is a publish-refusing
inconsistency, because L16 already says a null observation can never become
the weakest link. An omitted field is only the compatibility state for
pre-Slice-02 surfaces.

This is deliberately a scalar instead of `sub`: Slice-04 owns exposing all
four values and its own best-window-hour join. Slice-02 needs one published
value paired with one already published factor. Carrying the entire record now
would pre-build Slice-04 and contradict the slice boundary.

## Planned Given-When-Then mapping

These are executable behavior contracts for the future JIT test. They are not
yet acceptance scenarios and carry no cucumber tags.

| Coverage | Given | When | Then | Intended driving surface |
|---|---|---|---|---|
| R7, R8 | A published morning where one spot has `weakest_link: wind`, `weakest_link_subscore: 0.18` today and `weakest_link: size`, `weakest_link_subscore: 0.62` tomorrow | A surfer opens that spot at 390 px | Today reads the Spanish wind sentence with `0.18`; tomorrow reads the size sentence with `0.62`; neither section borrows the other day's number | Production build, emitted `dist/`, real HTTP, Chromium |
| R7, R8 | A published row where damage names wind while tide has the numerically lower raw score | A surfer opens that spot | The sentence names wind and displays wind's published raw score, never tide's lower value | Production build, emitted `dist/`, real HTTP, Chromium |
| R8, R28 | A named factor from a legacy row without `weakest_link_subscore` | A surfer opens that spot | The existing Spanish factor sentence remains readable but has no numeric suffix, raw token, dangling punctuation, or fabricated value | Production build, emitted `dist/`, real HTTP, Chromium |
| R2, R8 | A published perfect day with `weakest_link: null` and no scalar | A surfer opens that spot | No callout element exists | Production build, emitted `dist/`, real HTTP, Chromium |
| R21-R27 | The longest spot name with the two-day numeric sentence in light and dark themes, including reduced motion | A surfer opens the spot at 390 px | The sentence clears the existing real-backdrop, overflow, touch-target, motion, type and token checks without adding JavaScript | Production build, emitted `dist/`, real HTTP, Chromium |

The first two scenarios are the walking path and anti-minimum regression. The
last three are error or boundary paths, so three of five planned scenarios
exercise an honest degrade or constraint.

## Delivery sequence

1. Accept the scalar schema seam and carry it from `CallRow.sub` in the
   producer projection. This is a serialized producer-lane change.
2. Add the optional field and strict finite-range validation to the static
   surface type without breaking retained dawn receipts.
3. Resolve factor and scalar from the same selected row and day, preserving
   the current clean and unknown states.
4. Extend the one display formatter and the existing callout element only.
   No new mount, page change, CSS file, browser data fetch, or JavaScript is
   permitted.
5. At legal JIT DISTILL open, author the five scenarios above, run RED against
   the production build, then implement one behavior at a time with the full
   U1-U7 check set and a fresh U8 examiner result before commit.

## Explicit non-goals

- No full four-bar breakdown or hourly best-window lookup. That is Slice-04.
- No counterfactual score or client arithmetic. That is Slice-03.
- No map, image, endpoint, Lambda, island, report-flow import, or route change.
- No copy settlement beyond the existing one-string formatter seam.
