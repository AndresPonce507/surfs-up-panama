# Controlled infrastructure declaration fixture

This directory is a **test input**, never a shipped `infra/` directory and
never a deployment candidate. Slice-02 rejects every source symlink, then
copies it without dereferencing to a fresh temporary root before every
mutation. The acceptance test passes that root to the production-owned
declaration evaluator through the local-CI entry. The fixture needs no
`package.json`, CDK app, synth, deploy, or fixture-specific guard branch.

It contains the Slice-02 declaration witnesses only: Lambda reserved
concurrency, Lambda timeouts, log retention, and non-prediction lifecycle
rules. Its three known unrelated lifecycle rules make the clean zero result a
traversal result, not a canned report.

`infra/lib/guardrail-declarations.ts` contains a harmless opt-in execution
tripwire. The acceptance environment provides its temporary marker path; a
successful declaration-only evaluation must leave that marker absent, proving
the source was parsed as data rather than imported or executed.

Anthropic's $5/month limit and CloudFront's pay-as-you-go posture are
terminal-report external-audit statements, not locally mutated or
live-console facts. Actual confirmation remains a release and monthly
checklist responsibility.

No fixture file is symlinked. The test mutates only the copy, restores every
changed regular file, and removes the copy in a finally-safe cleanup path after
each scenario.
