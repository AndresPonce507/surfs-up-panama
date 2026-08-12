// WHY-NEW-FILE: src/publish/static-map-policy.ts
//   CLOSEST-EXISTING: src/publish/factor-vocab.ts
//   EXTENSION-COST: that module is the four Spanish factor nouns and imports
//     nothing at all, on purpose, so it can be moved into the shared data lane
//     as a file move. Adding a licence-and-attribution decision to it would give
//     it a second reason to change and break the import-freedom test that guards
//     the move.
//   PARALLEL-RATIONALE: incompatible lifecycle. factor-vocab changes on a copy
//     review; this changes only when a source, a licence or the seed changes,
//     by pull request, and it must stay decidable when no morning has been
//     published at all.
//
// The decision half of the static break map: which launch spots may receive a
// generated diagram, and exactly what credit each approved one must show.
//
// PURE. No filesystem, no network, no clock. The caller reads the tracked
// policy (data/maps/pa-pacific-map-policy.json) and hands it in, so the rule
// stays testable without a disk and the generator stays the only thing that
// touches bytes.
//
// THE ONE RULE: a map may be drawn only where a citable source says both where
// the break is AND which way it faces, and where that source can be credited
// visibly, in Spanish, on the page. X11 accepted the orientation-only diagram
// precisely because it claims nothing beyond the seed; a spot whose facing no
// source states would need an invented arrow, and this product does not invent.
// Two launch spots are in exactly that position today (playa-la-barqueta and
// las-lajas both carry `orientation_source: null`), and they lose their map.

/** One launch spot's entry in the tracked policy. */
export type StaticMapSpotRecord = {
  /** Visible Spanish credit for where the coordinate came from. Empty means uncreditable. */
  readonly coordinate_attribution: string;
  /** Visible Spanish credit for where the facing came from. Empty means no source states it. */
  readonly orientation_attribution: string;
  /** The raw provenance record, kept for audit. Never rendered. */
  readonly coordinate_provenance: string;
  /** The raw provenance record, kept for audit. Never rendered. */
  readonly orientation_provenance: string;
};

/** The tracked policy, after validation. */
export type StaticMapPolicy = {
  readonly schema: 'static-map-policy/1';
  readonly region_id: string;
  /** Only one path is accepted today; X11 rejected every imagery source. */
  readonly path: 'orientation-only';
  readonly generator_version: string;
  readonly seed_file: string;
  readonly asset: {
    readonly dir: string;
    readonly extension: string;
    readonly width: number;
    readonly height: number;
    readonly max_bytes: number;
  };
  readonly caption_template: string;
  readonly spots: Readonly<Record<string, StaticMapSpotRecord>>;
};

/**
 * Why a spot gets no map. Named reasons, never a boolean: a caller has to say
 * which absence it means before its code compiles, so "no source states the
 * facing" can never be logged as "we forgot to enumerate it". The first three
 * are answered by the policy alone; the last two only the seed can answer.
 */
export type StaticMapRefusalReason =
  | 'absent_from_policy'
  | 'coordinate_attribution_missing'
  | 'orientation_attribution_missing'
  | 'seed_row_absent'
  | 'orientation_absent_from_seed';

/** The decision for exactly one launch spot. */
export type StaticMapDecision =
  | {
    readonly kind: 'approved';
    readonly spot_id: string;
    readonly coordinate_attribution: string;
    readonly orientation_attribution: string;
    /** The visible caption, already composed. The page renders it, never builds it. */
    readonly caption: string;
  }
  | {
    readonly kind: 'refused';
    readonly spot_id: string;
    readonly reason: StaticMapRefusalReason;
  };

type StaticMapRefusal = {
  readonly kind: 'refused';
  readonly spot_id: string;
  readonly reason: StaticMapRefusalReason;
};

function refuse(spot_id: string, reason: StaticMapRefusalReason): StaticMapRefusal {
  return { kind: 'refused', spot_id, reason };
}

/**
 * Fills the policy's caption template. The template is data so the wording can
 * change without a code review, but the two slots are not optional: a caption
 * that dropped one would credit half of what it draws.
 */
export function composeStaticMapCaption(
  template: string,
  coordinate_attribution: string,
  orientation_attribution: string,
): string {
  return template
    .replace('{coordinate_attribution}', coordinate_attribution)
    .replace('{orientation_attribution}', orientation_attribution);
}

/**
 * Decides every launch spot, in the order the launch policy publishes them.
 * Total: exactly one decision per requested spot, always.
 */
export function decideStaticMapAssets(
  policy: StaticMapPolicy,
  launchSpotIds: readonly string[],
): readonly StaticMapDecision[] {
  return launchSpotIds.map((spot_id) => decideOne(policy, spot_id));
}

function decideOne(policy: StaticMapPolicy, spot_id: string): StaticMapDecision {
  const record = policy.spots[spot_id];
  if (record === undefined) return refuse(spot_id, 'absent_from_policy');
  if (record.coordinate_attribution.trim() === '') return refuse(spot_id, 'coordinate_attribution_missing');
  if (record.orientation_attribution.trim() === '') return refuse(spot_id, 'orientation_attribution_missing');
  return {
    kind: 'approved',
    spot_id,
    coordinate_attribution: record.coordinate_attribution,
    orientation_attribution: record.orientation_attribution,
    caption: composeStaticMapCaption(
      policy.caption_template,
      record.coordinate_attribution,
      record.orientation_attribution,
    ),
  };
}

// ------------------------------------------------- the seed join --

/** What the human-owned seed says about one break. Read by the generator, never guessed. */
export type StaticMapSeedRow = {
  readonly spot_id: string;
  readonly shore_normal_deg: number | null;
};

/**
 * One spot's final answer: draw it with exactly this facing, or do not draw it.
 * The credit and the geometry arrive together, so an asset can never be produced
 * from a seed row that has no orientation or credited from a policy record that
 * has no seed row.
 */
export type StaticMapAssetPlan =
  | {
    readonly kind: 'approved';
    readonly spot_id: string;
    readonly coordinate_attribution: string;
    readonly orientation_attribution: string;
    readonly caption: string;
    readonly shore_normal_deg: number;
  }
  | {
    readonly kind: 'refused';
    readonly spot_id: string;
    readonly reason: StaticMapRefusalReason;
  };

/**
 * Joins the policy's credit decision to the seed's declared facing. Pure, and
 * total: every decision comes back, approved with a real bearing or refused with
 * a named reason. The two refusals it can add are the ones only the seed can
 * answer -- there is no row, or the row states no usable facing -- and neither
 * has a fallback, because the fallback would be an invented arrow.
 */
export function planStaticMapAssets(
  decisions: readonly StaticMapDecision[],
  seedBySpotId: ReadonlyMap<string, StaticMapSeedRow>,
): readonly StaticMapAssetPlan[] {
  return decisions.map((decision) => {
    if (decision.kind === 'refused') return decision;
    const seed = seedBySpotId.get(decision.spot_id);
    if (seed === undefined) return refuse(decision.spot_id, 'seed_row_absent');
    if (seed.shore_normal_deg === null) return refuse(decision.spot_id, 'orientation_absent_from_seed');
    return {
      kind: 'approved',
      spot_id: decision.spot_id,
      coordinate_attribution: decision.coordinate_attribution,
      orientation_attribution: decision.orientation_attribution,
      caption: decision.caption,
      shore_normal_deg: seed.shore_normal_deg,
    };
  });
}

// ------------------------------------------------------ the asset manifest --

/**
 * One approved spot's generated asset, as the manifest records it and as the
 * page reads it. Every field the contract requires travels together in one row:
 * an asset can never be credited by one record while being served from another.
 */
export type StaticMapManifestRow = {
  readonly spot_id: string;
  /** Site-absolute path of the emitted file, content-addressed. */
  readonly path: string;
  /** Full digest of the exact bytes on disk. A byte change is a path change. */
  readonly digest: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly caption: string;
  readonly coordinate_attribution: string;
  readonly orientation_attribution: string;
  readonly coordinate_provenance: string;
  readonly orientation_provenance: string;
  /** Digest of the human-owned seed file this row was drawn from. */
  readonly seed_revision: string;
  readonly generator_version: string;
};

/** The generated manifest. Committed, and re-verified on every build. */
export type StaticMapManifest = {
  readonly schema: 'static-map-manifest/1';
  readonly region_id: string;
  readonly generator_version: string;
  readonly seed_revision: string;
  readonly frame: { readonly width: number; readonly height: number };
  /** Approved spots only, in launch order. */
  readonly spots: Readonly<Record<string, StaticMapManifestRow>>;
  /** Refused spots and why, so an absent map is a recorded decision rather than a gap. */
  readonly refused: Readonly<Record<string, StaticMapRefusalReason>>;
};

/**
 * The stable, content-addressed site path for one asset. Content-addressed on
 * purpose: a revised diagram cannot be served under a path a cached page or a
 * stale manifest already knows, so "credited one image, showed another" has no
 * shape it could take.
 */
export function staticMapAssetPath(spot_id: string, digest: string, extension: string): string {
  return `/maps/${spot_id}-${digest.slice(0, 12)}${extension}`;
}

/**
 * Validating constructor. A malformed policy refuses the build here rather than
 * reaching the generator, because the generator's next act is writing bytes a
 * page will credit.
 */
export function parseStaticMapPolicy(raw: unknown): StaticMapPolicy {
  const policy = raw as StaticMapPolicy;
  const problems: string[] = [];
  if (policy?.schema !== 'static-map-policy/1') problems.push('schema is not static-map-policy/1');
  if (policy?.path !== 'orientation-only') problems.push('path is not the orientation-only fallback X11 accepted');
  if (typeof policy?.caption_template !== 'string' || !policy.caption_template.includes('{coordinate_attribution}')) {
    problems.push('caption_template does not carry the coordinate credit slot');
  }
  if (typeof policy?.caption_template !== 'string' || !policy.caption_template.includes('{orientation_attribution}')) {
    problems.push('caption_template does not carry the orientation credit slot');
  }
  if (typeof policy?.generator_version !== 'string' || policy.generator_version === '') {
    problems.push('generator_version is missing, so an asset could not be tied to what drew it');
  }
  if (typeof policy?.asset?.max_bytes !== 'number' || policy.asset.max_bytes <= 0) {
    problems.push('asset.max_bytes is missing, so no size ceiling exists');
  }
  if (policy?.spots === null || typeof policy?.spots !== 'object') problems.push('spots is not enumerated');
  if (problems.length > 0) {
    throw new Error(
      `static map policy refused: WHAT ${problems.join('; ')}; WHY an asset may not be drawn or credited from a policy this build cannot read; HOW correct data/maps/pa-pacific-map-policy.json.`,
    );
  }
  return policy;
}
