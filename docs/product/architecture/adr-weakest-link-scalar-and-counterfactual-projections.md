# ADR: publish smallest honest weakest-link projections

**Status:** Accepted (2026-08-10)  
**Decides:** X7 and X8, the day-summary and reading-surface schema for
`f-see-what-killed-it` slices 02 and 03  
**Owns:** the contracts in `domain-model.md` §13 and
`application-architecture.md` P1. Future implementation changes remain owned
by the serialized producer/schema lane.

## Context

The scoring core already decides the weighted-damage `weakest_link` and holds
the matching raw `sub` value. It also holds the damage record and the applied
correction needed to calculate the model's score with that named damage
removed. Reading routes render only the committed `published-surface` input;
they must not reselect a factor, inspect hourly data, or do score arithmetic.

The accepted day-summary list is exhaustive. Therefore neither Slice 02 nor
Slice 03 may silently extend it. The compatible reading-surface wire also
retains older dawn receipts, so a missing additive field and an explicit clean
state must remain distinct.

An optional `counterfactual_score_q` alone is insufficient for the proposed
legacy-gap health event. Its absence can mean either a valid fresh rounding
collision or an old named row that predates the field. Those facts are not
recoverable at render time without a producer-provided discriminator.

## Decision

Add the following optional day-scoped fields to both `region-bundle/1`
day summaries and `published-surface-update/v1` `SurfaceCall` rows. Their
optionality is compatibility only; every freshly produced row follows the
invariants below.

```ts
weakest_link_subscore?: number
counterfactual_score_q?: number
counterfactual_suppression?: 'rounded_equal'
```

### X7: named raw sub-score

`weakest_link_subscore` is the raw `sub[weakest_link]` value from the exact
scored `CallRow` chosen for that spot and day. A fresh row includes it if and
only if `weakest_link` is named. It is finite and in the inclusive interval
`[0, 1]`. A named link with a null, non-finite, or out-of-range matching
sub-score is a publish-refusing producer inconsistency. A clean row
(`weakest_link: null`) includes no scalar. A named legacy row without the key
remains readable and omits only the numeric suffix.

### X8: counterfactual score and its discriminator

For a named link, the producer calculates the candidate while `damages` and
the applied `delta_q` are still in scope:

```text
round(100 * clip(exp(-(D - d_w)) + delta_q, 0, 1))
```

`counterfactual_score_q` is emitted only when that candidate is an integer in
`[0, 100]` and is strictly greater than the same row's `score_q`. It is the
model score without the named weakness, not a claim about a different physical
ocean. It is never calculated by a page.

For a fresh named row, exactly one of these representations is required:

1. `counterfactual_score_q` is present and strictly greater than `score_q`; or
2. `counterfactual_suppression: 'rounded_equal'` is present because the valid
   rounded candidate equals `score_q`.

They are mutually exclusive. A fresh clean row contains neither. A malformed
candidate, a fractional or out-of-range projected value, both fields together,
or a candidate below `score_q` refuses publication before the bundle or
surface advances.

A named row with neither field is therefore an unambiguous legacy compatibility
gap. The publish-time renderer omits the clause and emits exactly one
operator-visible event for that row and publish invocation:

```text
health.publish.counterfactual_field_missing
{ spot_id, day, published_at }
```

The event has no browser transport, metric, endpoint, client storage, or
JavaScript consequence. `rounded_equal` is not rendered and must not emit the
legacy event.

## Alternatives considered

1. **Expose the full `sub` record and damages now.** Rejected. It pre-builds
   Slice 04's all-factor disclosure, widens the stable reading contract beyond
   the two slice outcomes, and lets a page choose a different factor.
2. **Have the page derive either number.** Rejected. It duplicates scoring
   rules at the rendering boundary and breaks the accepted producer-decides,
   reader-renders rule.
3. **Use only optional `counterfactual_score_q`.** Rejected. A valid collision
   and an old omitted field are indistinguishable, making a legacy health event
   either false-positive or absent.
4. **Version-bump the entire bundle for two additive fields.** Rejected. Old
   consumers safely ignore optional keys, while the fresh-output and strict
   validation invariants give producers a stronger guarantee. A version bump
   would add migration work without resolving the compatibility distinction.

## Consequences and enforcement

- The surface grows by at most two scalar values plus a collision token per
  day summary. It remains builder input, never a browser fetch or page-weight
  cost.
- The existing anti-anchoring boundary remains unchanged: report capture
  routes may not import the reading surface. Neither field enters the report
  write or reveal contracts.
- The producer must project the fields from the selected `CallRow` before it
  drops `sub`, `damages`, and correction context. The reader accepts only the
  row's already-published values.
- Future validation has three independent layers: TypeScript fresh-projection
  types require the field pairing; strict surface validation checks finite
  ranges, integer/greater-than, and mutual exclusion; property and build tests
  exercise valid, legacy, collision, malformed, and lower-than-score cases.
  The fresh-build populated-field check covers every committed named row.
- No external adapter, SDK, filesystem, network, clock, or subprocess contract
  is introduced by this schema decision. Existing build and publish probes
  remain the applicable environment evidence.
