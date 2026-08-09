// The v1 7-band size vocabulary. The es/en labels are verbatim from
// application-architecture.md section 10 Q1; their canonical home is domain
// model section 7.2, one constants file consumed by capture form, display and
// residual math alike. This module is that one file on the frontend side.
//
// The `value` tokens ARE the canonical size_band enum of domain model section
// 7.2 (the scaffold placeholders they replaced could never have produced a
// valid report). `lo_m`/`hi_m` are that section's metre ranges, the same
// intervals the build classifies with: half-open (lo, hi], so `flat` opens
// just below zero to catch a dead-flat effective height of exactly 0, and the
// last band stays open-ended upward rather than claiming a ceiling.
//
// This module must never import from src/publish/**: the report capture form
// imports it, and that route may not reach the forecast layer
// (application-architecture.md section 9, leak path L1).

import type { Locale } from '../i18n/strings';

/**
 * The v1 `size_band` enum, domain-model.md section 7.2. One home for the seven
 * tokens: the capture form emits them, the published surface carries them, and
 * the learning lane keys residuals on them.
 */
export type SizeBandToken =
  | 'flat'
  | 'ankle_knee'
  | 'knee_waist'
  | 'waist_chest'
  | 'chest_head'
  | 'head_overhead'
  | 'double_overhead_plus';

export interface SizeBand {
  readonly value: SizeBandToken;
  /** Metre range of the breaking face, domain model section 7.2. */
  readonly lo_m: number;
  readonly hi_m: number;
  readonly label: Record<Locale, string>;
}

export const sizeBands: readonly SizeBand[] = [
  {
    value: 'flat',
    lo_m: -Number.EPSILON,
    hi_m: 0.1,
    label: { es: 'Plano', en: 'Flat' },
  },
  {
    value: 'ankle_knee',
    lo_m: 0.1,
    hi_m: 0.4,
    label: { es: 'Tobillo a rodilla', en: 'Ankle to knee' },
  },
  {
    value: 'knee_waist',
    lo_m: 0.4,
    hi_m: 0.7,
    label: { es: 'Rodilla a cintura', en: 'Knee to waist' },
  },
  {
    value: 'waist_chest',
    lo_m: 0.7,
    hi_m: 1.1,
    label: { es: 'Cintura a pecho', en: 'Waist to chest' },
  },
  {
    value: 'chest_head',
    lo_m: 1.1,
    hi_m: 1.6,
    label: { es: 'Pecho a cabeza', en: 'Chest to head' },
  },
  {
    value: 'head_overhead',
    lo_m: 1.6,
    hi_m: 2.4,
    label: { es: 'Cabeza a un metro más', en: 'Head to overhead' },
  },
  {
    value: 'double_overhead_plus',
    lo_m: 2.4,
    hi_m: Number.POSITIVE_INFINITY,
    label: { es: 'Doble o más', en: 'Double overhead +' },
  },
];

/** The one band whose metre range has no upper edge (section 7.2 reads "2.4 +"). */
export const OPEN_ENDED_SIZE_BAND: SizeBandToken = 'double_overhead_plus';
