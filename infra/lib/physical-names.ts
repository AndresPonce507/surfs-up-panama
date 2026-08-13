// Deterministic physical names shared by the four real stacks. Cross-stack
// references go through these literals instead of CloudFormation exports so
// each stack deploys independently in the mandated order (site, ingest,
// observability, then write LAST) without export/import coupling. The one
// exception is the site origin, which is unknowable before the distribution
// exists and therefore crosses stacks as a real CloudFormation export.

export const projectAccountId = '602167897909';
export const projectRegion = 'us-east-1';

export const siteBucketName = `surfs-up-panama-site-${projectAccountId}`;

export const functionNames = {
  fetch: 'surfs-up-panama-fetch',
  build: 'surfs-up-panama-build',
  report: 'surfs-up-panama-report',
  mint: 'surfs-up-panama-mint',
  push: 'surfs-up-panama-push',
  // The SEND lane, and a different function from `push` above: `push` is the
  // POST /api/push subscribe endpoint behind a Function URL, `notify` is the
  // hourly scheduled fan-out that is never on the request path
  // (07-write-path.md section 2's function table; section 8.6 draws them as
  // two participants).
  notify: 'surfs-up-panama-notify',
  'photo-presign': 'surfs-up-panama-photo-presign',
  resize: 'surfs-up-panama-resize',
  breaker: 'surfs-up-panama-breaker',
  // The tenth function: the nightly observation export + abuse signals
  // (07-write-path.md section 2's function table row `export`;
  // adr-observation-export.md). Scheduled at 00:30 UTC, never on the
  // request path.
  export: 'surfs-up-panama-export',
} as const;

export const opsAlarmTopicName = 'surfs-up-panama-alarms';
export const breakerTopicName = 'surfs-up-panama-breaker';
export const siteOriginExportName = 'SurfsUpPanamaSiteOrigin';

// Public on purpose: this address is already the public git identity on
// every commit in this public repository.
export const alarmEmail = 'andresponce0001@gmail.com';

export const metricNamespace = 'SurfsUpPanama';
export const restoreSchedulePrefix = 'surfs-up-panama-breaker-restore';
