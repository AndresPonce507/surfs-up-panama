// Pure mapping from pipeline outcomes to the exact structured log lines the
// already-deployed dead-man alarm chain watches. infra/lib/ingest-stack.ts's
// three MetricFilters match `$.event` against these three literal strings;
// import the constants from here on both sides so the strings can never
// silently drift apart.
//
// The one rule the whole product rests on: never claim more than the data
// earned. `IngestOutcome.completed` alone is not honest proof of success --
// it stays `true` even when the source loop ran to the end with every
// provider failing and zero predictions written (runIngestOnce hardcodes it;
// see src/pipeline/ingest.ts). So the success gate here also requires at
// least one confirmed durable write (`prediction_created` or
// `prediction_duplicate`), matching 04-ingest-pipeline.md section 3 step 8's
// "iff the source loop completed and every attempted log PUT succeeded or
// was a verified duplicate" -- a loop that completed but wrote nothing
// attempted no log PUT at all, so it cannot honestly claim that either.

import type { BuildOutcome, IngestOutcome } from '../ports';

export const INGEST_SUCCESS_EVENT = 'ingest.success';
export const PROVIDER_ERROR_EVENT = 'provider.error';
export const BUILD_SUCCESS_EVENT = 'build.success';
/** Informational only: no metric filter watches this. Lets a human read why
 * an hourly build cycle produced no new page without paging anyone. */
export const BUILD_REFUSED_EVENT = 'build.refused';

export type LogLine = Readonly<Record<string, unknown>>;

const DURABLE_WRITE_EVENT_TYPES: ReadonlySet<string> = new Set(['prediction_created', 'prediction_duplicate']);

export function deriveIngestLogLines(outcome: IngestOutcome): readonly LogLine[] {
  const providerErrorLines = outcome.events
    .filter((event) => event.type === 'wave_source_unavailable')
    .map((event): LogLine => ({ event: PROVIDER_ERROR_EVENT, source: 'wave', reason: event.detail }));

  const wroteAtLeastOnePrediction = outcome.events.some((event) => DURABLE_WRITE_EVENT_TYPES.has(event.type));
  const successLines: readonly LogLine[] = outcome.completed && wroteAtLeastOnePrediction
    ? [{
      event: INGEST_SUCCESS_EVENT,
      predictions_created: outcome.events.filter((event) => event.type === 'prediction_created').length,
      predictions_confirmed_duplicate: outcome.events.filter((event) => event.type === 'prediction_duplicate').length,
    }]
    : [];

  return [...providerErrorLines, ...successLines];
}

export function deriveBuildLogLines(outcome: BuildOutcome): readonly LogLine[] {
  if (outcome.published) {
    return [{ event: BUILD_SUCCESS_EVENT, build_id: outcome.build_id }];
  }
  return [{ event: BUILD_REFUSED_EVENT, reason: outcome.reason }];
}
