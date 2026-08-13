import type { SpreadInput, SpreadTerms } from './confidence';
import { spreadPenalty } from './published-call-history';

// WHY-NEW-FILE: src/scoring/spread-climatology.ts
//   CLOSEST-EXISTING: src/scoring/confidence.ts
//   EXTENSION-COST: confidence.ts calculates a call from current members;
//     adding archive cardinality would blend availability policy into scoring.
//   PARALLEL-RATIONALE: this is the independent, pure policy selector between
//     a validated historical distribution and the existing confidence input.

export const SPREAD_CLIMATOLOGY_MINIMUM_HISTORY_DAYS = 30;

export type SpreadClimatologyDecision =
  | { readonly kind: 'absolute'; readonly input: Extract<SpreadInput, { kind: 'absolute' }> }
  | {
    readonly kind: 'climatology';
    readonly input: Extract<SpreadInput, { kind: 'climatology' }>;
    readonly compares_worse_than_spot_normal: boolean;
  };

export function selectSpreadClimatology(
  history: readonly number[],
  currentTerms: SpreadTerms,
): SpreadClimatologyDecision {
  if (history.length < SPREAD_CLIMATOLOGY_MINIMUM_HISTORY_DAYS) {
    return { kind: 'absolute', input: { kind: 'absolute' } };
  }
  const pct = percentileRank(history, spreadPenalty(currentTerms));
  return {
    kind: 'climatology',
    input: { kind: 'climatology', pct },
    compares_worse_than_spot_normal: pct >= 80,
  };
}

function percentileRank(history: readonly number[], value: number): number {
  return 100 * history.filter((sample) => sample <= value).length / history.length;
}
