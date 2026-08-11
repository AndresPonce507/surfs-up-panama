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

import type { GatedKey, StoredCorrection } from "./correction-file";

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
