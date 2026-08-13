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
- `received_at` and `credential_issued_at` ride on every row from day one — the retroactive trust gate depends on them (07 §6).
- `person_id` is **omitted at launch**: no identity items exist in the write store (ClaimName ships later). The C5 rule (`reporter_key = person_id ?? device_id`) resolves late at aggregation; consumers already treat `person_id` as optional. When C5 ships, whether the export stamps person_id at export time (frozen-at-export) or consumers resolve from an identity snapshot is that lane's decision — flagged, not decided here.
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

## Consumer-contract mismatches found (flagged, not silently resolved)

| # | Docs say | Reality | This lane does |
|---|---|---|---|
| 1 | domain-model §12 / adr-write-store-single-table: report `PK=SPOT#<spot>`, `SK=REP#<utc>#<id>`, GSI1/GSI2, uppercase `PK` | Deployed store: lowercase `pk=REP#<report_id>`, `sk=REPORT`, record nested under `record`, reveal under `receipt`, **no GSIs** | Read reality; export the doc §7.3 flat shape. Docs need a coherence-round amendment (not edited by this lane) |
| 2 | 07 §7.4: `dt=<date>/<tile>.jsonl.gz` | Learning docstring: `dt=<date>/reports.jsonl`, "read as text" | §7.4 naming; real gzip bytes. Safe only because the house store adapter gunzips on the `.gz` suffix — the learning lane's eventual production store adapter MUST do the same (its branch has no production wiring yet). Flagged to that lane |
| 3 | domain-model §7.3 stores flat fields incl. `build_id`, GSI keys | Stored item has no top-level `build_id`/GSI keys; `predicted{}` lives inside `receipt` | Export lifts `predicted`; `build_id` exported when present on the stored item, omitted otherwise (no consumer reads it today) |
| 4 | AP13 "query per tile" via GSI2 | No GSI; 07 §2 says "scan" | Scan (Decision 3) |
| 5 | record feature P4(a): `n_obs` vs `n_reports` ambiguous | — | Decision 4 |

## Consequences

- The scorecard's slice-03/05 real store read and the learning fit get a log whose rows parse today with their committed readers.
- The export role is read-only on DynamoDB (`Scan`, `DescribeTable` only) and can put only under `log/observations/v1/*` and `ops/abuse-signals/v1/*` — the write-once, no-clobber property is IAM-shaped as well as request-shaped.
- Function roster lockstep: adding the **tenth** function (notify became the ninth) updates `physical-names.ts`, the guardrails roster/RC-sum/log-group assertions, and `write-declarations.ts` (`reservedConcurrencySum` 14 → 15, quota-precondition comment moved with it) in the same change, deliberately.
