// One stored write-store item to one line of the observation log.
//
// The stored item nests the client's record under `record` and the reveal
// under `receipt` (src/report/aws-write-store.ts). The exported row is FLAT:
// consumers never learn the store's nesting. domain-model.md section 7.3 and
// the ADR's Decision 2 fix the field list, and src/learning/inputs.ts
// `ObservationRow` is what actually parses it.
//
// Every key is ENUMERATED, never spread. Two reasons, both of them about a
// log that can never be repaired once written:
//
//   - `{ ...receipt.predicted }` would let a future widening of PredictedCall
//     leak a field into an immutable log, and a spread of `record` would carry
//     `photo_ids` out with it. The row list here is the whole contract.
//   - Narrowing is just as dangerous in the other direction. An export that
//     dropped `conf_level` from `predicted` would produce zero calibration
//     bins forever: src/learning/metrics.ts `calibrationOf` skips any row
//     whose predicted block has no `conf_level`, which makes `offendingTermOf`
//     return null unconditionally and silently disarms the C_spread kill
//     switch. So all five keys of PredictedCall ride out together or none do.
//
// `person_id` is OMITTED, never emitted as an empty string. The two landed C5
// copies disagree on `''`: src/learning/residuals.ts treats it as absent and
// falls through to `device_id`, while src/learning/trust.ts accepts it as a
// real reporter key and would collapse every empty reporter into one.
// Omitting the key is the only value both copies agree on.

/** The five keys of the stored `PredictedCall`, lifted whole. */
export type ExportedPrediction = {
  readonly score_q: number;
  readonly size_band: string;
  readonly size_range_m: readonly [number, number];
  readonly wind_state: string;
  readonly conf_level: string;
};

/** One line of log/observations/v1/. Flat, and exactly these keys. */
export type ObservationRow = {
  readonly report_id: string;
  readonly spot_id: string;
  readonly device_id: string;
  readonly observed_at: string;
  readonly submitted_at: string;
  readonly received_at: string;
  readonly credential_issued_at: string;
  readonly size_band: string;
  readonly size_band_schema: number;
  readonly wind: string;
  readonly quality: string;
  readonly trigger: string;
  readonly predicted: ExportedPrediction | null;
};

/**
 * The one sort key an accepted report is stored under. The selection rule is
 * POSITIVE on purpose: the scan exports items with this sort key and skips
 * everything else, so the shapes that exist today (CRED#/MINT, DEV#/QUOTA#,
 * SPOT#/COUNTER) and every shape added later are skipped by construction
 * rather than by a list somebody has to remember to extend.
 */
export const REPORT_SORT_KEY = 'REPORT';

/**
 * The row this stored item becomes, or `null` when it is not an accepted
 * report this export can carry honestly. A scan hands over every shape in the
 * table plus whatever a partial write left behind, so this never throws: an
 * item it cannot read is an item that contributes no row.
 */
export function observationRowOf(item: unknown): ObservationRow | null {
  if (!isRecord(item) || item['sk'] !== REPORT_SORT_KEY) return null;
  const record = item['record'];
  if (!isRecord(record)) return null;

  const report_id = textAt(record, 'report_id');
  const spot_id = textAt(record, 'spot_id');
  const observed_at = textAt(record, 'observed_at');
  const submitted_at = textAt(record, 'submitted_at');
  const size_band = textAt(record, 'size_band');
  const size_band_schema = countAt(record, 'size_band_schema');
  const wind = textAt(record, 'wind');
  const quality = textAt(record, 'quality');
  const trigger = textAt(record, 'trigger');
  const device_id = textAt(item, 'device_id');
  const received_at = textAt(item, 'received_at');
  const credential_issued_at = textAt(item, 'credential_issued_at');

  if (
    report_id === null || spot_id === null || observed_at === null || submitted_at === null
    || size_band === null || size_band_schema === null || wind === null || quality === null
    || trigger === null || device_id === null || received_at === null || credential_issued_at === null
  ) {
    return null;
  }

  return {
    report_id,
    spot_id,
    device_id,
    observed_at,
    submitted_at,
    received_at,
    credential_issued_at,
    size_band,
    size_band_schema,
    wind,
    quality,
    trigger,
    predicted: predictionOf(item['receipt']),
  };
}

/**
 * The call the surfer was shown, or `null` when none was live.
 *
 * A receipt whose predicted block is missing any of the five keys also reads
 * as `null`. That is the honest reading of the two rules that meet here: R2
 * forbids a narrowed `predicted` outright, and the observation itself must
 * still export. Half a call is not a call.
 */
function predictionOf(receipt: unknown): ExportedPrediction | null {
  if (!isRecord(receipt)) return null;
  const predicted = receipt['predicted'];
  if (!isRecord(predicted)) return null;

  const score_q = countAt(predicted, 'score_q');
  const size_band = textAt(predicted, 'size_band');
  const size_range_m = metreRangeAt(predicted, 'size_range_m');
  const wind_state = textAt(predicted, 'wind_state');
  const conf_level = textAt(predicted, 'conf_level');

  if (score_q === null || size_band === null || size_range_m === null || wind_state === null || conf_level === null) {
    return null;
  }
  return { score_q, size_band, size_range_m, wind_state, conf_level };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A field the row needs as words. An empty string is absence wearing a costume. */
function textAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function countAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metreRangeAt(source: Record<string, unknown>, key: string): readonly [number, number] | null {
  const value = source[key];
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [low, high] = value as readonly unknown[];
  if (typeof low !== 'number' || !Number.isFinite(low)) return null;
  if (typeof high !== 'number' || !Number.isFinite(high)) return null;
  return [low, high];
}
