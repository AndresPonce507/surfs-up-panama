// The SHAPE of the correction file, schema spot-correction/1
// (domain-model.md section 11), and nothing else: no behaviour, no imports,
// no reachable module beyond this one.
//
// WHY-NEW-FILE: src/learning/correction-record.ts
//   CLOSEST-EXISTING: src/learning/correction-file.ts
//   EXTENSION-COST: correction-file.ts is where these types were declared, but
//     it also builds the record, so it imports the run's Clock from
//     src/pipeline/ports.ts. Any module that needs only the SHAPE inherits
//     that reach.
//   PARALLEL-RATIONALE: scripts/check-report-leak.mjs walks import specifiers
//     as source text and cannot tell a type-only import from a value one --
//     deliberately, since it guards against a transitive reach delivering
//     forecast data to the report pages and fails closed. The scoring engine
//     needs this shape to read a stored correction, the report pages reach the
//     scoring engine through data/launch-spots.ts, and so importing the shape
//     from correction-file.ts put every report page one text-level hop from
//     pipeline/ports.ts and turned that gate red. A leaf with no imports is
//     what breaks the chain honestly, rather than restating the record's shape
//     in a second place where it could drift away from the writer's.
//
// correction-file.ts re-exports both types, so the module that WRITES the
// record stays the one place to look for it.

/** One gated key, domain-model.md section 11: what a reader needs to decide whether to trust a number. */
export type GatedKey = {
  b: number;
  se: number;
  n: number;
  reporters: number;
  applied: boolean;
  shrunk_from_global: number;
};

export type StoredCorrection = {
  spot_id: string;
  schema: "spot-correction/1";
  computed_at: string;
  score_delta?: GatedKey & { units: "display_points" };
  bias: { swell_h_m: { per_source: Record<string, Record<string, GatedKey>> } };
  clamp: { max_abs_h_frac: number; max_abs_score: number };
};
