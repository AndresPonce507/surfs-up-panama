# ADR: IaC — AWS CDK (TypeScript) with a compile-time guardrail gate

- **Status:** Proposed (DESIGN round 1, 2026-08-08)
- **Lane:** infrastructure (nw-system-designer)
- **Decides:** the IaC tool and how the eleven cost guardrails are enforced.

## Context

The architecture is ~6 resource families (S3, CloudFront+OAC, Lambda+Function URLs,
DynamoDB, EventBridge Scheduler, CloudWatch/Budgets) run by a solo TypeScript developer on a
personal account with a $20 alarm. The eleven cost guardrails (research 08 §10) are the
actual deliverable — an IaC choice that cannot enforce them as code fails the brief.

## Decision

**AWS CDK in TypeScript.** Guardrails are constructor properties
(`reservedConcurrentExecutions: 2`, `logRetention: TWO_WEEKS`, lifecycle rules,
`BlockPublicAccess.BLOCK_ALL`) plus a CDK-assertions test suite
(`infra/test/guardrails.test.ts`) that iterates every synthesized `AWS::Lambda::Function`,
`AWS::Logs::LogGroup`, and `AWS::S3::Bucket` and fails CI on any missing guardrail — with no
AWS credentials needed, so the gate runs in the public repo's credential-free CI. The suite
must be demonstrated failing once (constructed violation) before it counts as a guardrail.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| AWS SAM | Good second | Strong for Lambda+API Gateway; weaker at the CloudFront/S3/OAC wiring that is the bulk of this stack; YAML instead of the project language (research 08 §11) |
| Terraform | Rejected | Mature, but a second language plus remote-state management for a solo dev on a 6-resource stack — overhead without a payoff here (research 08 §11) |
| Amplify Gen 2 | **Actively wrong** | Steers hosting into Amplify Hosting, which has no always-free tier and 67× less free egress than CloudFront — it would undo the core cost decision (research 08 §1.3, §2.3, §11) |
| Console / ClickOps | Rejected | Guardrails become settings someone forgets; irreproducible; violates the deploy-path requirement that a human applies a *reviewed artifact* |

## Consequences

- Deploys are human-only (`npx cdk deploy` with local credentials); CI runs `synth` + the
  guardrail gate only. No agent or automation holds an infrastructure-write credential.
- CDK bootstrap is a one-time human step; the bootstrap roles exist in-account but are never
  exposed to CI in phase 1.
- Drift risk (console edits diverging from code) is accepted and mitigated by `cdk diff`
  before every deploy — a solo operator's discipline, documented in the runbook.
