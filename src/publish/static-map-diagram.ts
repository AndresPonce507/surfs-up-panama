// WHY-NEW-FILE: src/publish/static-map-diagram.ts
//   CLOSEST-EXISTING: src/publish/static-map-policy.ts
//   EXTENSION-COST: that module is read by BOTH sides -- the build-time
//     generator and the contract tests that must decide a credit with no
//     geometry loaded. Folding a drawing routine into it would put diagram
//     geometry on the import path of the module the caption side reads, and
//     05-04 requires the page to ship zero map code of any kind.
//   PARALLEL-RATIONALE: divergent target. Everything here runs exactly once,
//     inside the build-time generator process, and must never be reachable from
//     a component or a browser bundle; the policy module is reachable from both.
//     Splitting them is what makes "no map code in the document" checkable by
//     looking at one import edge instead of reading a function body.
//
// The drawing half of the static break map: seed record in, SVG source out.
//
// PURE. A string is the whole output. Rasterising it, hashing it and writing it
// belong to the generator adapter, so this stays testable without sharp, without
// a filesystem, and without a byte comparison.
//
// WHAT THIS MAY DRAW, exactly (X11, adr-static-map-orientation-fallback.md): the
// declared spot marker and the declared shore-normal arrow. It may not depict or
// imply a coastline, satellite image, street, boundary, bathymetry, or any
// precision beyond the cited seed record. The concentric rings below are a
// locator, centred on the marker and symmetric by construction -- there is no
// direction in which they could be read as a shore.

/** The fixed frame every generated asset uses. Reserved by the page before the image arrives. */
export type DiagramFrame = {
  readonly width: number;
  readonly height: number;
};

/** One spot's drawable record, already taken from the human-owned seed. */
export type DiagramInput = {
  readonly spot_id: string;
};

const SEA_TOP = '#06304a';
const SEA_BOTTOM = '#0a4a70';
const RING = '#7fd3f7';
const MARKER_HALO = '#ffffff';
const MARKER_CORE = '#ff8a3d';

/**
 * The marker sits at the centre of the frame, always. The diagram makes no
 * claim about what surrounds the break, so there is no reason to offset it and
 * every reason not to: an off-centre dot invites the eye to read the empty side
 * as water and the full side as land, which is exactly the coastline this asset
 * is forbidden to imply.
 */
function centreOf(frame: DiagramFrame): { readonly x: number; readonly y: number } {
  return { x: frame.width / 2, y: frame.height / 2 };
}

function locatorRings(frame: DiagramFrame): string {
  const { x, y } = centreOf(frame);
  const step = Math.min(frame.width, frame.height) / 6;
  return [1, 2, 3]
    .map((ring) => `<circle cx="${x}" cy="${y}" r="${round(step * ring)}" fill="none" stroke="${RING}" stroke-width="1" opacity="${0.34 - ring * 0.07}"/>`)
    .join('');
}

function spotMarker(frame: DiagramFrame): string {
  const { x, y } = centreOf(frame);
  return `<circle cx="${x}" cy="${y}" r="7.5" fill="${MARKER_HALO}"/><circle cx="${x}" cy="${y}" r="4.5" fill="${MARKER_CORE}"/>`;
}

/** Two decimals is plenty for a 320 px frame and keeps the bytes stable. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The SVG source for one spot's diagram. Deterministic: the same input produces
 * the same string, byte for byte, so the generator can content-address the
 * raster without a timestamp or a random id anywhere in the pipeline.
 */
export function renderStaticMapDiagram(frame: DiagramFrame, _input: DiagramInput): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
    `<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${SEA_TOP}"/><stop offset="1" stop-color="${SEA_BOTTOM}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${frame.width}" height="${frame.height}" fill="url(#sea)"/>`,
    locatorRings(frame),
    spotMarker(frame),
    `</svg>`,
  ].join('');
}
