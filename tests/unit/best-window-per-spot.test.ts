// Bug 2 regression: `best_window` must be derived from EACH spot's own
// hourly score series, never a fixed offset shared by every spot.
//
// Before this fix, `bestWindow(validTs, timezone)` computed `validTs + 3h`
// in the spot's timezone. Every spot shares one ranking anchor (the same
// T18:00Z hour) and one timezone (America/Panama, data/spots/pa-pacific.yaml),
// so every published row read the identical "mejor de 13:00 a 16:00" by
// construction -- the window carried zero information about the spot it was
// printed under.
//
// The fix (05-scoring-engine.md section 7, D6(a)): the longest contiguous
// run of daylight hours scoring at or above 80% of THAT day's own peak,
// built from the spot's real hourly predictions. This test drives the whole
// pipeline through its driving port (runBuildOnce) with two spots whose
// hourly series are engineered so exactly one hour scores above zero and
// every other daylight hour scores exactly zero -- a structural fact any
// correct "run at >= ratio * day max" implementation must resolve to that
// single hour, regardless of the exact scoring arithmetic. It also proves
// the documented `null when max_q = 0` case: a day with real predictions but
// no genuine peak must publish no window, not a crash and not an invented
// span.
//
// Driven through runBuildOnce, the build's driving port, exactly like
// tests/unit/published-bundle-contract.test.ts. The store is the only
// double, at the driven port boundary.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import type { BuildStore, Clock } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const BUILD_INSTANT = '2026-08-09T11:22:00Z';
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
// The daylight bounds this pipeline approximates (local 06:00-18:00,
// America/Panama = UTC-5) fall inside UTC hours 11 through 23 inclusive.
const DAYLIGHT_UTC_HOURS = Array.from({ length: 13 }, (_, index) => 11 + index);

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

function seed(spot_id: string, name: string): SpotSeed {
  return {
    spot_id,
    name,
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

/**
 * One hour, every declared member identical. `height_m` is the lever: 0
 * forces `S_size = 0` exactly (src/scoring/engine.ts sSize/combine both
 * special-case zero, never NaN), which forces `q = 0` exactly (combine's
 * geometric mean collapses to 0 the instant one participating factor is
 * zero). A non-zero height at direction 204 (inside the [150, 210] window,
 * so the direction gate stays 1) produces a genuinely positive score. This
 * makes the "one peak hour, every other hour zero" fixture exact by
 * construction, without needing to hand-replicate the scoring arithmetic.
 */
function hourLines(spotId: string, utcHour: number, heightM: number, windObserved = true): string {
  const validTs = `${TODAY}T${String(utcHour).padStart(2, '0')}:00Z`;
  return MEMBER_SOURCES.map((source) => JSON.stringify({
    spot_id: spotId,
    source,
    run_ts: `${TODAY}T06:00Z`,
    valid_ts: validTs,
    lead_h: 12,
    swell_h_m: heightM,
    swell_t_s: 15.5,
    swell_dir_deg: 204,
    wind_speed_kt: windObserved ? 7 : null,
    wind_dir_deg: windObserved ? 40 : null,
    tide_m: null,
    tide_day_low_m: null,
    tide_day_high_m: null,
    land_masked: false,
  })).join('\n');
}

/** A full daylight sweep for one spot with exactly one non-zero hour. */
function daySweepWithPeak(spotId: string, peakUtcHour: number): string {
  return DAYLIGHT_UTC_HOURS
    .map((hour) => hourLines(spotId, hour, hour === peakUtcHour ? 1.2 : 0))
    .join('\n');
}

/** A full daylight sweep with no peak anywhere: every hour scores zero. */
function flatDaySweep(spotId: string): string {
  return DAYLIGHT_UTC_HOURS.map((hour) => hourLines(spotId, hour, 0, false)).join('\n');
}

function tomorrowLine(spotId: string, heightM: number): string {
  return MEMBER_SOURCES.map((source) => JSON.stringify({
    spot_id: spotId,
    source,
    run_ts: `${TOMORROW}T06:00Z`,
    valid_ts: `${TOMORROW}T18:00Z`,
    lead_h: 12,
    swell_h_m: heightM,
    swell_t_s: 15.5,
    swell_dir_deg: 204,
    wind_speed_kt: 7,
    wind_dir_deg: 40,
    tide_m: null,
    tide_day_low_m: null,
    tide_day_high_m: null,
    land_masked: false,
  })).join('\n');
}

async function publish(store: RecordingStore, spots: SpotSeed[]): Promise<Record<string, unknown>> {
  const clock: Clock = { now: () => new Date(BUILD_INSTANT) };
  const outcome = await runBuildOnce({ store, clock, region_id: 'pa-pacific', spots });
  assert.equal(outcome.published, true, `The fixture must publish before its contract can be read. Got ${JSON.stringify(outcome)}.`);
  const bundleBody = store.objects.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(bundleBody, 'The build must publish the region bundle; the reading lanes have no other input.');
  return JSON.parse(bundleBody) as Record<string, unknown>;
}

/**
 * Reads the actual user-facing reading surface (`publish_surface`, the
 * SurfaceCall wire shape `publish-static-surface.ts` promotes into
 * `data/published-surface.json` and Astro pages render), not the internal
 * `bundle.days` builder struct nothing reads today. This is what proves the
 * fix, not an artifact only this test would ever look at.
 */
function todaySpot(bundle: Record<string, unknown>, spotId: string): Record<string, unknown> {
  const publishSurface = bundle.publish_surface as { days: { date: string; spots: Record<string, unknown>[] }[] };
  const today = publishSurface.days.find((day) => day.date === TODAY);
  const spot = today?.spots.find((entry) => entry.spot_id === spotId);
  assert.ok(spot, `${spotId} must have a published call for ${TODAY}.`);
  return spot!;
}

describe('best_window is derived from each spot\'s own hourly series', () => {
  it('gives two spots with different peak hours two different, hour-accurate windows', async () => {
    const store = new RecordingStore();
    // Playa Venao peaks at 12:00Z (07:00 local); Playa Cambutal peaks at
    // 20:00Z (15:00 local). Neither peak sits at the shared T18:00Z ranking
    // anchor (13:00 local) or at the old bug's fixed "13:00 to 16:00" span,
    // so a surviving fixed-offset implementation cannot accidentally pass.
    store.objects.set(`predictions/v1/dt=${TODAY}/venao.jsonl`, daySweepWithPeak('playa-venao', 12));
    store.objects.set(`predictions/v1/dt=${TODAY}/cambutal.jsonl`, daySweepWithPeak('playa-cambutal', 20));
    store.objects.set(`predictions/v1/dt=${TOMORROW}/all.jsonl`, [
      tomorrowLine('playa-venao', 0.5),
      tomorrowLine('playa-cambutal', 1.4),
    ].join('\n'));

    const bundle = await publish(store, [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')]);
    const venao = todaySpot(bundle, 'playa-venao');
    const cambutal = todaySpot(bundle, 'playa-cambutal');

    assert.deepEqual(
      venao.best_window,
      { start: '07:00', end: '07:00' },
      `Playa Venao's window must land on its own 12:00Z peak (07:00 local), not a shared offset. Got ${JSON.stringify(venao.best_window)}.`,
    );
    assert.deepEqual(
      cambutal.best_window,
      { start: '15:00', end: '15:00' },
      `Playa Cambutal's window must land on its own 20:00Z peak (15:00 local), not a shared offset. Got ${JSON.stringify(cambutal.best_window)}.`,
    );
    assert.notDeepEqual(
      venao.best_window,
      cambutal.best_window,
      'Two spots with genuinely different hourly data must never publish the identical best_window by construction.',
    );
    assert.ok(
      (venao.call_es as string).includes('07:00') && (cambutal.call_es as string).includes('15:00'),
      'The baked Spanish call sentence must repeat each spot\'s own window, not a copy-pasted one.',
    );
  });

  it('publishes no window, and no crash, on a day with real predictions but no genuine peak', async () => {
    const store = new RecordingStore();
    store.objects.set(`predictions/v1/dt=${TODAY}/flat.jsonl`, flatDaySweep('playa-venao'));
    store.objects.set(`predictions/v1/dt=${TOMORROW}/all.jsonl`, tomorrowLine('playa-venao', 1.4));

    const bundle = await publish(store, [seed('playa-venao', 'Playa Venao')]);
    const venao = todaySpot(bundle, 'playa-venao');

    assert.equal(
      venao.best_window,
      null,
      `A day whose every daylight hour scores zero has no genuine peak to build a window around (05-scoring-engine.md section 7: "null when max_q = 0"); the published surface must retain that honest null rather than omit it or invent a span. Got ${JSON.stringify(venao.best_window)}.`,
    );
    assert.equal(venao.wind_state, null, 'The same full-path fixture must retain its honest null wind fact.');
    assert.ok(
      !(venao.call_es as string).includes('mejor de'),
      'A day with no genuine window must not claim one in the baked call sentence.',
    );
    assert.ok(
      (venao.call_en as string).includes('no wind data, no estimated window.'),
      `The English call must compose both null facts from the same published row. Got ${String(venao.call_en)}.`,
    );
  });
});
