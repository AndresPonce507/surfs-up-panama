// Production adapters for the build's static publication plan. The renderer
// is deliberately a port: S3/CloudFront mechanics are testable without AWS,
// while the Lambda composition root owns the real Astro runner.

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';

import { mergePublishedSurface, type StaticSurface } from '../../publish/static-surface';
import { assertCompleteStaticPublication, type StaticPublicationPlan } from '../static-publication';
import type { S3CommandSender } from './s3-store';

const STATIC_SURFACE_KEY = 'v1/static-surface.json';
const HTML_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type GeneratedStaticFile = {
  readonly path: string;
  readonly body: Uint8Array;
  readonly contentType: string;
};

export interface StaticRouteRenderer {
  render(surface: StaticSurface): Promise<readonly GeneratedStaticFile[]>;
}

export interface PublicManifestProbe {
  probe(build_id: string): Promise<void>;
}

export class S3StaticSitePublisher {
  constructor(
    private readonly client: S3CommandSender,
    private readonly bucket: string,
    private readonly renderer: StaticRouteRenderer,
    private readonly publicProbe: PublicManifestProbe,
  ) {}

  async publish(plan: StaticPublicationPlan): Promise<void> {
    const surface = mergePublishedSurface(await this.readSurface(), plan.surface);
    const files = await this.renderer.render(surface);
    assertCompleteStaticPublication(files.map((file) => file.path));

    // Immutable assets first. Then route documents, then the retained-reading
    // source. Build advances manifest only after this method returns.
    for (const file of files.filter((candidate) => !candidate.path.endsWith('.html'))) await this.putFile(file, false);
    for (const file of files.filter((candidate) => candidate.path.endsWith('.html'))) {
      await this.putFile(file, true);
      if (file.path !== 'index.html') {
        await this.put(`site/${file.path.slice(0, -'.html'.length)}/`, file.body, file.contentType, HTML_CACHE_CONTROL);
      }
    }
    await this.put(STATIC_SURFACE_KEY, JSON.stringify(surface), 'application/json', HTML_CACHE_CONTROL);
  }

  async probe(build_id: string): Promise<void> {
    await this.publicProbe.probe(build_id);
  }

  private async putFile(file: GeneratedStaticFile, isHtml: boolean): Promise<void> {
    const isAsset = file.path.startsWith('assets/');
    const key = isHtml ? `site/${file.path}` : isAsset ? file.path : `site/${file.path}`;
    await this.put(key, file.body, file.contentType, isAsset ? ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL);
  }

  private async put(key: string, body: string | Uint8Array, contentType: string, cacheControl: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }));
  }

  private async readSurface(): Promise<StaticSurface | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: STATIC_SURFACE_KEY }));
      const body = await (response as { Body?: { transformToString?: (encoding: string) => Promise<string> } }).Body?.transformToString?.('utf8');
      if (body === undefined) throw new Error('static publication refused: existing static surface response had no body.');
      return JSON.parse(body) as StaticSurface;
    } catch (error) {
      if (isMissingKey(error)) return null;
      throw error;
    }
  }
}

/** Runs the same Astro static build that developers run, against a copied
 * writable project tree. Lambda's deployment package is immutable; /tmp is
 * the only honest place to inject the newly published surface. */
export class AstroStaticRouteRenderer implements StaticRouteRenderer {
  constructor(private readonly packagedProjectRoot = requiredEnv('STATIC_SITE_SOURCE_ROOT')) {}

  async render(surface: StaticSurface): Promise<readonly GeneratedStaticFile[]> {
    const work = await mkdtemp(join(tmpdir(), 'surfs-up-static-'));
    try {
      const project = join(work, 'project');
      const output = join(work, 'dist');
      // Copy only Astro's project inputs, never the complete Lambda package
      // (which includes Astro's dependency tree). The node_modules symlink
      // below is read-only and avoids spending the build timeout copying it.
      await mkdir(project, { recursive: true });
      await mkdir(join(project, 'data'), { recursive: true });
      for (const input of ['src', 'public', 'scripts', 'data/spots']) {
        await cp(join(this.packagedProjectRoot, input), join(project, input), { recursive: true });
      }
      for (const input of ['astro.config.mjs', 'tsconfig.json', 'data/published-surface.json']) {
        await cp(join(this.packagedProjectRoot, input), join(project, input));
      }
      await symlink(join(this.packagedProjectRoot, 'node_modules'), join(project, 'node_modules'));
      await writeFile(join(project, 'data/published-surface.json'), `${JSON.stringify(surface, null, 2)}\n`);
      await run(process.execPath, [join(project, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', project, '--outDir', output]);
      // Await inside the try: a bare returned promise would run `finally`
      // immediately and erase /tmp before the uploader had read the files.
      return await readStaticFiles(output);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

export class FetchPublicManifestProbe implements PublicManifestProbe {
  constructor(private readonly origin = requiredEnv('PUBLIC_SITE_ORIGIN')) {}

  async probe(build_id: string): Promise<void> {
    const response = await fetch(`${this.origin.replace(/\/$/, '')}/manifest.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`health.publish.mismatch: public manifest returned HTTP ${response.status}, expected build ${build_id}.`);
    const body = await response.json() as { build_id?: unknown };
    if (body.build_id !== build_id) throw new Error(`health.publish.mismatch: public manifest build ${String(body.build_id)} did not match ${build_id}.`);
  }
}

async function readStaticFiles(root: string): Promise<readonly GeneratedStaticFile[]> {
  const files: GeneratedStaticFile[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      if (!entry.isFile()) continue;
      const path = relative(root, absolute).split(sep).join('/');
      files.push({ path, body: await readFile(absolute), contentType: contentType(path) });
    }
  }
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function contentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function isMissingKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name: unknown }).name === 'NoSuchKey';
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`static publication refused: missing ${name}.`);
  return value;
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: 'pipe' });
    let stderr = '';
    child.stderr.on('data', (chunk: Uint8Array) => { stderr += Buffer.from(chunk).toString('utf8'); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`static publication refused: Astro build exited ${code}: ${stderr}`)));
  });
}
