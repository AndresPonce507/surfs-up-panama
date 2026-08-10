// The basin is a hard partition. This law drives the nightly-fit port with
// two invented coasts and watches the stored Caribbean bytes, rather than
// re-deriving the parent estimate in the test.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runLearningFitOnce, type LearningFitDeps, type LearningStore } from '../../src/learning/fit';
import { OBSERVATION_LOG_PREFIX, PREDICTION_LOG_PREFIX } from '../../src/learning/inputs';

const CARIBBEAN_ID = 'caribe-unit';
const PACIFIC_ID = 'pacifico-unit';
const CARIBBEAN_KEY = `learned/corrections/v1/current/${CARIBBEAN_ID}.json`;

type PoolingSpot = { spot_id: string; region_id: string; coast: string; break_type: string };

class MemoryStore implements LearningStore {
  readonly objects = new Map<string, string>();
  async put(key: string, body: string): Promise<void> { this.objects.set(key, body); }
  async get(key: string): Promise<string | null> { return this.objects.get(key) ?? null; }
  async list(prefix: string): Promise<string[]> { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}

function clock() { return { now: () => new Date('2026-08-08T11:02:14.000Z') }; }

function day(index: number): string {
  const date = new Date('2026-07-01T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

async function writeSpot(store: MemoryStore, spotId: string, count: number, reporters: number, biggerThanForecastM: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const date = day(index);
    const observation = {
      spot_id: spotId,
      device_id: `d_${spotId}_${index % reporters}`,
      observed_at: `${date}T18:41:00Z`,
      size_band: 'chest_head',
      quality: 'good',
      predicted: { score_q: 80 },
    };
    const prediction = {
      spot_id: spotId,
      source: 'ncep_gfswave016',
      valid_ts: `${date}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.35 - biggerThanForecastM + (index % 2 === 0 ? 0.21 : -0.21),
      swell_t_s: 10,
      land_masked: false,
    };
    await append(store, `${OBSERVATION_LOG_PREFIX}dt=${date}/reports.jsonl`, observation);
    await append(store, `${PREDICTION_LOG_PREFIX}dt=${date}/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz`, prediction);
  }
}

async function append(store: MemoryStore, key: string, row: object): Promise<void> {
  const previous = await store.get(key);
  await store.put(key, `${previous === null ? '' : `${previous}\n`}${JSON.stringify(row)}`);
}

async function run(store: MemoryStore, spots: PoolingSpot[]): Promise<void> {
  await runLearningFitOnce({ store, clock: clock(), spots } as LearningFitDeps);
}

describe('pooling hierarchy: a basin is a hard wall', () => {
  it('keeps every Caribbean correction byte-identical when arbitrary Pacific evidence is removed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.double({ min: -1.2, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 10, max: 40 }),
        fc.double({ min: -1.2, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        async (caribbeanCount, caribbeanDifference, pacificCount, pacificDifference) => {
          const caribbean: PoolingSpot = { spot_id: CARIBBEAN_ID, region_id: 'pa-caribbean', coast: 'caribbean', break_type: 'beach' };
          const pacific: PoolingSpot = { spot_id: PACIFIC_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
          const withPacific = new MemoryStore();
          const withoutPacific = new MemoryStore();
          await writeSpot(withPacific, CARIBBEAN_ID, caribbeanCount, Math.min(caribbeanCount, 5), caribbeanDifference);
          await writeSpot(withPacific, PACIFIC_ID, pacificCount, Math.min(pacificCount, 7), pacificDifference);
          await writeSpot(withoutPacific, CARIBBEAN_ID, caribbeanCount, Math.min(caribbeanCount, 5), caribbeanDifference);
          await run(withPacific, [caribbean, pacific]);
          await run(withoutPacific, [caribbean]);

          assert.equal(
            withPacific.objects.get(CARIBBEAN_KEY),
            withoutPacific.objects.get(CARIBBEAN_KEY),
            'a Pacific input may never change bytes stored for a Caribbean spot, however many mornings or what difference it claims',
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
