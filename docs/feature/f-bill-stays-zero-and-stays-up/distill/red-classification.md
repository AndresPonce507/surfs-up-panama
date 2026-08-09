# RED classification history

Feature: `f-bill-stays-zero-and-stays-up`
Slices: none entered DISTILL yet
Workspace opened: 2026-08-09

## Current state, honestly

No acceptance scenario exists for this feature and none was authored at workspace-open. The
JIT rule (HANDOFF §1, §4) forbids writing a slice's tests before that slice legally enters
DISTILL, and this file records classifications, it does not pre-write them. An empty history
here is the correct state today; a green run against zero tests is never evidence of behavior
(the keystone learned this: "No test files found" exits green and proves nothing, see its own
`red-classification.md`).

## Contract for every future entry

When a slice enters JIT DISTILL, its scenarios are run once before DELIVER and each failure is
classified here, one row per scenario:

- `MISSING_FUNCTIONALITY`: the scenario reached its observable and failed at the behavior
  oracle. The only classification that admits a slice into DELIVER. Correct RED.
- `IMPORT_ERROR` / `FIXTURE_BROKEN` / `SETUP_FAILURE`: the scenario never reached its oracle.
  Wrong RED; fix the test, never hand it to a crafter.
- `WRONG_ASSERTION` / `OBSERVABLE_NOT_AT_PORT`: the assertion couples to internals instead of
  the command surface. Wrong shape; fix the observable.

Every new gate in slices 01 to 03 additionally owes the red-once demonstration of
`system-architecture.md` §11: the assert is shown failing against the drifted declaration
before it counts as a guardrail. That demonstration is recorded here with the exact drift and
the exact rejection text observed.

Slices 04 and 05 produce no scaffold-RED entries: their proofs are live and human-run (an
ALARM/OK email pair, a command's report and exit code against the real account). Their
charters in `docs/product/expectations/f-bill-stays-zero-and-stays-up/` are the oracle; their
outcomes land in each charter's session log, and this file records only whatever local
command-surface tests those slices do ship.

## Commands that will be observed

```sh
npm run ci:local            # captured with its real exit code, never piped into tail
npm run test:at -- --tags @slice-NN
```

## Classification log

| Slice | Scenario | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- | --- |
