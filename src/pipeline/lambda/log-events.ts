import type { BuildOutcome, IngestOutcome } from '../ports';

export const INGEST_SUCCESS_EVENT = 'ingest.success';
export const PROVIDER_ERROR_EVENT = 'provider.error';
export const BUILD_SUCCESS_EVENT = 'build.success';
export const BUILD_REFUSED_EVENT = 'build.refused';

export type LogLine = Readonly<Record<string, unknown>>;

const DURABLE_WRITE_EVENT_TYPES: ReadonlySet<string> = new Set(['prediction_created', 'prediction_duplicate']);

export function deriveIngestLogLines(outcome: IngestOutcome): readonly LogLine[] {
  const providerErrors = outcome.events
    .filter((event) => event.type === 'wave_source_unavailable')
    .map((event): LogLine => ({ event: PROVIDER_ERROR_EVENT, source: 'wave', reason: event.detail }));
  const durable = outcome.events.some((event) => DURABLE_WRITE_EVENT_TYPES.has(event.type));
  return outcome.completed && durable
    ? [...providerErrors, {
      event: INGEST_SUCCESS_EVENT,
      predictions_created: outcome.events.filter((event) => event.type === 'prediction_created').length,
      predictions_confirmed_duplicate: outcome.events.filter((event) => event.type === 'prediction_duplicate').length,
    }]
    : providerErrors;
}

export function deriveBuildLogLines(outcome: BuildOutcome): readonly LogLine[] {
  return outcome.published
    ? [{ event: BUILD_SUCCESS_EVENT, build_id: outcome.build_id }]
    : [{ event: BUILD_REFUSED_EVENT, reason: outcome.reason }];
}
