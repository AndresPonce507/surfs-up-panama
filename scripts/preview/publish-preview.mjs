#!/usr/bin/env node
// Publish dist/ to the ephemeral S3 + CloudFront preview used for examiner walks.
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
// Usage: node scripts/preview/publish-preview.mjs [--dist dist]

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BUCKET = 'surfs-up-panama-preview-602167897909';
const DISTRIBUTION = 'EH95FHQ75WCL3';

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

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function put(key, body, contentType) {
  await run('aws', [
    's3api',
    'put-object',
    '--bucket',
    BUCKET,
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

async function main() {
  const distArg = process.argv.indexOf('--dist');
  const distDir = distArg === -1 ? 'dist' : process.argv[distArg + 1];

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

  let canonical = 0;
  let directoryAliases = 0;

  for (const file of files) {
    const key = relative(distDir, file).split(sep).join('/');
    const type = contentTypeFor(key);

    await put(key, file, type);
    canonical += 1;

    // `spots/playa-venao.html` also lands at the literal key
    // `spots/playa-venao/`, so the directory-form link resolves. `index.html`
    // is already served by the distribution's DefaultRootObject.
    const directoryAlias = directoryAliasFor(key);
    if (directoryAlias !== undefined) {
      await put(directoryAlias, file, type);
      directoryAliases += 1;
    }
  }

  const { stdout } = await run('aws', [
    'cloudfront',
    'create-invalidation',
    '--distribution-id',
    DISTRIBUTION,
    '--paths',
    '/*',
    '--query',
    'Invalidation.Id',
    '--output',
    'text',
  ]);

  console.log(
    `Published ${canonical} objects and ${directoryAliases} directory aliases. Invalidation ${stdout.trim()}.`,
  );
  console.log(`https://d1j9u9fxnap4es.cloudfront.net/`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
