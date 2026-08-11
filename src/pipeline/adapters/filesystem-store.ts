// Real-filesystem adapter for IngestStore + BuildStore. Keys are relative
// paths under `root`, using the same segments the S3 layout uses
// (predictions/v1/dt=.../, log/calls/v1/dt=.../, pub/v1/regions/...), so the
// adapter is a drop-in local stand-in and swapping to a real S3 adapter later
// is a registry change, not a pipeline rewrite (mirrors
// adr-openmeteo-vs-raw-grib2.md's adapter-boundary discipline for sources).
//
// Conditional-write semantics emulate S3 `If-None-Match: *`: the first
// writer of a key wins, a repeat write is a duplicate acknowledgement, never
// an overwrite. `wx` gives an atomic create-exclusive at the OS level, so
// there is no read-then-write race window.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import type {
  BuildStore,
  IngestStore,
  PublishedCallHistoryProbe,
  PublishedCallHistoryScope,
  RawProviderPayload,
} from '../ports';

export class FilesystemStore implements IngestStore, BuildStore {
  constructor(private readonly root: string) {}

  async putRaw(key: string, body: RawProviderPayload): Promise<void> {
    await this.write(key, body);
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.writeIfAbsent(key, body);
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.read(key);
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return this.list(prefix);
  }

  async getCorrection(key: string): Promise<string | null> {
    return this.read(key);
  }

  async listPublishedCallKeys(scope: PublishedCallHistoryScope): Promise<readonly string[]> {
    const allKeys = await this.list(scope.prefix);
    const regionSuffix = `/${scope.region_id}.jsonl.gz`;
    return allKeys.filter((key) => key.endsWith(regionSuffix));
  }

  async getPublishedCall(key: string): Promise<string> {
    const body = await this.read(key);
    if (body === null) throw new Error(`published call receipt unavailable: ${key}`);
    return body;
  }

  async probePublishedCallHistory(scope: PublishedCallHistoryScope): Promise<PublishedCallHistoryProbe> {
    let keys: readonly string[];
    try {
      keys = await this.listPublishedCallKeys(scope);
    } catch (error) {
      return unavailable(error);
    }
    const dawnRows = new Set<string>();
    try {
      for (const key of keys) {
        const match = publishedCallKey(scope, key);
        if (match === null) return malformed(`key:${key}`);
        const body = await this.getPublishedCall(key);
        for (const line of body.split('\n').filter((candidate) => candidate !== '')) {
          const row = JSON.parse(line) as Record<string, unknown>;
          if (!validPublishedCallRow(row)) return malformed(`receipt:${key}`);
          if (match.buildHour !== '11' || !row.valid_ts.startsWith(`${match.date}T18:00`)) continue;
          const grain = `${row.spot_id}\u0000${match.date}`;
          if (dawnRows.has(grain)) return malformed(`duplicate:${key}`);
          dawnRows.add(grain);
        }
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof SyntaxError) return malformed('receipt-json');
      return unavailable(error);
    }
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.writeIfAbsent(key, body);
  }

  async putBundle(key: string, body: string): Promise<void> {
    await this.write(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    await this.write(key, body);
  }

  private targetPath(key: string): string {
    return join(this.root, key);
  }

  private async write(key: string, body: string | Uint8Array): Promise<void> {
    const target = this.targetPath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  private async writeIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    const target = this.targetPath(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, body, { flag: 'wx' });
      return 'created';
    } catch (error) {
      if (isAlreadyExists(error)) return 'already-exists';
      throw error;
    }
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await readFile(this.targetPath(key), 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async list(prefix: string): Promise<string[]> {
    const target = this.targetPath(prefix);
    const files: string[] = [];
    await collectFiles(target, files);
    return files
      .map((file) => relative(this.root, file).split(sep).join('/'))
      .sort();
  }
}

function publishedCallKey(scope: PublishedCallHistoryScope, key: string): { date: string; buildHour: string } | null {
  const escapedRegion = scope.region_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${scope.prefix}dt=(\\d{4}-\\d{2}-\\d{2})/build=(\\d{2})Z/${escapedRegion}\\.jsonl\\.gz$`).exec(key);
  if (match === null || !validCivilDate(match[1]!) || Number(match[2]!) > 23) return null;
  return { date: match[1]!, buildHour: match[2]! };
}

function unavailable(error: unknown): PublishedCallHistoryProbe {
  return { ok: false, reason: 'unavailable', detail: error instanceof Error ? error.name : 'filesystem' };
}

function malformed(detail: string): PublishedCallHistoryProbe {
  return { ok: false, reason: 'malformed', detail };
}

function validPublishedCallRow(row: Record<string, unknown>): row is Record<string, string | number> & { spot_id: string; valid_ts: string } {
  return typeof row.spot_id === 'string'
    && row.spot_id.length > 0
    && typeof row.valid_ts === 'string'
    && validUtcTimestamp(row.valid_ts)
    && typeof row.members_used === 'number'
    && Number.isSafeInteger(row.members_used)
    && row.members_used >= 0
    && (row.spread_penalty === undefined || (typeof row.spread_penalty === 'number' && Number.isFinite(row.spread_penalty)));
}

function validCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function validUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && validCivilDate(value.slice(0, 10));
}

async function collectFiles(directory: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(entryPath, out);
    } else if (entry.isFile()) {
      out.push(entryPath);
    }
  }
}

function isMissing(error: unknown): boolean {
  return isErrnoException(error) && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return isErrnoException(error) && error.code === 'EEXIST';
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
