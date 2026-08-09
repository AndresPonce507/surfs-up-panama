// covers: R43, R46
// In-process acceptance scenarios for the static reading surface. The sole
// browser E2E remains the public walking skeleton; these test the builder's
// state selection without multiplying subprocess browsers.

import { describe, expect, it } from 'vitest';

import { resolveYesterdayReading, type PublishedReceipt } from '../../../src/publish/reading-state';

const priorDawn: PublishedReceipt = {
  surf_date: '2026-08-07',
  published_at: '2026-08-07T11:22:00Z',
  build_kind: 'dawn',
  spot_id: 'playa-venao',
  score_q: 80,
};

describe('the static reading states', () => {
  it('shows a Spanish explanation, not a fabricated score, on the first morning without yesterday', () => {
    const state = resolveYesterdayReading({
      spot_id: 'playa-venao',
      prior_surf_date: '2026-08-07',
      receipts: [],
      current_build_refused: false,
    });

    expect(state).toEqual({
      kind: 'empty',
      message_es: 'Todavía no hay un llamado de ayer para Playa Venao.',
    });
  });

  it('uses only the prior civil day dawn receipt and preserves its exact publish time', () => {
    const currentCivilDayDawn: PublishedReceipt = {
      ...priorDawn,
      surf_date: '2026-08-08',
      published_at: '2026-08-08T11:22:00Z',
      score_q: 91,
    };
    const wrongSpotDawn: PublishedReceipt = {
      ...priorDawn,
      spot_id: 'santa-catalina',
      score_q: 64,
    };
    const olderCivilDayDawn: PublishedReceipt = {
      ...priorDawn,
      surf_date: '2026-08-06',
      published_at: '2026-08-06T11:22:00Z',
      score_q: 43,
    };
    const laterRevision: PublishedReceipt = {
      ...priorDawn,
      published_at: '2026-08-07T17:22:00Z',
      build_kind: 'hourly',
      score_q: 12,
    };

    const state = resolveYesterdayReading({
      spot_id: 'playa-venao',
      prior_surf_date: '2026-08-07',
      receipts: [laterRevision, currentCivilDayDawn, wrongSpotDawn, olderCivilDayDawn, priorDawn],
      current_build_refused: false,
    });

    expect(state).toEqual({ kind: 'success', receipt: priorDawn, published_at: priorDawn.published_at });
  });

  it('keeps an existing receipt visibly stale after a no-data refusal and never relabels it as current', () => {
    const state = resolveYesterdayReading({
      spot_id: 'playa-venao',
      prior_surf_date: '2026-08-07',
      receipts: [priorDawn],
      current_build_refused: true,
    });

    expect(state).toEqual({
      kind: 'stale',
      receipt: priorDawn,
      published_at: priorDawn.published_at,
      notice_es: 'Viejo. Lo último que vimos fue a las 6:22 a.m. No pudimos sacar datos nuevos esta mañana.',
    });
  });

  it('has no loading variant because a reading route is complete static HTML, not a browser data fetch', () => {
    const state = resolveYesterdayReading({
      spot_id: 'playa-venao',
      prior_surf_date: '2026-08-07',
      receipts: [priorDawn],
      current_build_refused: false,
    });

    expect(['success', 'empty', 'stale']).toContain(state.kind);
  });
});
