// The correction file this lane's nightly fit writes, schema spot-correction/1
// (domain-model.md section 11, written to
// learned/corrections/v1/current/<spot_id>.json). Building the record is
// pure: every estimate, every shrink, every gate verdict is a function of the
// residual samples handed in and the run's own clock, never of the ambient
// world. Writing the bytes is fit.ts's job, at the one IO boundary this
// module never crosses.
//
// G4, structural rather than merely tested (06 section 7): this module reads
// each key's raw weighted-mean estimate exactly once, immediately hands it to
// shrinkTowardParent, and only ever writes THAT return value as `b` -- the
// raw estimate itself never reaches the object this module returns. The
// `applied` field is always carried through from gateCorrection's verdict,
// never written as a literal; src/learning/declarations.ts's whole-source
// examination (01-02 through 01-04) enforces that across the shipped tree,
// this module included.
//
// SHRINK PARENT RULE (06 section 5.3, this step's own design notes): the
// parent estimate at a key is the group-weighted mean, over every spot this
// RUN examined, of that key's own raw estimate -- weighted by each spot's own
// sample count. With one spot examined that parent equals the spot's own raw
// estimate and the shrink is numerically the identity; with more than one
// spot it genuinely pools. The parent is never hardcoded to 0.
//
// WHICH spots are allowed into that mean is not this module's judgement: the
// pooling ladder (src/learning/hierarchy.ts, 06 section 5.3) decides it from
// the seed roster this run was handed, and hands back one parent per spot.
// Handed no roster, the ladder collapses to exactly the mean described above,
// which is why a run that names no seeds stores what it has stored since
// 01-12, byte for byte.

import type { Clock } from "../pipeline/ports";
import {
  CLAMP_MAX_ABS_HEIGHT_FRACTION,
  CLAMP_MAX_ABS_SCORE_POINTS,
  SIGMA_EFF,
  TAU_SPOT_PRIOR,
} from "./constants";
import type { GatedKey, StoredCorrection } from "./correction-record";
import { gateCorrection } from "./gates";
import type { ObservationRow, PredictionRow } from "./inputs";
import {
  formHeightResidualRows,
  formScoreResidualSamples,
  type ResidualSample,
} from "./residuals";
import {
  weightedMean,
  weightedSampleStandardError,
  type WeightedSample,
} from "./estimate";
import {
  parentEstimateBySpot,
  SHIPPED_POOLING_CAPS,
  spotTauFrom,
  type PoolingCaps,
  type ProvenEstimate,
  type SpotEvidence,
  type SpotSeed,
} from "./hierarchy";
import { shrinkTowardParent, shrinkageWeightFromParent } from "./shrink";
import {
  applyReporterWeights,
  collapseSessionsToMedian,
  concordanceWeightByReporter,
  winsorizeAtDayFence,
} from "./weights";

export const CORRECTIONS_PREFIX = "learned/corrections/v1/";

export function currentCorrectionKey(spotId: string): string {
  return `${CORRECTIONS_PREFIX}current/${spotId}.json`;
}

/**
 * The record's shape lives in ./correction-record, a leaf with no imports, and
 * is re-exported here so this module stays the one place to look for the file
 * it writes. The split exists because a module that needs only the shape must
 * not inherit this one's reach into src/pipeline/ports.ts; the reasoning is
 * recorded in that file's header.
 */
export type { GatedKey, StoredCorrection };

/** What this run read for one spot: its own reports, and every prediction the run has to pair them against. */
export type SpotInputs = {
  spotId: string;
  observations: readonly ObservationRow[];
  predictions: readonly PredictionRow[];
};

/**
 * How this run reads one spot's evidence at one key. `samplesPerReporter`
 * exists for the ladder alone: it is what lets a region's mean stop counting
 * one person past their cap (09 section 17.5 item 2). It sums to `n`.
 */
type RawEstimate = {
  b: number;
  se: number;
  n: number;
  reporters: number;
  samplesPerReporter: number[];
};

/** The seed roster and influence caps one run pools by; handed none, the ladder collapses to the launch shape. */
export type PoolingInputs = {
  readonly seeds: readonly SpotSeed[];
  readonly caps: PoolingCaps;
};

const NO_POOLING_ROSTER: PoolingInputs = {
  seeds: [],
  caps: SHIPPED_POOLING_CAPS,
};

/**
 * The two stages of the weighing room that a key can run on its own (06
 * section 6.2 steps 1 and 2, in that order). The third, concordance, cannot:
 * a reporter\'s record spans every spot and every key this run examined, so it
 * is measured once over all of them and applied afterwards.
 */
function weighWithinKey(reported: readonly ResidualSample[]): ResidualSample[] {
  return winsorizeAtDayFence(collapseSessionsToMedian(reported));
}

/**
 * One key\'s evidence, once the weighing room is done with it. Every count
 * here -- n, the distinct reporters, the n inside se\'s physical floor -- is
 * therefore already the post-collapse count, rather than three separate places
 * each remembering to subtract, exactly as the trust gate is applied once
 * upstream in fit.ts for the same reason.
 */
function estimateOf(samples: readonly ResidualSample[]): RawEstimate | null {
  if (samples.length === 0) return null;
  const weighted: WeightedSample[] = samples.map((sample) => ({
    value: sample.value,
    weight: sample.weight,
  }));
  const byReporter = new Map<string, number>();
  for (const sample of samples) {
    byReporter.set(sample.device_id, (byReporter.get(sample.device_id) ?? 0) + 1);
  }
  return {
    b: weightedMean(weighted),
    se: weightedSampleStandardError(weighted),
    n: samples.length,
    reporters: byReporter.size,
    samplesPerReporter: [...byReporter.values()],
  };
}

/** One spot's evidence at one key, in the shape the pooling ladder reads. */
function evidenceOf(
  spotId: string,
  raw: RawEstimate,
  gated: boolean,
): SpotEvidence {
  return {
    spotId,
    b: raw.b,
    n: raw.n,
    samplesPerReporter: raw.samplesPerReporter,
    gated,
  };
}

/**
 * Which spots the ladder already knows have earned a correction. Consulted per
 * key; before the collapsed pass has run, nothing has.
 */
type ProvenSpots = { has: (spotId: string) => boolean };
const NOTHING_PROVEN_YET: ProvenSpots = { has: () => false };

/** What the gate says about one key's evidence once it has been shrunk toward the parent handed in. */
function verdictAt(
  raw: RawEstimate,
  parent: number,
  sigmaEff: number,
  tau: number,
) {
  return gateCorrection({
    n: raw.n,
    reporters: raw.reporters,
    b: shrinkTowardParent(raw.b, raw.n, tau, parent),
    se: raw.se,
    sigma_eff: sigmaEff,
  });
}

function gatedKeyFrom(
  raw: RawEstimate,
  parent: number,
  sigmaEff: number,
  tau: number,
): GatedKey {
  const bShrunk = shrinkTowardParent(raw.b, raw.n, tau, parent);
  const verdict = verdictAt(raw, parent, sigmaEff, tau);
  return {
    b: bShrunk,
    se: verdict.se,
    n: raw.n,
    reporters: raw.reporters,
    applied: verdict.applied,
    shrunk_from_global: shrinkageWeightFromParent(raw.n, tau),
  };
}

/** spotId -> source -> leadBucket -> the samples the weighing room left, per key. */
type WeighedHeightSamples = Map<string, Map<string, Map<string, ResidualSample[]>>>;

/**
 * Every height key\'s samples, collapsed and fenced. Stops one stage short of
 * an estimate on purpose: concordance still has to look across every spot
 * before any of these may be averaged.
 */
function weighedHeightSamplesPerSpot(spots: readonly SpotInputs[]): WeighedHeightSamples {
  const bySpot: WeighedHeightSamples = new Map();
  for (const spot of spots) {
    const rows = formHeightResidualRows(spot.observations, spot.predictions);
    const samplesByKey = new Map<string, Map<string, ResidualSample[]>>();
    for (const row of rows) {
      const bySource =
        samplesByKey.get(row.source) ?? new Map<string, ResidualSample[]>();
      const samples = bySource.get(row.leadBucket) ?? [];
      samples.push(row.sample);
      bySource.set(row.leadBucket, samples);
      samplesByKey.set(row.source, bySource);
    }

    const weighedByKey = new Map<string, Map<string, ResidualSample[]>>();
    for (const [source, byLead] of samplesByKey) {
      const weighedByLead = new Map<string, ResidualSample[]>();
      for (const [lead, samples] of byLead) {
        const weighed = weighWithinKey(samples);
        if (weighed.length > 0) weighedByLead.set(lead, weighed);
      }
      if (weighedByLead.size > 0) weighedByKey.set(source, weighedByLead);
    }
    if (weighedByKey.size > 0) bySpot.set(spot.spotId, weighedByKey);
  }
  return bySpot;
}

/** Every key this run weighed, height and score alike, as the flat list concordance reads. */
function everyKeyIn(
  height: WeighedHeightSamples,
  score: ReadonlyMap<string, ResidualSample[]>,
): ResidualSample[][] {
  const keys: ResidualSample[][] = [];
  for (const byKey of height.values()) {
    for (const byLead of byKey.values()) {
      for (const samples of byLead.values()) keys.push(samples);
    }
  }
  for (const samples of score.values()) keys.push(samples);
  return keys;
}

/** Turn one key\'s weighed samples into its estimate, once every weight is final. */
function estimatesFrom(
  height: WeighedHeightSamples,
  earned: ReadonlyMap<string, number>,
): Map<string, Map<string, Map<string, RawEstimate>>> {
  const bySpot = new Map<string, Map<string, Map<string, RawEstimate>>>();
  for (const [spotId, byKey] of height) {
    const rawByKey = new Map<string, Map<string, RawEstimate>>();
    for (const [source, byLead] of byKey) {
      const rawByLead = new Map<string, RawEstimate>();
      for (const [lead, samples] of byLead) {
        const raw = estimateOf(applyReporterWeights(samples, earned));
        if (raw !== null) rawByLead.set(lead, raw);
      }
      if (rawByLead.size > 0) rawByKey.set(source, rawByLead);
    }
    if (rawByKey.size > 0) bySpot.set(spotId, rawByKey);
  }
  return bySpot;
}

/** Every (source, leadBucket) key this run touched, each once, in first-appearance order. */
function keysTouchedIn(
  rawHeightBySpot: ReadonlyMap<string, Map<string, Map<string, RawEstimate>>>,
): { source: string; lead: string }[] {
  const seenKeys: { source: string; lead: string }[] = [];
  const seen = new Set<string>();
  for (const rawByKey of rawHeightBySpot.values()) {
    for (const [source, byLead] of rawByKey) {
      for (const lead of byLead.keys()) {
        const seenKey = `${source} ${lead}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        seenKeys.push({ source, lead });
      }
    }
  }

  return seenKeys;
}

/**
 * The parent estimate every spot shrinks toward, at every key this run
 * touched: source -> lead -> spot -> parent. A parent PER SPOT rather than one
 * per key, because two spots at the same key can sit in different basins and
 * must then inherit different parents.
 */
function heightParents(
  rawHeightBySpot: ReadonlyMap<string, Map<string, Map<string, RawEstimate>>>,
  pooling: PoolingInputs,
  provenAt: (source: string, lead: string) => ProvenSpots,
): Map<string, Map<string, Map<string, number>>> {
  const parents = new Map<string, Map<string, Map<string, number>>>();
  for (const { source, lead } of keysTouchedIn(rawHeightBySpot)) {
    const proven = provenAt(source, lead);
    const evidence: SpotEvidence[] = [];
    for (const [spotId, rawByKey] of rawHeightBySpot) {
      const raw = rawByKey.get(source)?.get(lead);
      if (raw !== undefined) {
        evidence.push(evidenceOf(spotId, raw, proven.has(spotId)));
      }
    }
    const parentBySource =
      parents.get(source) ?? new Map<string, Map<string, number>>();
    parentBySource.set(
      lead,
      parentEstimateBySpot(evidence, pooling.seeds, pooling.caps),
    );
    parents.set(source, parentBySource);
  }
  return parents;
}

/**
 * Which spots passed the gates at each key when the ladder was collapsed --
 * the first of the two passes a similarity family needs.
 *
 * A family activates on the number of its spots that have earned a correction,
 * and whether a spot earns one depends on the parent it was shrunk toward,
 * which is what the family would change. That circle is cut once, here, and
 * not iterated: the gate certifies a spot's OWN evidence, the collapsed pass
 * is where that evidence is weighed against nothing but its region, and a
 * fixed-point loop over a threshold could oscillate. Recorded rather than
 * assumed, because 06 section 5.3 does not say which pass decides.
 */
function provenSpotsAtEachKey(
  rawHeightBySpot: ReadonlyMap<string, Map<string, Map<string, RawEstimate>>>,
  collapsedParents: ReadonlyMap<string, Map<string, Map<string, number>>>,
): {
  at: (source: string, lead: string) => ProvenSpots;
  tauAt: (source: string, lead: string) => number;
} {
  const proven = new Map<string, Set<string>>();
  const tau = new Map<string, number>();
  for (const { source, lead } of keysTouchedIn(rawHeightBySpot)) {
    const earned = new Set<string>();
    const estimates: ProvenEstimate[] = [];
    for (const [spotId, rawByKey] of rawHeightBySpot) {
      const raw = rawByKey.get(source)?.get(lead);
      if (raw === undefined) continue;
      const parent = collapsedParents.get(source)?.get(lead)?.get(spotId) ?? raw.b;
      const verdict = verdictAt(raw, parent, SIGMA_EFF.height.value, TAU_SPOT_PRIOR);
      if (!verdict.applied) continue;
      earned.add(spotId);
      estimates.push({ b: raw.b, n: raw.n, se: verdict.se });
    }
    proven.set(`${source} ${lead}`, earned);
    tau.set(`${source} ${lead}`, spotTauFrom(estimates));
  }
  return {
    at: (source, lead) => proven.get(`${source} ${lead}`) ?? new Set<string>(),
    tauAt: (source, lead) => tau.get(`${source} ${lead}`) ?? TAU_SPOT_PRIOR,
  };
}

/** The score delta's parent per spot, over the same collapsed-then-informed pair of passes. */
function scoreParentsFor(
  rawScoreBySpot: ReadonlyMap<string, RawEstimate>,
  pooling: PoolingInputs,
): { parents: Map<string, number>; tau: number } {
  const evidenceWith = (proven: ProvenSpots): SpotEvidence[] =>
    [...rawScoreBySpot].map(([spotId, raw]) =>
      evidenceOf(spotId, raw, proven.has(spotId)),
    );

  const collapsed = parentEstimateBySpot(
    evidenceWith(NOTHING_PROVEN_YET),
    pooling.seeds,
    pooling.caps,
  );
  const earned = new Set<string>();
  const estimates: ProvenEstimate[] = [];
  for (const [spotId, raw] of rawScoreBySpot) {
    const parent = collapsed.get(spotId) ?? raw.b;
    const verdict = verdictAt(raw, parent, SIGMA_EFF.score.value, TAU_SPOT_PRIOR);
    if (!verdict.applied) continue;
    earned.add(spotId);
    estimates.push({ b: raw.b, n: raw.n, se: verdict.se });
  }
  return {
    parents: parentEstimateBySpot(evidenceWith(earned), pooling.seeds, pooling.caps),
    tau: spotTauFrom(estimates),
  };
}

/**
 * One correction record per spot that produced at least one height residual
 * sample, across every spot this run examined together. A spot with no
 * paired height sample gets no record at all: there is nothing to correct
 * and nothing honest to shrink toward a parent.
 */
export function buildCorrectionRecords(
  spots: readonly SpotInputs[],
  clock: Clock,
  pooling: PoolingInputs = NO_POOLING_ROSTER,
): Map<string, StoredCorrection> {
  const computedAt = clock.now().toISOString();

  // The weighing room, 06 section 6.2, in its stated order and once for the
  // whole run. Steps 1 and 2 are local to a key; step 3 is not -- a reporter\'s
  // record is read across every spot and key this run examined, which is why
  // the samples wait here in their weighed-but-unaveraged state until it has
  // been measured.
  const weighedHeight = weighedHeightSamplesPerSpot(spots);
  const weighedScore = new Map<string, ResidualSample[]>();
  for (const spot of spots) {
    const weighed = weighWithinKey(formScoreResidualSamples(spot.observations));
    if (weighed.length > 0) weighedScore.set(spot.spotId, weighed);
  }
  const earned = concordanceWeightByReporter(everyKeyIn(weighedHeight, weighedScore));

  const rawHeightBySpot = estimatesFrom(weighedHeight, earned);
  // Two passes, and only the second one's numbers are ever stored. The first
  // runs the ladder collapsed, so the gate can weigh each spot's own evidence
  // against its region alone; the second runs it again knowing which spots
  // earned a correction, which is the only thing a similarity family forms on.
  const collapsedParents = heightParents(
    rawHeightBySpot,
    pooling,
    () => NOTHING_PROVEN_YET,
  );
  const proven = provenSpotsAtEachKey(rawHeightBySpot, collapsedParents);
  const parentsByKey = heightParents(rawHeightBySpot, pooling, proven.at);

  const rawScoreBySpot = new Map<string, RawEstimate>();
  for (const [spotId, samples] of weighedScore) {
    const raw = estimateOf(applyReporterWeights(samples, earned));
    if (raw !== null) rawScoreBySpot.set(spotId, raw);
  }
  // The score delta climbs the same ladder as the height keys, in the same two
  // passes. A basin wall that held for one and not the other would let a
  // Pacific spot's score difference reach a Caribbean file through the back
  // door.
  const scoreDelta = scoreParentsFor(rawScoreBySpot, pooling);

  const records = new Map<string, StoredCorrection>();
  for (const [spotId, rawByKey] of rawHeightBySpot) {
    const perSource: Record<string, Record<string, GatedKey>> = {};
    for (const [source, byLead] of rawByKey) {
      const perLead: Record<string, GatedKey> = {};
      for (const [lead, raw] of byLead) {
        const parent = parentsByKey.get(source)?.get(lead)?.get(spotId) ?? raw.b;
        perLead[lead] = gatedKeyFrom(
          raw,
          parent,
          SIGMA_EFF.height.value,
          proven.tauAt(source, lead),
        );
      }
      perSource[source] = perLead;
    }

    const record: StoredCorrection = {
      spot_id: spotId,
      schema: "spot-correction/1",
      computed_at: computedAt,
      bias: { swell_h_m: { per_source: perSource } },
      clamp: {
        max_abs_h_frac: CLAMP_MAX_ABS_HEIGHT_FRACTION,
        max_abs_score: CLAMP_MAX_ABS_SCORE_POINTS,
      },
    };

    const scoreRaw = rawScoreBySpot.get(spotId);
    if (scoreRaw !== undefined) {
      record.score_delta = {
        ...gatedKeyFrom(
          scoreRaw,
          scoreDelta.parents.get(spotId) ?? scoreRaw.b,
          SIGMA_EFF.score.value,
          scoreDelta.tau,
        ),
        units: "display_points",
      };
    }

    records.set(spotId, record);
  }

  return records;
}
