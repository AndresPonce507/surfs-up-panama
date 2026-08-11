// GUARD: every current published call, on both days, must carry conf_level,
// size_band, size_range_m, wind_state and best_window. Wind/window may be the
// explicit value null, which is an honest structured fact; omission is never
// equivalent to null. SurfaceCall now requires the fields statically and its
// runtime validator refuses omissions. This committed-artifact guard protects
// the other end of the path so generated data cannot silently drift.
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
  const bilingualCall = call as SurfaceCall & { readonly call_en?: string };
  if (typeof call.call_es !== 'string' || call.call_es.trim() === '') {
    findings.push(`${where} ${call.spot_id}: call_es missing or empty`);
  }
  if (typeof bilingualCall.call_en !== 'string' || bilingualCall.call_en.trim() === '') {
    findings.push(`${where} ${call.spot_id}: call_en missing or empty`);
  }
  if (!['low', 'medium', 'high'].includes(String(call.conf_level))) {
    findings.push(`${where} ${call.spot_id}: conf_level is ${JSON.stringify(call.conf_level)}, not one of low/medium/high`);
  }
  if (typeof call.size_band !== 'string' || call.size_band.length === 0) {
    findings.push(`${where} ${call.spot_id}: size_band missing`);
  }
  if (!Array.isArray(call.size_range_m) || call.size_range_m.length !== 2 || !call.size_range_m.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    findings.push(`${where} ${call.spot_id}: size_range_m missing or malformed`);
  }
  if (call.wind_state !== null && !['clean', 'choppy', 'blown_out'].includes(String(call.wind_state))) {
    findings.push(`${where} ${call.spot_id}: wind_state is ${JSON.stringify(call.wind_state)}, not null or one of clean/choppy/blown_out`);
  }
  if (call.best_window !== null
    && (!/^\d{2}:\d{2}$/.test(call.best_window?.start ?? '') || !/^\d{2}:\d{2}$/.test(call.best_window?.end ?? ''))) {
    findings.push(`${where} ${call.spot_id}: best_window is neither null nor a valid local-time pair`);
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
//   npm run pipeline:build -- --at 2026-08-09T11:22:00Z
//   npm run publish:surface -- --input .pipeline-out/pub/v1/regions/pa-pacific/bundle.json
// and this guard is unskipped and green against it.
describe('published surface: every spot, both days, carries both calls and the five structured fields', () => {
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
});
