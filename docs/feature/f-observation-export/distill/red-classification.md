# RED classification — f-observation-export

JIT DISTILL (house waiver 1, recorded in feature-delta.md): the acceptance feature file is authored at slice open by the acceptance designer; step definitions are authored by the crafter at RED so the globally-imported steps surface (`cucumber.mjs` loads `tests/**/steps/**/*.ts` for every run) never breaks other features with an unresolved import.

Expected RED discipline per scenario: first failure must be a business-behavior failure (a missing row, a wrong key, a clobbered object), never an import/collection error. The crafter records the observed RED (command + exit code + failure line) in the step contract before driving GREEN. Scenarios tagged `@step-01-02` stay honestly red until that step runs — the whole-suite `npm run test:at` is expected green only at slice close, after 01-02's COMMIT.

| Scenario (by step tag) | Why RED at authoring |
|---|---|
| @step-01-01 group | No export module exists; the driving port is absent. Missing behavior, not broken plumbing, once the crafter lands the port skeleton with step defs in the same RED. |
| @step-01-02 group | Signals computation, write-once re-run and gzip round-trip unimplemented until 01-02. |
