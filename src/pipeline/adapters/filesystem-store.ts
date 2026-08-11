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
import { gunzipSync, gzipSync } from 'node:zlib';

import type { BuildStore, IngestStore, RawArchiveRecord } from '../ports';

export class FilesystemStore implements IngestStore, BuildStore {
  constructor(private readonly root: string) {}

  async putRawIfAbsent(record: RawArchiveRecord): Promise<'created' | 'already-exists'> {
    return this.writeIfAbsent(record.key, encodeText(record.key, record.verbatim));
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.writeIfAbsent(key, encodeText(key, body));
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.readGzip(key);
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return this.list(prefix);
  }

  async getCorrection(key: string): Promise<string | null> {
    return this.read(key);
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.writeIfAbsent(key, encodeText(key, body));
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

  private async writeIfAbsent(key: string, body: string | Uint8Array): Promise<'created' | 'already-exists'> {
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

  private async readGzip(key: string): Promise<string | null> {
    try {
      const bytes = await readFile(this.targetPath(key));
      // data/predictions-capture predates the storage adapter's honest gzip
      // writes. Preserve its offline replay value without ever emitting new
      // plaintext under a .gz suffix.
      return key.endsWith('.gz') && isGzip(bytes) ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
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

function encodeText(key: string, body: string): Uint8Array {
  const bytes = Buffer.from(body, 'utf8');
  return key.endsWith('.gz') ? gzipSync(bytes) : bytes;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
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
