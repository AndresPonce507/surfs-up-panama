import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';
import { rawArchiveKey, rawArchiveRecord } from '../../src/pipeline/raw-archive';

const provider = fc.constantFrom('open-meteo-marine', 'open-meteo-wind', 'coops');
const spotId = fc.stringMatching(/^[a-z][a-z0-9-]{0,16}$/);
const instant = fc.integer({ min: 0, max: Date.UTC(2100, 0, 1) });

describe('raw archive identity', () => {
  it('is stable and collision-free for distinct provider/spot/run identities', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.record({ provider, spotId, instant }), {
        selector: (value) => `${value.provider}|${value.spotId}|${value.instant}`,
        minLength: 1,
        maxLength: 50,
      }),
      (captures) => {
        const keys = captures.map((capture) => rawArchiveKey(capture.provider, capture.spotId, new Date(capture.instant)));
        expect(new Set(keys).size).toBe(captures.length);
        for (const capture of captures) {
          expect(rawArchiveKey(capture.provider, capture.spotId, new Date(capture.instant)))
            .toBe(rawArchiveKey(capture.provider, capture.spotId, new Date(capture.instant)));
        }
      },
    ));
  });
});

describe('FilesystemStore raw archive adapter', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'surfs-up-raw-archive-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips the received verbatim payload as gzip bytes', async () => {
    const record = rawArchiveRecord('open-meteo-marine', 'playa-venao', new Date('2026-08-10T06:17:00.000Z'), '{"malformed":');
    await new FilesystemStore(root).putRaw(record);

    const bytes = await readFile(join(root, record.key));
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    expect(gunzipSync(bytes).toString('utf8')).toBe('{"malformed":');
  });
});
