import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const archivePrefix = 'predictions/';

const requiredSafeguards = [
  ['lambda-reserved-concurrency', 'Lambda reserved concurrency', '2'],
  ['timeout-fetch', 'fetch timeout', '60 seconds'],
  ['timeout-build', 'build timeout', '420 seconds'],
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

// F-TELL-US-WHAT-YOU-SAW-COLD slice-02: the write-address cost boundaries.
// Posture and origin come from adr-write-path-off-cloudfront.md; the
// concurrency ceilings are 07-write-path.md section 7.2 control 0.2.
const WRITE_URL_POSTURES = [
  ['report-url-auth', 'report Function URL auth', 'anonymous reports must not need a sign-in route'],
  ['mint-url-auth', 'mint Function URL auth', 'anonymous reports must not need a sign-in route'],
  ['push-url-auth', 'push Function URL auth', 'delivery subscriptions must be callable from the site'],
  ['photo-presign-url-auth', 'photo-presign Function URL auth', 'the public write address must retain its settled posture'],
];

const WRITE_URL_ORIGINS = [
  ['report-url-origin', 'report Function URL origin'],
  ['mint-url-origin', 'mint Function URL origin'],
  ['push-url-origin', 'push Function URL origin'],
  ['photo-presign-url-origin', 'photo-presign Function URL origin'],
];

const LOOSE_ORIGIN_REASON = 'a loose origin lets another site spend the write budget';
const ONE_SITE_ORIGIN = 'one shared absolute https site origin, never *';

const WRITE_CONCURRENCY_CEILINGS = [
  ['report-limit', 'report reserved concurrency', '2', 'the report flood ceiling is no longer bounded'],
  ['mint-limit', 'mint reserved concurrency', '1', 'mint traffic can outrun its cost ceiling'],
  ['push-limit', 'push reserved concurrency', '1', 'push traffic can outrun its cost ceiling'],
  ['photo-presign-limit', 'photo-presign reserved concurrency', '1', 'presign traffic can outrun its cost ceiling'],
];

const WRITE_ADDRESS_NAMES = ['report', 'mint', 'push', 'photo-presign'];

// 07-write-path.md section 7.2 control 0.4 and adr-write-store-provisioned-
// capacity.md: fixed capacity is what makes the store throttle for free
// instead of billing. On-demand would make the bill the only limit.
const WRITE_STORE_CAPACITY = [
  ['table-billing-mode', 'write table billing mode', 'PROVISIONED', 'on-demand writes make the bill the only limit'],
  ['table-read-capacity', 'write table read capacity', '25', 'the fixed free-tier read ceiling must not drift'],
  ['table-write-capacity', 'write table write capacity', '25', 'the fixed free-tier write ceiling must not drift'],
];

// Control 0.6: one circuit breaker per write function on the free Invocations
// metric. Presence only here -- the thresholds live in write-declarations.ts
// and the synth guardrail proves the alarms exist on the real template.
const WRITE_BREAKER_ALARMS = [
  ['report-breaker-alarm', 'report breaker alarm', 'declared', 'a report flood can keep spending without an alarm'],
  ['mint-breaker-alarm', 'mint breaker alarm', 'declared', 'a mint flood can keep spending without an alarm'],
  ['push-breaker-alarm', 'push breaker alarm', 'declared', 'a push flood can keep spending without an alarm'],
  ['photo-presign-breaker-alarm', 'photo-presign breaker alarm', 'declared', 'a presign flood can keep spending without an alarm'],
];

// Control 0.10, and the deliberate removal of guardrail 7's per-IP rows:
// Panama runs carrier-grade NAT, so one mobile IP is a whole town at the
// beach while an attacker rotates cloud IPs for cents. Quotas are device-only.
// Which document these ceilings may be sized from. 07-write-path.md section
// 12's write-path arithmetic is falsified, so a guard that leans on it is
// guarding nothing; system-architecture.md section 6.1 is the corrected
// sizing of record and the only source the green result may cite.
const CORRECTED_SIZING_SOURCE = [
  ['sizing-source', 'corrected sizing source', 'system-architecture.md section 6.1', 'the write-path arithmetic is falsified and cannot set a budget guard'],
];

const DEVICE_QUOTA_LIMITS = [
  ['report-device-limit', 'report device daily limit', '20', 'anonymous reports need the settled daily device ceiling'],
  ['presign-device-limit', 'presign device daily limit', '10', 'photo grants need the settled daily device ceiling'],
  ['subscription-device-limit', 'subscription device daily limit', '20', 'subscription writes need the settled daily device ceiling'],
  ['quota-identity', 'quota identity', 'device-only', 'per-IP quotas do not match the anonymous credential boundary'],
];

function satisfiedProtection(key, protection) {
  return { key, protection, status: 'satisfied' };
}

function refusedProtection(key, protection, observed, required, why) {
  return { key, protection, status: 'refused', observed, required, why, repair: `restore ${key}` };
}

function declaredValue(declarations, key) {
  const value = declarations[key];
  return value === undefined || value === '' ? 'missing' : value;
}

function assessFixedValue(declarations, [key, protection, required, why]) {
  const observed = declaredValue(declarations, key);
  return observed === required
    ? satisfiedProtection(key, protection)
    : refusedProtection(key, protection, observed, required, why);
}

/**
 * An exact site origin is one absolute https origin and nothing else: no '*',
 * no scheme-less host, no path. CORS is browser-only discipline, so the value
 * this guards is that the four addresses stay bound to the same single site.
 */
function isExactSiteOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.origin === origin;
  } catch {
    // '*', 'missing' and every scheme-less host land here: not a site origin.
    return false;
  }
}

/**
 * The one origin the four write addresses agree on. Structural on purpose: the
 * deployment imports the live origin from the site stack, so the guard is that
 * all four declare the same exact site origin, not which host it happens to be.
 */
function agreedSiteOrigin(observedOrigins) {
  const tally = new Map();
  for (const origin of observedOrigins) tally.set(origin, (tally.get(origin) ?? 0) + 1);
  const [agreed, count] = [...tally].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (count === undefined || count < 2 || !isExactSiteOrigin(agreed)) return undefined;
  return agreed;
}

function assessOrigins(declarations) {
  const observedOrigins = WRITE_URL_ORIGINS.map(([key]) => declaredValue(declarations, key));
  const agreed = agreedSiteOrigin(observedOrigins);
  return WRITE_URL_ORIGINS.map(([key, protection], index) => {
    const observed = observedOrigins[index];
    if (agreed === undefined) return refusedProtection(key, protection, observed, ONE_SITE_ORIGIN, LOOSE_ORIGIN_REASON);
    return observed === agreed
      ? satisfiedProtection(key, protection)
      : refusedProtection(key, protection, observed, agreed, LOOSE_ORIGIN_REASON);
  });
}

/**
 * Pure declaration policy. Given the declared write-path values, returns one
 * protection slot per declared boundary. This is the evaluation port the
 * property tests drive; it reads nothing and writes nothing.
 */
export function assessWritePathDeclarations(declarations) {
  return [
    ...WRITE_URL_POSTURES.map(([key, protection, why]) => assessFixedValue(declarations, [key, protection, 'NONE', why])),
    ...assessOrigins(declarations),
    ...WRITE_CONCURRENCY_CEILINGS.map((ceiling) => assessFixedValue(declarations, ceiling)),
    ...WRITE_STORE_CAPACITY.map((capacity) => assessFixedValue(declarations, capacity)),
    ...WRITE_BREAKER_ALARMS.map((alarm) => assessFixedValue(declarations, alarm)),
    ...DEVICE_QUOTA_LIMITS.map((limit) => assessFixedValue(declarations, limit)),
    ...CORRECTED_SIZING_SOURCE.map((source) => assessFixedValue(declarations, source)),
  ];
}

function readWritePathDeclarations(source) {
  const block = /export const writePathGuardrailDeclarations = \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)].map((entry) => [entry[1], entry[2]]));
}

/**
 * F-TELL-US-WHAT-YOU-SAW-COLD slice-02: the write-address cost boundaries a
 * deployer must be able to read before any write resource exists. A separate
 * phase from the two above for the same reason they are separate from each
 * other: the keystone feature's frozen `declarationInput`-mode fixtures predate
 * these keys and must never reach this check. It parses the same committed
 * declaration text; it never imports TypeScript source, starts a child process,
 * accesses a network, or writes to the inspected root.
 */
export async function evaluateWritePathGuardrails({ root, output }) {
  const lines = [];
  const declarationPath = resolve(root, 'infra', 'lib/guardrail-declarations.ts');

  let source;
  try {
    source = readFileSync(declarationPath, 'utf8');
  } catch {
    return failure(output, lines, `cannot inspect ${declarationPath}: declaration text is unreadable; restore infra/lib/guardrail-declarations.ts`);
  }
  if (!source.includes('export const writePathGuardrailDeclarations = {')) {
    return failure(output, lines, `cannot inspect ${declarationPath}: the write-path declarations are missing, so no write address, origin or concurrency ceiling can be checked; restore writePathGuardrailDeclarations in infra/lib/guardrail-declarations.ts`);
  }

  const declarations = readWritePathDeclarations(source);
  const slots = assessWritePathDeclarations(declarations);
  const refusals = slots.filter((slot) => slot.status === 'refused');
  if (refusals.length > 0) {
    for (const slot of refusals) {
      emit(output, lines, `${slot.protection}: observed ${slot.observed}; required ${slot.required}; ${slot.why}; ${slot.repair}`);
    }
    return { exitCode: 1, lines };
  }

  const siteOrigin = declarations['report-url-origin'];
  emit(output, lines, `write addresses: ${WRITE_ADDRESS_NAMES.join(', ')}; AuthType: NONE on every one; CORS bound to the exact site origin ${siteOrigin}, never *`);
  emit(output, lines, `reserved concurrency ceilings: ${WRITE_CONCURRENCY_CEILINGS.map(([key, , required]) => `${key.replace(/-limit$/, '')} ${declarations[key] ?? required}`).join(', ')}`);
  emit(output, lines, `write store capacity: ${declarations['table-billing-mode']} at ${declarations['table-read-capacity']} RCU and ${declarations['table-write-capacity']} WCU, so it throttles for free instead of billing`);
  emit(output, lines, `four write breaker alarms declared: ${WRITE_ADDRESS_NAMES.join(', ')}`);
  emit(output, lines, `device-only daily quotas: ${declarations['report-device-limit']} reports, ${declarations['presign-device-limit']} presigns, ${declarations['subscription-device-limit']} subscription writes per device per day; no per-IP rows, because carrier-grade NAT makes one mobile address a whole beach town`);
  emit(output, lines, `write-path sizing source: ${declarations['sizing-source']}, the corrected sizing of record`);
  emit(output, lines, `write-path preflight: passed; ${slots.length} declared write-path protections inspected without AWS credentials`);
  return { exitCode: 0, lines };
}
