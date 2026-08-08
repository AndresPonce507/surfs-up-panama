# ADR: Secrets and credentials for a PUBLIC repo — zero long-lived keys, human-only deploys

- **Status:** Proposed (DESIGN round 1, 2026-08-08)
- **Lane:** infrastructure (nw-system-designer)

## Context

The repo is public and MIT-licensed; no credential may ever land in it. The owner's standing
rule: agents are read-only on production, and a human runs every privileged apply. The
architecture needs (a) provider API keys at Lambda runtime, (b) an infrastructure deploy
path, and (c) in phase 2, a way for a GitHub Actions job to write data files to S3.

## Decision

Three separated credential planes, none of which is a long-lived AWS key:

1. **Runtime provider keys → SSM Parameter Store Standard `SecureString`** (free for storage
   AND standard-throughput API; Secrets Manager is $0.40/secret/mo with no free tier —
   research 08 §14.2). Keys: `/surfsuppanama/prod/worldtides-api-key`,
   `/surfsuppanama/prod/anthropic-api-key`, phase-2 `/surfsuppanama/prod/github-dispatch-pat`.
   Human-created via CLI; read at Lambda cold start, cached in module scope; each Lambda's
   IAM role scoped to exactly the paths it reads. `.env.example` documents names only.
2. **Infrastructure deploys → human-only.** `npx cdk deploy` from the operator's machine with
   his own credentials. The public repo's CI is **credential-free**: it runs the guardrail
   assertion suite and `cdk synth` only, neither of which needs AWS access. No deploy role
   exists for CI in phase 1 at all — the strongest possible answer to "how does a public repo
   deploy without leaking", which is: it doesn't; a human does.
3. **Phase-2 data-plane writes → GitHub OIDC federation, no stored key.** IAM OIDC provider
   `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, trust policy pinned
   `"token.actions.githubusercontent.com:sub": "repo:AndresPonce507/surfs-up-panama:ref:refs/heads/<default-branch>"`,
   workflow `permissions: { id-token: write, contents: read }` (research 13 §7, first-party
   docs). **Known trap (research 13 §7): declaring an `environment:` on the job REPLACES the
   `sub` claim with the environment form — it does not add it.** The role allows
   `s3:PutObject` on `raw/*` and `predictions/*` prefixes only: it cannot read secrets,
   cannot touch infrastructure, cannot delete or overwrite outside those prefixes. The
   workflow asserts its assumed-role ARN before writing (OIDC probe). Because the trust
   policy is world-readable in a public repo's IaC, tightness IS the security model.

Repo hygiene, enforced: GitHub secret scanning + push protection (free on public repos),
gitleaks in the local CI gate, `.gitignore` already excludes env files and keys.

## Alternatives considered

| Option | Why rejected |
|---|---|
| AWS access key in GitHub Secrets | Long-lived credential, rotatable-by-human-memory, and strictly worse than OIDC which is first-party, free, and short-lived (research 08 §14.2) |
| AWS Secrets Manager | $0.40/secret/mo, no free tier — would cost more than the rest of the architecture combined (research 08 §14.2) |
| CI-driven `cdk deploy` via a broad OIDC role | Hands an automated system an infrastructure-write credential — violates the human-applies rule; also makes the world-readable trust policy the only wall around the whole stack |
| Encrypting secrets into the repo (SOPS/age) | A public repo makes the ciphertext a permanent offline-attack target; nothing here needs repo-resident secrets |

## Consequences

- Contributors cannot deploy or ingest against production — by design. They bring their own
  provider keys (`.env.example`) and their own AWS account for a full stack; the CDK app takes
  account/region from the environment.
- IAM OIDC provider / STS `AssumeRoleWithWebIdentity` pricing is **assumed $0 but
  UNVERIFIED** (research 13 §"could not be verified"; own live check today inconclusive) —
  verify before phase 2 wiring.
- The Anthropic key's blast radius is bounded by the Anthropic Console spend limit
  (guardrail 10), because direct-API spend is invisible to AWS Budgets (research 08 §6.5).
