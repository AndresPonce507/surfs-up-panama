# Tests

Layout follows the nWave DISTILL contract. The `.feature` files are the
specification, not a description of one: every scenario is authored before
the production code exists, runs, and fails on the missing behaviour.

```
tests/
  acceptance/<feature-id>/*.feature     Gherkin scenarios, the spec
  acceptance/<feature-id>/steps/*.ts    step definitions
  unit/**/*.test.ts                     vitest, incl. fast-check property tests
  e2e/**/*.spec.ts                      playwright, ONE per feature
```

## Two tags that are load-bearing

The carpaccio slice gate finds work by tag, so both are required or it
reports no scenarios for the slice:

- **File level `@feature-<feature-id>`**, on the line above `Feature:`. This
  is how the gate discovers the file at all.
- **Per scenario `@slice-NN`**, on every single scenario. Feature-level tags
  do NOT inherit downward. A `@slice-NN` sitting only above `Feature:` binds
  to zero scenarios.

## One end-to-end per feature, on purpose

Everything else drives in memory. Wiring is proved by the single walking
skeleton, by Vera walking the real surface against the charter, and by the
feature-end checks. Adding more subprocess tests to feel safer just makes
the suite slow, which makes people stop running it.

## Commands

```
npm test          vitest, in-process
npm run test:at   cucumber, the acceptance scenarios
npm run test:e2e  playwright, needs a running preview
```
