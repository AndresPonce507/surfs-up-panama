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

/**
 * One spot's drawable record, already taken from the human-owned seed.
 *
 * `shore_normal_deg` is the ONE direction this diagram is allowed to draw: the
 * compass bearing that row declares the break faces, out to sea. It is never a
 * regional default and never inferred from a picture. A `null` means the seed
 * states no usable facing, and the diagram draws no arrow at all rather than a
 * plausible one -- the generator refuses that spot outright, and this is the
 * second lock on the same rule.
 */
export type DiagramInput = {
  readonly spot_id: string;
  readonly shore_normal_deg: number | null;
};

const SEA_TOP = '#06304a';
const SEA_BOTTOM = '#0a4a70';
const RING = '#7fd3f7';
const MARKER_HALO = '#ffffff';
const MARKER_CORE = '#ff8a3d';
const ARROW = '#ffd08a';

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
 * A compass bearing, in the frame's own coordinates. 0 is up and the turn is
 * clockwise, which is what "faces 135" means to anyone reading the seed; the
 * screen's y axis grows downward, which is the only reason the cosine is
 * negated. Nothing else in this module knows about angles.
 */
function bearingOffset(bearingDeg: number, distance: number): { readonly dx: number; readonly dy: number } {
  const radians = (bearingDeg * Math.PI) / 180;
  return { dx: distance * Math.sin(radians), dy: -distance * Math.cos(radians) };
}

/**
 * The arrow: a shaft from the marker outward along the declared facing, and a
 * head at its tip. Drawn from the bearing alone, so two spots that declare the
 * same facing produce the same arrow and two that differ cannot share one.
 */
function orientationArrow(frame: DiagramFrame, bearingDeg: number): string {
  const { x, y } = centreOf(frame);
  const reach = Math.min(frame.width, frame.height) * 0.42;
  const tip = bearingOffset(bearingDeg, reach);
  const shaftEnd = bearingOffset(bearingDeg, reach - 12);
  const left = bearingOffset(bearingDeg + 148, 14);
  const right = bearingOffset(bearingDeg - 148, 14);
  const point = (offset: { dx: number; dy: number }, from: { dx: number; dy: number } = { dx: 0, dy: 0 }) =>
    `${round(x + from.dx + offset.dx)},${round(y + from.dy + offset.dy)}`;
  return [
    `<line x1="${x}" y1="${y}" x2="${round(x + shaftEnd.dx)}" y2="${round(y + shaftEnd.dy)}" stroke="${ARROW}" stroke-width="3.5" stroke-linecap="round"/>`,
    `<polygon points="${point(tip)} ${point(left, tip)} ${point(right, tip)}" fill="${ARROW}"/>`,
  ].join('');
}

/**
 * A single vector "N" at the top of the frame. Without it the arrow is a
 * direction on a blank field and means nothing; with it, it is a compass
 * bearing a surfer can read. Keeping its strokes in SVG avoids making the
 * content-addressed raster depend on the deploy runtime's installed fonts.
 */
function northTick(frame: DiagramFrame): string {
  const x = frame.width / 2;
  return `<path data-compass-north="true" d="M${round(x - 4)} 18V6L${round(x + 4)} 18V6" fill="none" stroke="${RING}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
}

/**
 * The SVG source for one spot's diagram. Deterministic: the same input produces
 * the same string, byte for byte, so the generator can content-address the
 * raster without a timestamp or a random id anywhere in the pipeline.
 */
export function renderStaticMapDiagram(frame: DiagramFrame, input: DiagramInput): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
    `<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${SEA_TOP}"/><stop offset="1" stop-color="${SEA_BOTTOM}"/>`,
    `</linearGradient></defs>`,
    `<rect width="${frame.width}" height="${frame.height}" fill="url(#sea)"/>`,
    locatorRings(frame),
    input.shore_normal_deg === null ? '' : orientationArrow(frame, input.shore_normal_deg),
    spotMarker(frame),
    northTick(frame),
    `</svg>`,
  ].join('');
}
