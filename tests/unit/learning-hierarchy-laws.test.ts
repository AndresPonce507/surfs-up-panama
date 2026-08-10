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
const ESTABLISHED_ID = 'established-unit';
const NEW_ID = 'new-unit';

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

function storedHeight(store: MemoryStore, spotId: string): { b: number; applied: boolean } {
  const body = store.objects.get(`learned/corrections/v1/current/${spotId}.json`);
  assert.ok(body, `the fit must store the auditable correction record for ${spotId}`);
  const record = JSON.parse(body) as { bias: { swell_h_m: { per_source: { ncep_gfswave016: { lead_24_48: { b: number; applied: boolean } } } } } };
  return record.bias.swell_h_m.per_source.ncep_gfswave016.lead_24_48;
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

describe('pooling hierarchy: cold starts retain the launch corridor', () => {
  it('keeps every two-morning spot nearer its established neighbour than its own isolated difference', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.4, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        async (newDifference) => {
          const established: PoolingSpot = { spot_id: ESTABLISHED_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
          const newcomer: PoolingSpot = { spot_id: NEW_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
          const together = new MemoryStore();
          const alone = new MemoryStore();
          await writeSpot(together, ESTABLISHED_ID, 22, 7, 0.22);
          await writeSpot(together, NEW_ID, 2, 2, newDifference);
          await writeSpot(alone, NEW_ID, 2, 2, newDifference);
          await run(together, [established, newcomer]);
          await run(alone, [newcomer]);

          const stored = storedHeight(together, NEW_ID);
          const neighbour = storedHeight(together, ESTABLISHED_ID).b;
          const own = storedHeight(alone, NEW_ID).b;
          assert.equal(stored.applied, false, 'two mornings may never earn an applied correction');
          assert.ok(
            Math.abs(stored.b - neighbour) < Math.abs(stored.b - own),
            'a two-morning spot must stay nearer its established neighbour than its own isolated difference',
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('moves every one-morning claim by no more than one third of that claim', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.3, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        async (loudDifference) => {
          const established: PoolingSpot = { spot_id: ESTABLISHED_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
          const newcomer: PoolingSpot = { spot_id: NEW_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
          const store = new MemoryStore();
          await writeSpot(store, ESTABLISHED_ID, 22, 7, 0);
          await writeSpot(store, NEW_ID, 1, 1, loudDifference);
          await run(store, [established, newcomer]);

          assert.ok(
            Math.abs(storedHeight(store, NEW_ID).b) <= loudDifference / 3 + 1e-12,
            'one loud morning may move a brand-new spot by at most one third of its claim',
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('pooling hierarchy: similarity groups activate from earned evidence', () => {
  it('moves a new beach spot toward its three gated beach neighbours, not the region-wide mix', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.25, max: 0.75, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.25, max: 0.75, noNaN: true, noDefaultInfinity: true }),
        async (beachDifference, reefDifference) => {
          const store = new MemoryStore();
          const spots: PoolingSpot[] = [];
          for (let index = 1; index <= 3; index += 1) {
            const spot_id = `beach-${index}`;
            spots.push({ spot_id, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' });
            await writeSpot(store, spot_id, 22, 7, -beachDifference);
          }
          for (let index = 1; index <= 3; index += 1) {
            const spot_id = `reef-${index}`;
            spots.push({ spot_id, region_id: 'pa-pacific', coast: 'pacific', break_type: 'reef' });
            await writeSpot(store, spot_id, 22, 7, reefDifference);
          }
          spots.push({ spot_id: NEW_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' });
          await writeSpot(store, NEW_ID, 2, 2, 0);
          await run(store, spots);

          const stored = storedHeight(store, NEW_ID).b;
          const regionalMean = (beachDifference - reefDifference) / 2;
          assert.ok(
            Math.abs(stored - beachDifference) < Math.abs(stored - regionalMean),
            'three gated beach spots must become the new beach spot\'s parent instead of the regional mix',
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('keeps two beach spots inside the region-wide parent until a third earns its correction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.25, max: 0.75, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.25, max: 0.75, noNaN: true, noDefaultInfinity: true }),
        async (beachDifference, reefDifference) => {
          const store = new MemoryStore();
          const spots: PoolingSpot[] = [];
          for (let index = 1; index <= 2; index += 1) {
            const spot_id = `beach-${index}`;
            spots.push({ spot_id, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' });
            await writeSpot(store, spot_id, 22, 7, -beachDifference);
          }
          for (let index = 1; index <= 3; index += 1) {
            const spot_id = `reef-${index}`;
            spots.push({ spot_id, region_id: 'pa-pacific', coast: 'pacific', break_type: 'reef' });
            await writeSpot(store, spot_id, 22, 7, reefDifference);
          }
          spots.push({ spot_id: NEW_ID, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' });
          await writeSpot(store, NEW_ID, 2, 2, 0);
          await run(store, spots);

          const stored = storedHeight(store, NEW_ID).b;
          const regionalMean = (2 * beachDifference - 3 * reefDifference) / 5;
          assert.ok(
            Math.abs(stored - regionalMean) < Math.abs(stored - beachDifference),
            'two beach spots are not yet a family, so the region-wide parent must still carry the newcomer',
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
