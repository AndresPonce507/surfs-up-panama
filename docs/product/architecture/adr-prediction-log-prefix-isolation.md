# ADR: Prediction log lives at the top-level `predictions/` prefix, never under `log/`

**Status:** Proposed (2026-08-08 coherence round) · **Lane:** domain/data · **Amends:** `domain-model.md` §3, §5.2, §5.3, §9, §17 · **Context:** C1 Forecast Intake

## Context

The prediction log is the one artifact HANDOFF §3 calls irreplaceable and impossible to add later. Round-1 documents disagreed on where it lives, and the disagreement disarmed its protection:

| Document | What it said | Effect |
|---|---|---|
| system-architecture guardrail 4 | No expiration rule may overlap the literal string `predictions/`; CI assert | Guard written against a top-level prefix |
| system-architecture context diagram + IAM | Ingest writes `raw/ + predictions/`; role grants `s3:PutObject` on `raw/*` and `predictions/*` only | Assumes top-level prefix |
| domain-model §5.2 (round 1) | `log/predictions/v1/...`, nested beside `log/calls/` and `log/observations/` | Real path not covered by the guard |
| domain-model §17 (round 1) | Lifecycle recommendation `log/*` to Glacier IR at 90 d | A `log/*` rule reaches the log the guard cannot see |

Net round-1 state: the guard asserted a path nothing wrote to, the ingest IAM could not write the path the domain doc specified, and a sibling recommendation in the same document aimed a lifecycle rule at the log.

## Decision

**The prediction log lives at the top-level prefix `predictions/v1/...`** (option a). `log/` holds exactly the two derived, rebuildable-adjacent logs: `log/calls/` and `log/observations/`. Every reference in `domain-model.md` is amended to match.

Lifecycle law restated with the move:

| Prefix | Expiry | Transition |
|---|---|---|
| `raw/` | 30 d | none |
| `log/*` (calls, observations) | none at launch; rules permitted | Glacier IR at 90 d permitted |
| `predictions/` | **never; excluded from every expiration rule (guardrail 4 asserts the literal prefix)** | optional Glacier IR at 90 d only (system-architecture §5 topology + guardrail 4; corrected from 180 d, 2026-08-08 coherence round: 180 was cited to a section that never contained it) |

## Why (a) over (b) (keep `log/predictions/` plus a carve-out)

1. A guard whose literal string matches the real path is structurally stronger than a guard plus a carve-out. The carve-out is the thing a future lifecycle edit forgets; the literal match cannot be forgotten because the assert and the path are the same string.
2. Two additional specs already assume the top-level form: the ingest IAM write scope (`predictions/*`) and the system-architecture context diagram. Option (b) would require amending both plus documenting the carve-out; option (a) amends one document and everything converges.
3. Zero migration cost: no code exists and no object has ever been written (HANDOFF §1).

## Consequences

- Any `log/*` lifecycle rule is now safe by construction with respect to the prediction log; it can only reach `calls/` and `observations/`, both of which are derived or re-exportable (observations re-export nightly from DynamoDB; calls are valuable but not the irreplaceable asset).
- The ingest job writes `predictions/...` and needs exactly the IAM grant already specified.
- domain-model §17's lifecycle note now names `predictions/` as excluded from all expiration rules, transition-only at 90 d (corrected from 180 d, 2026-08-08 coherence round).
- The guardrail assert must be observed failing once (add a violating rule in a test synth, watch CI go red, revert) before it counts as protection; system-architecture already carries this proof obligation for its guardrail suite.
