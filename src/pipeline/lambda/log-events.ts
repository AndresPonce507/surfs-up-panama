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
// see src/pipeline/ingest.ts). So the success gate requires either a
// confirmed durable prediction write or an exact persisted-series match that
// deliberately made no prediction PUT. The latter is separately logged and
// never masquerades as a synthetic prediction receipt.

import type { BuildOutcome, IngestOutcome } from '../ports';
import type { PublishOutcome } from '../publish-site';

export const INGEST_SUCCESS_EVENT = 'ingest.success';
export const PROVIDER_ERROR_EVENT = 'provider.error';
export const BUILD_SUCCESS_EVENT = 'build.success';
/** Informational only: no metric filter watches this. Lets a human read why
 * an hourly build cycle produced no new page without paging anyone. */
export const BUILD_REFUSED_EVENT = 'build.refused';
export const PUBLISH_SUCCESS_EVENT = 'publish.success';
/** Informational only, same reason as BUILD_REFUSED_EVENT: lets a human read
 * why a publish cycle left the previous pages serving without paging anyone. */
export const PUBLISH_REFUSED_EVENT = 'publish.refused';
export const STARTUP_REFUSED_EVENT = 'health.startup.refused';
/** Informational only: no metric filter watches this. A provider restated an
 * already-archived hour with a different forecast under the same run stamp and
 * the write was refused to keep the log insert-only. Rare and never expected;
 * a human reading it means the upstream contradicted itself. */
export const ARCHIVE_REWRITE_REFUSED_EVENT = 'health.archive.rewrite_refused';
export const CYCLE_FROZEN_EVENT = 'health.provider.cycle_frozen';
/** Informational only, same reason as BUILD_REFUSED_EVENT: lets a human read
 * why an hour's handover to the publisher could not be delivered, without
 * paging anyone. The build itself already succeeded (this line is only ever
 * printed after build.success), and the next hourly cycle republishes
 * everything anyway because publication is additive-only. */
export const PUBLISH_HANDOFF_FAILED_EVENT = 'health.publish.handoff_failed';
export const UNCHANGED_CYCLE_EVENT = 'ingest.cycle_unchanged';

export type LogLine = Readonly<Record<string, unknown>>;

const DURABLE_WRITE_EVENT_TYPES: ReadonlySet<string> = new Set(['prediction_created', 'prediction_duplicate']);
const SUCCESSFUL_CYCLE_EVENT_TYPES: ReadonlySet<string> = new Set([...DURABLE_WRITE_EVENT_TYPES, 'cycle_unchanged']);

export function deriveIngestLogLines(outcome: IngestOutcome): readonly LogLine[] {
  const providerErrorLines = outcome.events
    .filter((event) => event.type.endsWith('_source_unavailable'))
    .map((event): LogLine => ({ event: PROVIDER_ERROR_EVENT, source: event.type.replace('_source_unavailable', ''), reason: event.detail }));
  const startupLines = outcome.events
    .filter((event) => event.type === STARTUP_REFUSED_EVENT)
    .map((event): LogLine => ({ event: STARTUP_REFUSED_EVENT, detail: event.detail }));
  const frozenCycleLines = outcome.events
    .filter((event) => event.type === CYCLE_FROZEN_EVENT)
    .map((event): LogLine => ({ event: CYCLE_FROZEN_EVENT, detail: event.detail }));
  const unchangedCycleLines = outcome.events
    .filter((event) => event.type === 'cycle_unchanged')
    .map((event): LogLine => ({ event: UNCHANGED_CYCLE_EVENT, cycle: event.detail }));
  const rewriteRefusedLines = outcome.events
    .filter((event) => event.type === ARCHIVE_REWRITE_REFUSED_EVENT)
    .map((event): LogLine => ({ event: ARCHIVE_REWRITE_REFUSED_EVENT, record: event.detail }));

  const hasSuccessfulCycle = outcome.events.some((event) => SUCCESSFUL_CYCLE_EVENT_TYPES.has(event.type));
  const successLines: readonly LogLine[] = outcome.completed && hasSuccessfulCycle
    ? [{
      event: INGEST_SUCCESS_EVENT,
      predictions_created: outcome.events.filter((event) => event.type === 'prediction_created').length,
      predictions_confirmed_duplicate: outcome.events.filter((event) => event.type === 'prediction_duplicate').length,
      unchanged_cycles: outcome.events.filter((event) => event.type === 'cycle_unchanged').length,
    }]
    : [];

  return [...startupLines, ...frozenCycleLines, ...unchangedCycleLines, ...rewriteRefusedLines, ...providerErrorLines, ...successLines];
}

export function deriveBuildLogLines(outcome: BuildOutcome): readonly LogLine[] {
  if (outcome.published) {
    return [{ event: BUILD_SUCCESS_EVENT, build_id: outcome.build_id }];
  }
  return [{ event: BUILD_REFUSED_EVENT, reason: outcome.reason }];
}

/**
 * The publish honesty gate, same pattern as deriveBuildLogLines: `published`
 * is structurally impossible on a PublishOutcome unless runPublishOnce
 * completed every put, so this derivation cannot itself invent a success.
 */
export function derivePublishLogLines(outcome: PublishOutcome): readonly LogLine[] {
  if (outcome.published) {
    return [{ event: PUBLISH_SUCCESS_EVENT, build_id: outcome.build_id }];
  }
  return [{ event: PUBLISH_REFUSED_EVENT, reason: outcome.reason }];
}
