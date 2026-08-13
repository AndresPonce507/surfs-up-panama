// The best-window bar renders a published window onto the 06:00-18:00
// daylight track. Its one law: never draw a bar the data does not earn — a
// window the track cannot represent honestly is a stated absence (undefined),
// never a clamped-to-something guess that looks like data.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { bestWindowSpan } from '../../src/render/best-window';

const hhmm = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

describe('bestWindowSpan', () => {
  it('maps the full daylight window onto the whole track', () => {
    assert.deepEqual(bestWindowSpan({ start: '06:00', end: '18:00' }), { left: 0, width: 100 });
  });

  it('places an afternoon window at its true offset', () => {
    const span = bestWindowSpan({ start: '13:00', end: '18:00' });
    assert.ok(span !== undefined);
    assert.ok(Math.abs(span.left - (7 / 12) * 100) < 1e-9);
    assert.ok(Math.abs(span.width - (5 / 12) * 100) < 1e-9);
  });

  it('clamps a window that starts before dawn to the track edge', () => {
    const span = bestWindowSpan({ start: '05:00', end: '09:00' });
    assert.deepEqual(span, { left: 0, width: 25 });
  });

  it('refuses a window entirely outside the track', () => {
    assert.equal(bestWindowSpan({ start: '19:00', end: '21:00' }), undefined);
  });

  it('refuses an inverted or empty window', () => {
    assert.equal(bestWindowSpan({ start: '14:00', end: '13:00' }), undefined);
    assert.equal(bestWindowSpan({ start: '10:00', end: '10:00' }), undefined);
  });

  it('refuses text that is not a clock time instead of inventing a bar', () => {
    assert.equal(bestWindowSpan({ start: 'madrugada', end: '18:00' }), undefined);
    assert.equal(bestWindowSpan({ start: '', end: '' }), undefined);
    assert.equal(bestWindowSpan({ start: '6:00', end: '18:00' }), undefined);
  });

  it('@property every drawn bar fits the track: 0 <= left, left + width <= 100, width > 0', () => {
    fc.assert(
      fc.property(hhmm, hhmm, (start, end) => {
        const span = bestWindowSpan({ start, end });
        if (span === undefined) return true;
        return span.left >= 0 && span.width > 0 && span.left + span.width <= 100 + 1e-9;
      }),
    );
  });

  it('@property a bar is drawn exactly when the clamped window has real daylight width', () => {
    fc.assert(
      fc.property(hhmm, hhmm, (start, end) => {
        const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
        const lo = Math.max(toMin(start), 360);
        const hi = Math.min(toMin(end), 1080);
        const drawable = hi > lo;
        return (bestWindowSpan({ start, end }) !== undefined) === drawable;
      }),
    );
  });
});
