import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { mergePublishedSurface, type PublishedSurfaceUpdate, type StaticSurface, type SurfaceCall } from './static-surface';

const DEFAULT_SURFACE_PATH = 'data/published-surface.json';

async function main(argv: readonly string[]): Promise<void> {
  if (argv[0] === '--verify') {
    const surface = await readSurface(resolve(DEFAULT_SURFACE_PATH));
    verifyCurrentCivilDay(surface);
    console.log(`publish-surface: current ${surface.current.surf_date}; ${surface.dawn_receipts.length} dawn receipt(s) retained`);
    return;
  }
  const inputPath = option(argv, '--input');
  if (inputPath === null) {
    throw new Error('publish-surface refused: WHAT missing --input; WHY the static surface must be derived from a published build bundle; HOW run npm run publish:surface -- --input <bundle.json>.');
  }
  const targetPath = option(argv, '--output') ?? DEFAULT_SURFACE_PATH;
  const incoming = publishedUpdate(await readJson(resolve(inputPath)));
  const target = resolve(targetPath);
  const previous = await readExistingSurface(target);
  const merged = mergePublishedSurface(previous, incoming);
  await writeAtomically(target, merged);
  console.log(`publish-surface: published ${incoming.surf_date} ${incoming.build_kind}; retained ${merged.dawn_receipts.length} dawn receipt(s)`);
}

function option(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

async function readExistingSurface(path: string): Promise<StaticSurface | null> {
  try {
    return await readSurface(path);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function readSurface(path: string): Promise<StaticSurface> {
  const value = await readJson(path);
  if (!isRecord(value) || value.schema !== 'static-surface/v1' || !isRecord(value.current) || !Array.isArray(value.dawn_receipts)) {
    throw new Error(`publish-surface refused: WHAT invalid static surface at ${path}; WHY the archive must contain a current publication and a receipt collection; HOW restore a valid data/published-surface.json or publish a verified bundle.`);
  }
  return value as StaticSurface;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function publishedUpdate(value: unknown): PublishedSurfaceUpdate {
  const candidate = isRecord(value) && isRecord(value.publish_surface) ? value.publish_surface : value;
  if (!isRecord(candidate)
    || candidate.schema !== 'published-surface-update/v1'
    || typeof candidate.surf_date !== 'string'
    || typeof candidate.published_at !== 'string'
    || (candidate.build_kind !== 'dawn' && candidate.build_kind !== 'hourly')
    || !Array.isArray(candidate.calls)
    || !candidate.calls.every(isSurfaceCall)) {
    throw new Error('publish-surface refused: WHAT input lacks the published-surface-update/v1 contract; WHY static HTML may only render a completed build receipt; HOW pass the pub/v1 region bundle produced by runBuildOnce.');
  }
  return candidate as PublishedSurfaceUpdate;
}

function isSurfaceCall(value: unknown): value is SurfaceCall {
  return isRecord(value)
    && typeof value.spot_id === 'string'
    && typeof value.score_q === 'number'
    && typeof value.call_es === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function verifyCurrentCivilDay(surface: StaticSurface): void {
  const panamaToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (surface.current.surf_date !== panamaToday) {
    throw new Error(`publish-surface refused: WHAT static surface is for ${surface.current.surf_date}, not Panama's ${panamaToday}; WHY a stale build cannot pretend to be this morning's call; HOW publish the completed current bundle with npm run publish:surface -- --input <pub-v1-bundle.json>, then run npm run build again.`);
  }
}

async function writeAtomically(path: string, surface: StaticSurface): Promise<void> {
  const temporary = `${path}.next`;
  await writeFile(temporary, `${JSON.stringify(surface, null, 2)}\n`);
  await rename(temporary, path);
}

await main(process.argv.slice(2));
