// The canonical wind and quality enum tokens. One constants file, three
// consumers: the report capture form, the published surface, and the write
// path's wire contract (f-tell-us-what-you-saw-cold Definition of Done row 9).
//
// Decided 2026-08-09 by Andres, closing Pre-requisite 1 of
// docs/feature/f-tell-us-what-you-saw-cold/feature-delta.md.
//
// Wind: `clean | choppy | blown_out`. This was never genuinely open. `bumpy`
// appears in zero lines of code; `WindState` shipped with these three tokens;
// the live published surface carries 28 clean / 27 choppy / 5 blown_out across
// its 60 rows. 05-scoring-engine.md section 7 named a different vocabulary
// (`clean | bumpy | choppy`, where `choppy` was the WORST bucket rather than
// the middle one) and is the stale side; it is corrected in the same commit
// as this file, thresholds moved to the code's live 0.35 rather than the
// document's 0.40 so the document stops contradicting what 40 spot rows are
// displaying right now.
//
// Quality: `bad | ok | good | epic`. No code anywhere had voted. The spelling
// is the lowercased English label so 06-learning-layer.md section 6's q_obs
// anchor table (Bad 20, OK 45, Good 70, Epic 90) has exactly one reading.
//
// Why a file of its own, and why under src/data rather than src/publish: the
// report capture route may never reach the forecast layer (leak path L1,
// application-architecture.md section 9). src/publish/static-surface.ts, which
// does live on the forecast side, imports its WindState from here — the arrow
// points data -> publish and never back, so the capture form can share the
// vocabulary without inheriting the forecast import graph.
//
// This module must never import from src/publish/** or src/scoring/**, for
// the same reason src/data/size-bands.ts must not.

/**
 * The three wind states, in the capture form's display order (Limpio, Picado,
 * Destrozado). That order is also descending quality, so the scoring engine's
 * `windWord` thresholds read off the same array without a second mapping.
 */
export const WIND_STATE_TOKENS = ['clean', 'choppy', 'blown_out'] as const;

/** The four session-quality labels, ascending, matching the q_obs anchors. */
export const QUALITY_TOKENS = ['bad', 'ok', 'good', 'epic'] as const;

export type WindStateToken = (typeof WIND_STATE_TOKENS)[number];

export type QualityToken = (typeof QUALITY_TOKENS)[number];

/**
 * `q_obs` anchors on the 0-100 scale, 06-learning-layer.md section 6.
 * Unfit priors, flagged in that document's section 14: the score residual
 * inherits their arbitrariness until an ordinal-logistic treatment replaces
 * them. Kept beside the tokens so the two can never drift into disagreeing
 * about which bucket is which.
 */
export const QUALITY_OBSERVED_SCORE: Readonly<Record<QualityToken, number>> = {
  bad: 20,
  ok: 45,
  good: 70,
  epic: 90,
};
