// Robustness begins by giving one device one voice per spot-day.  These laws
// exercise that pure pre-weighting boundary directly; the acceptance scenario
// separately proves the nightly fit consumes its result before estimation.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  collapseDeviceDayMedian,
  winsorizeSpotDayResiduals,
  type DeviceDaySample,
} from '../../src/learning/weights';

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
