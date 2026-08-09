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
