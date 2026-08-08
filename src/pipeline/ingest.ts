// The hourly fetch run. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// Contract: docs/product/architecture/04-ingest-pipeline.md section 3.
// The run's durable side effects, in order and the ONLY ones it performs:
//   1. PUT the verbatim payload to raw/<provider>/dt=<date>/<HH>/  (durable #1)
//   2. PUT one gzip JSONL file per (run_date, source, cycle, partition) to
//      predictions/v1/... with If-None-Match:*                      (durable #2)
// The snapshot happens before any scoring exists anywhere in the run, so no
// downstream failure, build bug or publish refusal can ever cost a snapshot.
// One row per member per valid hour, natural key
// (spot_id, source, run_ts, valid_ts), fields per domain-model section 5.1.

export const __SCAFFOLD__ = true;

import type { IngestDeps, IngestOutcome } from './ports';

export async function runIngestOnce(_deps: IngestDeps): Promise<IngestOutcome> {
  throw new Error(
    '__SCAFFOLD__ assertion: the ingest run is not implemented yet. ' +
      'This seam is authored by DISTILL; DELIVER slice-01 makes it real.',
  );
}
