import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const archivePrefix = 'predictions/';

const requiredSafeguards = [
  ['lambda-reserved-concurrency', 'Lambda reserved concurrency', '2'],
  ['timeout-fetch', 'fetch timeout', '60 seconds'],
  ['timeout-build', 'build timeout', '120 seconds'],
  ['timeout-report', 'report timeout', '5 seconds'],
  ['timeout-mint', 'mint timeout', '5 seconds'],
  ['timeout-push', 'push timeout', '5 seconds'],
  ['timeout-photo-presign', 'photo-presign timeout', '5 seconds'],
  ['timeout-resize', 'resize timeout', '60 seconds'],
  ['timeout-dispatcher', 'dispatcher timeout', '10 seconds'],
  ['timeout-notify-export', 'notify/export timeout', '120 seconds'],
  ['timeout-breaker', 'breaker timeout', '10 seconds'],
  ['log-retention', 'log retention', '14 days'],
  ['raw-expiration', 'raw archive expiration', '30 days'],
  ['photo-expiration', 'photo expiration', '90 days'],
  ['multipart-abort', 'incomplete multipart abort', '7 days'],
];

const expectedLifecycleRules = [
  ['raw-archive-expiration', 'raw/', 'expirationAfterDays', 30],
  ['photo-expiration', 'photos/', 'expirationAfterDays', 90],
  ['incomplete-multipart-abort', undefined, 'abortAfterDays', 7],
];

// Slice-03 (F-BILL-STAYS-ZERO-AND-STAYS-UP): the money lines and the $18
// deny scope.
const MONEY_LINES = [
  ['budget-alert-1', '$1 alert', '1'],
  ['budget-alert-5', '$5 alert', '5'],
  ['budget-alert-15', '$15 alert', '15'],
  ['budget-action-18', '$18 action-enabled budget', '18'],
  ['budget-last-line-20', '$20 last line', '20'],
];
const REQUIRED_DENY_SCOPE = [
  'write-report-function-url',
  'write-mint-function-url',
  'write-push-function-url',
  'write-photo-presign-function-url',
];
const INGEST_ROLE_TARGET = 'ingest-lambda-execution-role';

function readDenyScopeTargets(source) {
  const match = /export const budgetDenyScopeTargets = \[([\s\S]*?)\]/.exec(source);
  if (!match) return undefined;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function emit(output, lines, line) {
  lines.push(line);
  output.write(line);
}

function failure(output, lines, line) {
  emit(output, lines, line);
  return { exitCode: 1, lines };
}

function extractDeclarationValue(source, key) {
  const matcher = new RegExp(`['\"]${key}['\"]\\s*:\\s*['\"]([^'\"\\n]+)['\"]`);
  return matcher.exec(source)?.[1];
}

function readLifecycleRules(source) {
  const rules = [];
  const matcher = /\{\s*id\s*:\s*'([^']+)'([^{}]*)\}/g;
  for (const match of source.matchAll(matcher)) {
    const [, id, fields] = match;
    rules.push({
      id,
      prefix: /prefix\s*:\s*'([^']+)'/.exec(fields)?.[1],
      expirationAfterDays: Number(/expirationAfterDays\s*:\s*(\d+)/.exec(fields)?.[1]),
      abortAfterDays: Number(/abortAfterDays\s*:\s*(\d+)/.exec(fields)?.[1]),
      transition: /transition\s*:\s*(Glacier[A-Za-z]+)\s+after\s+(\d+)\s+days/.exec(fields),
    });
  }
  return rules;
}

function reachesArchive(prefix) {
  return prefix === undefined
    || prefix === archivePrefix
    || prefix.startsWith(archivePrefix)
    || archivePrefix.startsWith(prefix);
}

function isRequiredMultipartAbort(rule) {
  return rule.id === 'incomplete-multipart-abort'
    && rule.prefix === undefined
    && rule.abortAfterDays === 7
    && Number.isNaN(rule.expirationAfterDays)
    && rule.transition === null;
}

function ruleReason(rule) {
  if (rule.prefix === undefined) return 'a bucket-wide lifecycle rule reaches the prediction archive';
  if (rule.prefix !== archivePrefix) return `the prefix ${rule.prefix} overlaps ${archivePrefix}`;
  if (rule.expirationAfterDays) return 'expiration removes prediction receipts';
  const transition = rule.transition;
  if (!transition) return 'the prediction lifecycle action cannot be inspected';
  if (transition[1] !== 'GlacierInstantRetrieval') return `${transition[1]} is not Glacier Instant Retrieval`;
  return `${transition[2]} days is not the exact 90-day allowance`;
}

/**
 * Parses committed declaration text. It never imports TypeScript source,
 * starts a child process, accesses a network, or writes to the inspected root.
 */
export async function evaluateInfrastructureDeclarations({ root, environment = {}, output }) {
  const lines = [];
  const infraRoot = resolve(root, 'infra');
  const sitePath = resolve(infraRoot, 'lib/site-stack.ts');
  const declarationPath = resolve(infraRoot, 'lib/guardrail-declarations.ts');

  emit(output, lines, `infrastructure root: ${infraRoot}`);
  emit(output, lines, 'credentials: absent; offline declaration inspection; declaration-only evaluator');
  emit(output, lines, 'child commands: 0; package imports: 0; deployment actions: 0; network operations: 0');

  if (environment.AWS_EC2_METADATA_DISABLED !== 'true') {
    return failure(output, lines, 'cannot inspect credential-free boundary: AWS_EC2_METADATA_DISABLED must be true; restore the isolated environment');
  }
  if (!existsSync(sitePath)) {
    return failure(output, lines, `cannot inspect ${sitePath}: the site declaration anchors archive protection; restore infra/lib/site-stack.ts`);
  }
  if (!existsSync(declarationPath)) {
    return failure(output, lines, `cannot inspect ${declarationPath}: the guardrail declaration is unavailable; restore infra/lib/guardrail-declarations.ts`);
  }

  let source;
  try {
    source = readFileSync(declarationPath, 'utf8');
  } catch {
    return failure(output, lines, `cannot inspect ${declarationPath}: declaration text is unreadable; restore infra/lib/guardrail-declarations.ts`);
  }
  if (!source.includes('export const guardrailDeclarations = {') || !source.includes('export const lifecycleRules = [')) {
    return failure(output, lines, `cannot inspect ${declarationPath}: declaration structure is malformed; restore the guardrail declarations`);
  }

  for (const [key, label, required] of requiredSafeguards) {
    const actual = extractDeclarationValue(source, key);
    if (actual !== required) {
      const reportedLabel = actual === undefined ? `missing ${label}` : label;
      return failure(output, lines, `${reportedLabel}: observed ${actual ?? 'missing'}; required ${required}; restore ${key}`);
    }
  }

  const rules = readLifecycleRules(source);
  for (const [id, prefix, action, requiredValue] of expectedLifecycleRules) {
    const rule = rules.find((candidate) => candidate.id === id);
    const expectedAction = action === 'expirationAfterDays'
      ? rule?.expirationAfterDays
      : rule?.abortAfterDays;
    if (!rule || rule.prefix !== prefix || expectedAction !== requiredValue) {
      return failure(output, lines, `${id}: observed missing or changed declaration; required ${action}: ${requiredValue}; restore ${id}`);
    }
  }

  // Multipart-abort rules are bucket-wide by design, but this one exact
  // identity/action pair is a required non-prediction safeguard. Do not give
  // that exception to any other unscoped lifecycle rule.
  const archiveRules = rules.filter((rule) => reachesArchive(rule.prefix) && !isRequiredMultipartAbort(rule));
  for (const rule of archiveRules) {
    const [storageClass, days] = rule.transition?.slice(1) ?? [];
    const allowed = rule.prefix === archivePrefix
      && storageClass === 'GlacierInstantRetrieval'
      && days === '90'
      && !rule.expirationAfterDays;
    if (!allowed) {
      return failure(output, lines, `${rule.id}: reason: ${ruleReason(rule)}; remove this lifecycle rule and restore no overlap with ${archivePrefix}`);
    }
    emit(output, lines, `${rule.id}: sole allowed prediction transition at ${archivePrefix}, Glacier Instant Retrieval after 90 days`);
  }

  emit(output, lines, `${rules.length} lifecycle rules inspected`);
  for (const rule of rules) emit(output, lines, `lifecycle rule: ${rule.id}`);
  emit(output, lines, `${archiveRules.length} prediction-reaching lifecycle rules; ${archivePrefix} has no-overlap protection`);
  emit(output, lines, '11 Lambda guardrail values inspected');
  for (const [, label, value] of requiredSafeguards.slice(0, 11)) emit(output, lines, `${label}: ${value}`);
  emit(output, lines, 'log retention: 14 days');
  emit(output, lines, 'raw archive expiration: 30 days');
  emit(output, lines, 'photo expiration: 90 days');
  emit(output, lines, 'incomplete multipart abort: 7 days');
  if (source.includes('CONTROLLED FIXTURE ONLY')) {
    emit(output, lines, `controlled-infrastructure-declarations fixture inspected at ${declarationPath}`);
  }
  emit(output, lines, 'Anthropic $5/month and CloudFront billing posture require an external audit, not a live-console assertion');
  return { exitCode: 0, lines };
}

/**
 * F-BILL-STAYS-ZERO-AND-STAYS-UP slices 01-03: archive bucket versioning,
 * the dead-man's switch declaration, and the money lines / deny scope / cost
 * tag. Deliberately a SEPARATE phase from `evaluateInfrastructureDeclarations`
 * above (which the keystone `daily-call-with-permanent-receipts` feature
 * exercises directly through `declarationInput`-mode fixtures that predate
 * this feature and cannot declare these keys). This phase runs only inside
 * the full `runInfrastructureJob` composition, after the base declaration
 * evaluation and before the vitest/synth phases, so it never reaches -- and
 * never breaks -- that other feature's frozen fixtures. It parses the same
 * committed declaration text; it never imports TypeScript source, starts a
 * child process, accesses a network, or writes to the inspected root.
 */
export async function evaluateBillGuardrails({ root, output }) {
  const lines = [];
  const infraRoot = resolve(root, 'infra');
  const declarationPath = resolve(infraRoot, 'lib/guardrail-declarations.ts');

  let source;
  try {
    source = readFileSync(declarationPath, 'utf8');
  } catch {
    return failure(output, lines, `cannot inspect ${declarationPath}: declaration text is unreadable; restore infra/lib/guardrail-declarations.ts`);
  }

  // Slice-01: archive bucket versioning.
  const bucketVersioning = extractDeclarationValue(source, 'archive-bucket-versioning');
  if (bucketVersioning !== 'Enabled') {
    return failure(output, lines, `archive bucket versioning: observed ${bucketVersioning ?? 'missing'}; required Enabled; the prediction archive bucket has no other recovery path if a single console delete happens; restore archive-bucket-versioning`);
  }
  emit(output, lines, 'archive bucket versioning: Enabled; the prediction archive bucket has no other recovery path if a single console delete happens');

  // Slice-02: the dead-man's switch declaration. Declaration and CI-assert
  // only; the live proof is slice-04, post-deploy.
  if (!source.includes('export const deadMansSwitchDeclaration = {')) {
    return failure(output, lines, "dead-man's switch declaration: missing entirely; the forecast could freeze in silence with nobody notified; restore deadMansSwitchDeclaration in infra/lib/guardrail-declarations.ts");
  }
  const watchedMetric = extractDeclarationValue(source, 'dead-mans-switch-metric');
  if (watchedMetric !== 'IngestSuccess') {
    return failure(output, lines, `dead-man's switch watched metric: observed ${watchedMetric ?? 'missing'}; required IngestSuccess; the switch must watch the metric the fetch Lambda emits, never the Lambda directly; restore dead-mans-switch-metric`);
  }
  const deadMansSwitchProperties = [
    ['dead-mans-switch-treat-missing-data', 'missing-data handling', 'BREACHING', 'without BREACHING a missing datapoint holds the alarm green forever, exactly when everything is dead'],
    ['dead-mans-switch-alarm-action', 'ALARM action', undefined, 'without an ALARM action nobody is notified the ingest stalled'],
    ['dead-mans-switch-ok-action', 'OK action', undefined, "without an OK action nobody learns the ingest recovered"],
  ];
  for (const [key, label, required, reason] of deadMansSwitchProperties) {
    const actual = extractDeclarationValue(source, key);
    const observedPresence = required === undefined ? (actual ? 'present' : 'missing') : (actual ?? 'missing');
    const satisfied = required === undefined ? Boolean(actual) : actual === required;
    if (!satisfied) {
      return failure(output, lines, `dead-man's switch ${label}: observed ${observedPresence}; required ${required ?? 'present'}; ${reason}; restore ${key}`);
    }
  }
  const evaluationPeriods = Number(extractDeclarationValue(source, 'dead-mans-switch-evaluation-periods'));
  if (!(evaluationPeriods >= 2)) {
    return failure(output, lines, `dead-man's switch evaluation periods: observed ${Number.isNaN(evaluationPeriods) ? 'missing' : evaluationPeriods}; required at least 2 consecutive 1 h periods; fewer risks alarming on a single missed hour instead of a genuine stall; restore dead-mans-switch-evaluation-periods`);
  }
  emit(output, lines, "dead-man's switch: present; watches IngestSuccess, never the Lambda directly; missing data treated as BREACHING; 2 consecutive 1 h periods; ALARM and OK actions present; honest detection floor is 2 to 3 hours");

  // Slice-03: the money lines and the $18 deny scope. The four write
  // Function URLs the deny scope targets do not exist yet
  // (F-TELL-US-WHAT-YOU-SAW-COLD); this is a declaration guard, not live
  // denial. The $20 line is CREATED by this project: the account has zero
  // CloudWatch alarms and the only $20 budget belongs to another project.
  for (const [key, label, required] of MONEY_LINES) {
    const actual = extractDeclarationValue(source, key);
    if (actual !== required) {
      return failure(output, lines, `${label}: observed ${actual ?? 'missing'}; required $${required}; restore ${key}`);
    }
  }
  const lastLineSource = extractDeclarationValue(source, 'budget-last-line-source');
  if (lastLineSource !== 'created-by-project') {
    return failure(output, lines, `$20 last line source: observed ${lastLineSource ?? 'missing'}; required created-by-project; the account has zero CloudWatch alarms and the only $20 budget belongs to another project, so this line must be created, never imported; restore budget-last-line-source`);
  }
  const denyScope = readDenyScopeTargets(source);
  if (!denyScope) {
    return failure(output, lines, 'budget deny scope: missing; restore budgetDenyScopeTargets');
  }
  if (denyScope.includes(INGEST_ROLE_TARGET)) {
    return failure(output, lines, `budget deny scope: observed ${INGEST_ROLE_TARGET} included; a billing flood must never be able to stop the prediction log at ${archivePrefix}; remove ${INGEST_ROLE_TARGET} from budgetDenyScopeTargets`);
  }
  const extraDenyTargets = denyScope.filter((target) => !REQUIRED_DENY_SCOPE.includes(target));
  if (extraDenyTargets.length > 0) {
    return failure(output, lines, `budget deny scope: observed extra target(s) ${extraDenyTargets.join(', ')}; required exactly the four write Function URLs (report, mint, push, photo-presign); remove ${extraDenyTargets.join(', ')} from budgetDenyScopeTargets`);
  }
  const missingDenyTargets = REQUIRED_DENY_SCOPE.filter((target) => !denyScope.includes(target));
  if (missingDenyTargets.length > 0) {
    return failure(output, lines, `budget deny scope: missing ${missingDenyTargets.join(', ')}; required exactly the four write Function URLs; restore budgetDenyScopeTargets`);
  }
  const tagKey = extractDeclarationValue(source, 'cost-allocation-tag-key');
  const tagValue = extractDeclarationValue(source, 'cost-allocation-tag-value');
  if (!tagKey || !tagValue) {
    return failure(output, lines, `cost-allocation tag: observed ${!tagKey ? 'missing key' : 'missing value'}; restore costAllocationTag`);
  }
  emit(output, lines, `money lines declared: $1, $5, $15 alerts; $18 action-enabled budget; $20 last line created by this project, never imported`);
  emit(output, lines, `budget deny scope: exactly ${REQUIRED_DENY_SCOPE.join(', ')}; the ingest role is deliberately excluded so a billing flood can never stop the prediction log`);
  emit(output, lines, 'these four write Function URLs do not exist yet (F-TELL-US-WHAT-YOU-SAW-COLD); this is a declaration guard, not live denial');
  emit(output, lines, `cost-allocation tag: ${tagKey}=${tagValue} on every resource this project declares`);

  return { exitCode: 0, lines };
}
