// GUARD: every published call, on both days, must carry conf_level,
// size_band, size_range_m, wind_state, best_window, weakest_link and
// confidence_reason, and the surface itself must carry spot_detail. All
// seven per-call fields plus spot_detail are declared OPTIONAL on SurfaceCall
// / PublishedSurfaceUpdate (src/publish/static-surface.ts), so `npm run
// typecheck` passes and every existing CI job stays green even when they are
// silently missing -- that gap is exactly what shipped once already
// (conf_level, size_band, size_range_m, wind_state, best_window). This is
// the gate that would have caught it, extended per
// adr-enriched-fields-reach-the-reading-surface.md to cover weakest_link,
// confidence_reason and spot_detail: "whoever ships these fields owes the
// guard in the same slice."
//
// Reads the COMMITTED file directly, never a freshly-built in-memory
// bundle: a guard that only inspects runBuildOnce's own fixture output
// would stay green forever while the committed file itself rotted —
// Fixture Theater against the very regression this guard exists to prevent.
//
// Scope: current.days[0..1].spots and current.calls (the legacy alias the
// yesterday/receipt readers use). Retained dawn_receipts are explicitly OUT
// of scope: they are historical, pre-contract archives (2026-08-07 and
// 2026-08-08 predate the structured fields settling in 6620a64); requiring
// them to carry fields they never captured would mean inventing history,
// which is exactly the fabrication this project refuses to do.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { StaticSurface, SurfaceCall } from '../../src/publish/static-surface';

const SURFACE_PATH = resolve('data/published-surface.json');
// The launch-policy invariant, read from the other end: loadLaunchSpotSeeds
// (src/data/launch-spots.ts) throws unless launch_spot_ids.length === 20.
// A guard that only checks the SHAPE of present entries and never the COUNT
// would pass on a surface that silently dropped spots — the same
// green-tests-broken-page failure class this guard exists to close.
const LAUNCH_SPOT_COUNT = 20;

function loadSurface(): StaticSurface {
  return JSON.parse(readFileSync(SURFACE_PATH, 'utf8')) as StaticSurface;
}

function fieldFindings(call: SurfaceCall, where: string): string[] {
  const findings: string[] = [];
  if (!['low', 'medium', 'high'].includes(String(call.conf_level))) {
    findings.push(`${where} ${call.spot_id}: conf_level is ${JSON.stringify(call.conf_level)}, not one of low/medium/high`);
  }
  if (typeof call.size_band !== 'string' || call.size_band.length === 0) {
    findings.push(`${where} ${call.spot_id}: size_band missing`);
  }
  if (!Array.isArray(call.size_range_m) || call.size_range_m.length !== 2 || !call.size_range_m.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    findings.push(`${where} ${call.spot_id}: size_range_m missing or malformed`);
  }
  if (!['clean', 'choppy', 'blown_out'].includes(String(call.wind_state))) {
    findings.push(`${where} ${call.spot_id}: wind_state is ${JSON.stringify(call.wind_state)}, not one of clean/choppy/blown_out`);
  }
  if (!/^\d{2}:\d{2}$/.test(call.best_window?.start ?? '') || !/^\d{2}:\d{2}$/.test(call.best_window?.end ?? '')) {
    findings.push(`${where} ${call.spot_id}: best_window missing or malformed`);
  }
  // weakest_link and confidence_reason (adr-enriched-fields-reach-the-
  // reading-surface.md): key PRESENCE is the check, never a value check --
  // weakest_link legitimately carries `null` (a genuine perfect day) and
  // that must stay distinguishable from the key being absent (an older
  // surface published before the field existed). Checking for a truthy
  // value here would make this guard reject exactly the honest case it
  // exists to protect.
  if (!('weakest_link' in call)) {
    findings.push(`${where} ${call.spot_id}: weakest_link key missing`);
  }
  if (!('confidence_reason' in call) || call.confidence_reason === undefined
    || !('dominant' in call.confidence_reason)
    || typeof call.confidence_reason.spread_terms?.height !== 'number'
    || typeof call.confidence_reason.spread_terms?.period !== 'number'
    || typeof call.confidence_reason.spread_terms?.direction !== 'number'
    || !['unverified', 'measured'].includes(call.confidence_reason.track_state)) {
    findings.push(`${where} ${call.spot_id}: confidence_reason missing or malformed`);
  }
  return findings;
}

// History: this guard was written and proven falsifiable against the
// then-committed, incomplete surface (all 60 spot-day-entries had at least
// one missing field), then temporarily SKIPPED because regenerating the
// surface from real pipeline output would have broken a shipped, unrelated
// scenario in tomorrows-ranking.steps.ts that hardcoded two literal
// expected values reverse-fitted to that old fixture. Andres authorized
// fixing the actual coupling instead of leaving the guard disabled: that
// scenario now derives its expectations dynamically
// (tomorrows-ranking.steps.ts, commit b0970b3), data/published-surface.json
// is regenerated from real pipeline output via
//   npm run pipeline:build -- --at <ISO-8601 instant, current civil day> --work-dir <tmp dir>
//   npm run publish:surface -- --input <work-dir>/pub/v1/regions/pa-pacific/bundle.json
// and this guard is unskipped and green against it. `--at` is NOT a fixed
// literal: `npm run build` runs `publish:surface --verify` first, which
// refuses unless `current.days[0].date` is Panama's real current civil day,
// so the instant must be regenerated fresh each time this file is
// regenerated, never copy-pasted from a past run's command.
describe('published surface: every spot, both days, carries the seven structured fields plus spot_detail', () => {
  it('has no gaps in current.days[0], current.days[1], or current.calls', () => {
    const surface = loadSurface();

    expect(surface.current.calls, 'calls must carry all 20 launch spots, not a partial ranking').toHaveLength(LAUNCH_SPOT_COUNT);
    for (const [index, day] of surface.current.days.entries()) {
      expect(day.spots, `days[${index}] must carry all 20 launch spots, not a partial ranking`).toHaveLength(LAUNCH_SPOT_COUNT);
    }

    const findings = [
      ...surface.current.calls.flatMap((call) => fieldFindings(call, 'calls')),
      ...surface.current.days.flatMap((day, index) => day.spots.flatMap((call) => fieldFindings(call, `days[${index}]`))),
    ];
    expect(findings, findings.join('\n')).toEqual([]);
  });

  // spot_detail (adr-enriched-fields-reach-the-reading-surface.md): f-show-
  // our-track-record needs it on the surface, not the bundle, because the
  // bundle is written to S3 and never committed. Same count discipline as
  // the five structured fields above: a surface that carries the key but
  // silently drops spots from it would still pass a shape-only check.
  it('carries spot_detail for every launch spot, not a partial identity map', () => {
    const surface = loadSurface();
    const spotDetail = surface.current.spot_detail ?? {};

    expect(Object.keys(spotDetail), 'spot_detail must resolve identity for every launch spot').toHaveLength(LAUNCH_SPOT_COUNT);
    for (const call of surface.current.calls) {
      expect(Object.hasOwn(spotDetail, call.spot_id), `spot_detail is missing an identity for ${call.spot_id}`).toBe(true);
    }
  });
});
