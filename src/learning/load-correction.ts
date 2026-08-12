// The read side of the correction file, schema spot-correction/1
// (domain-model.md section 11). src/learning/correction-file.ts writes these
// bytes on the nightly fit; this module reads them back on every build, a day
// later and in a different process.
//
// WHY-NEW-FILE: src/learning/load-correction.ts
//   CLOSEST-EXISTING: src/learning/correction-file.ts
//   EXTENSION-COST: correction-file.ts is the pure build-time EMITTER - typed
//     SpotInputs and a Clock in, a Map of records it constructed itself out -
//     so it never handles untrusted bytes; folding a reader into it would give
//     one module two opposite directions and force the nightly fit to import a
//     store-shaped port it has no use for.
//   PARALLEL-RATIONALE: the reader has a different lifecycle and a different
//     dependency set - it runs inside the BUILD process against a driven store
//     port and must stay total over arbitrary bytes, while the emitter runs
//     inside the nightly FIT process with no store at all - and the accepted
//     roadmap names this path as 02-01's own owned file.
//
// TOTALITY IS THE POINT. Every function here returns a verdict; none throws.
// A correction file is the one build input a machine wrote for another machine
// to read later, and it is read on every build of every spot. A parser that
// threw on one shape of bad bytes would take the whole publication down rather
// than publish the day-zero numbers, which is precisely the opposite of what a
// missing correction is supposed to cost. So a file that cannot be trusted
// costs the build exactly what no file costs, and says why out loud.
//
// UNITS PIN, domain-model.md section 11: display_points is the only legal
// value for score_delta.units. The pin exists so that a hundredfold misread
// fails HERE, at read time, instead of printing. The refusal names the foreign
// unit it found, because an unexplained refusal is indistinguishable from a
// bug in the reader.
//
// G4 / the marking rule (06 section 7): this module parses records that CARRY
// a gate verdict and passes that verdict through untouched. Carrying a verdict
// is not marking one, and nothing here ever constructs the applied state -
// src/learning/declarations.ts's whole-source examination watches this file
// stay that way.
//
// VERDICT CONSUMPTION AT THE APPLY SEAM (wave-decisions.md D-2026-08-12-1,
// roadmap 05-02 pin 4). The monthly evaluation job (src/learning/evaluate.ts)
// is metrics-only: it never rewrites a stored correction, on any verdict. The
// kill lives at THIS seam instead. `loadStoredCorrections` now also consults
// the latest monthly verdict under learned/metrics/v1/ before trusting any
// stored record: while that verdict is an affirmative `corrections-killed`,
// every spot costs the build exactly what an absent or corrupt file costs --
// null, the day-zero forecast. `corrections-stay`, `not_evaluated`, and any
// verdict this reader cannot make sense of all leave the per-correction gates
// (G1-G6) as the sole authority; only an affirmative kill kills, mirroring
// readReporterOverrides' rule that a byte nobody can parse must never flip
// system state in either direction.
//
// The metrics-file probe is bounded and reads no directory listing: current
// calendar month first, by the injected clock; the previous month only when
// the current month's read is not a KNOWN verdict at all (absent, corrupt,
// or a value outside the three this reader recognises). The metrics-key
// format is restated here rather than imported from evaluate.ts: that module
// owns the monthly job's own heavier import graph (inputs.ts, metrics.ts,
// cross-validation.ts), and pulling all of it into the build's hourly hot
// path merely to share one template string is the wrong trade -- the same
// reasoning evaluate.ts itself gives for restating fit.ts's fit-window
// boundary rather than importing it.

import type { Clock } from "../pipeline/ports";
import {
  currentCorrectionKey,
  type GatedKey,
  type StoredCorrection,
} from "./correction-file";

/** The one schema this reader accepts. Anything else is a file it has no business trusting. */
const SCHEMA = "spot-correction/1";

/** domain-model.md section 11: the only legal statement of a score move. */
const LEGAL_SCORE_UNITS = "display_points";

/** Bytes at the key that are not a record this reader can trust. */
const EVENT_UNREADABLE = "learning.correction.unreadable";
/** A record whose score move is stated in some other unit than the points a surfer sees. */
const EVENT_FOREIGN_SCORE_UNIT = "learning.correction.foreign_score_unit";
/** The store itself could not be read: a permission, network or bucket fault. */
const EVENT_READ_FAILED = "learning.correction.read_failed";

/** The one driven capability this reader needs; BuildStore already satisfies it. */
export type CorrectionSource = {
  getCorrection(key: string): Promise<string | null>;
};

/**
 * What happened at the key. `absent` is the launch state and is not a fault;
 * `rejected-as-absent` is a file that existed and could not be trusted, which
 * costs the build exactly as much as no file at all and is reported so.
 */
export type CorrectionLoadOutcome = "loaded" | "absent" | "rejected-as-absent";

export type CorrectionLoadEvent = { readonly type: string; readonly detail?: string };

export type CorrectionLoadReport = {
  readonly record: StoredCorrection | null;
  readonly outcome: CorrectionLoadOutcome;
  readonly events: readonly CorrectionLoadEvent[];
};

export type CorrectionParse =
  | { readonly kind: "accepted"; readonly record: StoredCorrection }
  | { readonly kind: "refused"; readonly event: CorrectionLoadEvent };

// ---------- the pure parser ----------

/**
 * Bytes in, verdict out, for any bytes whatsoever. The one place the schema
 * of a stored correction is checked.
 */
export function parseStoredCorrection(bytes: string): CorrectionParse {
  const parsed = parseJson(bytes);
  if (parsed.kind === "refused") return parsed;

  const candidate = parsed.value;
  if (!isRecord(candidate)) {
    return refuse(EVENT_UNREADABLE, `the file is not a record: ${describe(candidate)}`);
  }
  if (candidate.schema !== SCHEMA) {
    return refuse(
      EVENT_UNREADABLE,
      `the file names schema ${describe(candidate.schema)}, and this reader only trusts ${SCHEMA}`,
    );
  }
  if (!isNonEmptyString(candidate.spot_id)) {
    return refuse(EVENT_UNREADABLE, `the file names no spot: ${describe(candidate.spot_id)}`);
  }
  if (!isNonEmptyString(candidate.computed_at)) {
    return refuse(
      EVENT_UNREADABLE,
      `the file says nothing about when it was computed: ${describe(candidate.computed_at)}`,
    );
  }

  const clamp = clampOf(candidate.clamp);
  if (clamp.kind === "refused") return clamp;

  const heightBias = heightBiasOf(candidate.bias);
  if (heightBias.kind === "refused") return heightBias;

  const scoreDelta = scoreDeltaOf(candidate.score_delta);
  if (scoreDelta.kind === "refused") return scoreDelta;

  const record: StoredCorrection = {
    spot_id: candidate.spot_id,
    schema: SCHEMA,
    computed_at: candidate.computed_at,
    bias: { swell_h_m: { per_source: heightBias.value } },
    clamp: clamp.value,
  };
  if (scoreDelta.value !== undefined) record.score_delta = scoreDelta.value;
  return { kind: "accepted", record };
}

// ---------- the one I/O boundary ----------

/**
 * Read the correction stored at a key. A missing file is `absent` and is the
 * launch state; a file that cannot be trusted, and a store that cannot be
 * reached at all, are both `rejected-as-absent` with an event saying why.
 */
export async function loadStoredCorrection(input: {
  store: CorrectionSource;
  key: string;
}): Promise<CorrectionLoadReport> {
  let bytes: string | null;
  try {
    bytes = await input.store.getCorrection(input.key);
  } catch (error) {
    return {
      record: null,
      outcome: "rejected-as-absent",
      events: [
        {
          type: EVENT_READ_FAILED,
          detail: `${input.key} could not be read: ${messageOf(error)}`,
        },
      ],
    };
  }

  if (bytes === null) return { record: null, outcome: "absent", events: [] };

  const parsed = parseStoredCorrection(bytes);
  if (parsed.kind === "refused") {
    return {
      record: null,
      outcome: "rejected-as-absent",
      events: [parsed.event],
    };
  }
  return { record: parsed.record, outcome: "loaded", events: [] };
}

/**
 * Every published spot's stored correction, looked up at that spot's OWN
 * `current/<spot_id>.json` and read once per build.
 *
 * ONE KEY PER SPOT, and the key is built by the same function the nightly fit
 * writes with (`currentCorrectionKey`), not restated here: a reader and a
 * writer that each spell the path themselves is how a build quietly stops
 * finding files the fit is still writing.
 *
 * A spot maps to `null` for all four reasons a build can have no correction:
 * no file was ever written, the file could not be trusted, the store itself
 * could not be reached, or the latest monthly verdict is an affirmative
 * `corrections-killed` (D-2026-08-12-1). Every one of those costs the build
 * exactly what no file costs -- the day-zero forecast -- so the caller has
 * one case to handle rather than four, and cannot accidentally treat a
 * corrupt file, or a killed month, as a correction.
 *
 * BOUNDED PROBE: the monthly verdict is only ever consulted when at least one
 * loaded record this build actually holds carries an applied key (height or
 * score). A record with none is already the day-zero cost on its own --
 * nothing the gates ever approved is standing to be killed -- so a killed
 * month can change nothing about what that spot would publish, and the probe
 * is skipped rather than spent on a question whose answer moves no number.
 * This is the same reasoning G5/G6's own read-time clamps rest on: a check
 * that cannot change a published value is not owed a read.
 *
 * The reader's events are not returned here. `runBuildOnce` has no event
 * channel of its own to carry them to, and inventing one is not this seam's
 * work; the archived call still names the gate that stopped a file it COULD
 * read, which is the operator-visible half. Recorded as a known gap in the
 * 02-03 contract rather than papered over.
 */
export async function loadStoredCorrections(input: {
  store: CorrectionSource;
  spotIds: readonly string[];
  clock: Clock;
}): Promise<ReadonlyMap<string, StoredCorrection | null>> {
  const loaded = await Promise.all(
    input.spotIds.map(async (spotId) => {
      const report = await loadStoredCorrection({
        store: input.store,
        key: currentCorrectionKey(spotId),
      });
      return [spotId, report.record] as const;
    }),
  );

  const anyAppliedKeyLoaded = loaded.some(([, record]) => record !== null && hasAnyAppliedKey(record));
  const killed = anyAppliedKeyLoaded && (await correctionsAreKilled(input.store, input.clock.now()));

  return new Map(
    loaded.map(([spotId, record]) => [
      spotId,
      killed && record !== null && hasAnyAppliedKey(record) ? null : record,
    ]),
  );
}

/** Any height key, or the score move, the gates already marked applied. Property access only -- never the literal `applied: true` -- so declarations.ts's whole-source examination reads this module as what it is: a carrier of the gate's verdict, never its author. */
function hasAnyAppliedKey(record: StoredCorrection): boolean {
  const heightApplied = Object.values(record.bias.swell_h_m.per_source).some((byLead) =>
    Object.values(byLead).some((key) => key.applied),
  );
  return heightApplied || (record.score_delta?.applied ?? false);
}

// ---------- the verdict-consumption seam (D-2026-08-12-1) ----------

const METRICS_PREFIX = "learned/metrics/v1/";

/** Must match evaluate.ts's own `monthlyMetricsKey` byte for byte: METRICS_PREFIX + the UTC year-month + `/metrics.json`. */
function monthlyMetricsKeyFor(when: Date): string {
  return `${METRICS_PREFIX}dt=${when.toISOString().slice(0, 7)}/metrics.json`;
}

/**
 * Current month first, by the injected clock; only when that read is not a
 * known verdict at all does this fall back to the previous month. The first
 * known verdict found wins outright -- "latest verdict wins" means the
 * newest determinable answer, never an average of two months.
 */
async function correctionsAreKilled(store: CorrectionSource, now: Date): Promise<boolean> {
  const current = await knownMonthlyVerdict(store, now);
  if (current !== undefined) return current === "corrections-killed";
  const previous = await knownMonthlyVerdict(store, oneMonthBefore(now));
  return previous === "corrections-killed";
}

/** `undefined` for absent, unreadable, or any value outside the three-word vocabulary -- never a fault, just nothing this reader can act on. */
async function knownMonthlyVerdict(store: CorrectionSource, when: Date): Promise<string | undefined> {
  let bytes: string | null;
  try {
    bytes = await store.getCorrection(monthlyMetricsKeyFor(when));
  } catch {
    return undefined;
  }
  if (bytes === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const cv = parsed.cv;
  if (!isRecord(cv)) return undefined;
  const verdict = cv.verdict;
  return isKnownVerdict(verdict) ? verdict : undefined;
}

function isKnownVerdict(value: unknown): value is string {
  return value === "corrections-killed" || value === "corrections-stay" || value === "not_evaluated";
}

/** The first of the month before `now`, day-of-month normalised first so a day-31 instant can never overflow into the wrong month. */
function oneMonthBefore(now: Date): Date {
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  firstOfMonth.setUTCMonth(firstOfMonth.getUTCMonth() - 1);
  return firstOfMonth;
}

// ---------- field readers, one shape each ----------

type Accepted<T> = { readonly kind: "accepted"; readonly value: T };
type Refused = { readonly kind: "refused"; readonly event: CorrectionLoadEvent };
type Checked<T> = Accepted<T> | Refused;

function accept<T>(value: T): Accepted<T> {
  return { kind: "accepted", value };
}

function refuse(type: string, detail: string): Refused {
  return { kind: "refused", event: { type, detail } };
}

function parseJson(bytes: string): Checked<unknown> {
  try {
    return accept(JSON.parse(bytes) as unknown);
  } catch (error) {
    return refuse(EVENT_UNREADABLE, `the bytes are not JSON: ${messageOf(error)}`);
  }
}

function clampOf(value: unknown): Checked<StoredCorrection["clamp"]> {
  if (!isRecord(value)) {
    return refuse(EVENT_UNREADABLE, `the file states no clamp limits: ${describe(value)}`);
  }
  if (!isFiniteNumber(value.max_abs_h_frac)) {
    return refuse(
      EVENT_UNREADABLE,
      `the height clamp is not a number: ${describe(value.max_abs_h_frac)}`,
    );
  }
  if (!isFiniteNumber(value.max_abs_score)) {
    return refuse(
      EVENT_UNREADABLE,
      `the score clamp is not a number: ${describe(value.max_abs_score)}`,
    );
  }
  return accept({
    max_abs_h_frac: value.max_abs_h_frac,
    max_abs_score: value.max_abs_score,
  });
}

function heightBiasOf(
  value: unknown,
): Checked<Record<string, Record<string, GatedKey>>> {
  if (!isRecord(value)) {
    return refuse(EVENT_UNREADABLE, `the file states no height bias: ${describe(value)}`);
  }
  const swellHeight = value.swell_h_m;
  if (!isRecord(swellHeight)) {
    return refuse(
      EVENT_UNREADABLE,
      `the height bias names no swell height: ${describe(swellHeight)}`,
    );
  }
  const perSource = swellHeight.per_source;
  if (!isRecord(perSource)) {
    return refuse(
      EVENT_UNREADABLE,
      `the height bias is not keyed by model: ${describe(perSource)}`,
    );
  }

  const bySource: Record<string, Record<string, GatedKey>> = {};
  for (const [source, byLead] of Object.entries(perSource)) {
    if (!isRecord(byLead)) {
      return refuse(
        EVENT_UNREADABLE,
        `the height bias for ${source} is not keyed by lead time: ${describe(byLead)}`,
      );
    }
    const perLead: Record<string, GatedKey> = {};
    for (const [lead, key] of Object.entries(byLead)) {
      const gated = gatedKeyOf(key, `${source} ${lead}`);
      if (gated.kind === "refused") return gated;
      perLead[lead] = gated.value;
    }
    bySource[source] = perLead;
  }
  return accept(bySource);
}

function scoreDeltaOf(
  value: unknown,
): Checked<StoredCorrection["score_delta"] | undefined> {
  if (value === undefined) return accept(undefined);
  if (!isRecord(value)) {
    return refuse(EVENT_UNREADABLE, `the score move is not a record: ${describe(value)}`);
  }
  // The units pin is checked FIRST and refused under its own event, because a
  // move stated in the wrong unit is the one corruption that would otherwise
  // print a plausible number a hundred times too large.
  if (value.units !== LEGAL_SCORE_UNITS) {
    return refuse(
      EVENT_FOREIGN_SCORE_UNIT,
      `the score move is stated in ${describe(value.units)}, and the only unit this product publishes is ${LEGAL_SCORE_UNITS}`,
    );
  }
  const gated = gatedKeyOf(value, "the score move");
  if (gated.kind === "refused") return gated;
  return accept({ ...gated.value, units: LEGAL_SCORE_UNITS });
}

/** One gated key as the emitter writes it, verdict carried through untouched. */
function gatedKeyOf(value: unknown, at: string): Checked<GatedKey> {
  if (!isRecord(value)) {
    return refuse(EVENT_UNREADABLE, `${at} is not a record: ${describe(value)}`);
  }
  for (const field of ["b", "se", "n", "reporters", "shrunk_from_global"]) {
    if (!isFiniteNumber(value[field])) {
      return refuse(
        EVENT_UNREADABLE,
        `${at} states ${field} as ${describe(value[field])}, which is not a number`,
      );
    }
  }
  const verdict = value.applied;
  if (typeof verdict !== "boolean") {
    return refuse(
      EVENT_UNREADABLE,
      `${at} carries no gate verdict: ${describe(verdict)}`,
    );
  }
  return accept({
    b: value.b as number,
    se: value.se as number,
    n: value.n as number,
    reporters: value.reporters as number,
    applied: verdict,
    shrunk_from_global: value.shrunk_from_global as number,
  });
}

// ---------- small total helpers ----------

/** A plain object, never an array and never null: reading a field off one must not surprise. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** What was found, short enough for one archived line and never itself a throw. */
function describe(value: unknown): string {
  if (value === undefined) return "nothing at all";
  try {
    return JSON.stringify(value)?.slice(0, 80) ?? String(value);
  } catch {
    return String(value);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
