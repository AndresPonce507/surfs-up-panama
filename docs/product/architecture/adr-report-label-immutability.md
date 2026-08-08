# ADR: SurfReport label immutability — commit-before-reveal as an aggregate invariant

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C2 Observation Capture · **Implements:** DISCUSS decision 28 (resolved), decision 24

## Decision

1. A `SurfReport` is created by exactly one command, `CommitLabel`, whose payload contains only label fields (`size_band`, `wind`, `quality`), `spot_id`, `observed_at`, `device_id`, and a client-minted `report_id`. The write is a conditional put on `(PK, SK) = (SPOT#spot, REP#observed_at_utc#report_id)`.
2. **No command that edits a label exists in the domain.** The reveal screen is a read of the PublishedCall; it is never an input to any C2 command. Anchoring cannot re-enter through the API even if a future UI regresses.
3. The only mutation on a committed report is `AttachPhoto`: append to `photo_ids`. Declared delta = that one slot; complement (labels, timestamps, `predicted{}`, keys) asserted unchanged.
4. The server attaches `predicted{}` (what we showed for that spot/hour) **authoritatively at accept time** from `log/calls/` — the client's cached build is recorded for drift audit but not trusted. If no call exists for that hour, `predicted: null` and the Brier pairing is skipped.
5. The label is **absolute** (cold capture). The residual is derived server-side. Vision-model output never writes into label fields — annotations are a separate record (research 09 §9.3).

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Ask "bigger/smaller than forecast" directly (research 09 §13.2) | Rejected | Statistically superior (cancels per-user constants) but requires showing the forecast, re-introducing the anchoring bias decision 28 exists to remove. Binding DISCUSS resolution. Per-user offset estimation recovers most of the loss |
| Allow label edit within N minutes | Rejected | Any post-reveal edit path reintroduces anchoring; the accuracy score would inflate against our own prior (decision 28 build implication, verbatim) |
| Client-supplied `predicted{}` | Rejected | Client cache may be stale or tampered; the evaluation dataset must record what the system actually published |
| Moderation queue for bad labels | Rejected | Decision 24: statistical outlier down-weighting only; quota item is abuse control, not moderation |

## Consequences

- The immutability is enforceable in one place (no update code path exists) and testable in one AT: attempt any mutation of a committed label → rejected.
- Offline queue + idempotent conditional put means a report is committed locally the instant screen 1 finishes — the reveal never waits on the network.
- Higher cold-start label noise than the residual-question design; accepted and flagged in the domain model §15.2.
