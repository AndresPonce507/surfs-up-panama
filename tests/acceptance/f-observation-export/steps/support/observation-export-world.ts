// In-memory doubles and stored-item fixtures for the observation-export
// acceptance scenarios.
//
// <!-- DES-ENFORCEMENT : exempt --> The DES Stop hook misanchors on this
// repository (HANDOFF.md section 10 waiver, "Waivers, recorded rather than
// hidden"). Evidence for this step is the recorded RED, the focused acceptance
// run and the gate logs, never a hook's say-so.
//
// The two doubles below validate their inputs the way the real adapters do.
// A permissive double is a double that lies: DynamoDB rejects an empty table
// scan target, and S3 rejects an empty key, so a fake that accepted either
// would hide a wiring bug until production.
//
// Fixtures are the SHAPE src/report/aws-write-store.ts actually writes --
// `pk`/`sk`, three hoisted server fields, the client record nested under
// `record`, the reveal under `receipt` -- not the shape domain-model.md
// section 12 describes. The deployed store is the authority here.

import assert from 'node:assert/strict';

import type { AbuseSignalsStore, ObservationLogStore, StoredItemReader } from '../../../../../src/export/ports';
import type { SpotCoordinate } from '../../../../../src/pipeline/adapters/spot-coordinates';

/** The two seeded beaches these scenarios use, lat/lon verbatim from data/spots/pa-pacific.yaml. */
export const SEEDED_SPOTS: readonly SpotCoordinate[] = [
  { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 },
  { spot_id: 'santa-catalina-la-punta', lat: 7.6342047, lon: -81.2546103 },
];

/** A clock frozen at one instant, because nothing in the core may read the ambient one. */
export class FrozenClock {
  constructor(private instant: Date) {}

  now(): Date {
    return this.instant;
  }

  set(iso: string): void {
    this.instant = new Date(iso);
  }
}

/** A scan that hands back whatever the table holds, and can never write to it. */
export class InMemoryItemReader implements StoredItemReader {
  private readonly items: unknown[] = [];

  add(item: unknown): void {
    assert.ok(item !== undefined, 'a write store never holds an undefined item');
    this.items.push(item);
  }

  async scanItems(): Promise<readonly unknown[]> {
    return [...this.items];
  }
}

/**
 * Write-once object storage: the first writer of a key wins, exactly as S3
 * If-None-Match does.
 *
 * It stands in for BOTH narrow write capabilities the run is handed -- the
 * observation log and the ops signals file -- because they are the same
 * contract over two different prefixes, which is exactly how the deployed
 * role's two prefix grants read.
 */
export class InMemoryLogStore implements ObservationLogStore, AbuseSignalsStore {
  readonly objects = new Map<string, string>();

  async putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    assert.equal(typeof key, 'string', 'S3 refuses a non-string key');
    assert.ok(key.length > 0, 'S3 refuses an empty key');
    assert.equal(typeof body, 'string', 'the log adapter encodes text, so a body must be a string');
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  /** Every line of every object, parsed, in key order. */
  lines(): Record<string, unknown>[] {
    return [...this.objects.keys()].sort().flatMap((key) => linesOf(this.objects.get(key) ?? ''));
  }

  /** Every line of one object, parsed. */
  linesUnder(key: string): Record<string, unknown>[] {
    return linesOf(this.objects.get(key) ?? '');
  }
}

function linesOf(body: string): Record<string, unknown>[] {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** The reveal block the store keeps under `receipt.predicted`. */
export type StoredPrediction = {
  readonly score_q: number;
  readonly size_band: string;
  readonly size_range_m: readonly [number, number];
  readonly wind_state: string;
  readonly conf_level: string;
};

export type StoredReportFixture = {
  readonly report_id: string;
  readonly spot_id: string;
  readonly device_id: string;
  readonly received_at: string;
  readonly predicted?: StoredPrediction | null;
  /** Defaults to the one age the row scenarios pin. The signals scenarios vary it: credential age IS the signal. */
  readonly credential_issued_at?: string;
  /** Defaults to the one answer the row scenarios pin. The signals scenarios vary it: band spread IS the signal. */
  readonly size_band?: string;
};

/** A live call, the five keys the store's PredictedCall carries. */
export const A_LIVE_CALL: StoredPrediction = {
  score_q: 82,
  size_band: 'waist_chest',
  size_range_m: [0.9, 1.4],
  wind_state: 'clean',
  conf_level: 'medium',
};

/** One accepted report item, shaped exactly as src/report/aws-write-store.ts stores it. */
export function storedReportItem(fixture: StoredReportFixture): Record<string, unknown> {
  const observedAt = fixture.received_at;
  return {
    pk: `REP#${fixture.report_id}`,
    sk: 'REPORT',
    report_id: fixture.report_id,
    device_id: fixture.device_id,
    received_at: fixture.received_at,
    credential_issued_at: fixture.credential_issued_at ?? '2026-07-01T12:00:00Z',
    record: {
      report_id: fixture.report_id,
      spot_id: fixture.spot_id,
      observed_at: observedAt,
      submitted_at: observedAt,
      size_band: fixture.size_band ?? 'waist_chest',
      size_band_schema: 1,
      wind: 'choppy',
      quality: 'good',
      trigger: 'organic',
      photo_ids: ['ph_never_exported'],
    },
    receipt: {
      outcome: fixture.predicted === undefined || fixture.predicted === null ? 'no_snapshot' : 'compared',
      report_id: fixture.report_id,
      predicted: fixture.predicted ?? null,
      counter: { n_reports: 3, threshold: 30 },
    },
  };
}

/** The three non-report shapes the table holds today. None of them is an observation. */
export const NON_REPORT_ITEMS: readonly Record<string, unknown>[] = [
  { pk: 'CRED#d_abc', sk: 'MINT', device_id: 'd_abc', issued_at: '2026-07-01T12:00:00Z', src_hash: 'sh_secret' },
  { pk: 'DEV#d_abc', sk: 'QUOTA#2026-08-12', reports: 2 },
  { pk: 'SPOT#playa-venao', sk: 'COUNTER', n_reports: 41 },
];

export type MintLedgerFixture = {
  readonly device_id: string;
  readonly issued_at: string;
  readonly src_hash: string;
};

/**
 * One mint-ledger item, the shape src/report/aws-write-store.ts writes under
 * `CRED#<device_id>` / `MINT`.
 *
 * `src_hash` exists on this shape and on no other. It is the join key the
 * trailing-week mint signal counts on, and it is the one field that must reach
 * the ops file while never reaching a single line of the observation log
 * (07-write-path.md section 7.4 for the first half, R5 for the second).
 */
export function mintLedgerItem(fixture: MintLedgerFixture): Record<string, unknown> {
  return {
    pk: `CRED#${fixture.device_id}`,
    sk: 'MINT',
    device_id: fixture.device_id,
    issued_at: fixture.issued_at,
    issued_at_epoch: Math.floor(Date.parse(fixture.issued_at) / 1000),
    src_hash: fixture.src_hash,
  };
}

/** A report item a partial write left behind: the sort key is right, the record is gone. */
export function halfWrittenReportItem(reportId: string): Record<string, unknown> {
  return {
    pk: `REP#${reportId}`,
    sk: 'REPORT',
    report_id: reportId,
    device_id: 'd_abc',
    received_at: '2026-08-12T15:00:00Z',
  };
}
