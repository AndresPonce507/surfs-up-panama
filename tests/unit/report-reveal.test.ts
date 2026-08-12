// The reveal: what the surfer reads once their own report has arrived.
//
// Two driving ports, both pure at this layer:
//
//  - sendSavedReport (src/report/submit.ts) is the transport boundary. The
//    server already computes the whole comparison (src/report/call-log-reader.
//    ts returns the delta, src/report/aws-write-store.ts adds the counter), so
//    the only question here is whether the browser keeps what it was handed.
//    Proven as a property: the receipt must survive an arbitrary signed delta
//    and an arbitrary count, because a transport that only carries the values
//    someone happened to pick as an example is not a transport.
//
//  - decideArrivalUi (src/report/reveal.ts) is the pure decision that turns a
//    receipt plus the surfer's own answers into what the screen says. No DOM
//    here: this repo's unit suite runs without jsdom, so island.ts's
//    renderRevealView is proven in a real browser by
//    tests/acceptance/f-tell-us-what-you-saw-cold/the-call-is-revealed-only-
//    after-arrival.feature.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { Fetcher } from '../../src/report/mint';
import type { ReportAnswers } from '../../src/report/report-record';
import { RECEIVED_MESSAGE, decideArrivalUi } from '../../src/report/reveal';
import { sendSavedReport, type ReportReceipt } from '../../src/report/submit';

const REPORT_URL = 'https://report-id.lambda-url.us-east-1.on.aws/';

const predicted = {
  score_q: 82,
  size_band: 'chest_head',
  size_range_m: [1.1, 1.6],
  wind_state: 'clean',
  conf_level: 'medium',
} as const;

/** The waist to chest, choppy and good report the acceptance journey sends. */
const observed: ReportAnswers = { size_band: 'waist_chest', wind: 'choppy', quality: 'good' };

describe('carrying the comparison the server computed back to the surfer', () => {
  it('keeps the signed difference and the report count the receipt arrived with', async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -6, max: 6 }),
      fc.integer({ min: 1, max: 5_000 }),
      async (score_points, size_bands, n_reports) => {
        const body = {
          report_id: 'report-1',
          outcome: 'compared',
          predicted,
          delta: { score_points, size_bands },
          counter: { n_reports, threshold: 30 },
        };
        const fetcher: Fetcher = async () => new Response(JSON.stringify(body), { status: 200 });

        const result = await sendSavedReport('{"report_id":"report-1"}', 'credential-1', fetcher, REPORT_URL);

        assert.deepEqual(
          result,
          { kind: 'received', receipt: body },
          'the browser must keep the whole receipt: a dropped delta or counter is a comparison the surfer can never be shown',
        );
      },
    ));
  });
});

describe('telling the surfer how the call did', () => {
  it('says what we said, what they saw, which way we missed and how many reports this spot has', () => {
    fc.assert(fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: 1, max: 5_000 }),
      (score_points, n_reports) => {
        const receipt: ReportReceipt = {
          report_id: 'report-1',
          outcome: 'compared',
          predicted,
          delta: { score_points, size_bands: 1 },
          counter: { n_reports, threshold: 30 },
        };

        const view = decideArrivalUi(receipt, observed);

        assert.ok(view.comparison !== undefined, 'a receipt carrying a whole comparison must produce one');
        // application-architecture.md section 10, report screen 2: the canonical
        // report vocabulary on both halves, the sign flipping the verb.
        assert.equal(view.comparison.said, 'Dijimos: Pecho a cabeza (≈1.1 a 1.6 m), limpio. 82.');
        assert.equal(view.comparison.saw, 'Tú viste: Cintura a pecho, picado.');
        assert.equal(view.comparison.difference, expectedDifference(score_points));
        assert.equal(view.comparison.count, `Reporte ${n_reports} de 30 en este spot. Gracias.`);
      },
    ));
  });
});

describe('reading the comparison off what the receipt carries, never off its outcome word', () => {
  it('repeats the whole card for a resent report and shows no card at all when a part is missing', () => {
    const whole = {
      report_id: 'report-1',
      predicted,
      delta: { score_points: 12, size_bands: 1 },
      counter: { n_reports: 8, threshold: 30 },
    };

    // 07-write-path.md section 4.2: a resent report returns its original
    // reveal and the screen renders it identically.
    const resent = decideArrivalUi({ ...whole, outcome: 'queued_duplicate' }, observed);
    assert.deepEqual(resent, decideArrivalUi({ ...whole, outcome: 'compared' }, observed));
    assert.equal(resent.comparison?.difference, 'Nos pasamos 12 puntos.');

    const missingParts: readonly ReportReceipt[] = [
      { ...whole, outcome: 'compared', predicted: null },
      { report_id: whole.report_id, outcome: 'compared', predicted, counter: whole.counter },
      { report_id: whole.report_id, outcome: 'compared', predicted, delta: whole.delta },
      { ...whole, outcome: 'compared', predicted: { ...predicted, size_band: 'not_a_band' } },
    ];
    for (const receipt of missingParts) {
      const view = decideArrivalUi(receipt, observed);
      assert.equal(view.comparison, undefined, 'a receipt missing a part of the comparison must produce no card');
      assert.equal(view.message, RECEIVED_MESSAGE, 'the arrival stays plainly true when there is nothing whole to compare');
      assert.ok(!/\d/.test(`${view.heading} ${view.message}`), 'a state with nothing to compare must show no number at all');
    }

    const withoutAnswers = decideArrivalUi({ ...whole, outcome: 'compared' }, undefined);
    assert.equal(withoutAnswers.comparison, undefined, 'with no readable answers there is no "Tú viste" half, so there is no card');
  });
});

/** The spec's own rule, re-derived: positive means we ran big (07-write-path.md section 4.2). */
function expectedDifference(scorePoints: number): string {
  if (scorePoints === 0) return 'Le dimos justo.';
  const size = Math.abs(scorePoints);
  const points = size === 1 ? '1 punto' : `${size} puntos`;
  return scorePoints > 0 ? `Nos pasamos ${points}.` : `Nos quedamos cortos ${points}.`;
}
