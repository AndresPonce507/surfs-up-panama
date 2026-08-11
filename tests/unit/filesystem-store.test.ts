// Adapter integration test, real I/O (Mandate 6): every driven adapter gets
// at least one test that would fail if its real system dependency were
// absent or broken. Exercised through the BuildStore/IngestStore port
// surface, never through a mocked filesystem.

import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';

const HISTORY_SCOPE = { region_id: 'pa-pacific', prefix: 'log/calls/v1/' } as const;
const VALID_HISTORY_ROW = { spot_id: 'playa-venao', valid_ts: '2026-08-08T18:00:00Z', members_used: 2, spread_penalty: 0.1 };

class DisappearingFilesystemStore extends FilesystemStore {
  override async getPublishedCall(key: string): Promise<string> {
    await unlink((this as unknown as { root: string }).root + `/${key}`);
    return super.getPublishedCall(key);
  }
}

describe('FilesystemStore (real filesystem I/O)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'surfs-up-store-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips a prediction row through real files and lists it under its prefix', async () => {
    const store = new FilesystemStore(root);

    const created = await store.putPredictionIfAbsent('predictions/v1/dt=2026-08-09/src=ncep_gfswave016/cyc=06Z/pa-pacific.jsonl', '{"spot_id":"playa-venao"}');
    expect(created).toBe('created');

    const onDisk = await readFile(join(root, 'predictions/v1/dt=2026-08-09/src=ncep_gfswave016/cyc=06Z/pa-pacific.jsonl'), 'utf8');
    expect(onDisk).toBe('{"spot_id":"playa-venao"}');

    const readBack = await store.getPrediction('predictions/v1/dt=2026-08-09/src=ncep_gfswave016/cyc=06Z/pa-pacific.jsonl');
    expect(readBack).toBe('{"spot_id":"playa-venao"}');

    const listed = await store.listPredictions('predictions/v1/dt=2026-08-09/');
    expect(listed).toEqual(['predictions/v1/dt=2026-08-09/src=ncep_gfswave016/cyc=06Z/pa-pacific.jsonl']);
  });

  it('treats a conditional write like S3 If-None-Match: the second write is a no-op duplicate ack', async () => {
    const store = new FilesystemStore(root);

    await store.putCallIfAbsent('log/calls/v1/dt=2026-08-09/build=11Z/pa-pacific.jsonl', 'first');
    const second = await store.putCallIfAbsent('log/calls/v1/dt=2026-08-09/build=11Z/pa-pacific.jsonl', 'second');

    expect(second).toBe('already-exists');
    const body = await readFile(join(root, 'log/calls/v1/dt=2026-08-09/build=11Z/pa-pacific.jsonl'), 'utf8');
    expect(body).toBe('first');
  });

  it('reads missing keys as null instead of throwing, mirroring a missing S3 object', async () => {
    const store = new FilesystemStore(root);

    expect(await store.getPrediction('predictions/v1/dt=2026-08-09/nothing-here.jsonl')).toBeNull();
    expect(await store.listPredictions('predictions/v1/dt=2099-01-01/')).toEqual([]);
  });

  it('writes the bundle and manifest as plain mutable files, overwritable on republish', async () => {
    const store = new FilesystemStore(root);

    await store.putBundle('pub/v1/regions/pa-pacific/bundle.json', '{"build_id":"b_1"}');
    await store.putBundle('pub/v1/regions/pa-pacific/bundle.json', '{"build_id":"b_2"}');
    await store.putManifest('pub/v1/manifest.json', '{"build_id":"b_2"}');

    expect(await readFile(join(root, 'pub/v1/regions/pa-pacific/bundle.json'), 'utf8')).toBe('{"build_id":"b_2"}');
    expect(await readFile(join(root, 'pub/v1/manifest.json'), 'utf8')).toBe('{"build_id":"b_2"}');
  });

  it('reads only the selected region history and proves a valid receipt corpus before use', async () => {
    const store = new FilesystemStore(root);
    const key = 'log/calls/v1/dt=2026-08-08/build=11Z/pa-pacific.jsonl.gz';
    await store.putCallIfAbsent(key, JSON.stringify(VALID_HISTORY_ROW));
    await store.putCallIfAbsent('log/calls/v1/dt=2026-08-08/build=11Z/other-region.jsonl.gz', JSON.stringify({ broken: true }));

    expect(await store.listPublishedCallKeys(HISTORY_SCOPE)).toEqual([key]);
    expect(await store.getPublishedCall(key)).toContain('playa-venao');
    expect(await store.probePublishedCallHistory(HISTORY_SCOPE)).toEqual({ ok: true });
  });

  it('refuses malformed, duplicate-grain, or disappearing published history instead of calling it thin', async () => {
    const store = new FilesystemStore(root);
    const malformedKey = 'log/calls/v1/dt=not-a-date/build=11Z/pa-pacific.jsonl.gz';
    await store.putCallIfAbsent(malformedKey, JSON.stringify(VALID_HISTORY_ROW));
    expect(await store.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'malformed' });

    await rm(join(root, 'log'), { recursive: true, force: true });
    const duplicateKey = 'log/calls/v1/dt=2026-08-08/build=11Z/pa-pacific.jsonl.gz';
    await store.putCallIfAbsent(duplicateKey, [
      JSON.stringify(VALID_HISTORY_ROW),
      JSON.stringify(VALID_HISTORY_ROW),
    ].join('\n'));
    expect(await store.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'malformed' });

    await rm(join(root, 'log'), { recursive: true, force: true });
    await store.putCallIfAbsent('log/calls/v1/dt=2026-02-30/build=99Z/pa-pacific.jsonl.gz', JSON.stringify({
      ...VALID_HISTORY_ROW, valid_ts: '2026-02-30T18:00:00Z',
    }));
    expect(await store.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'malformed' });

    const keys = await store.listPublishedCallKeys(HISTORY_SCOPE);
    await unlink(join(root, keys[0]!));
    await expect(store.getPublishedCall(keys[0]!)).rejects.toThrow(/unavailable/);
  });

  it('reports a non-directory durable archive as unavailable rather than an empty history', async () => {
    const fileRoot = join(root, 'not-a-directory');
    await writeFile(fileRoot, 'not a directory');
    const store = new FilesystemStore(fileRoot);
    expect(await store.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('refuses an incomplete or disappearing listed receipt as a known history fault', async () => {
    const incomplete = new FilesystemStore(root);
    const key = 'log/calls/v1/dt=2026-08-08/build=11Z/pa-pacific.jsonl.gz';
    await incomplete.putCallIfAbsent(key, JSON.stringify({ spot_id: 'playa-venao', valid_ts: '2026-08-08T18:00:00Z' }));
    expect(await incomplete.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'malformed' });

    await rm(join(root, 'log'), { recursive: true, force: true });
    const disappearing = new DisappearingFilesystemStore(root);
    await disappearing.putCallIfAbsent(key, JSON.stringify(VALID_HISTORY_ROW));
    expect(await disappearing.probePublishedCallHistory(HISTORY_SCOPE)).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});
