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
// ledger of corrections this run stored -- which, since 01-05, can be a
// refusal: a correction file this run wrote with `applied: false`, because a
// refusal that leaves no trace is not auditable (06-learning-layer.md
// section 7). Only src/learning/gates.ts may ever mark one applied; this
// module never inspects, let alone constructs, that state itself.
//
// Store and clock are passed in. Nothing here reads the ambient environment or
// the ambient clock, per the rule at the top of src/pipeline/ports.ts.

import type { Clock } from '../pipeline/ports';
import { buildCorrectionRecords, currentCorrectionKey } from './correction-file';
import { PROPENSITY_WINDOW_DAYS } from './constants';
import { SHIPPED_POOLING_CAPS, type PoolingCaps, type SpotSeed } from './hierarchy';
import {
  readCallLog,
  readObservationLog,
  readPredictionLog,
  readReporterOverrides,
  spotsReportedIn,
  type LearningInputStore,
  type ObservationRow,
  type PublishedCallRow,
} from './inputs';
import { reporterKeyOf } from './residuals';
import { selectTrustEligible, SHIPPED_TRUST_GATE, type TrustGateConfig } from './trust';
import { morningKey, selectionWeightByMorning, type PublishedCall } from './weights';

/** What the fit needs of the store: read its inputs, store what it earns. */
export interface LearningStore extends LearningInputStore {
  put(key: string, body: string): Promise<void>;
}

export interface LearningFitDeps {
  store: LearningStore;
  clock: Clock;
  /**
   * G2's eligibility thresholds (06 section 7). Injected rather than read
   * from disk here, for the same reason the clock is: nothing in the core
   * reaches for the ambient world (src/pipeline/ports.ts). Omitted, the run
   * uses the thresholds shipped in data/config/trust-gate.json, which are a
   * proven no-op at launch.
   */
  trustGate?: TrustGateConfig;
  /**
   * The spot-seed roster this run pools by (06 section 5.3's ladder, keyed on
   * `coast`, `region_id`, `break_type`). Passed in for the same reason the
   * clock and the trust gate are: the seed list is human-owned data on disk
   * and nothing in the core reaches for it. Omitted, every examined spot pools
   * with every other -- the collapsed launch shape, unchanged since 01-12.
   */
  spots?: readonly SpotSeed[];
  /**
   * The influence caps of 09 section 17.5. Omitted, the shipped caps apply:
   * 200 effective samples per region, no per-reporter cap.
   */
  poolingCaps?: PoolingCaps;
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
  /** How many corrections this run actually stored, refusals included. */
  corrections_written: number;
  events: { type: string; detail?: string }[];
};

export async function runLearningFitOnce(deps: LearningFitDeps): Promise<LearningFitOutcome> {
  const predictions = await readPredictionLog(deps.store);
  const calls = await readCallLog(deps.store);
  const overrides = await readReporterOverrides(deps.store);

  // 06 section 6.4. A reporter an incident put at zero is EXCISED HERE, before
  // anything at all reads the log -- before eligibility, before the spots are
  // counted, before the propensity denominators, before a single residual is
  // formed. That placement is the criterion: their mornings have to leave the
  // run byte-identically to never having been written, and a sample merely
  // weighted zero still counts toward n, toward the distinct-reporter gate,
  // toward the error floor's n and toward a day's median.
  //
  // This is the one filter in this lane that also removes a spot from
  // spots_examined, and deliberately so. The trust gate excludes SAMPLES from
  // the fit while leaving the spot examined (06 section 7); an incident file
  // says those mornings should never have been in the log.
  const observations = withExcisedReportersRemoved(
    await readObservationLog(deps.store),
    overrides,
  );

  // Eligibility is applied ONCE, here, to the whole log before it is grouped
  // by spot. Two reasons. The history clause counts a reporter's earlier
  // reports ACROSS spots, so it needs the whole log, not one spot's slice.
  // And filtering upstream means every count downstream is already the
  // post-eligibility count -- G1's n, G2's distinctness, and the n inside
  // se_gate's floor -- rather than three separate places each remembering to
  // subtract (06 section 7: "Ineligible samples are excluded from the
  // correction fit and from every gated count").
  const eligible = selectTrustEligible(observations, deps.trustGate ?? SHIPPED_TRUST_GATE);

  // spots_examined stays over the RAW log: a spot whose only reports were
  // ineligible was still examined, and 07 section 7.3 keeps acceptance and
  // display ungated. This gate excludes samples from the fit, nothing else.
  const spots = spotsReportedIn(observations);

  // 06 section 6.3's propensity denominators. The window and the "did anybody
  // report that morning" question both need things a pure function may not
  // reach for -- the run's own clock and the whole raw log -- so they are
  // resolved here and the finished table is handed inward.
  //
  // The reported set is built from the RAW log, not the eligible one: what is
  // being modelled is a human behaviour, people post when it looks good, and a
  // morning somebody reported was reported whether or not the fit was later
  // willing to weigh it.
  const selection = selectionWeightByMorning(
    publishedCallsWithin(calls, deps.clock.now()),
    morningsSomebodyReported(observations),
  );

  const records = buildCorrectionRecords(
    spots.map((spotId) => ({
      spotId,
      observations: eligible.filter((observation) => observation.spot_id === spotId),
      predictions,
    })),
    deps.clock,
    {
      seeds: deps.spots ?? [],
      caps: deps.poolingCaps ?? SHIPPED_POOLING_CAPS,
    },
    selection,
    overrides,
  );

  for (const [spotId, record] of records) {
    await deps.store.put(currentCorrectionKey(spotId), JSON.stringify(record));
  }

  const events = spots.map((spot_id) => ({ type: 'spot_examined', detail: spot_id }));

  return {
    completed: true,
    spots_examined: spots.length,
    corrections_written: records.size,
    events,
  };
}

/** Every published call inside 06 section 6.3's trailing window, as the propensity table reads them. */
function publishedCallsWithin(rows: readonly PublishedCallRow[], now: Date): PublishedCall[] {
  const oldest = new Date(now);
  oldest.setUTCDate(oldest.getUTCDate() - PROPENSITY_WINDOW_DAYS);
  const calls: PublishedCall[] = [];
  for (const row of rows) {
    const day = utcDayOf(row.valid_ts);
    if (day === null) continue;
    if (new Date(`${day}T00:00:00Z`).getTime() < oldest.getTime()) continue;
    calls.push({ spot_id: row.spot_id, day, score_q: row.score_q });
  }
  return calls;
}

/** The (spot, morning) pairs anybody reported at all, which is the propensity numerator. */
function morningsSomebodyReported(observations: readonly ObservationRow[]): Set<string> {
  const reported = new Set<string>();
  for (const observation of observations) {
    const day = utcDayOf(observation.observed_at);
    if (day === null || typeof observation.spot_id !== 'string') continue;
    reported.add(morningKey(observation.spot_id, day));
  }
  return reported;
}

function utcDayOf(timestamp: unknown): string | null {
  if (typeof timestamp !== 'string') return null;
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

/** 06 section 6.4: every row from a reporter the incident file put at zero, gone before anything reads the log. */
function withExcisedReportersRemoved(
  observations: readonly ObservationRow[],
  overrides: ReadonlyMap<string, number>,
): ObservationRow[] {
  if (overrides.size === 0) return [...observations];
  return observations.filter((observation) => {
    const deviceId = observation.device_id;
    if (deviceId === undefined) return true;
    return (overrides.get(reporterKeyOf(observation, deviceId)) ?? 1) > 0;
  });
}
