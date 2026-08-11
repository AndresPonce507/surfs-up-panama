# Offline reload remediation evidence

Post-release repair evidence for the 2026-08-10 production defect. This is
not a DES execution log and does not alter the original feature history.

| Phase | Command and result |
| --- | --- |
| RED | With `OFFLINE_DOCUMENT="/sin-senal"`, `npm run build && PREVIEW_PORT=4911 npx playwright test tests/e2e/f-works-with-no-signal/offline-reload.spec.ts` failed: the fresh browser context was controlled but `psb-offline-v1` contained `[/favicon.svg, /sin-senal]`, not `/sin-senal/`. |
| GREEN | Restored `OFFLINE_DOCUMENT="/sin-senal/"`; `npm run build && PREVIEW_PORT=4912 npx playwright test tests/e2e/f-works-with-no-signal/offline-reload.spec.ts` passed. The test waits for `serviceWorker.ready` and a controller, checks the canonical cache key, then reloads offline and sees a cached reading or fallback heading. |
| COMMIT | Follow-up commit records the E2E boundary and this evidence. No push or deployment is authorized by this repair lane. |

