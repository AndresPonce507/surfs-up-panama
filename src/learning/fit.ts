// The nightly fit's driving port.
//
// The fit REPORTS an outcome; it does not return void. That is the whole point
// of this seam. Everything this feature has to prove at launch is an absence,
// and an absence read off an empty store is vacuous: "no correction is there"
// is true before a single line of this lane exists. So the fit says what it
// did out loud instead. "The fit finished, examined these spots and wrote no
// correction" is a claim a surface has to exist to make, and it is false the
// moment the job dies quietly, which is exactly the failure an empty store
// cannot tell apart from an honest refusal.
//
// The counts are therefore never literals. spots_examined is the spots the
// observation log actually named, and corrections_written is the length of the
// ledger of corrections this run stored. Nothing writes yet: no spot can earn a
// correction before the gate exists (06-learning-layer.md section 7), and only
// the gate may ever mark one applied. So "no correction by default" is what the
// code does, not a comment about what it intends.
//
// Store and clock are passed in. Nothing here reads the ambient environment or
// the ambient clock, per the rule at the top of src/pipeline/ports.ts.

import type { Clock } from '../pipeline/ports';
import { readObservationLog, spotsReportedIn, type LearningInputStore } from './inputs';

/** What the fit needs of the store: read its inputs, store what it earns. */
export interface LearningStore extends LearningInputStore {
  put(key: string, body: string): Promise<void>;
}

export interface LearningFitDeps {
  store: LearningStore;
  clock: Clock;
}

/**
 * What one nightly fit reports. Absence claims are read from here rather than
 * from an empty store, so "nothing was written" is a positive report.
 */
export type LearningFitOutcome = {
  /** True iff the run reached its end; a job that dies must not look finished. */
  completed: boolean;
  /** How many spots the observation log named, never a constant. */
  spots_examined: number;
  /** How many corrections this run actually stored. */
  corrections_written: number;
  events: { type: string; detail?: string }[];
};

export async function runLearningFitOnce(deps: LearningFitDeps): Promise<LearningFitOutcome> {
  const reported = await readObservationLog(deps.store);
  const spots = spotsReportedIn(reported);

  // The ledger of corrections this run stored. It is empty because nothing in
  // this run can put one, and the count below is its length, so the report can
  // never claim a write that did not happen.
  const storedCorrections: string[] = [];

  const events = spots.map((spot_id) => ({ type: 'spot_examined', detail: spot_id }));

  return {
    completed: true,
    spots_examined: spots.length,
    corrections_written: storedCorrections.length,
    events,
  };
}
