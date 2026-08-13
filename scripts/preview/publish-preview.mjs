#!/usr/bin/env node
// Publish dist/ to one approved S3 + CloudFront target. The default remains
// the examiner preview; production needs an explicit target and a matching
// PUBLIC_SITE_ORIGIN, so a preview build cannot accidentally become public.
//
// Why this is not a plain `aws s3 sync`:
//
// The build emits `format: 'file'` artifacts (`spots/playa-venao.html`) while
// every internal link is the directory form (`/spots/playa-venao/`). An S3 REST
// origin serves no index document, so those directory requests returned 403
// AccessDenied and every spot link on the hosted preview was dead. Local
// `astro preview` resolves directory URLs itself, which is why the gap only
// ever showed up against the hosted URL.
//
// The correct fix is a CloudFront viewer-request function; the code for it is
// committed beside this file at scripts/preview/clean-urls.js. The andres-cli
// identity is denied cloudfront:CreateFunction, so until that permission
// exists this script closes the gap at publish time by writing each page a
// second time at its literal directory key, which is the same trick that was
// already applied by hand to `manana/`.
//
// Publication is additive: this script only PUTs keys present in dist/ and
// their extensionless and directory aliases. It never lists or deletes bucket keys, so raw
// captures, prediction logs, and hourly publisher artifacts stay outside its
// blast radius. HTML is uploaded with no-cache, so no routine whole-
// distribution invalidation is needed.
//
// Usage:
//   node scripts/preview/publish-preview.mjs [--dist dist]
//   PUBLIC_SITE_ORIGIN=https://d1dtqpd8bf3oze.cloudfront.net \
//     node scripts/preview/publish-preview.mjs --target production [--dist dist]

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { assertPublicationArtifactOrigin, publicationPlan } from '../release/publication-target.mjs';

const run = promisify(execFile);

/** @typedef {(command: string, arguments_: string[]) => Promise<unknown>} CommandRunner */

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function contentTypeFor(path) {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return CONTENT_TYPES[path.slice(dot)] ?? 'application/octet-stream';
}

export function directoryAliasFor(key) {
  if (!key.endsWith('.html') || key === 'index.html') return undefined;
  return `${key.slice(0, -'.html'.length)}/`;
}

function extensionlessAliasFor(key) {
  if (!key.endsWith('.html') || key === 'index.html') return undefined;
  return key.slice(0, -'.html'.length);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** @param {CommandRunner} invoke */
async function put(target, key, body, contentType, invoke) {
  await invoke('aws', [
    's3api',
    'put-object',
    '--bucket',
    target.bucket,
    '--key',
    key,
    '--body',
    body,
    '--content-type',
    contentType,
    '--cache-control',
    'no-cache',
  ]);
}

/**
 * @param {{ target: { name: string, bucket: string }, distDir: string, origin: string }} plan
 * @param {CommandRunner} [invoke]
 */
export async function publishBuild({ target, distDir, origin }, invoke = /** @type {CommandRunner} */ (run)) {
  const distStat = await stat(distDir).catch(() => null);
  if (!distStat?.isDirectory()) {
    console.error(`No build artifact at ${distDir}. Run "npm run build" first.`);
    process.exit(1);
  }

  const files = await walk(distDir);
  if (files.length === 0) {
    console.error(`${distDir} is empty. Refusing to publish an empty preview.`);
    process.exit(1);
  }

  await assertPublicationArtifactOrigin(distDir, origin);

  let canonical = 0;
  let extensionlessAliases = 0;
  let directoryAliases = 0;

  for (const file of files) {
    const key = relative(distDir, file).split(sep).join('/');
    const type = contentTypeFor(key);

    await put(target, key, file, type, invoke);
    canonical += 1;

    // The S3 REST origin does no route rewrite. Keep both clean static keys
    // beside the emitted document, so a shared `/spots/.../reportar` link and
    // the site's canonical `/spots/.../reportar/` link serve the same page.
    // `index.html` is already served by the distribution's DefaultRootObject.
    const extensionlessAlias = extensionlessAliasFor(key);
    if (extensionlessAlias !== undefined) {
      await put(target, extensionlessAlias, file, type, invoke);
      extensionlessAliases += 1;
    }

    const directoryAlias = directoryAliasFor(key);
    if (directoryAlias !== undefined) {
      await put(target, directoryAlias, file, type, invoke);
      directoryAliases += 1;
    }
  }

  return { canonical, extensionlessAliases, directoryAliases };
}

async function main() {
  const plan = publicationPlan(process.argv.slice(2));
  const { canonical, extensionlessAliases, directoryAliases } = await publishBuild(plan);
  console.log(
    `Published ${canonical} objects, ${extensionlessAliases} extensionless aliases, and ${directoryAliases} directory aliases to ${plan.target.name}.`,
  );
  console.log(plan.origin);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
