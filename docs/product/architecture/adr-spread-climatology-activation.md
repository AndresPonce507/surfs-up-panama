# ADR: Spread climatology activates after 30 completed local days and fails closed

**Status:** Accepted, 2026-08-10
**Context:** Trust Slice 05 / `C_spread`
**Implements:** research 09 §3.6; `05-scoring-engine.md` §6.1; `06-learning-layer.md` §10

## Context

Research establishes that inter-model spread is only a qualitative signal at unusually high or
low values relative to a spot's own historical spread. It deliberately gives no sample-size
threshold. The project must therefore set a reversible data-availability policy before the
percentile form can be used, without representing that policy as calibration evidence. The
PublishedCall archive is insert-only and began on 2026-08-08, so no historical value may be
backfilled or borrowed from another spot.

## Decision

1. Set `spread_climatology.minimum_history_days` to **30** in the versioned launch policy.
2. Count only one qualifying observation for each distinct completed spot-local forecast day.
   It must have usable multi-source spread in that spot's PublishedCall history. The call being
   published is excluded from its own reference distribution.
3. At fewer than 30 **valid, readable** observations, use the existing absolute-spread form and
   omit normal-comparison wording. This is the only downgrade case. An unavailable history
   source, an unreadable call, a malformed key or receipt, an unprovable region/date grain, or a
   duplicate `(spot_id, completed spot-local day)` is not thin history: it refuses the build before
   any call, bundle, or manifest write. No partial, cross-spot, backfilled, or fabricated
   climatology is permitted.
4. Availability and validity are separate gates. A 30-day history only permits the percentile
   form. The existing learning-lane calibration check remains authoritative: on failure it sets
   `confidence_factors.spread` to `false`, removing the entire spread factor rather than falling
   back to either spread form. Re-enable only after a later recorded evaluation.

`30` is an unfit, reversible policy prior. It matches the project’s settled 30-day evidence
counter and lies between Slice 05’s honest two-day negative fixture and sixty-day positive
fixture. It makes no claim that 30 days establishes forecast skill or calibration.

## Alternatives considered

| Option | Decision | Reason |
|---|---|---|
| Activate on any historical row | Rejected | A two-day percentile is noise and contradicts the roadmap’s explicit thin-history guard. |
| Require 60 days | Rejected | The fixture's 60 days is a safe test bound, not a research-backed activation floor. It would delay a qualitative, separately kill-switch-protected signal without added established evidence. |
| Pool other spots or backfill history | Rejected | Research requires a spot’s own climatology; archived predictions cannot be recreated honestly. |

## Durable history-read boundary and startup probe

`BuildStore` owns an explicit, compile-time-required PublishedCall history-read capability. It is
not a cast to a broader object store and it is not allowed to return an empty collection for an
I/O or decoding fault. The interface contract, to be added to `src/pipeline/ports.ts`, is:

```ts
type PublishedCallHistoryScope = { readonly region_id: string; readonly prefix: 'log/calls/v1/' };
type PublishedCallHistoryProbe = { readonly ok: true } | {
  readonly ok: false; readonly reason: 'unavailable' | 'malformed'; readonly detail?: string;
};
interface BuildStore {
  listPublishedCallKeys(scope: PublishedCallHistoryScope): Promise<readonly string[]>;
  getPublishedCall(key: string): Promise<string>;
  probePublishedCallHistory(scope: PublishedCallHistoryScope): Promise<PublishedCallHistoryProbe>;
}
```

The port must uphold the following behavioral contract:

- list only the selected `region_id`'s insert-only `log/calls/v1/` receipt keys;
- read the exact immutable receipt body for each listed key; a listed key that disappears is a
  failure, not a missing-history row;
- `probePublishedCallHistory(scope)` validates the region-scoped key shape, reads and decodes the
  selected receipt corpus, and proves the one-row-per-completed-spot-local-day grain before the
  build can use the adapter. The probe must distinguish `unavailable` from `malformed` without
  exposing raw receipt content.

The production composition root wires the prediction reader, durable PublishedCall history reader,
and PublishedCall writer to the same durable publication root. It calls the probe before
`runBuildOnce` (`wire -> probe -> use`). It must not source historical calls from a per-run work
directory. If the probe or a later scoped history read fails, the CLI emits exactly one structured
event:

```json
{"type":"health.startup.refused","component":"published_call_history","scope":{"region_id":"<region_id>","prefix":"log/calls/v1/"},"reason":"unavailable|malformed"}
```

and exits non-zero without invoking `putCallIfAbsent`, `putBundle`, or `putManifest`. `detail` may
name a safe key or OS/API error class, but must never contain receipt contents. The selection scope
is the requested region's complete durable call archive, not merely the days that happen to be
above the threshold. Thus a corrupt receipt cannot be hidden while a neighbouring healthy receipt
activates climatology.

Every driven implementation must demonstrate this contract. The adapter probe is enforced three
ways: TypeScript requires it on every `BuildStore` implementation; an AST/pre-commit check rejects
a production composition that invokes `runBuildOnce` without first awaiting the probe; and CI runs
the fault catalogue below against the real filesystem adapter. This self-applies: the CI catalogue
also proves an adapter missing the probe cannot satisfy the composition boundary.

## Consequences

- Slice 05-01 may enter implementation planning now, but production activation remains unavailable
  until each spot earns 30 qualifying days.
- The policy is data, not an engine constant. A future change must be an explicit policy/ADR
  decision and must preserve existing PublishedCall history.
- The exact CI evidence is: (1) `tests/unit/published-call-history-port-contract.test.ts` proves
  every `BuildStore` double and production adapter implements the explicit history methods;
  (2) `tests/unit/filesystem-store.test.ts` exercises a real durable filesystem corpus, including
  region isolation and a disappearing listed key; (3) `tests/unit/run-build-cli.test.ts` proves
  `wire -> probe -> use`, durable-root reuse across two invocations, and no output writes after an
  `unavailable` or `malformed` refusal; and (4) the Slice-05 acceptance feature drives malformed
  and unavailable history through `runProductionBuild` and observes the structured refusal. The
  fault catalogue also contains duplicate-date and one-source-history receipts: duplicates refuse;
  one-source days are valid-but-nonqualifying and therefore remain the absolute-form case.
