// Compile-time BuildStore conformance is enforced by `implements BuildStore`.
// This small runtime contract prevents a future optional/cast-based history
// seam from silently returning the old absolute fallback on adapter faults.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';
import type { BuildStore, PublishedCallHistoryScope } from '../../src/pipeline/ports';
import { InMemoryStore } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fakes';

const SCOPE: PublishedCallHistoryScope = { region_id: 'pa-pacific', prefix: 'log/calls/v1/' };

describe('BuildStore PublishedCall history contract', () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'surfs-up-history-port-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('requires a concrete history reader and probe on the production adapter', async () => {
    const store: BuildStore = new FilesystemStore(root);
    expect(typeof store.listPublishedCallKeys).toBe('function');
    expect(typeof store.getPublishedCall).toBe('function');
    expect(await store.probePublishedCallHistory(SCOPE)).toEqual({ ok: true });
  });

  it('keeps the in-memory driven-port double fail-closed for malformed selected history', async () => {
    const store: BuildStore = new InMemoryStore();
    (store as InMemoryStore).objects.set('log/calls/v1/dt=2026-02-30/build=11Z/pa-pacific.jsonl.gz', '{}');
    expect(await store.probePublishedCallHistory(SCOPE)).toMatchObject({ ok: false, reason: 'malformed' });
  });
});
