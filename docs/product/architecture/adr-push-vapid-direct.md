# ADR: Web push — direct VAPID HTTP from a scheduled Lambda, allowlisted endpoints

**Status:** Accepted (DELIVER, 2026-08-13) · **Lane:** write path · **Implements:** decision 12 (web push, opt-in per spot), decision 23 (no nagging); closes research 15 §15.5's named gap ("push subscriptions are a second anonymous write surface, not analysed") and system-architecture §19 flag 4 (fan-out cost unmodelled).

## Decision

1. **Send lane: direct Web Push protocol (VAPID, HTTPS POST to the browser push service) from an hourly scheduled notify Lambda.** Per system-architecture §19 flag 4, Web Push is direct HTTP with VAPID keys, not SNS. VAPID private key in SSM SecureString; public key in the client (public by design); JWT ES256 per push-service origin; `sub` = the repo URL (no email, no PII).
2. **Subscribe/unsubscribe/status** via credential-required `POST /api/push`. Subscribe upserts and unsubscribe deletes on the settled `(spot_id, endpoint_hash)` item. Status accepts the browser endpoint and reports only whether the same credential-derived device owns that row. There is deliberately no readable GET endpoint.
3. **Endpoint host allowlist**: HTTPS only, hostname must match a config data file of known browser push services. Nothing geographic, additive by PR. Rejection is loud and names the host.
4. **Send rules**: max one notification per spot per subscriber per day (morning window, spot-local, score ≥ per-subscription threshold), plus at most one afternoon solicitation follow-up (`?t=ps` → `trigger: push_solicited`, the learning lane's required field). Per-run send cap 10,000 with a loud skip event; 404/410/403 prunes the subscription on first failure.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Amazon SNS | Rejected | SNS mobile push targets native platform endpoints; the browser Web Push protocol with VAPID is direct HTTP (system-architecture §19 flag 4 — settled input). Wrong tool for a PWA |
| Firebase Admin SDK / FCM topics | Rejected | Third-party dependency and account for a protocol the platform already speaks natively; adds nothing at this scale; misfits the MIT/no-third-party ethos and the KB budget |
| SQS fan-out per subscriber | Rejected | Queue machinery for a fan-out that completes in seconds inside one Lambda at every design point measured; complexity with no consumer (GDP-10) |
| No allowlist (accept any HTTPS endpoint) | Rejected | An attacker subscribing victim URLs turns the notify job into a scheduled low-rate booter using our egress — a named incident class, not a hypothetical |

## Cost math (the arithmetic the infra lane flagged as owed — full table in write-path doc §8.5)

150 ms/POST, ~2 KB/push, 256 MB job: launch (200 subs) ≈ 450 GB-s/mo = 0.1% of the perpetual free 400k; global (8,000 subs) ≈ 4.5%; abuse (50k junk subs) bounded by the per-run cap + pruning at ≤ 14%. Egress ≤ 3 GB/mo inside the free 100 GB. **$0.00 at every design point, including under abuse.**

## Consequences

- A new browser's push host silently cannot subscribe until a PR adds it; the rejection names the host, so the gap self-reports.
- Solicited reporters saw the morning score in the push — cold-screen but not cold-person; carried honestly by the `trigger` flag the learning lane weights separately.
- ATs against a fake push service attest protocol framing only, not real FCM/APNs acceptance or aes128gcm interop — one real-device smoke (iOS installed-PWA + Android) on the launch checklist.
- The notify job is scheduled, never URL-exposed: its cost is bounded by subscriptions × dedup rules × the run cap, not by an attacker's request rate.
- `push-config.json` is same-origin, `no-store` public configuration containing only the Push Function URL, Mint Function URL and VAPID public key. It avoids a circular Ingest/Write deployment dependency; it contains no credential or private key.
