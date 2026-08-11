import { sizeBands, type SizeBandToken } from '../data/size-bands';
import type { Locale } from '../i18n/strings';
import type { BestWindow, WindState } from './static-surface';

export type DailyCallFacts = {
  readonly size_band: SizeBandToken;
  readonly wind_state: WindState | null;
  readonly best_window: BestWindow | null;
};

const DAILY_CALL_WIND: Readonly<Record<Locale, Readonly<Record<WindState, string>>>> = {
  es: { clean: 'limpio', choppy: 'picado', blown_out: 'destrozado' },
  en: { clean: 'clean', choppy: 'choppy', blown_out: 'blown out' },
};

/** Section 10's one producer-owned bilingual projection of published facts. */
export function composeDailyCall(locale: Locale, facts: DailyCallFacts): string {
  const size = sizeBands.find((band) => band.value === facts.size_band)?.label[locale];
  if (size === undefined) {
    throw new Error(
      `daily call refused: size_band "${facts.size_band}" is outside the v1 seven-band vocabulary`,
    );
  }
  if (locale === 'es') {
    const wind = facts.wind_state === null ? 'sin datos' : DAILY_CALL_WIND.es[facts.wind_state];
    const window = facts.best_window === null
      ? 'sin ventana estimada'
      : `mejor de ${facts.best_window.start} a ${facts.best_window.end}`;
    return `${size}, viento ${wind}, ${window}.`;
  }
  const wind = facts.wind_state === null ? 'no wind data' : `${DAILY_CALL_WIND.en[facts.wind_state]} wind`;
  const window = facts.best_window === null
    ? 'no estimated window'
    : `best from ${facts.best_window.start} to ${facts.best_window.end}`;
  return `${size}, ${wind}, ${window}.`;
}
