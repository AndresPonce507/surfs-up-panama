# Controlled learning-infra declaration fixture

This directory is a **test input**, never a shipped `infra/` directory and
never a deployment candidate. The acceptance steps for slice-06 of
`f-forecast-learns-from-the-beach` copy it without dereferencing to a fresh
temporary root before every mutation, then pass that root to the
production-owned local `infra` job (`runLocalCi`) exactly the way
`f-bill-stays-zero-and-stays-up`'s contained scenarios do — that feature's
fixture is the precedent this one follows.

It is a full copy of the reviewed declaration surface (the bill guardrails,
the dead-man's switch, the money lines) plus the learning-job declarations
slice-06 adds: both schedules, the 1024 MB function, the nightly fit's two
write shelves, the monthly evaluation's one, and the denied complement. A
partial fixture would fail on an unrelated pre-existing check before ever
reaching the property under test, so it stays a complete copy.

`infra/lib/site-stack.ts` here is a bare existence witness: the evaluator
only checks the file exists before reading the guardrail declarations.

No scenario here deploys anything. AWS deploys are walled for this project
(CloudFormation writes are denied to the CLI identity — feature-delta
Pre-requisite 4), which is exactly why every check in this fixture's
scenarios is credential-free and declaration-shaped.
