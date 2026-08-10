// URL builders for the route map (application-architecture.md section 4).
// Spanish lives at the root, English under /en/ (decision 8). Slugs are
// language-neutral: the slug IS spot_id, so a shared URL works in both trees.
// No JS locale sniffing and no redirects, ever: both break caching and
// surprise people on bad signal.

import type { Locale } from './strings';

export const paths = {
  home: (locale: Locale): string => (locale === 'es' ? '/' : '/en/'),
  tomorrow: (locale: Locale): string =>
    locale === 'es' ? '/manana/' : '/en/tomorrow/',
  spot: (locale: Locale, spotId: string): string =>
    locale === 'es' ? `/spots/${spotId}/` : `/en/spots/${spotId}/`,
  report: (locale: Locale, spotId: string): string =>
    locale === 'es'
      ? `/spots/${spotId}/reportar/`
      : `/en/spots/${spotId}/report/`,
  reported: (locale: Locale, spotId: string): string =>
    locale === 'es'
      ? `/spots/${spotId}/reportado/`
      : `/en/spots/${spotId}/reported/`,
  // Precached offline fallback (application-architecture.md section 4). Spanish
  // only until the /en/ mirror ships (deferred to F-READ-IT-IN-YOUR-LANGUAGE);
  // there is no locale branch to get wrong in the meantime.
  offline: (): string => '/sin-senal/',
} as const;
