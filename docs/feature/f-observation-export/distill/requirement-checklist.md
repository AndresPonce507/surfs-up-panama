# Requirement checklist — f-observation-export

A test covers `Rn` iff it carries `@covers-Rn` (cucumber) or `// covers: Rn` (vitest).

| ID | Category | Requirement | Source |
|---|---|---|---|
| R1 | functional | One JSONL row per accepted report whose `received_at` falls in the closed UTC day; flat fields per ADR Decision 2 (report_id, spot_id, device_id, observed_at, submitted_at, received_at, credential_issued_at, size_band, size_band_schema, wind, quality, trigger, predicted) | ADR D2/D4; 07 §7.4 |
| R2 | functional | `predicted` is lifted from the stored receipt **whole and unnarrowed** — every key of `PredictedCall` (`score_q`, `size_band`, `size_range_m`, `wind_state`, `conf_level`); `null` when no call was live; never fabricated. A row whose `predicted` carries `score_q` but drops `conf_level` FAILS this requirement: `src/learning/metrics.ts` `calibrationOf` skips any row without `conf_level`, so narrowing yields zero calibration bins forever and silently disarms the C_spread kill switch | ADR D2 + mismatch 6; verified against landed `src/learning/metrics.ts` |
| R3 | functional | Rows partition to `log/observations/v1/dt=<received-utc-date>/<tile>.jsonl.gz`; tile = geohash4 of the spot seed lat/lon | ADR D3 |
| R4 | functional | Write-once: re-running the same day's export writes nothing new and never clobbers an existing object (putIfAbsent semantics) | ADR D3; predictions/ precedent |
| R5 | functional | `received_at` and `credential_issued_at` present on every row (retroactive trust gate inputs); no `src_hash`, no PII in observation rows | 07 §6; ADR D2 |
| R6 | functional | `ops/abuse-signals/v1/dt=<date>.json` written in the same pass with §7.4's four signals: distinct_devices + median_credential_age_days per (spot, local day); band_dispersion; min_interarrival_ms + burst clusters (<500 ms); mints_per_src_hash trailing 7 d | 07 §7.4 |
| R7 | security | Export role: DynamoDB read-only (`Scan`, `DescribeTable` only, table ARN); S3 put only on `log/observations/v1/*` and `ops/abuse-signals/v1/*`; no other write anywhere | ADR consequences |
| R8 | build | WriteStack declaration: schedule cron(30 0 * * ? *) UTC, RC 1, timeout 120 s, memory 512 MB, explicit 14-day log group, roster/RC-sum/log-group lockstep updated | 07 §2; guardrails |
| R9 | functional | Gzip bytes round-trip: what the export writes under a `.gz` key is readable back as JSON lines through the house storage adapter (the consumers' read path) | ADR mismatch 2 |
| R10 | validation | Non-report items in the scan and malformed items never crash the export and never become rows. The selection rule is POSITIVE — export only items with `sk === 'REPORT'` — so the four shapes that exist today (`REP#`, `CRED#/MINT`, `DEV#/QUOTA#`, `SPOT#/COUNTER`) and any shape added later are skipped by construction. Verified 2026-08-13: no `PUSH#` writer exists yet, so it is covered by the same rule rather than named | store reality |
| R12 | functional | `person_id` is OMITTED from a row, never emitted as an empty string: the two landed C5 copies disagree on `''` (`residuals.ts` falls through to `device_id`, `trust.ts` accepts it as a real key and would merge every empty reporter into one) | ADR D2; verified against landed learning code |
| R11 | functional | A report received after the day closed (received_at ≥ 00:00Z today) is not in yesterday's export; it belongs to the next run | ADR D3 |
