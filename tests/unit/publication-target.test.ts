import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PUBLICATION_TARGETS,
  publicationOriginReceipt,
  publicationPlan,
  resolvePublicSiteOrigin,
} from '../../scripts/release/publication-target.mjs';
import { publishBuild } from '../../scripts/preview/publish-preview.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function builtArtifact(origin: string) {
  const directory = await mkdtemp(join(tmpdir(), 'publication-origin-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, '_astro'), { recursive: true });
  await Promise.all([
    writeFile(join(directory, '.public-site-origin.json'), publicationOriginReceipt(origin)),
    writeFile(join(directory, 'index.html'), '<html><head></head><body>home</body></html>'),
    writeFile(join(directory, 'manana.html'), '<html><head></head><body>tomorrow</body></html>'),
    writeFile(join(directory, '_astro', 'entry.js'), 'console.log(\'ready\')'),
  ]);
  return directory;
}

describe('publication origin seam', () => {
  it('keeps the local and preview default on the examiner origin', () => {
    expect(resolvePublicSiteOrigin({})).toBe(PUBLICATION_TARGETS.preview.origin);
    expect(publicationPlan([], {}).target).toEqual(PUBLICATION_TARGETS.preview);
  });

  it('requires the production build origin before selecting the production bucket', () => {
    expect(() => publicationPlan(['--target', 'production'], {})).toThrow(
      /PUBLIC_SITE_ORIGIN resolves to https:\/\/d1j9u9fxnap4es\.cloudfront\.net/,
    );
    expect(publicationPlan(['--target', 'production'], {
      PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
    })).toMatchObject({
      origin: PUBLICATION_TARGETS.production.origin,
      target: PUBLICATION_TARGETS.production,
      distDir: 'dist',
    });
  });

  it('rejects an origin mismatch or an arbitrary target before invoking AWS', () => {
    expect(() => publicationPlan(['--target', 'preview'], {
      PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
    })).toThrow(/Build and publish against the same public origin/);
    expect(() => publicationPlan(['--target', 'anything-else'], {})).toThrow(/Unknown publication target/);
  });

  it('accepts only an absolute origin for static canonical URLs', () => {
    expect(() => resolvePublicSiteOrigin({ PUBLIC_SITE_ORIGIN: 'https://d1dtqpd8bf3oze.cloudfront.net/release' }))
      .toThrow(/must be an absolute http\(s\) origin/);
  });

  it('refuses a preview-built artifact before production AWS publication can begin', async () => {
    const artifact = await builtArtifact(PUBLICATION_TARGETS.preview.origin);
    const plan = publicationPlan(['--target', 'production', '--dist', artifact], {
      PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
    });
    const calls: unknown[] = [];
    await expect(publishBuild(plan, async (...call) => { calls.push(call); }))
      .rejects.toThrow(/artifact was built for https:\/\/d1j9u9fxnap4es\.cloudfront\.net/);
    expect(calls).toEqual([]);
  });

  it('publishes canonical objects plus both clean-URL aliases without destructive or invalidation operations', async () => {
    const artifact = await builtArtifact(PUBLICATION_TARGETS.production.origin);
    const plan = publicationPlan(['--target', 'production', '--dist', artifact], {
      PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
    });
    const calls: Array<[string, string[]]> = [];
    const result = await publishBuild(plan, async (command, arguments_) => {
      calls.push([command, arguments_]);
    });

    expect(result).toMatchObject({ canonical: 4, extensionlessAliases: 1, directoryAliases: 1 });
    expect(calls).toHaveLength(6);
    expect(calls.every(([command, arguments_]) => command === 'aws' && arguments_[0] === 's3api' && arguments_[1] === 'put-object')).toBe(true);
    expect(calls.every(([, arguments_]) => arguments_.includes(PUBLICATION_TARGETS.production.bucket))).toBe(true);
    expect(calls.map(([, arguments_]) => arguments_[arguments_.indexOf('--key') + 1])).toEqual([
      '.public-site-origin.json',
      '_astro/entry.js',
      'index.html',
      'manana.html',
      'manana',
      'manana/',
    ]);
    expect(calls.flatMap(([, arguments_]) => arguments_).join(' ')).not.toMatch(/delete|sync|cloudfront|create-invalidation/i);
  });

  it('publishes the report route at its extensionless static key as well as its canonical and trailing-slash keys', async () => {
    const artifact = await builtArtifact(PUBLICATION_TARGETS.production.origin);
    const reportDirectory = join(artifact, 'spots', 'playa-venao');
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(join(reportDirectory, 'reportar.html'), '<html><head></head><body>report</body></html>');

    const plan = publicationPlan(['--target', 'production', '--dist', artifact], {
      PUBLIC_SITE_ORIGIN: PUBLICATION_TARGETS.production.origin,
    });
    const calls: Array<[string, string[]]> = [];
    await publishBuild(plan, async (command, arguments_) => {
      calls.push([command, arguments_]);
    });

    const keys = calls.map(([, arguments_]) => arguments_[arguments_.indexOf('--key') + 1]);
    expect(keys).toEqual(expect.arrayContaining([
      'spots/playa-venao/reportar.html',
      'spots/playa-venao/reportar',
      'spots/playa-venao/reportar/',
    ]));
  });
});
