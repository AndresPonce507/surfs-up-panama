// The only allowed public publication targets. A caller may choose a target,
// but never supply arbitrary bucket, distribution, or origin values. That
// keeps a typo from turning a release command into a cross-account publisher.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PUBLICATION_ORIGIN_RECEIPT = '.public-site-origin.json';
const RECEIPT_SCHEMA = 1;

export const PUBLICATION_TARGETS = Object.freeze({
  preview: Object.freeze({
    name: 'preview',
    origin: 'https://d1j9u9fxnap4es.cloudfront.net',
    bucket: 'surfs-up-panama-preview-602167897909',
    distribution: 'EH95FHQ75WCL3',
  }),
  production: Object.freeze({
    name: 'production',
    origin: 'https://d1dtqpd8bf3oze.cloudfront.net',
    bucket: 'surfs-up-panama-site-602167897909',
    distribution: 'E30CRNEUVE67RM',
  }),
});

export const DEFAULT_PUBLICATION_TARGET = 'preview';

export function publicationOriginReceipt(origin) {
  return `${JSON.stringify({ schema: RECEIPT_SCHEMA, origin }, null, 2)}\n`;
}

/**
 * A static build bakes its absolute host into canonical, Open Graph and share
 * URLs. The build writes this receipt alongside the output; publication reads
 * it before AWS is ever invoked so a preview artifact cannot be relabelled as
 * a production release merely by changing the publisher's environment.
 */
export async function assertPublicationArtifactOrigin(distDir, expectedOrigin) {
  const receiptPath = join(distDir, PUBLICATION_ORIGIN_RECEIPT);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  } catch {
    throw new Error(
      `Publication refused: ${receiptPath} is missing or invalid. Rebuild with PUBLIC_SITE_ORIGIN=${expectedOrigin}.`,
    );
  }
  if (receipt?.schema !== RECEIPT_SCHEMA || receipt.origin !== expectedOrigin) {
    throw new Error(
      `Publication refused: artifact was built for ${String(receipt?.origin)}, not ${expectedOrigin}. Rebuild before publishing.`,
    );
  }
}

export function resolvePublicSiteOrigin(environment = process.env) {
  const value = environment.PUBLIC_SITE_ORIGIN ?? PUBLICATION_TARGETS.preview.origin;
  const url = new URL(value);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('PUBLIC_SITE_ORIGIN must be an absolute http(s) origin with no path, query, or fragment.');
  }
  return url.origin;
}

export function publicationTarget(name) {
  const target = PUBLICATION_TARGETS[name];
  if (target === undefined) {
    throw new Error(`Unknown publication target "${String(name)}". Use preview or production.`);
  }
  return target;
}

export function publicationPlan(argv, environment = process.env) {
  let targetName = DEFAULT_PUBLICATION_TARGET;
  let distDir = 'dist';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--target') {
      targetName = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--dist') {
      distDir = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown publication option "${String(argument)}". Use --target <preview|production> and --dist <directory>.`);
    }
  }
  if (distDir === '') throw new Error('Publication refused: --dist requires a directory.');
  const target = publicationTarget(targetName);
  const origin = resolvePublicSiteOrigin(environment);
  if (origin !== target.origin) {
    throw new Error(
      `Publication refused: target ${target.name} serves ${target.origin}, but PUBLIC_SITE_ORIGIN resolves to ${origin}. Build and publish against the same public origin.`,
    );
  }
  return { target, distDir, origin };
}
