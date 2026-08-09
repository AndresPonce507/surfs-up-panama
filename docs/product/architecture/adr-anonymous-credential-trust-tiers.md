# ADR: Anonymous credential — server-countersigned device id, signed age, trust tiers

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** write path · **Implements:** decisions 4, 11, 24; research 15 §10, §11, §14, §16. **Honors, does not amend:** `adr-identity-claim-merge.md` (ids stay client-minted; its rejection of *server-issued* ids stands — the server only countersigns first sight).

## Context

The repo is public, so any client-side identity is a value the attacker chooses (BRIEF constraint 4; research 15 §11: client UUIDs and fingerprinting are theatre). Decision 11 forbids login; decision 4 forbids friction. The one resource an attacker cannot mint is **time**: a credential can be forged-fresh but never forged-old.

## Decision

1. **Credential** = `v1.<device_id>.<issued_at_epoch>.<base64url(HMAC-SHA256(key, "v1.<device_id>.<issued_at>"))>`, minted by `POST /api/mint`, stored client-side, sent as `X-Surf-Credential` on every write. The `device_id` remains the client-minted `d_` + 128-bit random of domain model §8.
2. **`issued_at` is server-set and signed.** Mint is idempotent on `CRED#<device_id>`: re-minting returns the *original* timestamp — age can never be reset or backdated.
3. **Verification is stateless** (HMAC recompute, no read) — the report handler's 60 ms budget is itself a cost control (research 15 §5.4).
4. **Mint ledger**: one item per mint `(device_id, issued_at, src_hash)` where `src_hash` = keyed HMAC of the source IP (raw IP never stored — no PII on the write path). Without it, mass minting is invisible and credentials are uncountable and unrevocable (research 15 §14.1a).
5. **Trust gate, shipped at zero**: eligibility to count toward the learned correction and the scorecard's distinctness = credential age ≥ `min_credential_age_days` AND ≥ `min_prior_reports` across ≥ `min_prior_spots` spots, from `data/config/trust-gate.json` = `{0, 0, 2}` at launch. Computed at aggregation time, retroactively applicable because every report carries `credential_issued_at` + `received_at` from day one. Acceptance and display are never gated (decision 11 byte-for-byte).
6. **Proof of work: built now, dormant** behind a server flag, **on mint only, never on report** — verifying PoW runs the resource under attack, so it is a poisoning/nuisance control, not a cost control (research 15 §10.5). Hand-rolled `crypto.subtle`, < 1 KB, complexity ≈ 1 s on a Galaxy A14. Turnstile is the tier above it, also mint-only.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Bare client UUID (status quo ante) | Rejected as sole identity | Attacker mints one per request; zero forge cost. Kept as the continuity key it already is |
| Server-generated ids | Rejected | Already rejected in `adr-identity-claim-merge.md` (registration round trip on the zero-friction path); countersigning keeps the client-minted key and adds only what the server can attest: first-seen time |
| PoW on report submission | Rejected | Ten queued reports = ten puzzles on a phone that just regained signal (breaks decision 26); and it *adds* billed work per attack request (research 15 §10.5) |
| Login / magic link before posting | Rejected | Forbidden by decision 11 — and an unauthenticated auth endpoint is itself a floodable anonymous write path that sends an email per flood (research 15 §16.1); SES pricing UNVERIFIED besides |
| Browser fingerprinting | Rejected | Spoofable by anyone scripting, breaks privacy for honest users, costs kilobytes (research 15 §11) |
| Privacy Pass / WebAuthn | Rejected for now | Safari-only reach / biometric prompt at exactly the moment decision 11 protects (research 15 §11); revisit in years |

## Consequences

- The strongest free lever is armed but not fired: flipping the age gate is one PR + one recompute, applies to all history, and is invisible to honest users (their early reports count retroactively once the credential ages).
- An attacker can still beat the gate by aging credentials for weeks while behaving normally — the bar moves from seconds to weeks, which is the largest single improvement available at $0 (research 15 §11.2). Stated, not hidden.
- A revoked credential still verifies at ingest (stateless check); revocation takes effect at aggregation/recompute. Deliberate trade for the handler budget.
- Key lives in SSM SecureString per `adr-secrets-public-repo.md`; the `v1` prefix versions the scheme for rotation.
