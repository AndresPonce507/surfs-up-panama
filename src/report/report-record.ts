// The report record, composed pure at the moment the surfer taps Mandar.
//
// This is the whole of what the phone keeps. domain-model.md section 7.4 puts
// the full record plus its freshly minted `report_id` into the durable local
// queue BEFORE any network attempt, and a retry re-sends the identical record
// rather than re-minting one. Section 10 gives the SurfReport aggregate no
// edit command at all. So whatever is composed here is what gets POSTed the
// day the endpoint exists, and it can never be repaired: a placeholder token
// or a wrong field name is a permanently invalid record, not a bug to fix
// later.
//
// The shape is domain-model.md section 7.3's record narrowed to the fields a
// client may set, which is exactly 07-write-path.md section 4.1's request
// body plus `photo_ids`. Everything else on the stored item is server-owned
// and must never be guessed here: `device_id` comes from the credential and
// never from the body, `received_at` and `credential_issued_at` from the
// server clock and credential, `build_id` and `predicted{}` are captured
// authoritatively at accept time, and the DynamoDB keys are derived from the
// body server-side (07 section 6).
//
// Two readings recorded rather than left implicit:
//
//  - `observed_at` is always the commit instant. No control lets a surfer
//    pick a time; that is a product decision, not an omission, so the
//    back-dating allowance of section 7.3 has no client that exercises it.
//  - `submitted_at` is the same instant, read once. The record is composed
//    and queued in one step and replays byte-identical, so there is no second
//    clock read to make. The offline latency the write path wants survives:
//    07 section 6 derives it from the server's `received_at` minus this
//    `submitted_at`, not from the gap between these two fields.
//
// Timestamps are second-precision UTC because that is the shape both settled
// examples carry verbatim (domain-model section 7.3, 07-write-path section
// 4.1), and `observed_at` is only ever read at hour resolution by the
// verification join.
//
// This module must never import from src/publish/**, src/scoring/** or
// src/pipeline/**, for the same reason src/data/report-vocab.ts must not: the
// capture route may not reach the forecast layer (leak path L1).

import type { QualityToken, WindStateToken } from '../data/report-vocab';
import type { SizeBandToken } from '../data/size-bands';
import { mintReportId, type RandomSource } from './ulid';

/**
 * The commit instant, injected. Nothing in this lane reads the ambient clock
 * (the rule src/pipeline/ports.ts states for the forecast core, restated here
 * so the capture route owns its own port).
 */
export type Clock = () => Date;

/** The three answers the surfer gives, already in the one shared vocabulary. */
export interface ReportAnswers {
  readonly size_band: SizeBandToken;
  readonly wind: WindStateToken;
  readonly quality: QualityToken;
}

/**
 * The version of the size-band table this record's `size_band` was picked
 * from (domain-model.md section 7.2). Changing a band edge bumps this,
 * because old observations become incomparable otherwise.
 */
export const SIZE_BAND_SCHEMA = 1;

/**
 * How the surfer arrived at the form (07-write-path.md section 4.1, the
 * learning lane's required field). `push_solicited` belongs to the
 * solicitation deep link of section 8.3 and has no client yet.
 */
export type ReportTrigger = 'organic' | 'push_solicited';

/** The full record the phone keeps and later sends, field for field. */
export interface ReportRecord {
  readonly report_id: string;
  readonly spot_id: string;
  readonly observed_at: string;
  readonly submitted_at: string;
  readonly size_band: SizeBandToken;
  readonly size_band_schema: typeof SIZE_BAND_SCHEMA;
  readonly wind: WindStateToken;
  readonly quality: QualityToken;
  readonly trigger: ReportTrigger;
  readonly photo_ids: readonly string[];
}

/**
 * Compose the record for one spot and one set of answers at the commit
 * instant. Dependencies first, the surfer's own input last.
 */
export function composeReportRecord(
  clock: Clock,
  random: RandomSource,
  spot_id: string,
  answers: ReportAnswers,
): ReportRecord {
  const committedAt = clock();
  const stamp = toUtcSecondStamp(committedAt);
  return {
    report_id: mintReportId(committedAt, random),
    spot_id,
    observed_at: stamp,
    submitted_at: stamp,
    size_band: answers.size_band,
    size_band_schema: SIZE_BAND_SCHEMA,
    wind: answers.wind,
    quality: answers.quality,
    trigger: 'organic',
    photo_ids: [],
  };
}

/** The settled stamp: UTC, second precision, exactly as both examples write it. */
function toUtcSecondStamp(instant: Date): string {
  return `${instant.toISOString().slice(0, 19)}Z`;
}
