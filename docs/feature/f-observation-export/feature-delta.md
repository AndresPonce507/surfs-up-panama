# Feature delta — f-observation-export

Nightly observation export (AP13): the 00:30Z job that moves the day's accepted reports out of the DynamoDB write store into the immutable observation record `log/observations/v1/` plus the abuse-signals file `ops/abuse-signals/v1/`, on the site bucket. Closes the ownership gap that blocks F-SHOW-OUR-TRACK-RECORD slice-05 and all real-data learning.

## Wave: DISCUSS / [REF] Slice Plan

One slice, `slice-01`: the export exists end to end — pure core, adapters, CDK declaration. Decision authority for shape and semantics: `docs/product/architecture/adr-observation-export.md` (Status: Proposed) plus `07-write-path.md` §7.4 and `domain-model.md` §7.3. The consumers are the contract: `src/learning/inputs.ts` (branch `build/f2-learning-01-14-18`) and the scorecard's pending real-store read (branch `build/f2-record-fresh`).

## Wave: DISCUSS / [REF] Definition of Done

- One JSONL row per accepted report of the closed UTC day (`received_at` partition), fields per ADR Decision 2, parseable by the learning branch's committed `ObservationRow` reader.
- Re-runs are idempotent: write-once keys via `putIfAbsent`; a second run clobbers nothing and writes nothing new.
- Abuse-signals file with §7.4's four signals, same pass, write-once.
- CDK: export fn in `WriteStack`, schedule 00:30Z, RC 1, 120 s, 512 MB, 14-day log group; IAM read-only on the table (`Scan`+`DescribeTable`), S3 put only on the two prefixes.
- `npm run synth:infra` green credential-free; `npm run test:infra` green; `node scripts/ci-local.mjs --fast` green; focused `test:at` green for `@feature-f-observation-export and @slice-01`.

## Wave: DISCUSS / [REF] Out of scope

Deploy (integration terminal owns it). The learning fit's production store wiring. Any GSI addition. Person/identity items (C5 ships later — rows omit `person_id` until then). Editing settled docs (mismatches flagged in the ADR instead). The notify job.

## Wave: DISCUSS / [REF] Slice classification

Non-visual, all steps. UI N/A rationale (per the `f-bill-stays-zero-and-stays-up` precedent): every observable in this feature is a stored S3 object, a DynamoDB read, or a terminal exit code. No slice ships a page, a component, a style, or any pixel. U1–U7 executable checks and the U8 source-blind visual observation are N/A for every step. Non-visual does not mean unexamined: the acceptance suite reads the exported objects back through the same adapter contract the consumers use.

## Wave: DISTILL / [REF] Acceptance design

JIT DISTILL (house waiver 1): `tests/acceptance/f-observation-export/observation-export.feature`, file-level `@feature-f-observation-export`, `@slice-01` on every scenario. Port-to-port through the export's driving port (`runExport`-style composition with injected store fakes — the filesystem storage twin gives real gzip + real `putIfAbsent` semantics without AWS). Scenario inventory and coverage: `distill/requirement-checklist.md`. Infra requirements (R7, R8) are covered by `infra/test/` vitest assertions per house style, marked `// covers: Rn`.

## Wave: DELIVER / [REF] DES waiver record

Recorded per HANDOFF "Waivers, recorded rather than hidden": the DES Stop hook is misanchored on this machine, so crafter dispatches run DES-exempt. What replaces the mechanical gates, per step: real RED→GREEN evidence with exit codes recorded in step contracts and commit messages; `des-log-phase` with absolute `--project-dir /Users/andres/psb-obs-export/docs/feature/f-observation-export/deliver` using legacy phase names; `node scripts/ci-local.mjs --fast` with its real exit code; focused slice tags plus whole-suite `npm run test:at`. Nothing is fabricated; skipped gates are named, not faked.
