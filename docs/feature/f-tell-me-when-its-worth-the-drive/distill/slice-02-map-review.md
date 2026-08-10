# Slice-02 contract and map review

Reviewed 2026-08-10 against `feature-delta.md`, `application-architecture.md` §§6, 10 and 12,
`adr-push-vapid-direct.md`, `HANDOFF.md`, and the current slice-01 contract.

## Verdict

**Conditionally approved for a future DELIVER dispatch.** The acceptance contract covers R39,
R40 and R44-R50 through five source-blind scenarios. The roadmap maps every scenario to one
atomic delivery step, declares the shared `PushSettings` and `SpotDetail` paths, uses the real
emitted page at 390 px, and attaches U1-U7 commands plus the new Vera charter to every visible
step. No threshold value is introduced.

## Checks

| Check | Result |
|---|---|
| Every slice-02 requirement has an executable scenario or declared UI tag | pass |
| Scenario wording uses the surfer journey rather than implementation vocabulary | pass |
| Safari no-action negative is falsifiable against a capable context on the same emitted page | pass |
| Installed path reuses the slice-01 acknowledgement contract | pass |
| Manifest, registration, and service-worker ownership remain with SIGNAL | pass |
| A2HS disclosure has exactly one physical owner | blocked, Pre-requisite 4(b) |
| Focused suite reaches behavior oracles as RED | blocked, stale published surface stops `npm run build` first |

## Required before dispatch

1. Close slice-01 and its shared UI seams.
2. Record whether SIGNAL or Push owns the one A2HS `<details>` disclosure. The roadmap’s default
   consumes SIGNAL’s disclosure and does not allow a duplicate.
3. Supply a fresh two-day published surface to the isolated test build, then rerun the focused
   command until each scenario is `MISSING_FUNCTIONALITY`, not BROKEN.
4. Wait for the SIGNAL manifest, registration and service-worker contract. Do not create a second
   PWA implementation in this feature.

The iPhone plus Android real-device smoke stays on the launch checklist. It validates delivery
interop, not the browser contract this slice maps.
