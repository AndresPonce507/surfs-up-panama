// Trust eligibility for the nightly fit.
//
// This is a pure projection over immutable received records. It deliberately
// measures a credential's age at receipt, never at aggregation: a forged batch
// cannot become eligible merely by waiting in the log. At launch the settings
// are a proven no-op, but retaining the predicate makes the later policy flip
// a full recompute rather than a history rewrite.

export const TRUST_GATE_KEY = 'data/config/trust-gate.json';

export const SHIPPED_TRUST_GATE = Object.freeze({
  min_credential_age_days: 0,
  min_prior_reports: 0,
  min_prior_spots: 2,
});

export type TrustGate = {
  readonly min_credential_age_days: number;
  readonly min_prior_reports: number;
  readonly min_prior_spots: number;
};

/** The stored fields eligibility needs. `device_id` is the launch reporter_key. */
export type TrustRecord = {
  readonly spot_id?: string;
  readonly device_id?: string;
  readonly received_at?: string;
  readonly credential_issued_at?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Return the eligible slice without inspecting any ambient clock. Omitted
 * settings mean no gate at all. The prior-spots threshold belongs to the
 * history clause, so it is deliberately inactive when the required count of
 * prior reports is zero.
 */
export function eligibleTrustRecords<T extends TrustRecord>(records: readonly T[], gate?: TrustGate): T[] {
  if (gate === undefined) return [...records];
  return records.filter((record) => hasRequiredCredentialAge(record, gate) && hasRequiredHistory(record, records, gate));
}

/** Decode only a complete, non-negative config record. Invalid stored data does not become a partial policy. */
export function parseTrustGate(value: unknown): TrustGate | undefined {
  if (!isRecord(value)) return undefined;
  const age = value.min_credential_age_days;
  const reports = value.min_prior_reports;
  const spots = value.min_prior_spots;
  if (!isNonNegativeInteger(age) || !isNonNegativeInteger(reports) || !isNonNegativeInteger(spots)) return undefined;
  return {
    min_credential_age_days: age,
    min_prior_reports: reports,
    min_prior_spots: spots,
  };
}

function hasRequiredCredentialAge(record: TrustRecord, gate: TrustGate): boolean {
  if (gate.min_credential_age_days === 0) return true;
  const receivedAt = timestampOf(record.received_at);
  const issuedAt = timestampOf(record.credential_issued_at);
  return receivedAt !== null && issuedAt !== null && receivedAt - issuedAt >= gate.min_credential_age_days * DAY_MS;
}

function hasRequiredHistory(record: TrustRecord, allRecords: readonly TrustRecord[], gate: TrustGate): boolean {
  // `min_prior_spots` qualifies this clause. It cannot become an independent
  // launch gate, otherwise the shipped value of two would drop every report.
  if (gate.min_prior_reports === 0) return true;

  const reporter = record.device_id;
  const receivedAt = timestampOf(record.received_at);
  if (typeof reporter !== 'string' || receivedAt === null) return false;

  const priorReports = allRecords.filter(
    (candidate) => candidate.device_id === reporter && isEarlierThan(candidate.received_at, receivedAt),
  );
  const priorSpots = new Set(priorReports.map((candidate) => candidate.spot_id).filter(isNonEmptyString));
  return priorReports.length >= gate.min_prior_reports && priorSpots.size >= gate.min_prior_spots;
}

function isEarlierThan(iso: string | undefined, receivedAt: number): boolean {
  const candidateAt = timestampOf(iso);
  return candidateAt !== null && candidateAt < receivedAt;
}

function timestampOf(iso: string | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const timestamp = new Date(iso).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
