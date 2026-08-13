# ADR: Nightly observation export — stack home, record shape, counter semantics

**Status:** Proposed (industry-standard calls made under DELIVER autonomy; Andres reviews). **Date:** 2026-08-12. **Lane:** observation export (AP13). **Consumes, never redesigns:** `07-write-path.md` §7.4 (the AP13 contract), `domain-model.md` §7.3/§8/§12 (schema authority), `src/report/aws-write-store.ts` (what is actually in DynamoDB), the consumer readers on `build/f2-learning-01-14-18` (`src/learning/inputs.ts`) and `build/f2-record-fresh` (`src/scorecard/observation-source.ts`).

## Context

Nothing produces the immutable observation record today: accepted reports land in DynamoDB and never reach `log/observations/v1/`, which the learning fit (`readObservationLog`) and the scorecard (record feature slice-05) both read. This ADR records the decisions the export implementation takes where the settled docs disagree with each other or with the deployed store.

## Decision 1 — Stack home: `WriteStack`

The export Lambda, its EventBridge schedule (00:30 UTC) and its IAM live in `infra/lib/write-stack.ts`, not `IngestStack`.

- `07-write-path.md` §7.4 assigns ownership explicitly: "AP13, owned here: it is the write store's data leaving the store", and §2's topology places `EXPORT` inside the Write subgraph with RC 1 / 120 s / 512 MB.
- The DynamoDB table (`surfs-up-panama-write-store`) is declared in `WriteStack` with no cross-stack export and no entry in `physical-names.ts`. Same-stack placement reuses the house pattern (`WRITE_STORE_TABLE` env, IAM against `writeStore.tableArn`) instead of inventing a cross-stack name path.
- The scheduled-job idiom already lives in `WriteStack` since notify landed (2026-08-12, `Notify` fn + `NotifySchedule` + dedicated scheduler role): the export copies its in-stack neighbor. The shared guardrail declaration `timeout-notify-export: '120 seconds'` was written for both jobs, so the export's timeout is pre-declared on the frozen surface.

Considered and rejected: `IngestStack` placement (the "scheduled data-plane jobs live in Ingest" reading). Rejected because the table has no import path outside `WriteStack`, and §7.4's ownership sentence is unambiguous.

## Decision 2 — Observation record shape: flat JSONL row, one per accepted report

One line per accepted report in `log/observations/v1/`, fields flattened to `domain-model.md` §7.3 names — which is exactly what the learning reader (`ObservationRow`) parses:

```json
{"report_id":"01J…","spot_id":"playa-venao","device_id":"d_…",
 "observed_at":"…Z","submitted_at":"…Z","received_at":"…Z","credential_issued_at":"…Z",
 "size_band":"waist_chest","size_band_schema":1,"wind":"clean","quality":"good",
 "trigger":"organic","predicted":{"score_q":82,…}|null}
```

- The stored item nests the client record under `record` and the reveal under `receipt` (`aws-write-store.ts`); the export flattens `record.*` to the top level and lifts `predicted` from `receipt.predicted` (`null` when no call was live). Consumers never learn the store's internal nesting.
- **`predicted` is lifted WHOLE, never narrowed to `score_q`** (verified against landed consumers 2026-08-13). `src/learning/metrics.ts` `calibrationOf` reads `predicted.conf_level` through its own permissive row view, because the shared `ObservationRow` type does not declare that field. An export that emitted `{score_q}` alone would produce **zero calibration bins forever**, which makes `offendingTermOf` return `null` unconditionally and silently disarms the C_spread kill switch. So every key the store's `PredictedCall` carries rides out: `score_q`, `size_band`, `size_range_m`, `wind_state`, `conf_level`. The log is immutable, so a narrowed `predicted` could never be repaired without a re-export.
- `received_at` and `credential_issued_at` ride on every row from day one — the retroactive trust gate depends on them (07 §6).
- `person_id` is **omitted at launch — the key is absent, never present-and-empty** (verified 2026-08-13). The two landed C5 copies disagree on the empty string: `src/learning/residuals.ts:187` treats `person_id: ''` as absent and falls through to `device_id`, while `src/learning/trust.ts:56` uses a literal `?? device_id` and would accept `''` as a real reporter key, silently collapsing every empty-string reporter into one. Omitting the key entirely is the only value both copies agree on. The landed `ObservationRow` types `person_id` as optional, so the omission is contract-clean. No identity items exist in the write store (ClaimName ships later). The C5 rule (`reporter_key = person_id ?? device_id`) resolves late at aggregation; consumers already treat `person_id` as optional. When C5 ships, whether the export stamps person_id at export time (frozen-at-export) or consumers resolve from an identity snapshot is that lane's decision — flagged, not decided here.
- No PII and no `src_hash` in observation rows. `src_hash` appears only in the abuse-signals file, as §7.4 specifies.
- **Trust filtering: none at export.** Every accepted report exports. Eligibility is computed at aggregation time (07 §7.3); the export only carries the two gate inputs.

## Decision 3 — Partitioning, cadence, idempotency

- Key: `log/observations/v1/dt=<received-UTC-date>/<tile>.jsonl.gz`, tile = geohash4 of the spot seed's lat/lon (the same `geohash4` the publisher uses). §7.4's naming is kept even though the learning docstring mentions `reports.jsonl` — the reader lists the whole prefix, so names are transport, not contract.
- **`dt` partitions by `received_at` (server clock), not `observed_at`.** The 00:30Z run exports the UTC day that just closed. A report can be observed up to 12 h back and synced days late, so observed-day partitions would need rewriting closed files; received-day partitions are complete the moment the day ends. Consumers join on the in-row `observed_at`; the partition key carries no semantics for them.
- **Write-once:** every S3 put uses the house `putIfAbsent` (`IfNoneMatch: '*'`, the `predictions/` precedent). A re-run of the same night recomputes, finds the keys present, skips them, and clobbers nothing. Dedup inside a file is structural: the store keys report items by `report_id` (`pk=REP#<id>`), so one accepted report is one item is one row.
- Bytes are **real gzip** for `.gz` keys, via the house storage adapter (`src/pipeline/adapters/s3-store.ts` gzips/gunzips on the key suffix). The abuse-signals file `ops/abuse-signals/v1/dt=<date>.json` is plain JSON, written in the same pass, also write-once.
- The table has **no GSIs** (deployed reality; `adr-write-store-single-table.md`'s GSI2 `TILE#` was never built). The export **Scans** the table — which is what 07 §2's topology edge says ("scan day's reports") — filtering to report items for the closed day and mint-ledger items for the trailing-7-day signal. At provisioned 25 RCU and launch volumes this is cents-free; if a GSI is ever added, the read path narrows without changing the output.

## Decision 4 — Counter semantics: `n_obs` = accepted reports = rows (P4(a) resolved)

- **One observation record per accepted report.** `n_obs` for a spot = the count of its rows in the log. There is no session/day collapsing at export.
- **Distinct reporters** are counted by consumers as distinct `reporter_key = person_id ?? device_id` over rows (the C5 precedent already in `src/learning/residuals.ts`); every row carries `device_id` for exactly this.
- The reveal counter `n_reports` (`SPOT#/COUNTER` item) is a **different number by design**: a live, display-only, best-effort counter that can undercount on crashes and leads the log by up to a day. The scorecard and the learning fit must count from the log, never from the counter. A test asserting counter == rows would flake; `≤` is the honest assertion (07 "unobservable" note).

## Decision 5 — Abuse-signal buckets are local-day, and carry their own UTC window

07 §7.4 groups `distinct_devices` and `median_credential_age_days` per (spot, **local** day). Decision 3 names the file by **received-UTC** day. Panama is UTC-5, so a UTC-day file spans local 19:00 of the previous day to 19:00 of the named day, and **no local day is ever complete inside a single file**. That is a structural fact, not a tuning choice, so it is decided here rather than left to the implementation:

- Buckets keep §7.4's `(spot, local day)` grouping.
- Every bucket additionally carries the **UTC window it was actually computed over** and an explicit `complete: false` when the file's UTC boundary clipped it.
- A consumer that wants a true local day **must merge two adjacent files**. That is a real consequence and is flagged rather than hidden.

Rejected: grouping by UTC day (silently redefines §7.4's signal). Rejected: emitting clipped buckets unmarked — a median over a partial day that presents as whole is the project's one forbidden move, claiming more certainty than the data earns.

## Decision 6 — A partial stored `predicted` block exports as `null`

If `receipt.predicted` exists but is missing any of the five `PredictedCall` keys, the row's `predicted` is `null`, and the observation itself still exports.

Unreachable with today's writer (`receipt()` spreads a whole `PredictedCall`), so this governs only corrupt or future-schema data. It satisfies R10's never-crash rule, keeps the observation, and declines to report a call that cannot be reported honestly. R2 forbids narrowing a real call; this is not narrowing but refusing a call that was never whole. Recorded as a decision because an undocumented edge case in an immutable-log producer gets re-litigated later with nobody remembering why.

## Decision 7 — The schedule ships DISABLED; a human enables it after night one

The CDK declares `state: 'DISABLED'` on the export schedule.

The handler is real and tested, so this is NOT notify's reason (an unlanded stub). It is the write-once property: the first production run seals that night's keys permanently, and a re-run finds them present and skips, so a bug in night one is **unfixable in place**. An unattended 00:30Z cron with zero prior production observation is an irreversible action, and this project flags those for a human rather than taking them automatically. Enabling is a one-word CDK change plus a redeploy, and the deploy note carries it.

## Consumer-contract mismatches found (flagged, not silently resolved)

| # | Docs say | Reality | This lane does |
|---|---|---|---|
| 1 | domain-model §12 / adr-write-store-single-table: report `PK=SPOT#<spot>`, `SK=REP#<utc>#<id>`, GSI1/GSI2, uppercase `PK` | Deployed store: lowercase `pk=REP#<report_id>`, `sk=REPORT`, record nested under `record`, reveal under `receipt`, **no GSIs** | Read reality; export the doc §7.3 flat shape. Docs need a coherence-round amendment (not edited by this lane) |
| 2 | 07 §7.4: `dt=<date>/<tile>.jsonl.gz` | Learning docstring: `dt=<date>/reports.jsonl`, "read as text" | §7.4 naming; real gzip bytes. Safe only because the house store adapter gunzips on the `.gz` suffix — the learning lane's eventual production store adapter MUST do the same (its branch has no production wiring yet). Flagged to that lane |
| 3 | domain-model §7.3 stores flat fields incl. `build_id`, GSI keys | Stored item has no top-level `build_id`/GSI keys; `predicted{}` lives inside `receipt` | Export lifts `predicted`; `build_id` exported when present on the stored item, omitted otherwise (no consumer reads it today) |
| 4 | AP13 "query per tile" via GSI2 | No GSI; 07 §2 says "scan" | Scan (Decision 3) |
| 5 | record feature P4(a): `n_obs` vs `n_reports` ambiguous | — | Decision 4 |
| 6 | `ObservationRow` types `predicted` as `{score_q} \| null` | `src/learning/metrics.ts` `calibrationOf` also reads `predicted.conf_level` through a private permissive row view | Export the whole `predicted` block. Flagged: the shared row type under-declares what a landed consumer actually reads |
| 7 | — | `src/scorecard/pairing.ts` `SurfReport.predicted` is **required and non-null**, so it cannot represent an R2-conformant row where no call was live | Export still writes `null` per R2 (the learning reader and domain-model both allow it). The scorecard's eventual log reader must widen `SurfReport.predicted` or filter. **Flagged to the record lane, not fixed here** |
| 8 | domain-model §8: ClaimName writes `person_id` | No `PERSON#` item, no membership item, no `person_id` writer anywhere in `src/` | Omit the key (Decision 2). Real ownership gap: the field both C5 copies depend on has no producer. **Flagged, not this lane's to build** |
| 9 | R10 lists `PUSH#` among items the scan must skip | No `PUSH#` writer exists; the table holds exactly four shapes today: `REP#`, `CRED#`, `DEV#`, `SPOT#` | Skip rule is positive and stable: export only items with `sk === 'REPORT'`. Unknown future item shapes are skipped by construction, `PUSH#` included when it lands |
| 10 | 07 §7.4 + this ADR: rows are real gzip under `.jsonl.gz` | **No landed adapter satisfies the learning `LearningInputStore` port at all** — `S3Store.list`/`get`/`getGzip` are all private and `BuildStore` declares neither method | Keep real gzip. `S3Store.getGzip` gunzips unconditionally on a `.gz` suffix, so real gzip is the only choice its production read path accepts; plaintext under `.gz` would throw there. **Flagged to the learning lane: the production adapter it still owes must gunzip on `.gz`, contradicting its current "read as text" docstring** |

## Consequences

- The scorecard's slice-03/05 real store read and the learning fit get a log whose rows parse today with their committed readers.
- The export role is read-only on DynamoDB (`Scan`, `DescribeTable` only) and can put only under `log/observations/v1/*` and `ops/abuse-signals/v1/*` — the write-once, no-clobber property is IAM-shaped as well as request-shaped.
- Function roster lockstep: adding the **tenth** function (notify became the ninth) updates `physical-names.ts`, the guardrails roster/RC-sum/log-group assertions, and `write-declarations.ts` (`reservedConcurrencySum` 14 → 15, quota-precondition comment moved with it) in the same change, deliberately.
