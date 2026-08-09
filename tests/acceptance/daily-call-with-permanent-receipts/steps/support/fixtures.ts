// The worked-example fixture: Playa Venao, valid 2026-08-08, exactly the
// inputs of 05-scoring-engine.md section 11 (the real live pull of research
// 09 section 8.2). The expected outputs asserted in the scenarios (score 80,
// size band waist_chest, confidence 0.31 low, weakest link size) are that
// section's hand-computed intermediates, so the acceptance suite pins the
// blend, the physics and the combine through the driving port with real data.

import type { SpotSeed } from '../../../../../src/scoring/engine';

// Seed constants per domain-model.md section 11's example row. The launch
// seed file (data/spots/pa-pacific.yaml) deliberately ships these constants
// null (unresearched); the values below are the design's worked example and
// the AT's declared input. Sourcing real per-spot constants is Pre-requisites
// row 3/4 work, flagged in the DISTILL delta, not solved here.
export const venaoSeed: SpotSeed = {
  spot_id: 'playa-venao',
  name: 'Playa Venao',
  region_id: 'pa-pacific',
  timezone: 'America/Panama',
  shore_normal_deg: 175,
  swell_window_deg: [150, 210],
  h_ref_m: 1.3,
  s_size: 0.5,
  wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
  tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
};

export type MemberSpec = { source: string; h_m: number; t_s: number; dir_deg: number };

/** The four usable members of the 2026-08-08 Venao pull (05 section 11). */
export const venaoMorningMembers: readonly MemberSpec[] = [
  { source: 'ncep_gfswave016', h_m: 0.64, t_s: 15.5, dir_deg: 206 },
  { source: 'ncep_gfswave025', h_m: 0.66, t_s: 15.5, dir_deg: 204 },
  { source: 'meteofrance_wave', h_m: 0.78, t_s: 11.6, dir_deg: 212 },
  { source: 'dwd_gwam', h_m: 0.86, t_s: 10.05, dir_deg: 203 },
];

/** Forecast hours the fixture serves, UTC. 18Z is the worked-example hour. */
export const VALID_HOURS_UTC: readonly number[] = [17, 18, 19];

/** Wind at every fixture hour: 7.0 kt from 40 degrees (domain-model 5.1 sample). */
export const venaoWind = { speed_kt: 7.0, dir_deg: 40 };

// Hourly tide curve over the spot-local day (America/Panama, UTC-5), chosen
// so the day extremes are 0.9 / 4.3 m and the 18:00Z stage is 2.31 m, exactly
// the worked example's inputs. [utcHour, metres].
export const venaoTideCurve: readonly (readonly [number, number])[] = [
  [5, 2.5],
  [6, 1.8],
  [7, 1.2],
  [8, 0.95],
  [9, 0.9],
  [10, 1.1],
  [11, 1.7],
  [12, 2.5],
  [13, 3.3],
  [14, 3.9],
  [15, 4.2],
  [16, 4.3],
  [17, 3.4],
  [18, 2.31],
  [19, 1.6],
  [20, 1.1],
  [21, 0.95],
  [22, 1.2],
  [23, 1.9],
];

export function utcHourKey(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00Z`;
}
