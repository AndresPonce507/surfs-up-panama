# Slice-04 delivery contract: four honest best-window bars

Status: mapped only, 2026-08-10. This is not JIT DISTILL. It creates no
future acceptance label, feature file, step definition, fixture, expectation
charter, or RED-classification entry. Slice-04 opens only after Slice-03 is
sealed and X9's producer/schema projection is accepted.

## Binding outcome

For each spot-day with a published best window, the page shows four factor
rows, in Spanish, from the precise scored hour containing that window's start:
direction, size, wind, and tide. A row displays the published raw sub-score
with two decimals. The page does not average adjacent hours, select a lower
bar, re-run scoring, or compute a time zone in the browser.

The selected point is the one `spot_detail[spot_id].hourly[]` entry whose
precomputed spot-local offset timestamp `t` falls in the same hour as that
day summary's `best_window.start`. `t` and `sub` are the only hourly values
the static reading surface receives. This is the accepted P1 "derive, don't
ask" rule in `application-architecture.md` section 7 and `domain-model.md`
section 13.

The callout arrow follows that day summary's published `weakest_link`, never
the numerically lowest bar. A factor with a null score reads a direct absence,
such as `sin dato de viento hoy`; it has no number and no fill. Null means
missing observation, not zero and not a good condition. The committed
`windState(null) -> null` repair (`ee61840`) is therefore a required
regression dependency, though no longer a blocking implementation task.

If `best_window` is absent, the day displays no breakdown element. A legacy
surface missing the optional hourly field also omits the bars and records one
build-side `health.publish.breakdown_hourly_missing` event with spot, day, and
publish stamp. That event has no browser beacon, metric, endpoint, fetch or
JavaScript. A malformed fresh hourly projection is a producer-contract error,
not a condition the page may turn into plausible bars.

## Serialized schema seam

The schema authority already identifies `spot_detail[].hourly[]` as 48 points
spanning both days, with the page reading only `t` and `sub`. The current
implemented type and build still publish `name` only. X9 must therefore make
the intended field real across the bundle and reading surface before this
slice begins:

```ts
type HourlySubscorePoint = {
  readonly t: string; // precomputed spot-local ISO timestamp with numeric offset
  readonly sub: {
    readonly dir: number;
    readonly size: number;
    readonly wind: number | null;
    readonly tide: number | null;
  };
};

type SurfaceSpotDetail = {
  readonly name: string;
  readonly hourly?: readonly HourlySubscorePoint[];
};
```

Fresh built artifacts must contain exactly the scored two-day horizon and
preserve each `CallRow.sub` value and null unchanged. Optionality exists only
for retained legacy surfaces. This does not authorize raw weather fields,
damages, a second ranking, or any front-end calculation.

## Planned Given-When-Then mapping

These are future executable behavior contracts. They are not acceptance
scenarios and carry no cucumber tags.

| Coverage | Given | When | Then | Intended driving surface |
|---|---|---|---|---|
| R3, R5 | A published morning with distinct best-window hours and four sub-scores for today and tomorrow | A surfer opens that spot at 390 px | Each day has four Spanish rows whose printed values come only from that day's exact published hour | Production build, emitted `dist/`, real HTTP, Chromium |
| R3 | A day where one earlier or later hour has more attractive values than the best-window hour | The page is built | The bars retain the selected best-window hour and never average, interpolate, or choose the more attractive hour | Production build through the build driving port |
| R3, R4 | A row where tide has the lower raw sub-score but the day summary publishes wind as `weakest_link` | A surfer opens the spot | The arrow and words mark wind, while tide stays an ordinary row | Production build, emitted `dist/`, real HTTP, Chromium |
| R4 | A best-window hour where wind is null and tide is present | A surfer opens the spot | Wind states `sin dato de viento hoy` with no number or fill; tide and the other rows remain visible, and no clean-wind word is invented | Production build, emitted `dist/`, real HTTP, Chromium |
| R2, R4 | One day without `best_window`, and a legacy surface without `hourly` | The static page is published | The first day has no breakdown element; the legacy page remains complete and the build records one named hourly compatibility-gap event | Production build, emitted `dist/`, real HTTP, Chromium |
| R21-R27 | The longest spot name, both day breakdowns, light and dark themes, and reduced motion | A surfer opens the spot at 390 px | Tracks, words, arrow and missing-data state remain readable, colour-independent, un-clipped and leave the report action reachable with no added JavaScript | Production build, emitted `dist/`, real HTTP, Chromium |

Three of six planned behaviors cover absence, malformed/legacy data, or an
anti-selection failure. The future suite uses fast-check only at the pure
selector and formatter boundaries; build and browser cases are concrete,
example-based scenarios.

## Delivery sequence

1. X9 authorizes and implements the minimal hourly `t` plus `sub` projection
   across the producer and reading surface.
2. A pure reader selects exactly one published hour from the summary's local
   `best_window.start`, returning unavailable rather than guessing.
3. A formatter retains null as a stated Spanish absence and marks only the
   day summary's `weakest_link` row.
4. Create the static breakdown component and serially mount it in both spot
   day fragments through X10. Move the existing unshipped bar recipe into the
   shipped component stylesheet in that same change.
5. At legal JIT DISTILL open, author the six behaviors above, record RED
   against production ports, run U1 through U7, and obtain a fresh U8
   examiner result before commit.

## Explicit non-goals

- No browser scoring, clock or time-zone calculation.
- No full damage list, alternative-hour selector, counterfactual arithmetic,
  extra copy annotations, map, image, endpoint, Lambda, island or route.
- No modification of Slice-01 through Slice-03 evidence.
