// Trust eligibility, 06-learning-layer.md section 7 (G2): which stored
// reports are allowed to count toward a learned correction.
//
// THERE ARE TWO CLAUSES, NOT THREE. 06 section 7 states the structure
// exactly, and getting it wrong drops every sample this slice has:
//
//   Age     | received_at - credential_issued_at >= min_credential_age_days
//   History | at received_at, >= min_prior_reports earlier stored reports by
//             the same reporter_key, spanning >= min_prior_spots distinct
//             spots
//
// "The spots clause qualifies the history clause: at min_prior_reports = 0 it
// is vacuous, which is why the shipped min_prior_spots: 2 is inactive at
// launch." So min_prior_spots is NEVER a standalone requirement. Read as one,
// it would reject every morning in this slice, because every synthetic
// morning is at a single spot.
//
// AGE AT RECEIPT, not age at aggregation (07 section 6). Both timestamps are
// server-set and frozen on the record, so eligibility is a pure function of
// the log plus the config: no wall clock is read here, a recompute months
// later reaches the same verdict, and a forged batch already stored cannot
// ripen into eligibility by waiting.
//
// FAIL CLOSED ABOVE ZERO. Both trust fields are optional at the type level,
// because src/learning/inputs.ts parses permissively and a row it could only
// partly make sense of still reaches this module. An absent timestamp must
// never read as the most favourable value. At a zero threshold absence is
// harmless -- nothing is being asked -- so the launch no-op is exact; above
// zero, a record that cannot prove its standing does not get the benefit of
// the doubt.
//
// The thresholds have ONE home: data/config/trust-gate.json (git, owned by
// 07 section 7.3). This module re-exports them typed; it never restates the
// numbers.

import shippedTrustGate from '../../data/config/trust-gate.json';
import type { ObservationRow } from './inputs';

const MILLISECONDS_PER_DAY = 86_400_000;

/** The three thresholds `data/config/trust-gate.json` carries (07 section 7.3). */
export type TrustGateConfig = {
  readonly min_credential_age_days: number;
  readonly min_prior_reports: number;
  readonly min_prior_spots: number;
};

/** The shipped thresholds, read from the one config file that owns them. */
export const SHIPPED_TRUST_GATE: TrustGateConfig = {
  min_credential_age_days: shippedTrustGate.min_credential_age_days,
  min_prior_reports: shippedTrustGate.min_prior_reports,
  min_prior_spots: shippedTrustGate.min_prior_spots,
};

/** The C5 resolution, domain-model.md section 8: `person_id ?? device_id`, resolved late. */
function reporterKeyOf(observation: ObservationRow): string | undefined {
  return observation.person_id ?? observation.device_id;
}

/**
 * Every stored report allowed to count toward the fit, in its stored order.
 * Order is preserved deliberately: the surviving samples must be summed over
 * the same multiset in the same order as an ungated run, or the shipped
 * no-op would not be bit-identical (01-15's determinism discipline).
 */
export function selectTrustEligible(
  observations: readonly ObservationRow[],
  config: TrustGateConfig,
): ObservationRow[] {
  if (isInactive(config)) return [...observations];
  return observations.filter((observation) =>
    isTrustEligible(observation, observations, config),
  );
}

/** At the shipped all-zero thresholds nothing is asked of anyone, so no report can be excluded. */
function isInactive(config: TrustGateConfig): boolean {
  return config.min_credential_age_days <= 0 && config.min_prior_reports <= 0;
}

function isTrustEligible(
  observation: ObservationRow,
  log: readonly ObservationRow[],
  config: TrustGateConfig,
): boolean {
  return (
    ageClauseHolds(observation, config) && historyClauseHolds(observation, log, config)
  );
}

/** `received_at - credential_issued_at >= min_credential_age_days`, both frozen at receipt. */
function ageClauseHolds(observation: ObservationRow, config: TrustGateConfig): boolean {
  if (config.min_credential_age_days <= 0) return true;
  const receivedMs = safeDateMs(observation.received_at);
  const issuedMs = safeDateMs(observation.credential_issued_at);
  if (receivedMs === null || issuedMs === null) return false;
  return (receivedMs - issuedMs) / MILLISECONDS_PER_DAY >= config.min_credential_age_days;
}

/**
 * At `received_at`, at least `min_prior_reports` earlier stored reports by
 * the same reporter_key, spanning at least `min_prior_spots` distinct spots.
 * The spots requirement qualifies those required prior reports; with none
 * required there is nothing to qualify, which is why the shipped
 * `min_prior_spots: 2` is inactive at launch.
 */
function historyClauseHolds(
  observation: ObservationRow,
  log: readonly ObservationRow[],
  config: TrustGateConfig,
): boolean {
  if (config.min_prior_reports <= 0) return true;
  const reporterKey = reporterKeyOf(observation);
  const receivedMs = safeDateMs(observation.received_at);
  if (reporterKey === undefined || receivedMs === null) return false;

  const priors = log.filter((candidate) => {
    if (reporterKeyOf(candidate) !== reporterKey) return false;
    const candidateMs = safeDateMs(candidate.received_at);
    return candidateMs !== null && candidateMs < receivedMs;
  });

  if (priors.length < config.min_prior_reports) return false;
  return new Set(priors.map((prior) => prior.spot_id)).size >= config.min_prior_spots;
}

function safeDateMs(iso: string | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}
