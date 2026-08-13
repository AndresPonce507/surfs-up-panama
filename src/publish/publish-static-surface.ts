import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assertCurrentCivilDay, assertStrictTwoDayUpdate, mergePublishedSurface, type PublishedSurfaceUpdate, type StaticSurface } from './static-surface';

const DEFAULT_SURFACE_PATH = 'data/published-surface.json';

async function main(argv: readonly string[]): Promise<void> {
  if (argv[0] === '--verify') {
    const surface = await readSurface(resolve(DEFAULT_SURFACE_PATH));
    verifyCurrentCivilDay(surface);
    console.log(`publish-surface: current ${surface.current.days[0].date}; tomorrow ${surface.current.days[1].date}; ${surface.dawn_receipts.length} dawn receipt(s) retained`);
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
  console.log(`publish-surface: published ${incoming.days[0].date} and ${incoming.days[1].date} ${incoming.build_kind}; retained ${merged.dawn_receipts.length} dawn receipt(s)`);
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
  try {
    return { ...value, current: assertStrictTwoDayUpdate(value.current) } as StaticSurface;
  } catch (error) {
    throw new Error(`publish-surface refused: WHAT ${message(error)} WHY every published surface has exactly today and tomorrow, each with a real ranking; HOW publish a two-day bundle with non-empty ranked calls for consecutive civil dates.`);
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function publishedUpdate(value: unknown): PublishedSurfaceUpdate {
  const candidate = isRecord(value) && isRecord(value.publish_surface) ? value.publish_surface : value;
  try {
    return assertStrictTwoDayUpdate(candidate);
  } catch (error) {
    throw new Error(`publish-surface refused: WHAT input lacks a strict two-day published-surface-update/v1 contract (${message(error)}) WHY static HTML must never invent tomorrow by copying today; HOW pass a completed bundle with exactly two consecutive days and non-empty ranked calls for each.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function verifyCurrentCivilDay(surface: StaticSurface): void {
  try {
    assertCurrentCivilDay(surface, new Date());
  } catch (error) {
    throw new Error(`publish-surface refused: ${message(error)} HOW publish the completed current bundle with npm run publish:surface -- --input <pub-v1-bundle.json>, then run npm run build again.`);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeAtomically(path: string, surface: StaticSurface): Promise<void> {
  const temporary = `${path}.next`;
  await writeFile(temporary, `${JSON.stringify(surface, null, 2)}\n`);
  await rename(temporary, path);
}

await main(process.argv.slice(2));
