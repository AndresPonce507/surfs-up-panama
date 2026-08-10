// Bug 3 regression: a missing wind observation must never render as the
// best-case wind reading.
//
// The scoring layer already models absence correctly (05-scoring-engine.md
// section 3.6 / L16, proven by scoring-laws.test.ts's R27): a null wind pair
// leaves `sub.wind = null` and `missing` names "wind". The defect lived only
// in the presentation mapping, `windState()` in src/pipeline/build.ts:
//   if (score === null || score >= 0.75) return 'clean';
// collapsing "we don't know" onto "clean", the single best case a surfer can
// read. This property drives the whole pipeline through its driving port
// (runBuildOnce) with wind genuinely missing and every OTHER input
// (swell height, period, direction) generated across its valid domain, and
// asserts the honest invariant holds regardless of what the rest of the
// forecast says: a null wind observation is never published as a wind
// token, never baked into the call sentence as "limpio", and never logged
// in the receipt as anything but the true null.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import type { BuildStore, Clock } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const BUILD_INSTANT = '2026-08-09T11:22:00Z';
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const SPOT_ID = 'playa-venao';

class RecordingStore implements BuildStore {
  readonly objects = new Map<string, string>();

  async getPrediction(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  async putBundle(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }
}

function seed(): SpotSeed {
  return {
    spot_id: SPOT_ID,
    name: 'Playa Venao',
    region_id: 'pa-pacific',
    timezone: 'America/Panama',
    shore_normal_deg: 175,
    swell_window_deg: [150, 210],
    h_ref_m: 1.3,
    s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

function predictionLine(
  date: string,
  swell: { h_m: number; t_s: number; dir_deg: number },
  wind: { speed_kt: number | null; dir_deg: number | null },
): string {
  return MEMBER_SOURCES.map((source) => JSON.stringify({
    spot_id: SPOT_ID,
    source,
    run_ts: `${TODAY}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: swell.h_m,
    swell_t_s: swell.t_s,
    swell_dir_deg: swell.dir_deg,
    wind_speed_kt: wind.speed_kt,
    wind_dir_deg: wind.dir_deg,
    tide_m: null,
    tide_day_low_m: null,
    tide_day_high_m: null,
    land_masked: false,
  })).join('\n');
}

async function publishWithNullWindToday(swell: { h_m: number; t_s: number; dir_deg: number }): Promise<{
  todaySurfaceCall: Record<string, unknown>;
  todayReceiptRow: Record<string, unknown>;
}> {
  const store = new RecordingStore();
  store.objects.set(`predictions/v1/dt=${TODAY}/all.jsonl`, predictionLine(TODAY, swell, { speed_kt: null, dir_deg: null }));
  // Tomorrow carries a real wind reading and a different height, so the
  // build's today-must-differ-from-tomorrow refusal never fires and this
  // property stays focused on today's null-wind row alone.
  store.objects.set(`predictions/v1/dt=${TOMORROW}/all.jsonl`, predictionLine(TOMORROW, { h_m: 1.4, t_s: 15.5, dir_deg: 204 }, { speed_kt: 7, dir_deg: 40 }));

  const clock: Clock = { now: () => new Date(BUILD_INSTANT) };
  const outcome = await runBuildOnce({ store, clock, region_id: 'pa-pacific', spots: [seed()] });
  assert.equal(outcome.published, true, `The fixture must publish before its contract can be read. Got ${JSON.stringify(outcome)}.`);

  const bundleBody = store.objects.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(bundleBody, 'The build must publish the region bundle; the reading lanes have no other input.');
  const bundle = JSON.parse(bundleBody) as { publish_surface: { days: { date: string; spots: Record<string, unknown>[] }[] } };
  const today = bundle.publish_surface.days.find((day) => day.date === TODAY);
  const todaySurfaceCall = today?.spots.find((entry) => entry.spot_id === SPOT_ID);
  assert.ok(todaySurfaceCall, 'Today must have a published call.');

  const callKey = [...store.objects.keys()].find((key) => key.startsWith('log/calls/v1/'));
  assert.ok(callKey, 'The build must write a PublishedCall receipt.');
  const callLog = store.objects.get(callKey) ?? '';
  const todayReceiptRow = callLog
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((row) => row.valid_ts === `${TODAY}T18:00Z`);
  assert.ok(todayReceiptRow, 'The receipt log must carry today\'s row.');

  return { todaySurfaceCall: todaySurfaceCall!, todayReceiptRow: todayReceiptRow! };
}

describe('a missing wind observation is never published as the best-case reading', () => {
  it('never publishes "clean" and never fabricates a wind token, regardless of the rest of the forecast', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.05, max: 3, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 5, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 359.999, noNaN: true, noDefaultInfinity: true }),
        async (h_m, t_s, dir_deg) => {
          const { todaySurfaceCall, todayReceiptRow } = await publishWithNullWindToday({ h_m, t_s, dir_deg });

          assert.equal(
            todaySurfaceCall.wind_state,
            undefined,
            `A null wind observation must never publish a structured wind token (never a fabricated "clean"). Got ${JSON.stringify(todaySurfaceCall.wind_state)}.`,
          );
          assert.equal(
            todayReceiptRow.wind_state,
            null,
            `The PublishedCall receipt must log the true null, never a fabricated token, so the audit trail stays honest. Got ${JSON.stringify(todayReceiptRow.wind_state)}.`,
          );
          const callEs = todaySurfaceCall.call_es as string;
          assert.ok(
            !callEs.includes('limpio'),
            `The baked call sentence must never claim "limpio" (the single best-case wind reading) when wind was never observed. Got: ${callEs}`,
          );
          assert.ok(
            callEs.includes('sin datos'),
            `The baked call sentence must state the absence honestly. Got: ${callEs}`,
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
