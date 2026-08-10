# ADR: preserve confidence evidence to the locale reader

**Status:** Accepted (2026-08-10)
**Supersedes:** only the `confidence_reason` field decision in
`adr-enriched-fields-reach-the-reading-surface.md`. Its surface-widening,
`spot_detail`, and `weakest_link` decisions remain Accepted.
**Reconciles:** the former `confidence_reason_es` and `{ es: string }`
cross-lane instructions in trust roadmap steps 01-01, 01-06, and 01-09.
**Owns:** the semantic `confidence_reason` contract in `BundleDaySummary`,
`SurfaceCall`, `src/data/forecast.ts`, and the reader boundary.

## Context

The accepted enriched-fields ADR correctly chose the committed static reading
surface over making pages read the remote region bundle. It also correctly
chose structured evidence over a locale-bound sentence. Its first structured
shape was incomplete:

```ts
{ dominant, spread_terms, track_state }
```

That shape cannot make the Spanish reader tell the truth in three cases:

- `missing` is the cap evidence. Without it, a tide-capped row can be called
  model disagreement.
- `members_used` distinguishes one answering model from genuine agreement.
- freshness must distinguish no report ever from a report that exists. The
  former needs the explicit no-beach-report clause; it is not stale data and
  must never be inferred from a score level.

The trust branch instead proposed carrying `confidence_reason_es?: string`.
That closes today's Spanish page, but turns product wording into archived core
data and forces a republish for a copy or locale change. It also conflicts with
the structured direction already accepted on main.

## Decision

`confidence_reason` is an optional, per-`(spot_id, day)` **semantic evidence
object** on both `BundleDaySummary` and `SurfaceCall`. New builds must populate
it; the optional outer key is only compatibility for historical committed
surfaces.

```ts
type ConfidenceReasonEvidence = {
  readonly dominant:
    | 'spread_height'
    | 'spread_period'
    | 'spread_direction'
    | 'track'
    | 'freshness'
    | 'missing_data'
    | null;
  readonly spread_terms: {
    readonly height: number;
    readonly period: number;
    readonly direction: number;
  };
  readonly track_state: 'unverified' | 'measured';
  readonly missing: readonly ('wind' | 'tide')[];
  readonly members_used: number;
  readonly freshness:
    | { readonly state: 'no_report_yet' }
    | { readonly state: 'reported'; readonly age_h: number };
};
```

`BundleDaySummary.confidence_reason?: ConfidenceReasonEvidence` and
`SurfaceCall.confidence_reason?: ConfidenceReasonEvidence` have the **same
shape and value**. There is no `confidence_reason_es`, no `{ es: string }`, and
no precomposed text in either artifact. `conf_value`, `c_fresh`, and other
continuous scoring factors remain out of the reading contract.

### Semantics and invariants

- `missing` is copied from the score result, is duplicate-free in canonical
  `wind`, then `tide` order, and names every absent scored input. If it is
  non-empty, `dominant` is `missing_data`; the reader names the absence rather
  than claiming disagreement. `[]` means no scored input was absent, not that
  every possible observation was measured.
- `members_used` is the number of usable declared members actually blended.
  A published call has `members_used >= 1`. With `members_used === 1`, all
  spread terms are zero and a reader must say one model answered, never infer
  agreement or disagreement.
- `freshness.state === 'no_report_yet'` means no report exists for the spot at
  build time. It is distinct from an old report and causes the no-report
  honesty clause. `reported` means a report exists; `age_h` is a non-negative
  snapshot age measured at build time. It may support locale copy, but no
  renderer may reconstruct a continuous confidence factor from it.
- `track_state` remains the gated-scorecard state. `unverified` must remain
  visible to the composer; it must not be inferred from freshness.
- This evidence is day-scoped. Today and tomorrow must each use their own
  object, even for the same spot. No reader may copy evidence across days.
- `weakest_link` remains an independent, unchanged field with its existing
  `missing` versus explicit `null` meaning. It explains score damage;
  `confidence_reason` explains trust in the score. Neither field may replace,
  derive from, or shadow the other.

### Boundaries and locale responsibility

`src/pipeline/build.ts` is the sole producer. It maps the one confidence result
and call-row facts into the evidence object once, projects that same object to
the bundle day summary and static surface, and asserts freshly built rows carry
both `weakest_link` and `confidence_reason`.

`publish:surface` only promotes and validates the static surface. It never
translates, composes, or repairs evidence. Surface regeneration is required
after the producer change, before a reader is integrated.

`src/data/forecast.ts` is the sole static-surface reader. It copies the
evidence object into its day summary without interpreting it. Reading
components receive it through their props; they do not import the JSON or the
bundle directly.

`ConfidenceDetail` is the locale boundary. It composes the sentence from this
evidence plus the locale's approved factor vocabulary. Spanish is the only
active locale today. A future locale adds a formatter and vocabulary there,
not a new field or a republished core sentence. The 160-character limit and
no-technical-text checks run against each locale formatter's output. Missing
`confidence_reason` keeps P1's existing degrade: show the confidence level,
omit the disclosure body, invent nothing.

`RankedList` and `SpotDetail` only pass their own day summary and locale to
`ConfidenceDetail`. They may not compose reasons, fall back to the old
level-keyed copy, or exchange data between their day sections.

## Compatibility and migration

The schema labels stay `region-bundle/1` and `published-surface-update/v1`.
The outer evidence key stays optional so historical committed surface files
continue to parse. An absent outer key means an older surface did not publish
explanation evidence, not an empty reason and not `no_report_yet`.

New builds use a stricter producer return type that requires
`confidence_reason` and `weakest_link`; consumers still accept the optional
wire form. The producer guard must fail a newly regenerated row that omits
either required field. No reader accepts the trust branch's
`confidence_reason_es` or `{ es: string }` forms as a second production
contract. Fixture migration, if needed, is explicit at the fixture boundary
only, then removed when all fixtures use the semantic object.

## Serial integration order

This seam is shared and must not be parallel-written. Integrate in this exact
order:

1. **A, producer:** land the shared semantic type and `build.ts` projection to
   both bundle and `publish_surface`, preserving the existing `weakest_link`
   projection and extending the producer guard.
2. **Regenerate:** run the normal publish-surface promotion from an A-produced
   bundle and verify the committed surface has evidence for every newly built
   row. Do not apply a reader mount to an old surface.
3. **B, reader:** update `src/data/forecast.ts` to map the evidence unchanged
   into `DaySummary`; validate both days retain distinct objects.
4. **C, ranked reader:** make `RankedList` pass each row's own evidence and
   locale to `ConfidenceDetail`.
5. **D, spot reader:** make `SpotDetail` pass today and tomorrow's respective
   evidence and locale to the same component. Resolve its existing mount
   ownership once and apply it once.

The integration suite then proves: A's two projections are equal, regeneration
preserves the object, B does not drop it, C and D render their own day, the
old surface degrades quietly, and `weakest_link` still reaches its separate
consumer unchanged.

## Alternatives considered

1. **Keep `confidence_reason_es?: string`. Rejected.** It stores a Spanish
   rendering in core data, makes localization and copy correction require a
   republish, and forks main's structured contract.
2. **Keep main's three-field object. Rejected.** It cannot distinguish a cap,
   one model, or no report from their lookalikes. The resulting Spanish copy
   can be materially false.
3. **Let `ConfidenceDetail` read the bundle or surface itself. Rejected.** It
   creates a second reader, bypasses the forecast anti-leak boundary, and
   makes per-day provenance hard to test.
4. **Expose all scoring numbers. Rejected.** `conf_value` and raw factors are
   log/audit data, not a reading contract. The evidence above is the smallest
   semantic set the composer needs.

## Consequences

The surface gains a small build-time-only object and every locale owns its own
composition test. In return, Spanish text is true to the calculated morning,
future locales do not widen the schema, historical surfaces remain readable,
and the producer-to-reader path has one contract instead of three improvised
ones.
