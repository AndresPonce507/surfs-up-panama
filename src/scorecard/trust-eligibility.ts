import type { SurfReport } from './pairing';

export type TrustGateConfig = {
  readonly min_credential_age_days: number;
  readonly min_prior_reports: number;
  readonly min_prior_spots: number;
};

const millisecondsPerDay = 86_400_000;

const dateValue = (value: string): number => new Date(value).valueOf();

const hasReceiptAge = (report: SurfReport, minimumDays: number): boolean =>
  dateValue(report.received_at) - dateValue(report.credential_issued_at) >= minimumDays * millisecondsPerDay;

const earlierReportsFor = (
  report: SurfReport,
  reports: readonly SurfReport[],
  resolveReporter: (deviceId: string) => string,
): readonly SurfReport[] => {
  const reporter = resolveReporter(report.device_id);
  const receivedAt = dateValue(report.received_at);
  return reports.filter(
    (candidate) => resolveReporter(candidate.device_id) === reporter && dateValue(candidate.received_at) < receivedAt,
  );
};

const hasRequiredHistory = (
  report: SurfReport,
  reports: readonly SurfReport[],
  config: TrustGateConfig,
  resolveReporter: (deviceId: string) => string,
): boolean => {
  if (config.min_prior_reports === 0) return true;
  const earlier = earlierReportsFor(report, reports, resolveReporter);
  return (
    earlier.length >= config.min_prior_reports &&
    new Set(earlier.map((candidate) => candidate.spot_id)).size >= config.min_prior_spots
  );
};

const isEligible = (
  report: SurfReport,
  reports: readonly SurfReport[],
  config: TrustGateConfig,
  resolveReporter: (deviceId: string) => string,
): boolean => hasReceiptAge(report, config.min_credential_age_days) && hasRequiredHistory(report, reports, config, resolveReporter);

/** Filters only scorecard-gated samples using receipt-time identity evidence, never wall-clock time. */
export const eligibleReports = (
  reports: readonly SurfReport[],
  config: TrustGateConfig | null,
  resolveReporter: (deviceId: string) => string,
): readonly SurfReport[] =>
  config === null ? reports : reports.filter((report) => isEligible(report, reports, config, resolveReporter));
