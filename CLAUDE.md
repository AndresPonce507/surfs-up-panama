# Surfs Up Panama — project instructions

Project-level contract. Andres's global `~/.claude/CLAUDE.md` still applies; this file wins
where the two conflict, and the nWave wave configuration in `.nwave/` wins over both for
workflow mechanics.

## Development Paradigm

**functional**

Decided 2026-08-09 by Andres, closing the paradigm question `nw-deliver` step 1.5 asks when no
project CLAUDE.md declares one. It selects `@nw-functional-software-crafter` for every DELIVER
step and makes property-based testing the default, with `@property` tags signalling PBT and
example-based tests as the fallback.

This is a declaration of what the codebase already is, not a new direction. Evidence on disk at
the time of the decision:

- 37 exported functions against 2 classes across `src/`.
- `src/pipeline/ports.ts` is types only. The seams the acceptance tests drive through are type
  contracts, not base classes, and the comment at the top of that file states the rule directly:
  nothing in the core may read the ambient clock, so the clock is passed in.
- 5 test files already drive `fast-check`. `tests/unit/scoring-laws.test.ts` is the house style:
  the scoring engine's declared laws explored as properties rather than asserted as examples.
- The pipeline is composed as pure transformations with adapters at the edges
  (`src/pipeline/adapters/`), which is the shape `adr-openmeteo-vs-raw-grib2.md` requires so that
  swapping a forecast provider is a registry change plus one adapter.

Practical consequence for anyone writing code here: prefer a pure function over a class, pass
dependencies in rather than reaching for them, and when a module has a declared law, prove the
law with a property test instead of three examples.

## Mutation Testing Strategy

**disabled**

`.nwave/des-config.json` sets `rigor.mutation_enabled: false` under the `thorough` profile.
Recorded here so `nw-deliver` step 1.6 reads a declared strategy rather than falling through to
its `per-feature` default and then being overridden by rigor anyway. Revisit once the write path
ships and there is server-side logic whose tests are worth mutating.

## Local CI is the only gate that counts

GitHub Actions is billing-capped account-wide. CI runs on this machine.

- `npm run ci:local` is the authoritative gate. Ten jobs.
- **It exits 0 when jobs are SKIPPED, not only when they pass.** Read the summary line and confirm
  it says `0 skipped`. A skipped job is not a green job.
- **Never pipe a gate into `tail`, `head`, `grep` or a redactor.** A pipeline returns the last
  command's status. This repo has committed over a red gate exactly that way. Redirect to a file,
  capture `$?`, then read the file.
- Land PRs with `npm run merge:pr -- <n>`. Never the GitHub UI, never bare `gh pr merge`.

## Green tests do not mean it works

The worst bug this project has shipped passed all ten CI jobs: `data/published-surface.json`
carried `conf_level` on zero of its 60 rows and `size_band` on one of twenty spots, and because
those fields are optional on `SurfaceCall` nothing failed. Nineteen of twenty spot pages would
have rendered `undefined`.

So: after GREEN, run `npm run build` and inspect what actually renders in `dist/`. And prove every
negative test falsifiable — break the code, watch it fail for the right reason, revert, verify the
revert with `git diff`. Two tests in this repo have already passed for accidental reasons.

## Acceptance test tags are load-bearing

Cucumber tags do NOT inherit from `Feature:` down to scenarios. A `@slice-NN` sitting only above
`Feature:` binds to zero scenarios and the slice reports none. Every `.feature` file needs BOTH:

- file-level `@feature-<feature-id>` on the line above `Feature:`
- `@slice-NN` on EVERY scenario

During development, filter with `--tags "@feature-<id> and @slice-NN"`.

## Copy rules

- Zero technical text on the Spanish surface: no model names, no JSON, no placeholder tokens, no
  English, no raw timestamps.
- **No em dashes** anywhere in any UI string.
- Strings marked `verbatim` in `src/i18n/strings.ts` come word for word from
  `docs/product/architecture/application-architecture.md` section 10 and must not be reworded.

## The one rule the whole product rests on

Never claim more certainty than the data earns. A missing value renders as a stated absence, never
as the most favourable reading. Copy never runs ahead of the data. If a number cannot be computed
honestly, the surface says so instead of inventing one.
