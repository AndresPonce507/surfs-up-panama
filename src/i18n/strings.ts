// UI strings, both languages. Spanish and English strings marked "verbatim"
// come word for word from docs/product/architecture/application-architecture.md
// section 10 and must not be reworded here. Strings in [brackets] are scaffold
// placeholders: no exact copy exists for them yet, and inventing product copy
// is out of scope (copy register check pending, Decisions needing Andres #6).

import {
  QUALITY_TOKENS,
  WIND_STATE_TOKENS,
  type QualityToken,
  type WindStateToken,
} from '../data/report-vocab';

export type Locale = 'es' | 'en';

export const locales: readonly Locale[] = ['es', 'en'];

export function otherLocale(locale: Locale): Locale {
  return locale === 'es' ? 'en' : 'es';
}

interface HomeStrings {
  readonly header: string;
  readonly tabToday: string;
  readonly tabTomorrow: string;
  readonly updatedPrefix: string;
  readonly honestyFooter: string;
}

/**
 * `value` is the canonical wire token, never a display string: it is what the
 * capture form commits to IndexedDB and what gets POSTed on replay. `label` is
 * the settled Spanish or English copy of application-architecture.md section
 * 10 and is free to change on a copy review; the token is not.
 */
interface ReportOption {
  readonly value: WindStateToken | QualityToken;
  readonly label: string;
}

interface ReportCaptureStrings {
  readonly title: (spotName: string) => string;
  readonly sizeQuestion: string;
  readonly windQuestion: string;
  readonly windOptions: readonly ReportOption[];
  readonly qualityQuestion: string;
  readonly qualityOptions: readonly ReportOption[];
  readonly submit: string;
  readonly noscript: string;
}

interface SpotStrings {
  readonly reportCta: string;
}

interface ThemeStrings {
  readonly activateDark: string;
  readonly activateLight: string;
}

export interface UiStrings {
  readonly home: HomeStrings;
  readonly report: ReportCaptureStrings;
  readonly spot: SpotStrings;
  readonly theme: ThemeStrings;
}

// Option `value` tokens come from src/data/report-vocab.ts, the one home for
// the canonical wind and quality enums (decided 2026-08-09, closing
// f-tell-us-what-you-saw-cold Pre-requisite 1). Order here is the order there,
// which is why the tokens are indexed rather than retyped: a reordered array
// and a retyped literal are exactly how the form and the wire contract drift
// apart, and domain-model.md section 7.4 replays a queued report byte-
// identical, so drift is unrepairable once a record is committed.
export const strings: Record<Locale, UiStrings> = {
  es: {
    home: {
      header: '¿Dónde se surfea hoy?', // verbatim
      tabToday: 'Hoy', // verbatim
      tabTomorrow: 'Mañana', // verbatim
      updatedPrefix: 'Actualizado', // verbatim
      honestyFooter:
        'Solo hoy y mañana. Más allá nadie sabe de verdad, y no vamos a inventar.', // verbatim
    },
    report: {
      title: (spotName) => `¿Cómo estuvo ${spotName}?`, // verbatim
      sizeQuestion: '¿Qué tan grande?', // verbatim
      windQuestion: '¿El viento?', // verbatim
      windOptions: [
        { value: WIND_STATE_TOKENS[0]!, label: 'Limpio' }, // verbatim
        { value: WIND_STATE_TOKENS[1]!, label: 'Picado' }, // verbatim
        { value: WIND_STATE_TOKENS[2]!, label: 'Destrozado' }, // verbatim
      ],
      qualityQuestion: '¿Cómo estuvo?', // verbatim
      qualityOptions: [
        { value: QUALITY_TOKENS[0]!, label: 'Malo' }, // verbatim
        { value: QUALITY_TOKENS[1]!, label: 'Normal' }, // verbatim
        { value: QUALITY_TOKENS[2]!, label: 'Bueno' }, // verbatim
        { value: QUALITY_TOKENS[3]!, label: 'Épico' }, // verbatim
      ],
      submit: 'Mandar', // verbatim
      noscript:
        'Para mandar reportes hace falta JavaScript. Para leer el pronóstico no.', // verbatim
    },
    spot: {
      reportCta: '¿ESTUVISTE? CUÉNTANOS', // verbatim (section 14 wireframe)
    },
    theme: {
      activateDark: 'Activar modo oscuro',
      activateLight: 'Activar modo claro',
    },
  },
  en: {
    home: {
      header: "Where's it working today?", // verbatim
      tabToday: 'Today', // verbatim
      tabTomorrow: 'Tomorrow', // verbatim
      updatedPrefix: 'Updated', // verbatim
      honestyFooter:
        "Today and tomorrow only. Past that nobody really knows, so we don't pretend.", // verbatim
    },
    report: {
      title: (spotName) => `How was ${spotName}?`, // verbatim
      sizeQuestion: 'How big?', // verbatim
      windQuestion: 'Wind?', // verbatim
      windOptions: [
        { value: WIND_STATE_TOKENS[0]!, label: 'Clean' }, // verbatim
        { value: WIND_STATE_TOKENS[1]!, label: 'Choppy' }, // verbatim
        { value: WIND_STATE_TOKENS[2]!, label: 'Blown out' }, // verbatim
      ],
      qualityQuestion: 'How was it?', // verbatim
      qualityOptions: [
        { value: QUALITY_TOKENS[0]!, label: 'Bad' }, // verbatim
        { value: QUALITY_TOKENS[1]!, label: 'OK' }, // verbatim
        { value: QUALITY_TOKENS[2]!, label: 'Good' }, // verbatim
        { value: QUALITY_TOKENS[3]!, label: 'Epic' }, // verbatim
      ],
      submit: 'Send', // verbatim
      noscript:
        "Sending a report needs JavaScript. Reading the forecast doesn't.", // verbatim
    },
    spot: {
      reportCta: '[report CTA copy pending]', // no exact English copy exists yet
    },
    theme: {
      activateDark: 'Switch to dark mode',
      activateLight: 'Switch to light mode',
    },
  },
};
