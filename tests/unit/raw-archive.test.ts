import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';
import { rawArchiveKey, rawArchiveRecord } from '../../src/pipeline/raw-archive';

describe('raw forensic archive', () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'surfs-up-raw-archive-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('keeps per-spot same-hour captures distinct and stores verbatim gzip bytes', async () => {
    const at = new Date('2026-08-10T06:17:00.000Z');
    const first = rawArchiveRecord('open-meteo-marine', 'playa-venao', at, '{"spot":"venao"}');
    const second = rawArchiveRecord('open-meteo-marine', 'playa-cambutal', at, '{"spot":"cambutal"}');
    expect(first.key).not.toBe(second.key);
    expect(rawArchiveKey('open-meteo-marine', 'playa-venao', at)).toBe(first.key);

    const store = new FilesystemStore(root);
    await store.putRaw(first);
    await store.putRaw(second);

    expect(gunzipSync(await readFile(join(root, first.key))).toString('utf8')).toBe(first.verbatim);
    expect(gunzipSync(await readFile(join(root, second.key))).toString('utf8')).toBe(second.verbatim);
  });
});
