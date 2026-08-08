# ADR: Published payloads — one region bundle, measured-bytes governance

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C4 Publication · **Aligns with:** research 08 §4.4 (bundle, never per-spot files), DISCUSS decisions 10, 27

## Decision

1. The public read model is **one bundle per region** (`pub/v1/regions/<region_id>/bundle.json`) carrying every spot's full detail for today+tomorrow (48 hourly points), plus `index.json` (list-only variant), `reports.json`, and `manifest.json`. Schema authority: Domain Model §13.
2. **Byte sizes are measured, never estimated**: a representative 20-spot sample is built and gzipped as part of the design (and should become a CI budget check). Measured 2026-08-08: bundle 217,783 B raw / **27,510 B gzip**; index 1,030 B gz; reports 675 B gz; manifest 146 B gz.
3. Horizon is 48 h because the product is today+tomorrow only (decision 10) — this is the single biggest reason the payload fits the 100 KB page budget.
4. Past ~40 spots per region (or when a measured bundle approaches ~60 KB wire), split into geohash4 tile bundles with per-tile model-cycle stamps (research 08 §15.5). The trigger is **measured size**, not spot count alone.
5. All local-time strings are precomputed at build from each spot's `timezone` field — clients render, never compute timezones.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| One file per spot | Rejected | Multiplies CloudFront requests per session — the binding constraint of the whole architecture (research 08 §12.4) — and S3 PUTs ×40 |
| Index + lazy per-spot detail | Rejected for launch | Saves ~26 KB on first paint but adds a request per spot view; with the full bundle at 27.5 KB wire, the trade is not worth the extra requests. `index.json` is still published so the frontend can choose a fast-first-paint pattern without a schema change |
| 3-hourly resolution (measured 10,875 B gz) | Held as a lever | Documented fallback if the frontend's total budget math needs ~2.5× off the data cost; not the default because hourly resolution is what "best window 6:00–9:30" is computed from |
| 7-day horizon | Rejected | ~3.5× payload and contradicts binding decision 10 |

## Consequences

- Frontend budget arithmetic: ≈28.4 KB wire for all data (bundle + reports + manifest), ~70 KB left for HTML/CSS/JS. Decompressed bundle ≈218 KB in memory — stated so nobody is surprised on a low-end phone.
- Hourly republish = ~4 PUTs/region/hour ≈ 2,900 PUTs/mo at launch.
- Any lane adding a payload field must name its consumer and re-run the measurement — the sample script is the budget instrument.
