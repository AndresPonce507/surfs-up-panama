// The shared bundle contract. Slice-06 renders a per-spot detail page and
// slice-07 renders a per-row confidence, and both read the SAME published
// object: they must never each invent a field name for it.
//
// Authority: domain-model.md section 13 (schema authority for the region
// bundle) and adr-two-day-ranking.md (days[] ranked per day, spot_detail{}
// unordered and day-independent). The split this test pins:
//   - conf_level is a DAY field, because confidence genuinely drops with lead
//   - conf_value is continuous and stays in the PublishedCall log only, so a
//     page shows a level and threshold tuning reads the log
//
// Driven through runBuildOnce, the build's driving port. The store is the only
// double, at the driven port boundary, with the real S3 conditional-PUT
// semantics the prediction log rides on.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import type { BuildStore, Clock } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';
import { probeInMemoryPublishedCallHistory } from '../acceptance/daily-call-with-permanent-receipts/steps/support/fakes';

const BUILD_INSTANT = '2026-08-09T11:22:00Z';
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;

/** Every field the two reading lanes may join on, day by day. */
const DAY_SUMMARY_FIELDS = [
  'best_window',
  'call',
  'conf_level',
  'confidence_reason',
  'score_q',
  'size_band',
  'size_range_m',
  'spot_id',
  'weakest_link',
  'wind_state',
] as const;

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

  async listPublishedCallKeys(scope: { region_id: string; prefix: 'log/calls/v1/' }): Promise<readonly string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(scope.prefix) && key.endsWith(`/${scope.region_id}.jsonl.gz`)).sort();
  }

  async getPublishedCall(key: string): Promise<string> {
    const body = this.objects.get(key);
    if (body === undefined) throw new Error(`published call receipt unavailable: ${key}`);
    return body;
  }

  async probePublishedCallHistory(scope: { region_id: string; prefix: 'log/calls/v1/' }) {
    return probeInMemoryPublishedCallHistory(this.objects, scope);
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

function predictionLines(spot_id: string, date: string, height_m: number): string {
  return MEMBER_SOURCES
    .map((source, index) => JSON.stringify({
      spot_id,
      source,
      run_ts: `${date}T06:00Z`,
      valid_ts: `${date}T18:00Z`,
      lead_h: 12,
      swell_h_m: height_m + index * 0.02,
      swell_t_s: 15.5,
      swell_dir_deg: 204 + index,
      wind_speed_kt: 7,
      wind_dir_deg: 40,
      tide_m: 2.31,
      tide_day_low_m: 0.9,
      tide_day_high_m: 4.3,
      land_masked: false,
    }))
    .join('\n');
}

async function publishTwoSpots(): Promise<{ bundle: Record<string, unknown>; callLog: string }> {
  const store = new RecordingStore();
  // Heights differ per spot and per day, so today's ranking and tomorrow's are
  // genuinely their own lists and the build's clone guard cannot mask a bug.
  store.objects.set(`predictions/v1/dt=${TODAY}/all.jsonl`, [
    predictionLines('playa-venao', TODAY, 1.2),
    predictionLines('playa-cambutal', TODAY, 0.7),
  ].join('\n'));
  store.objects.set(`predictions/v1/dt=${TOMORROW}/all.jsonl`, [
    predictionLines('playa-venao', TOMORROW, 0.5),
    predictionLines('playa-cambutal', TOMORROW, 1.4),
  ].join('\n'));

  const clock: Clock = { now: () => new Date(BUILD_INSTANT) };
  const outcome = await runBuildOnce({
    store,
    clock,
    region_id: 'pa-pacific',
    spots: [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')],
  });
  assert.equal(outcome.published, true, `The two-day fixture must publish before its contract can be read. Got ${JSON.stringify(outcome)}.`);

  const bundleKey = 'pub/v1/regions/pa-pacific/bundle.json';
  const bundleBody = store.objects.get(bundleKey);
  assert.ok(bundleBody, `The build must publish ${bundleKey}; the reading lanes have no other input.`);
  const callKey = [...store.objects.keys()].find((key) => key.startsWith('log/calls/v1/'));
  assert.ok(callKey, 'The build must write a PublishedCall receipt; it is the only home of the continuous confidence value.');

  return {
    bundle: JSON.parse(bundleBody) as Record<string, unknown>,
    callLog: store.objects.get(callKey) ?? '',
  };
}

describe('published region bundle contract', () => {
  it('gives both days the same joinable summary and every spot one identity', async () => {
    const { bundle, callLog } = await publishTwoSpots();

    assert.deepEqual(
      {
        schema: bundle.schema,
        region_id: bundle.region_id,
        build_id: bundle.build_id,
        published_at: bundle.published_at,
      },
      {
        schema: 'region-bundle/1',
        region_id: 'pa-pacific',
        build_id: 'b_2026-08-09T11Z',
        published_at: BUILD_INSTANT.replace('Z', '.000Z'),
      },
      'The bundle header carries the stamp every route and every share card joins on, once per file.',
    );

    const days = bundle.days as { date: string; spots: Record<string, unknown>[] }[];
    const spotDetail = bundle.spot_detail as Record<string, { name: string }>;

    assert.deepEqual(
      days.map((day) => day.date),
      [TODAY, TOMORROW],
      'A bundle is exactly today and the next civil date; the product refuses to forecast past tomorrow.',
    );

    for (const [index, day] of days.entries()) {
      for (const summary of day.spots) {
        assert.deepEqual(
          Object.keys(summary).sort(),
          [...DAY_SUMMARY_FIELDS],
          `Day ${index} summary for ${String(summary.spot_id)} must carry exactly the settled day fields, so neither reading lane guesses a name nor finds a surprise one.`,
        );
        assert.ok(
          Object.hasOwn(spotDetail, String(summary.spot_id)),
          `Every ranked spot must resolve to one identity in spot_detail; ${String(summary.spot_id)} does not.`,
        );
      }
    }

    assert.deepEqual(
      Object.entries(spotDetail).map(([spot_id, detail]) => [spot_id, detail.name]).sort(),
      [['playa-cambutal', 'Playa Cambutal'], ['playa-venao', 'Playa Venao']],
      'spot_detail holds the day-independent identity once, never a second copy per day.',
    );

    const todaysVenao = days[0]?.spots.find((summary) => summary.spot_id === 'playa-venao');
    const tomorrowsVenao = days[1]?.spots.find((summary) => summary.spot_id === 'playa-venao');
    assert.notDeepEqual(
      [todaysVenao?.score_q, todaysVenao?.size_band],
      [tomorrowsVenao?.score_q, tomorrowsVenao?.size_band],
      'A day summary is that day\'s own numbers; a smaller swell tomorrow must not render as today copied forward.',
    );

    for (const [index, day] of days.entries()) {
      for (const summary of day.spots) {
        assert.ok(
          ['low', 'medium', 'high'].includes(String(summary.conf_level)),
          `Day ${index} confidence must publish as one of the three levels a page can print, not a raw number. Got ${String(summary.conf_level)}.`,
        );
        const reason = summary.confidence_reason as { es?: unknown } | undefined;
        assert.equal(
          typeof reason?.es,
          'string',
          `Day ${index} confidence must carry its own Spanish reason beside the level, not leave the reading surface to invent one.`,
        );
      }
    }

    assert.ok(
      !JSON.stringify(bundle).includes('conf_value'),
      'The continuous confidence value belongs to the call log alone: a page shows a level, and thresholds stay retunable without rewriting history.',
    );
    assert.ok(
      callLog.includes('"conf_value"') && callLog.includes('"conf_level"'),
      'The PublishedCall receipt must keep both, so a later threshold change can be replayed against what was actually shown.',
    );
  });
});
