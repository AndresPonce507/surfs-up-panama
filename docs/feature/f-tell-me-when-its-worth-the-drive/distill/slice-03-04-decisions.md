# Slice 03 and 04 DISTILL decisions

Date: 2026-08-10

This record resolves the reversible product choices that blocked acceptance design. It follows the
standing instruction to continue from accepted project truth without pausing for routine choices.
It does not claim that the external deployment prerequisites are available.

## Prior-wave reading checklist

- `docs/product/journeys/*.yaml` (not found)
- `docs/product/architecture/brief.md` (not found)
- `docs/product/kpi-contracts.yaml` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/discuss/user-stories.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/discuss/story-map.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/discuss/wave-decisions.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/design/wave-decisions.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/devops/wave-decisions.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/spike/findings.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/spike/wave-decisions.md` (not found)
- `docs/feature/f-tell-me-when-its-worth-the-drive/feature-delta.md`
- `docs/product/architecture/07-write-path.md`, sections 8.1 to 8.6 and Decisions D2/D5
- `docs/product/architecture/application-architecture.md`, sections 6, 7, 10, 11, 12 and 14
- `docs/product/architecture/adr-push-vapid-direct.md`
- `docs/architecture/atdd-infrastructure-policy.md`
- `docs/product/expectations/f-tell-me-when-its-worth-the-drive/`

The feature-local prior-wave directories are absent. The unified feature delta and accepted product
architecture contain the missing story, driving-port and environment information. Driving ports are
the hourly notification planner, the built report route, `POST /api/push`, browser
`PushManager.getSubscription()`, and the service-worker notification handler. DEVOPS remains the
project infrastructure policy plus the external prerequisite table.

Reconciliation passed with zero unresolved contradictions after the resolutions below. The old
feature-delta rows remain historical evidence of what was open before this record.

## Resolved product choices

1. Direct Web Push over VAPID is the accepted transport. SNS, a Firebase application dependency,
   and SQS fan-out remain rejected. The human-held private key and real-device delivery proof remain
   external launch prerequisites.
2. The launch default is 70. When `threshold_score` is omitted, the server stamps 70 into the stored
   subscription at subscribe time. Existing rows never change when the default changes.
3. The destination is per-subscription choice. Slice 04 lets the surfer choose any whole score from
   0 through 100 and persists that exact value through the existing idempotent subscription upsert.
   The control's visual form is a Design decision; acceptance owns the stored-number behavior,
   accessible name, and honest return-visit state.
4. The afternoon follow-up ships. It is the selection-bias mitigation already recommended by
   `07-write-path.md` D2 and by the feature's Slice Plan.
5. Spanish push copy is fixed for this feature:
   - morning title: `Mejor: {spot}, {score}`
   - morning body: the published Spanish call for that same spot and day
   - afternoon title: `¿Cómo estuvo?`
   - afternoon body: `Contanos cómo estuvo {spot}.`
   No em dash, technical term, service name, status code, raw timestamp or English word may appear.
6. SIGNAL owns the zero-JavaScript iPhone Add-to-Home-Screen disclosure because it owns the
   manifest and install surface. Push consumes that one emitted disclosure and does not duplicate
   it. The disclosure may be published only when the real subscribe path is live.

## External boundaries that remain open

- a deployed write stack and scheduler;
- the deployed mint credential path;
- the human-generated VAPID keypair;
- a real Android and installed-iPhone delivery smoke;
- the deployed report path that stores `trigger: push_solicited`.

These boundaries block production GREEN and launch where named. They do not block scaffolded,
default-skipped acceptance contracts or pure planner implementation.

## Architecture acceptance audit

The direct-VAPID ADR changed from Proposed to Accepted on 2026-08-10. This record and the ADR
agree: direct Web Push is the transport; SNS, Firebase and SQS fan-out stay rejected; the morning
threshold is per subscription; the afternoon follow-up is one per pushed spot-local day; and the
deep link carries the solicited-report marker. The acceptance map keeps VAPID signing, deployed
write/report storage and real Android or installed-iPhone delivery as external proofs, never local
fakes. Independent acceptance review approved the Slice 03–04 map with zero blockers and zero high
findings on 2026-08-10.
