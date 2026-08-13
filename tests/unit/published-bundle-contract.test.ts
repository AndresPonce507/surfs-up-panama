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
import type { ObservationLogReader } from '../../src/scorecard/observation-source';
import { assertStrictTwoDayUpdate } from '../../src/publish/static-surface';
import type { SpotSeed } from '../../src/scoring/engine';

const BUILD_INSTANT = '2026-08-09T11:22:00Z';
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;

/** Every field the two reading lanes may join on, day by day. */
const DAY_SUMMARY_FIELDS = [
  'best_window',
  'call',
  'conf_level',
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

function predictionLines(spot_id: string, date: string, height_m: number, utcHour = '18', validDate = date): string {
  return MEMBER_SOURCES
    .map((source, index) => JSON.stringify({
      spot_id,
      source,
      run_ts: `${date}T06:00Z`,
      valid_ts: `${validDate}T${utcHour}:00Z`,
      lead_h: 12,
      swell_h_m: height_m + index * 0.02,
      swell_t_s: 15.5,
      swell_dir_deg: 204 + index,
      // Wind and tide are absent at 21:00Z on purpose: a real morning loses
      // observations for some hours and the projection must carry that
      // absence through as null rather than as a zero or a best case.
      wind_speed_kt: utcHour === '21' ? null : 7,
      wind_dir_deg: utcHour === '21' ? null : 40,
      tide_m: utcHour === '21' ? null : 2.31,
      tide_day_low_m: utcHour === '21' ? null : 0.9,
      tide_day_high_m: utcHour === '21' ? null : 4.3,
      land_masked: false,
    }))
    .join('\n');
}

/** UTC hours that all land inside their own Panama civil day (UTC-5): 07:00 to 16:00 local. */
const IN_HORIZON_UTC_HOURS = ['12', '15', '18', '21'] as const;

/**
 * 00:00Z on the published day is 19:00 on the PREVIOUS Panama evening. The
 * build scores it (its UTC prefix is today) but it belongs to a civil day
 * this surface does not publish, so the projection must leave it out. This is
 * the row that fails an implementation which groups by the UTC prefix the
 * rest of build.ts ranks by.
 */
const BEFORE_HORIZON_UTC_HOUR = '00';

const PROJECTED_SPOTS = ['playa-venao', 'playa-cambutal'] as const;

type ProjectedPoint = { readonly t: string; readonly sub: Record<string, number | null> };
type ProjectedDetail = { readonly name: string; readonly hourly?: readonly ProjectedPoint[] };
type ReceiptRow = { readonly spot_id: string; readonly valid_ts: string; readonly sub: Record<string, number | null> };

async function publishEveryScoredHour(): Promise<{ bundle: Record<string, unknown>; receipts: readonly ReceiptRow[] }> {
  const store = new RecordingStore();
  const heights: Record<string, Record<string, number>> = {
    [TODAY]: { 'playa-venao': 1.2, 'playa-cambutal': 0.7 },
    [TOMORROW]: { 'playa-venao': 0.5, 'playa-cambutal': 1.4 },
  };
  for (const date of [TODAY, TOMORROW]) {
    const perDate = heights[date]!;
    store.objects.set(`predictions/v1/dt=${date}/all.jsonl`, PROJECTED_SPOTS.flatMap((spot_id) => [
      ...IN_HORIZON_UTC_HOURS.map((utcHour) => predictionLines(spot_id, date, perDate[spot_id]!, utcHour)),
      ...(date === TODAY ? [predictionLines(spot_id, date, perDate[spot_id]!, BEFORE_HORIZON_UTC_HOUR)] : []),
    ]).join('\n'));
  }

  const clock: Clock = { now: () => new Date(BUILD_INSTANT) };
  const outcome = await runBuildOnce({
    store,
    clock,
    region_id: 'pa-pacific',
    spots: [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')],
  });
  assert.equal(outcome.published, true, `The many-hour fixture must publish before its projection can be read. Got ${JSON.stringify(outcome)}.`);

  const bundleBody = store.objects.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(bundleBody, 'The build must publish the region bundle; the reading lanes have no other input.');
  const callKey = [...store.objects.keys()].find((key) => key.startsWith('log/calls/v1/'));
  assert.ok(callKey, 'The build must write a PublishedCall receipt; it is the only witness of what was actually scored.');

  return {
    bundle: JSON.parse(bundleBody) as Record<string, unknown>,
    receipts: (store.objects.get(callKey) ?? '').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as ReceiptRow),
  };
}

async function publishTwoSpots(
  observationLog?: ObservationLogReader,
  buildInstant = BUILD_INSTANT,
  historicalPredictionFiles: Readonly<Record<string, string>> = {},
): Promise<{ bundle: Record<string, unknown>; callLog: string }> {
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
  for (const [key, body] of Object.entries(historicalPredictionFiles)) store.objects.set(key, body);

  const clock: Clock = { now: () => new Date(buildInstant) };
  const outcome = await runBuildOnce({
    store,
    clock,
    region_id: 'pa-pacific',
    spots: [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')],
    ...(observationLog === undefined ? {} : { observationLog }),
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
  it('carries the honest zero-data P5 scorecard block for every rendered spot', async () => {
    const { bundle } = await publishTwoSpots();
    const details = bundle.spot_detail as Record<string, Record<string, unknown>>;
    const publishSurface = bundle.publish_surface as { spot_detail: Record<string, Record<string, unknown>> };

    for (const spotId of PROJECTED_SPOTS) {
      assert.deepEqual(
        details[spotId]?.scorecard,
        {
          n_obs: 0,
          n_reporters: 0,
          threshold: 30,
          counter: '0 / 30',
          claim_ok: false,
          headline: null,
        },
        `P5: ${spotId} must carry a computed scorecard block into the bundle even before the immutable observation log has an object.`,
      );
      assert.deepEqual(
        publishSurface.spot_detail[spotId]?.scorecard,
        details[spotId]?.scorecard,
        `P5: ${spotId}'s scorecard must cross the Publisher's publish_surface handoff unchanged.`,
      );
    }
  });

  it('projects actual immutable observation rows into the matching spot block', async () => {
    const observationLog: ObservationLogReader = async () => [
      ...['device-1', 'device-2', 'device-3'].map((device_id, index) => ({
        spot_id: 'playa-venao',
        device_id,
        observed_at: `2026-08-09T18:0${index}:00Z`,
        size_band: 'waist_chest',
        quality: 'good',
        credential_issued_at: '2026-07-01T00:00:00Z',
        received_at: `2026-08-09T18:0${index}:00Z`,
        predicted: { score_q: 70 },
      })),
    ];
    const { bundle } = await publishTwoSpots(observationLog, '2026-08-09T23:22:00Z');
    const details = bundle.spot_detail as Record<string, Record<string, unknown>>;

    assert.deepEqual(details['playa-venao']?.scorecard, {
      n_obs: 3,
      n_reporters: 3,
      threshold: 30,
      counter: '3 / 30',
      claim_ok: false,
      headline: null,
    });
    assert.deepEqual(details['playa-cambutal']?.scorecard, {
      n_obs: 0,
      n_reporters: 0,
      threshold: 30,
      counter: '0 / 30',
      claim_ok: false,
      headline: null,
    });
  });

  it('reads the immutable prediction partition that matches an older observation before projecting it', async () => {
    const observationLog: ObservationLogReader = async () => [{
      spot_id: 'playa-venao',
      device_id: 'device-1',
      observed_at: '2026-08-01T18:00:00Z',
      size_band: 'waist_chest',
      quality: 'good',
      credential_issued_at: '2026-07-01T00:00:00Z',
      received_at: '2026-08-01T18:00:00Z',
      predicted: { score_q: 70 },
    }];

    const { bundle } = await publishTwoSpots(
      observationLog,
      '2026-08-09T23:22:00Z',
      {
        'predictions/v1/dt=2026-07-25/history.jsonl': predictionLines(
          'playa-venao',
          '2026-07-25',
          1.2,
          '18',
          '2026-08-01',
        ),
      },
    );
    const details = bundle.spot_detail as Record<string, Record<string, unknown>>;

    assert.equal(
      (details['playa-venao']?.scorecard as { counter?: string } | undefined)?.counter,
      '1 / 30',
      'a scorecard rebuild must join an observation with the immutable prediction log rather than only today\'s forecast input',
    );
  });

  it('refuses the build when the immutable observation reader cannot answer, never falling back to zero', async () => {
    const unreadable: ObservationLogReader = async () => {
      throw new Error('observation source access denied');
    };

    await assert.rejects(
      () => publishTwoSpots(unreadable),
      /observation source access denied/,
      'a read failure must stop before the bundle can substitute the day-one counter for a real source',
    );
  });

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
        const hasCounterfactual = Object.hasOwn(summary, 'counterfactual_score_q');
        const hasSuppression = Object.hasOwn(summary, 'counterfactual_suppression');
        const expectedFields = summary.weakest_link === null
          ? [...DAY_SUMMARY_FIELDS]
          : [
            ...DAY_SUMMARY_FIELDS,
            'weakest_link_subscore',
            hasCounterfactual ? 'counterfactual_score_q' : 'counterfactual_suppression',
          ];
        assert.deepEqual(
          Object.keys(summary).sort(),
          expectedFields.sort(),
          `Day ${index} summary for ${String(summary.spot_id)} must carry exactly the settled day fields, so neither reading lane guesses a name nor finds a surprise one.`,
        );
        if (summary.weakest_link !== null) {
          assert.ok(
            typeof summary.weakest_link_subscore === 'number'
              && Number.isFinite(summary.weakest_link_subscore)
              && summary.weakest_link_subscore >= 0
              && summary.weakest_link_subscore <= 1,
            `Day ${index} ${summary.spot_id}: named weakest link must carry its own finite raw score.`,
          );
          assert.notEqual(
            hasCounterfactual,
            hasSuppression,
            `Day ${index} ${summary.spot_id}: a fresh named culprit must carry exactly one counterfactual representation.`,
          );
          if (hasCounterfactual) {
            assert.ok(
              typeof summary.counterfactual_score_q === 'number'
                && Number.isInteger(summary.counterfactual_score_q)
                && summary.counterfactual_score_q >= 0
                && summary.counterfactual_score_q <= 100
                && typeof summary.score_q === 'number'
                && summary.counterfactual_score_q > summary.score_q,
              `Day ${index} ${summary.spot_id}: a counterfactual must be an integral score strictly above this row's score.`,
            );
          } else {
            assert.equal(
              summary.counterfactual_suppression,
              'rounded_equal',
              `Day ${index} ${summary.spot_id}: equality may only use the declared rounded_equal marker.`,
            );
          }
        } else {
          assert.ok(!hasCounterfactual && !hasSuppression, `Day ${index} ${summary.spot_id}: a clean row carries neither counterfactual representation.`);
        }
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

  // Slice-04, step 04-02. The projection is a PROJECTION: the same scored
  // numbers the receipt already recorded, re-addressed by their own
  // spot-local hour. It is not a second scoring pass and it may not
  // substitute a missing observation.
  it('projects every scored hour of the two published civil days onto spot_detail, carrying the receipt\'s own sub values and nulls', async () => {
    const { bundle, receipts } = await publishEveryScoredHour();
    const spotDetail = bundle.spot_detail as Record<string, ProjectedDetail>;
    const surface = (bundle.publish_surface as { spot_detail: Record<string, ProjectedDetail> }).spot_detail;

    // The strict reading-surface validator (04-01) is the gate a real
    // publish runs through; a fresh projection must satisfy it, not merely
    // look plausible in this assertion.
    assertStrictTwoDayUpdate(bundle.publish_surface);

    for (const spotId of PROJECTED_SPOTS) {
      const points = spotDetail[spotId]?.hourly;
      assert.ok(points, `${spotId}: a freshly built surface must publish its hourly projection.`);
      assert.deepEqual(
        surface[spotId]?.hourly,
        points,
        `${spotId}: the bundle and the reading surface must carry the one projection, never two that can disagree.`,
      );

      const scored = receipts.filter((row) => row.spot_id === spotId);
      const beforeHorizon = scored.filter((row) => row.valid_ts.endsWith(`T${BEFORE_HORIZON_UTC_HOUR}:00Z`));
      assert.equal(beforeHorizon.length, 1, `${spotId}: the fixture must actually score the previous-evening hour it expects to be dropped.`);
      assert.equal(
        points.length,
        scored.length - beforeHorizon.length,
        `${spotId}: the projection must hold one point per scored hour of the two published civil days -- no fabricated hour, and no hour belonging to a day this surface does not publish.`,
      );

      const byInstant = new Map(points.map((point) => [new Date(point.t).toISOString(), point]));
      assert.equal(byInstant.size, points.length, `${spotId}: two projection points name the same instant.`);

      for (const row of scored) {
        const point = byInstant.get(new Date(row.valid_ts).toISOString());
        if (row.valid_ts.endsWith(`T${BEFORE_HORIZON_UTC_HOUR}:00Z`)) {
          assert.equal(point, undefined, `${spotId}: ${row.valid_ts} is 19:00 the previous Panama evening and must not be projected onto a day this surface publishes.`);
          continue;
        }
        assert.ok(point, `${spotId}: the scored hour ${row.valid_ts} reached the receipt but never reached the projection.`);
        assert.deepEqual(Object.keys(point).sort(), ['sub', 't'], `${spotId}: a projection point carries the local hour and its four sub-scores, nothing else.`);
        assert.match(
          point.t,
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}$/u,
          `${spotId}: ${point.t} is not a precomputed spot-local stamp with its own numeric offset; a page would have to work the local hour out for itself.`,
        );
        assert.ok(
          [TODAY, TOMORROW].includes(point.t.slice(0, 10)),
          `${spotId}: ${point.t} sits outside the two civil days this surface publishes.`,
        );
        assert.deepEqual(
          point.sub,
          row.sub,
          `${spotId}: ${row.valid_ts} was scored ${JSON.stringify(row.sub)} and projected ${JSON.stringify(point.sub)}; the projection must repeat the receipt exactly, nulls included.`,
        );
      }

      assert.ok(
        points.some((point) => point.sub.wind === null && point.sub.tide === null),
        `${spotId}: the fixture's unobserved hour must stay null in the projection, never a zero and never a best case.`,
      );
    }
  });
});
