// UI strings, both languages. Spanish and English strings marked "verbatim"
// come word for word from docs/product/architecture/application-architecture.md
// section 10 and must not be reworded here. Strings in [brackets] are scaffold
// placeholders: no exact copy exists for them yet, and inventing product copy
// is out of scope (copy register check pending, Decisions needing Andres #6).

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

interface ReportOption {
  readonly value: string;
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

export interface UiStrings {
  readonly home: HomeStrings;
  readonly report: ReportCaptureStrings;
  readonly spot: SpotStrings;
}

// Option `value` tokens are scaffold placeholders. The canonical wind and
// quality enum tokens are owned by the domain model and the write-path wire
// contract (07-write-path.md section 4.1); replace before any report submits.
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
        { value: 'wind-placeholder-1', label: 'Limpio' }, // verbatim
        { value: 'wind-placeholder-2', label: 'Picado' }, // verbatim
        { value: 'wind-placeholder-3', label: 'Destrozado' }, // verbatim
      ],
      qualityQuestion: '¿Cómo estuvo?', // verbatim
      qualityOptions: [
        { value: 'quality-placeholder-1', label: 'Malo' }, // verbatim
        { value: 'quality-placeholder-2', label: 'Normal' }, // verbatim
        { value: 'quality-placeholder-3', label: 'Bueno' }, // verbatim
        { value: 'quality-placeholder-4', label: 'Épico' }, // verbatim
      ],
      submit: 'Mandar', // verbatim
      noscript:
        'Para mandar reportes hace falta JavaScript. Para leer el pronóstico no.', // verbatim
    },
    spot: {
      reportCta: '¿ESTUVISTE? CUÉNTANOS', // verbatim (section 14 wireframe)
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
        { value: 'wind-placeholder-1', label: 'Clean' }, // verbatim
        { value: 'wind-placeholder-2', label: 'Choppy' }, // verbatim
        { value: 'wind-placeholder-3', label: 'Blown out' }, // verbatim
      ],
      qualityQuestion: 'How was it?', // verbatim
      qualityOptions: [
        { value: 'quality-placeholder-1', label: 'Bad' }, // verbatim
        { value: 'quality-placeholder-2', label: 'OK' }, // verbatim
        { value: 'quality-placeholder-3', label: 'Good' }, // verbatim
        { value: 'quality-placeholder-4', label: 'Epic' }, // verbatim
      ],
      submit: 'Send', // verbatim
      noscript:
        "Sending a report needs JavaScript. Reading the forecast doesn't.", // verbatim
    },
    spot: {
      reportCta: '[report CTA copy pending]', // no exact English copy exists yet
    },
  },
};
