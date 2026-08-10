// Robustness begins by giving one device one voice per spot-day.  These laws
// exercise that pure pre-weighting boundary directly; the acceptance scenario
// separately proves the nightly fit consumes its result before estimation.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { collapseDeviceDayMedian, type DeviceDaySample } from '../../src/learning/weights';

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
