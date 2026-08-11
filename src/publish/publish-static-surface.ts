import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SizeBandToken } from '../data/size-bands';
import { composeDailyCall, type DailyCallFacts } from './daily-call';
import { assertStrictTwoDayUpdate, mergePublishedSurface, type PublishedSurfaceUpdate, type StaticSurface } from './static-surface';

const DEFAULT_SURFACE_PATH = 'data/published-surface.json';

async function main(argv: readonly string[]): Promise<void> {
  if (argv[0] === '--upgrade-current-locales') {
    const target = resolve(option(argv, '--output') ?? DEFAULT_SURFACE_PATH);
    const surface = staticSurfaceEnvelope(await readJson(target), target);
    const upgraded = upgradeCurrentLocales(surface);
    await writeAtomically(target, upgraded);
    console.log(`publish-surface: added verified English calls to current ${upgraded.current.surf_date}; ${upgraded.dawn_receipts.length} immutable dawn receipt(s) unchanged`);
    return;
  }
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
    // The prior current projection is replaced wholesale by the verified
    // incoming update. Read only the archive envelope here so a pre-English
    // current call cannot block its own schema upgrade; dawn receipts are the
    // only prior values mergePublishedSurface retains.
    return staticSurfaceEnvelope(await readJson(path), path);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function readSurface(path: string): Promise<StaticSurface> {
  const value = staticSurfaceEnvelope(await readJson(path), path);
  try {
    return { ...value, current: assertStrictTwoDayUpdate(value.current) };
  } catch (error) {
    throw new Error(`publish-surface refused: WHAT ${message(error)} WHY every published surface has exactly today and tomorrow, each with a real ranking; HOW publish a two-day bundle with non-empty ranked calls for consecutive civil dates.`);
  }
}

function staticSurfaceEnvelope(value: unknown, path: string): StaticSurface {
  if (!isRecord(value) || value.schema !== 'static-surface/v1' || !isRecord(value.current) || !Array.isArray(value.dawn_receipts)) {
    throw new Error(`publish-surface refused: WHAT invalid static surface at ${path}; WHY the archive must contain a current publication and a receipt collection; HOW restore a valid data/published-surface.json or publish a verified bundle.`);
  }
  return value as StaticSurface;
}

function upgradeCurrentLocales(surface: StaticSurface): StaticSurface {
  const current = surface.current as unknown;
  if (!isRecord(current) || !Array.isArray(current.calls) || !Array.isArray(current.days)) {
    throw new Error('publish-surface refused: WHAT current locale upgrade found no ranked calls; WHY only an existing structured current projection can be upgraded; HOW publish a valid two-day surface first.');
  }
  const days = current.days.map((day, dayIndex) => {
    if (!isRecord(day) || !Array.isArray(day.spots)) {
      throw new Error(`publish-surface refused: WHAT current locale upgrade found malformed days[${dayIndex}]; WHY a call can only be composed from its own structured row; HOW restore a valid structured current surface.`);
    }
    return {
      ...day,
      spots: day.spots.map((call, callIndex) => upgradeCallLocale(call, `days[${dayIndex}].spots[${callIndex}]`)),
    };
  });
  const upgraded = {
    ...current,
    calls: current.calls.map((call, callIndex) => upgradeCallLocale(call, `calls[${callIndex}]`)),
    days,
  };
  return {
    ...surface,
    current: assertStrictTwoDayUpdate(upgraded),
  };
}

function upgradeCallLocale(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value) || typeof value.call_es !== 'string') {
    throw new Error(`publish-surface refused: WHAT ${where} has no Spanish source call; WHY the upgrade may add a twin but never invent the original; HOW restore the producer-published call_es.`);
  }
  const facts = dailyCallFacts(value, where);
  const expectedEs = composeDailyCall('es', facts);
  if (value.call_es !== expectedEs) {
    throw new Error(`publish-surface refused: WHAT ${where}.call_es disagrees with its structured facts; WHY adding English must not bless a contradictory source row; HOW regenerate the current surface from the producer.`);
  }
  const callEn = composeDailyCall('en', facts);
  if (value.call_en !== undefined && value.call_en !== callEn) {
    throw new Error(`publish-surface refused: WHAT ${where}.call_en disagrees with its structured facts; WHY current locale members must describe the same row; HOW regenerate the current surface from the producer.`);
  }
  return { ...value, call_en: callEn };
}

function dailyCallFacts(value: Record<string, unknown>, where: string): DailyCallFacts {
  if (typeof value.size_band !== 'string') {
    throw new Error(`publish-surface refused: WHAT ${where}.size_band is missing; WHY English copy cannot be composed without changing forecast facts; HOW regenerate a fully structured current surface.`);
  }
  if (!Object.hasOwn(value, 'wind_state')) {
    throw new Error(`publish-surface refused: WHAT ${where}.wind_state is missing; WHY an absent field is not proof that wind data was unavailable; HOW regenerate a fully structured current surface.`);
  }
  const wind = value.wind_state;
  if (wind !== null && wind !== 'clean' && wind !== 'choppy' && wind !== 'blown_out') {
    throw new Error(`publish-surface refused: WHAT ${where}.wind_state is invalid; WHY the call may use only the canonical wind vocabulary; HOW regenerate a fully structured current surface.`);
  }
  if (!Object.hasOwn(value, 'best_window')) {
    throw new Error(`publish-surface refused: WHAT ${where}.best_window is missing; WHY an absent field is not proof that no window was estimated; HOW regenerate a fully structured current surface.`);
  }
  const window = value.best_window;
  if (window !== null
    && (!isRecord(window) || typeof window.start !== 'string' || typeof window.end !== 'string')) {
    throw new Error(`publish-surface refused: WHAT ${where}.best_window is malformed; WHY the call repeats producer-computed local times and never guesses them; HOW regenerate a fully structured current surface.`);
  }
  return {
    size_band: value.size_band as SizeBandToken,
    wind_state: wind,
    best_window: window === null
      ? null
      : { start: window.start as string, end: window.end as string },
  };
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
  const panamaToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const today = surface.current.days[0].date;
  if (today !== panamaToday) {
    throw new Error(`publish-surface refused: WHAT static surface is for ${today}, not Panama's ${panamaToday}; WHY a stale build cannot pretend to be this morning's call; HOW publish the completed current bundle with npm run publish:surface -- --input <pub-v1-bundle.json>, then run npm run build again.`);
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
