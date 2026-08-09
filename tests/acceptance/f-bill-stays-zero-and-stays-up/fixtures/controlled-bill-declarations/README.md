# Controlled bill-guardrail declaration fixture

This directory is a **test input**, never a shipped `infra/` directory and
never a deployment candidate. The acceptance steps for
`f-bill-stays-zero-and-stays-up` copy it without dereferencing to a fresh
temporary root before every mutation, then pass that root to the
production-owned declaration evaluator (`infra/guardrail-evaluator.mjs`)
through `runLocalCi`'s `declarationInput` surface. No fixture file is
symlinked. Each scenario mutates only the copy, restores every changed
regular file, and removes the copy in a finally-safe cleanup path.

It is a full copy of the reviewed declaration surface `infra/lib/
guardrail-declarations.ts` checks end to end (Lambda timeouts, log
retention, non-prediction lifecycle rules) plus the three F-BILL additions
this feature's slices 01-03 declare: archive bucket versioning, the
dead-man's-switch declaration, and the money lines / deny scope / cost
tag. A partial fixture would fail on an unrelated pre-existing check before
ever reaching the property under test, so it stays a complete copy.

`infra/lib/site-stack.ts` here is a bare existence witness: the evaluator
only checks the file exists before reading the guardrail declarations.
