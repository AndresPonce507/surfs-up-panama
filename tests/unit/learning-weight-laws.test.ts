// Robustness begins by giving one device one voice per spot-day.  These laws
// exercise that pure pre-weighting boundary directly; the acceptance scenario
// separately proves the nightly fit consumes its result before estimation.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { readReporterOverrides } from '../../src/learning/inputs';
import {
  applyReporterOverrides,
  collapseDeviceDayMedian,
  concordanceWeight,
  selectionWeight,
  winsorizeSpotDayResiduals,
  type DeviceDaySample,
} from '../../src/learning/weights';

function overrideStore(body: string | null) {
  return {
    list: async () => [],
    get: async () => body,
  };
}

function sample(value: number): DeviceDaySample {
  return {
    spot_id: 'playa-venao',
    session_day: '2026-07-01',
    device_id: 'd_one_voice',
    value,
    weight: 1,
  };
}

describe('device-day collapse', () => {
  it('reduces every same-session multiset to its median voice', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 31 }),
        (values) => {
          const collapsed = collapseDeviceDayMedian(values.map(sample));
          const ordered = [...values].sort((left, right) => left - right);
          const median = ordered[Math.floor((ordered.length - 1) / 2)];
          assert.deepEqual(collapsed.map((entry) => entry.value), [median]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('keeps separate device-days separate', () => {
    const collapsed = collapseDeviceDayMedian([
      sample(-0.2),
      { ...sample(0.4), device_id: 'd_other' },
      { ...sample(0.6), session_day: '2026-07-02' },
    ]);
    assert.equal(collapsed.length, 3, 'only samples sharing every spot, day, and device identity may collapse');
  });
});

describe('spot-day winsorization', () => {
  it('pins every wild third voice to two widths from that day\'s median', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 0.9, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 2, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        (middle, width, extra, positive) => {
          const direction = positive ? 1 : -1;
          const wild = middle + direction * (2 * width + extra);
          const fenced = winsorizeSpotDayResiduals([
            { ...sample(middle), device_id: 'd_left', band_width_m: width },
            { ...sample(middle), device_id: 'd_middle', band_width_m: width },
            { ...sample(wild), device_id: 'd_wild', band_width_m: width },
          ]);
          assert.equal(fenced[2]?.value, middle + direction * 2 * width);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('leaves a day with fewer than three device voices untouched', () => {
    const samples = [
      { ...sample(-0.2), device_id: 'd_one', band_width_m: 0.5 },
      { ...sample(2), device_id: 'd_two', band_width_m: 0.5 },
    ];
    assert.deepEqual(winsorizeSpotDayResiduals(samples), samples);
  });
});

describe('reporter concordance', () => {
  it('clips chronic disagreement without discounting an unobserved newcomer', () => {
    fc.assert(
      fc.property(
        fc.option(
          fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
          { nil: undefined },
        ),
        (disagreement) => {
          const expected = disagreement === undefined
            ? 1
            : Math.min(1, Math.max(0.2, 4 / (4 + disagreement)));
          assert.equal(concordanceWeight(disagreement), expected);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('selection propensity', () => {
  it('caps organic rarity and leaves solicited mornings exactly plain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 90 }),
        fc.integer({ min: 0, max: 90 }),
        fc.integer({ min: 0, max: 90 }),
        fc.boolean(),
        (totalDays, reportedDays, totalReportedDays, solicited) => {
          const boundedReportedDays = Math.min(reportedDays, totalDays);
          const boundedTotalReportedDays = Math.min(totalReportedDays, totalDays);
          const actual = selectionWeight({
            totalDays,
            reportedDays: boundedReportedDays,
            totalReportedDays: boundedTotalReportedDays,
            trigger: solicited ? 'push_solicited' : 'organic',
          });
          const expected = solicited
            ? 1
            : boundedReportedDays === 0
              ? 3
              : Math.min(3, (boundedTotalReportedDays / totalDays) / (boundedReportedDays / totalDays));
          assert.equal(actual, expected);
          assert.ok(actual <= 3, 'a rare decile can never dominate the fit');
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('incident reporter overrides', () => {
  it('reads every finite zero-to-one reporter entry from the flat incident file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.constantFrom('d_keep_a', 'd_keep_b', 'd_excise'),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        ),
        async (overrides) => {
          assert.deepEqual(
            await readReporterOverrides(overrideStore(JSON.stringify(overrides))),
            Object.fromEntries(Object.entries(overrides)),
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('treats an absent, malformed, or non-flat incident file as the all-one default', async () => {
    for (const body of [null, '{not-json', JSON.stringify({ d_excise: -1 }), JSON.stringify(['d_excise'])]) {
      assert.deepEqual(await readReporterOverrides(overrideStore(body)), {});
    }
  });

  it('removes only reporters set to zero and leaves every absent override at full weight', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('d_keep_a', 'd_keep_b', 'd_excise'), { minLength: 1, maxLength: 30 }),
        (reporters) => {
          const observations = reporters.map((device_id, index) => ({
            spot_id: 'playa-venao',
            device_id,
            observed_at: `2026-07-${String(index + 1).padStart(2, '0')}T18:00:00Z`,
          }));
          const weighted = applyReporterOverrides(observations, { d_excise: 0 });

          assert.deepEqual(
            weighted.map((observation) => observation.device_id),
            reporters.filter((reporter) => reporter !== 'd_excise'),
          );
          assert.ok(weighted.every((observation) => observation.override_weight === 1));
        },
      ),
      { numRuns: 50 },
    );
  });
});
