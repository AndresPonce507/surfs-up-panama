// The build-time adapter for the static break map: policy and seed in, local
// content-addressed WebP files plus a committed manifest out.
//
// WHY THIS IS A BUILD STEP AND NOT AN ASTRO CONCERN: the asset must exist,
// bounded and credited, before a route is rendered. `npm run build` runs this in
// --verify mode first, so a page can never be emitted crediting a file that is
// not the file on disk. Regenerating is a separate, explicit command
// (`npm run maps:generate`), because the output is committed and reviewed.
//
// NOTHING HERE CONTACTS THE NETWORK. X11 settled the launch path as an
// orientation-only diagram drawn from data/spots/pa-pacific.yaml, this project's
// own human-owned seed. There is no provider, no tile template, no token, and no
// fetch. The failure modes that remain are local and all of them refuse:
// a policy this build cannot read, a spot with no citable credit, a seed row
// with no coordinate, an over-target file, or a manifest that disagrees with the
// bytes beside it.
//
// The pure halves live in src/publish/: static-map-policy.ts decides and
// credits, static-map-diagram.ts draws. This file only rasterises, hashes,
// writes and compares.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import {
  decideStaticMapAssets,
  parseStaticMapPolicy,
  staticMapAssetPath,
  type StaticMapManifest,
  type StaticMapManifestRow,
  type StaticMapPolicy,
  type StaticMapRefusalReason,
} from '../src/publish/static-map-policy';
import { renderStaticMapDiagram } from '../src/publish/static-map-diagram';

const DEFAULT_POLICY_PATH = 'data/maps/pa-pacific-map-policy.json';
const DEFAULT_MANIFEST_PATH = 'data/maps/pa-pacific-map-manifest.json';
const DEFAULT_LAUNCH_PATH = 'data/spots/pa-pacific-launch-v1.json';
const DEFAULT_ASSET_DIR = 'public/maps';

export type GenerateOptions = {
  readonly projectRoot?: string;
  readonly policyPath?: string;
  readonly manifestPath?: string;
  readonly launchPath?: string;
  readonly assetDir?: string;
};

export type GeneratedAsset = {
  readonly row: StaticMapManifestRow;
  readonly bytes: Buffer;
};

function refuse(what: string, why: string, how: string): never {
  throw new Error(`static map build refused: WHAT ${what}; WHY ${why}; HOW ${how}.`);
}

function digestOf(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

function readLaunchSpotIds(path: string): readonly string[] {
  const launch = JSON.parse(readFileSync(path, 'utf8')) as { launch_spot_ids?: readonly string[] };
  const ids = launch.launch_spot_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    refuse(
      `${path} enumerates no launch spot`,
      'a map set with no membership list would silently publish nothing or everything',
      'restore launch_spot_ids',
    );
  }
  return ids;
}

/**
 * Draws and rasterises every approved spot. Nothing is written: the caller
 * decides whether these bytes replace the committed ones or are only compared
 * against them.
 */
export async function planStaticMaps(options: GenerateOptions = {}): Promise<{
  readonly manifest: StaticMapManifest;
  readonly assets: readonly GeneratedAsset[];
}> {
  const root = resolve(options.projectRoot ?? process.cwd());
  const policyPath = join(root, options.policyPath ?? DEFAULT_POLICY_PATH);
  const policy: StaticMapPolicy = parseStaticMapPolicy(JSON.parse(readFileSync(policyPath, 'utf8')));
  const launchSpotIds = readLaunchSpotIds(join(root, options.launchPath ?? DEFAULT_LAUNCH_PATH));
  const seedRevision = digestOf(readFileSync(join(root, policy.seed_file))).slice(0, 12);
  const frame = { width: policy.asset.width, height: policy.asset.height };

  const decisions = decideStaticMapAssets(policy, launchSpotIds);
  const assets: GeneratedAsset[] = [];
  const spots: Record<string, StaticMapManifestRow> = {};
  const refused: Record<string, StaticMapRefusalReason> = {};

  for (const decision of decisions) {
    if (decision.kind === 'refused') {
      refused[decision.spot_id] = decision.reason;
      continue;
    }
    const record = policy.spots[decision.spot_id]!;
    const svg = renderStaticMapDiagram(frame, { spot_id: decision.spot_id });
    const bytes = await sharp(Buffer.from(svg)).webp({ quality: 88, effort: 6 }).toBuffer();
    if (bytes.length > policy.asset.max_bytes) {
      refuse(
        `${decision.spot_id} rasterised to ${bytes.length} bytes, over the ${policy.asset.max_bytes} byte target`,
        'the map is a lazy extra on a page that must stay light on a phone in the sun',
        'simplify the diagram or lower the frame size in the policy',
      );
    }
    if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
      refuse(
        `${decision.spot_id} produced bytes that are not a WebP image`,
        'a page would credit a diagram while serving something else entirely',
        'check the raster step before publishing',
      );
    }
    const digest = digestOf(bytes);
    spots[decision.spot_id] = {
      spot_id: decision.spot_id,
      path: staticMapAssetPath(decision.spot_id, digest, policy.asset.extension),
      digest,
      bytes: bytes.length,
      width: frame.width,
      height: frame.height,
      caption: decision.caption,
      coordinate_attribution: decision.coordinate_attribution,
      orientation_attribution: decision.orientation_attribution,
      coordinate_provenance: record.coordinate_provenance,
      orientation_provenance: record.orientation_provenance,
      seed_revision: seedRevision,
      generator_version: policy.generator_version,
    };
    assets.push({ row: spots[decision.spot_id]!, bytes });
  }

  if (assets.length === 0) {
    refuse(
      'no launch spot survived the policy',
      'a build that emits zero maps has either lost its policy or lost its seed, and silence would look identical to success',
      'check data/maps/pa-pacific-map-policy.json against the launch policy',
    );
  }

  return {
    manifest: {
      schema: 'static-map-manifest/1',
      region_id: policy.region_id,
      generator_version: policy.generator_version,
      seed_revision: seedRevision,
      frame,
      spots,
      refused,
    },
    assets,
  };
}

function assetFileName(row: StaticMapManifestRow): string {
  return row.path.slice(row.path.lastIndexOf('/') + 1);
}

/** Writes the assets and the manifest, removing any file the manifest no longer names. */
export async function writeStaticMaps(options: GenerateOptions = {}): Promise<StaticMapManifest> {
  const root = resolve(options.projectRoot ?? process.cwd());
  const assetDir = join(root, options.assetDir ?? DEFAULT_ASSET_DIR);
  const { manifest, assets } = await planStaticMaps(options);

  mkdirSync(assetDir, { recursive: true });
  const keep = new Set(assets.map((asset) => assetFileName(asset.row)));
  for (const existing of readdirSync(assetDir)) {
    if (!keep.has(existing)) rmSync(join(assetDir, existing), { force: true });
  }
  for (const asset of assets) {
    writeFileSync(join(assetDir, assetFileName(asset.row)), asset.bytes);
  }
  writeFileSync(
    join(root, options.manifestPath ?? DEFAULT_MANIFEST_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * Redraws everything and refuses unless the committed manifest and the committed
 * bytes are exactly what today's policy and seed produce. This is what `npm run
 * build` runs, so a page is never emitted crediting a file that has drifted.
 */
export async function verifyStaticMaps(options: GenerateOptions = {}): Promise<StaticMapManifest> {
  const root = resolve(options.projectRoot ?? process.cwd());
  const assetDir = join(root, options.assetDir ?? DEFAULT_ASSET_DIR);
  const manifestPath = join(root, options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const { manifest, assets } = await planStaticMaps(options);

  let committed: StaticMapManifest;
  try {
    committed = JSON.parse(readFileSync(manifestPath, 'utf8')) as StaticMapManifest;
  } catch {
    refuse(
      `${manifestPath} is missing or unreadable`,
      'a page cannot credit an asset set that was never recorded',
      'run npm run maps:generate and commit the result',
    );
  }
  if (JSON.stringify(committed) !== JSON.stringify(manifest)) {
    refuse(
      'the committed map manifest is not what this policy and seed produce',
      'the emitted pages would credit one diagram while the manifest names another',
      'run npm run maps:generate and commit the result',
    );
  }
  for (const asset of assets) {
    const file = join(assetDir, assetFileName(asset.row));
    let onDisk: Buffer;
    try {
      onDisk = readFileSync(file);
    } catch {
      refuse(
        `${asset.row.spot_id} is credited by the manifest but ${file} is not on disk`,
        'the page would reserve a frame for an image that can never load',
        'run npm run maps:generate and commit the result',
      );
    }
    if (digestOf(onDisk) !== asset.row.digest) {
      refuse(
        `${asset.row.spot_id} on disk is not the diagram its manifest row credits`,
        'crediting one image while serving another is the exact failure the content-addressed path exists to prevent',
        'run npm run maps:generate and commit the result',
      );
    }
  }
  const named = new Set(assets.map((asset) => assetFileName(asset.row)));
  const strays = readdirSync(assetDir).filter((entry) => !named.has(entry));
  if (strays.length > 0) {
    refuse(
      `${assetDir} carries ${strays.length} file(s) no manifest row names: ${strays.join(', ')}`,
      'an unnamed image in the published bundle is an uncredited image',
      'run npm run maps:generate and commit the result',
    );
  }
  return manifest;
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const verify = process.argv.includes('--verify');
  const run = verify ? verifyStaticMaps : writeStaticMaps;
  run()
    .then((manifest) => {
      const approved = Object.keys(manifest.spots).length;
      const refusedCount = Object.keys(manifest.refused).length;
      console.log(
        `${verify ? 'verified' : 'generated'} ${approved} static break map(s), ${refusedCount} refused, seed ${manifest.seed_revision}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
