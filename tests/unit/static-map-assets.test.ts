// WHY-NEW-FILE: tests/unit/static-map-assets.test.ts
//   CLOSEST-EXISTING: tests/unit/map-policy-contract.test.ts
//   EXTENSION-COST: that file is pure and runs in a millisecond with no disk and
//     no image codec. This one rasterises real WebP bytes and writes real files
//     into tmp_path, which is a different speed class and a different failure
//     mode (a missing native codec, a full disk).
//   PARALLEL-RATIONALE: incompatible dependency set. Loading sharp into the
//     policy contract would make the licence decision untestable on any machine
//     where the image codec is absent, and that decision must stay decidable.
//
// Driving port: `planStaticMaps()` and `writeStaticMaps()` in
// scripts/generate-static-maps.ts, plus the pure `renderStaticMapDiagram()`.
//
// REAL I/O ON PURPOSE (Mandate 6): the generator is an adapter. Its contract is
// "bytes that exist, that are a WebP, that fit the target, and whose name is
// their own digest". Mocking sharp here would test the mock.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import { afterAll, describe, it } from 'vitest';

import { planStaticMaps, writeStaticMaps, verifyStaticMaps } from '../../scripts/generate-static-maps';
import { renderStaticMapDiagram } from '../../src/publish/static-map-diagram';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const scratch: string[] = [];

/** A copy carrying only what the generator reads, so no test can touch the worktree. */
function isolatedProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-maps-'));
  scratch.push(root);
  cpSync(join(projectRoot, 'data/maps'), join(root, 'data/maps'), { recursive: true });
  cpSync(join(projectRoot, 'data/spots'), join(root, 'data/spots'), { recursive: true });
  return root;
}

afterAll(() => {
  for (const root of scratch) rmSync(root, { recursive: true, force: true });
});

const frame = { width: 320, height: 180 };

describe('the generated map assets', () => {
  it('emits one bounded, content-addressed WebP per approved spot', async () => {
    const root = isolatedProject();
    const manifest = await writeStaticMaps({ projectRoot: root });
    const emitted = readdirSync(join(root, 'public/maps'));

    assert.ok(Object.keys(manifest.spots).length > 0, 'no spot was drawn at all');
    assert.equal(emitted.length, Object.keys(manifest.spots).length, 'the directory and the manifest disagree');

    const maxBytes = 12 * 1024;
    for (const row of Object.values(manifest.spots)) {
      const file = join(root, 'public/maps', row.path.slice(row.path.lastIndexOf('/') + 1));
      const bytes = readFileSync(file);
      assert.equal(bytes.length, row.bytes, `${row.spot_id} records a size it did not write`);
      assert.ok(bytes.length <= maxBytes, `${row.spot_id} wrote ${bytes.length} bytes, over the 12 KB target`);
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${row.spot_id} is not a RIFF container`);
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${row.spot_id} is not a WebP image`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.digest, `${row.spot_id} is not its own digest`);
      // Spelled out rather than compared against staticMapAssetPath(): calling
      // the same function the generator called would agree with any mutation of
      // it, which is circular verification, not a test.
      assert.equal(
        row.path,
        `/maps/${row.spot_id}-${row.digest.slice(0, 12)}.webp`,
        `${row.spot_id} is served from a path that is not its own digest`,
      );
      assert.ok(row.seed_revision.length > 0 && row.generator_version.length > 0, `${row.spot_id} lost its provenance`);
    }
  });

  it('reproduces the same manifest from an unchanged policy and seed', async () => {
    const root = isolatedProject();
    const first = await planStaticMaps({ projectRoot: root });
    const second = await planStaticMaps({ projectRoot: root });

    assert.deepEqual(second.manifest, first.manifest, 'two runs over identical inputs disagreed');
    for (const [index, asset] of second.assets.entries()) {
      assert.ok(asset.bytes.equals(first.assets[index]!.bytes), `${asset.row.spot_id} rasterised differently twice`);
    }
  });

  it('moves only the changed spot when one approved record changes', async () => {
    const root = isolatedProject();
    const policyPath = join(root, 'data/maps/pa-pacific-map-policy.json');
    const before = (await planStaticMaps({ projectRoot: root })).manifest;
    const moved = Object.keys(before.spots)[0]!;

    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    policy.spots[moved].orientation_attribution = 'otra fuente citable';
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    const after = (await planStaticMaps({ projectRoot: root })).manifest;

    assert.notDeepEqual(after.spots[moved], before.spots[moved], `${moved} did not move when its own record changed`);
    assert.deepEqual(
      Object.fromEntries(Object.entries(after.spots).filter(([id]) => id !== moved)),
      Object.fromEntries(Object.entries(before.spots).filter(([id]) => id !== moved)),
      'changing one spot record moved another spot',
    );
  });

  it('refuses before writing when the policy cannot be read', async () => {
    const root = isolatedProject();
    writeFileSync(join(root, 'data/maps/pa-pacific-map-policy.json'), '{"schema":"static-map-policy/1"}\n');

    await assert.rejects(
      () => writeStaticMaps({ projectRoot: root }),
      /static map policy refused/,
      'a policy with no caption template still produced assets',
    );
    assert.deepEqual(
      existsSync(join(root, 'public')) ? readdirSync(join(root, 'public')) : [],
      [],
      'the build wrote a file before refusing',
    );
  });

  it('refuses a manifest that no longer matches the bytes beside it', async () => {
    const root = isolatedProject();
    const manifest = await writeStaticMaps({ projectRoot: root });
    const row = Object.values(manifest.spots)[0]!;
    writeFileSync(join(root, 'public/maps', row.path.slice(row.path.lastIndexOf('/') + 1)), 'not an image');

    await assert.rejects(
      () => verifyStaticMaps({ projectRoot: root }),
      /static map build refused/,
      'a replaced image passed verification',
    );
  });
});

describe('the diagram source, over any frame', () => {
  it('draws one marker inside its own frame and nothing that implies a shore', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 120, max: 640 }),
        fc.integer({ min: 90, max: 480 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (width, height, spot_id) => {
          const svg = renderStaticMapDiagram({ width, height }, { spot_id });

          assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'the diagram is not a standalone SVG');
          assert.ok(svg.includes(`width="${width}"`) && svg.includes(`height="${height}"`), 'the frame was not honoured');
          // The SVG namespace is the only http string allowed, and url(#...) is
          // a reference to a gradient defined three lines above it. Anything
          // else would be outside material the licence does not cover.
          const withoutNamespace = svg.replace('http://www.w3.org/2000/svg', '');
          assert.ok(
            !/<image\b|href=|url\((?!#)|https?:/i.test(withoutNamespace),
            'the diagram embeds outside material',
          );
          const marks = [...svg.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"/gu)];
          assert.ok(marks.length > 0, 'the diagram drew no marker');
          for (const mark of marks) {
            assert.equal(Number(mark[1]), width / 2, 'a mark sits off the frame centre');
            assert.equal(Number(mark[2]), height / 2, 'a mark sits off the frame centre');
          }
        },
      ),
    );
  });

  it('produces the same source twice, so the raster can be content-addressed', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 30 }), (spot_id) => {
        assert.equal(
          renderStaticMapDiagram(frame, { spot_id }),
          renderStaticMapDiagram(frame, { spot_id }),
          'the same spot drew two different diagrams',
        );
      }),
    );
  });
});
