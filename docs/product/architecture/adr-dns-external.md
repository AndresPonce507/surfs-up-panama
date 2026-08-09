# ADR: DNS — external registrar DNS, no Route 53 hosted zone

- **Status:** Proposed (DESIGN round 1, 2026-08-08) — final call is Andres's (decision 2 in
  the system-architecture "Decisions needing Andres" table)
- **Lane:** infrastructure (nw-system-designer)

## Context

Route 53 hosted zones have **no free tier**: $0.50/month per zone, charged with zero queries
(research 08 §2.5, accessed 2026-08-08). It is the only avoidable AWS floor cost in the whole
design; the brief demands a true $0.00 target. CloudFront does not require Route 53 — any DNS
host can CNAME/ALIAS to the distribution, and ACM validates certificates by DNS record
regardless of who hosts the zone (research 08 §2.5).

## Decision

**Register `surfsuppanama.com` at a registrar with free DNS and apex ALIAS/flattening
support (Cloudflare Registrar or Porkbun — their current pricing/apex support is UNVERIFIED
in research 08 §2.5, verify before buying), CNAME/ALIAS → `dxxxx.cloudfront.net`, one-time
ACM DNS-validation CNAME. AWS-side DNS+TLS cost: $0.00/month.** Domain registration
(~$12/yr) is unavoidable and not an AWS bill. Timing per DISCUSS #31: register when there is
something to host.

## Alternatives considered

| Option | Cost | Why not default |
|---|---|---|
| Route 53 hosted zone | $0.50/mo ($6/yr) flat; alias queries to CloudFront free | Entirely defensible convenience buy (one console, 50 free health checks, native apex alias). Loses only on the literal $0.00 target. Note the trap: zones bill on creation — create once, don't experiment (research 08 §2.5). |
| No custom domain (raw `*.cloudfront.net`) | $0.00 | Fine for private beta; unacceptable for a public community brand (research 08 §2.5) |

## Consequences

- DNS lives outside the CDK stack — one manual registrar step in the zero-to-deployed path,
  documented in the runbook.
- If Andres later wants Route 53 health checks or one-console operations, migrating is one
  zone import + NS change with no architectural impact; this decision is fully reversible.
