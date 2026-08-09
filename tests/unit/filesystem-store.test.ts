// Adapter integration test, real I/O (Mandate 6): every driven adapter gets
// at least one test that would fail if its real system dependency were
// absent or broken. Exercised through the BuildStore/IngestStore port
// surface, never through a mocked filesystem.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';

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
});
