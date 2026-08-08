# ADR: Identity — pointer-layer claim-and-merge, late resolution, no history rewrite

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C5 Community Identity · **Implements:** DISCUSS decision 11

## Decision

1. Every report is keyed by `device_id` **forever**. `device_id` = `d_` + 128-bit random, minted client-side on first visit, persisted in IndexedDB + localStorage.
2. Claiming a name creates a `Person` and writes a `person_id` pointer onto the Device item plus a membership item. Linking a second device repeats the same two writes. **Merge is a monotonic pointer append — no report is ever rewritten.**
3. Resolution is an open-host service with one operation: `reporter_key(device_id) = person_id ?? device_id`. C2 and C3 consume only this.
4. Every per-person statistic (per-user offset `u_user`, scorecard `distinct_reporters`) is a **projection computed at aggregation time** from immutable logs + the current mapping. Scorecard daily rows store raw `device_id` sets; distinctness is resolved at read.
5. `person_id` is set at most once per device in v1 (conditional write: only if null). No unmerge command in v1.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Rewrite historical reports to `person_id` on claim | Rejected | Violates log immutability; breaks the verification join audit trail; a bug in the rewrite is unrecoverable. Retrofitting-identity-later is the expensive version the brief warns about — this design makes merge O(1) writes |
| Store resolved counts in scorecard rows | Rejected | A later merge would silently overcount distinct reporters in history. Wrong carrier: the observation "distinct people" needs the device set retained, resolved late |
| Server-issued device ids | Rejected | Adds a registration round-trip to the zero-friction path; a random 128-bit client id has the same collision safety |
| Cross-device reputation pre-claim | Rejected | Explicitly out of scope per DISCUSS consequences: no cross-device reputation until a name is claimed |

## Consequences

- Claim-and-merge UI can ship any time later with zero migration — the schema and writes exist from day one.
- Lost browser storage = new anonymous reporter; per-user calibration restarts. Accepted cost of anonymity.
- A wrong merge is repairable only by manual mapping edit until an unlink command ships (flagged, domain model §15.6).
