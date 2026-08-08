// The v1 7-band size vocabulary. The es/en labels are verbatim from
// application-architecture.md section 10 Q1; their canonical home is domain
// model section 7.2, one constants file consumed by capture form, display and
// residual math alike. This module is that one file on the frontend side.
//
// The `value` tokens are scaffold placeholders: the canonical size_band enum
// tokens are owned by the domain model and must replace these before any
// report is ever submitted to the write path.

import type { Locale } from '../i18n/strings';

export interface SizeBand {
  readonly value: string;
  readonly label: Record<Locale, string>;
}

export const sizeBands: readonly SizeBand[] = [
  { value: 'band-placeholder-1', label: { es: 'Plano', en: 'Flat' } },
  {
    value: 'band-placeholder-2',
    label: { es: 'Tobillo a rodilla', en: 'Ankle to knee' },
  },
  {
    value: 'band-placeholder-3',
    label: { es: 'Rodilla a cintura', en: 'Knee to waist' },
  },
  {
    value: 'band-placeholder-4',
    label: { es: 'Cintura a pecho', en: 'Waist to chest' },
  },
  {
    value: 'band-placeholder-5',
    label: { es: 'Pecho a cabeza', en: 'Chest to head' },
  },
  {
    value: 'band-placeholder-6',
    label: { es: 'Cabeza a un metro más', en: 'Head to overhead' },
  },
  {
    value: 'band-placeholder-7',
    label: { es: 'Doble o más', en: 'Double overhead +' },
  },
];
