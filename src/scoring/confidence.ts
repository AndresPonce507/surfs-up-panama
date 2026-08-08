// Confidence, beside the score, never in it. RED SCAFFOLD, DISTILL 2026-08-08.
//
// Declared contract: docs/product/architecture/05-scoring-engine.md section 6.
// Structural separation (law L9): nothing this function returns is readable by
// combine(); the score signature accepts no spread, track or freshness input.

export const __SCAFFOLD__ = true;

import type { MemberRow } from './engine';

export type SpreadInput =
  | { kind: 'absolute' }
  | { kind: 'climatology'; pct: number };

export type ConfidenceResult = {
  c_spread: number;
  c_track: number;
  /** null = no report ever: excluded from the product, not floored (05 section 6.3). */
  c_fresh: number | null;
  c_total: number;
  level: 'high' | 'medium' | 'low';
  track_state: 'unverified' | 'measured';
  spread_terms: { height: number; period: number; direction: number };
  dominant:
    | 'spread_height'
    | 'spread_period'
    | 'spread_direction'
    | 'track'
    | 'freshness'
    | 'missing_data'
    | null;
};

export function confidence(
  _members: MemberRow[],
  _spread: SpreadInput,
  _track: { mae: number; mae_ref: number } | null,
  _last_report_age_h: number | null,
  _missing: ('wind' | 'tide')[],
): ConfidenceResult {
  throw new Error(
    '__SCAFFOLD__ assertion: confidence is not implemented yet. ' +
      'This seam is authored by DISTILL; DELIVER slice-01 makes it real.',
  );
}
