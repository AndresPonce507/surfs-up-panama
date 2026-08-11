// The pure mapping from pipeline outcomes to the exact structured log lines
// the already-deployed dead-man alarm chain watches
// (infra/lib/ingest-stack.ts's three MetricFilters match `$.event` against
// 'ingest.success', 'provider.error' and 'build.success' verbatim). This
// module owns the one rule the whole product rests on: never claim more than
// the data earned. `runIngestOnce`'s `completed` flag alone is not honest
// proof of success (it stays true even when every source failed and zero
// predictions were written), so the success gate here also requires at
// least one confirmed durable write.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  BUILD_SUCCESS_EVENT,
  CYCLE_FROZEN_EVENT,
  deriveBuildLogLines,
  deriveIngestLogLines,
  INGEST_SUCCESS_EVENT,
  PROVIDER_ERROR_EVENT,
  UNCHANGED_CYCLE_EVENT,
} from '../../src/pipeline/lambda/log-events';
import type { BuildOutcome, IngestOutcome } from '../../src/pipeline/ports';

const arbitraryEventType = fc.constantFrom(
  'wave_source_unavailable',
  'prediction_created',
  'prediction_duplicate',
);

const arbitraryEvent = arbitraryEventType.map((type) => ({ type, detail: `detail-for-${type}` }));

describe('deriveIngestLogLines (the dead-man alarm honesty gate)', () => {
  it('never emits ingest.success when zero predictions were created or confirmed, however the loop otherwise completed', () => {
    fc.assert(fc.property(
      fc.array(fc.constant({ type: 'wave_source_unavailable', detail: 'error' }), { minLength: 0, maxLength: 8 }),
      fc.boolean(),
      (events, completed) => {
        const outcome: IngestOutcome = { completed, events };
        const lines = deriveIngestLogLines(outcome);
        expect(lines.some((line) => line.event === INGEST_SUCCESS_EVENT)).toBe(false);
      },
    ));
  });

  it('emits exactly one ingest.success line whenever the loop completed and at least one prediction was created or confirmed duplicate', () => {
    fc.assert(fc.property(
      fc.array(arbitraryEvent, { minLength: 1, maxLength: 12 })
        .filter((events) => events.some((event) => event.type === 'prediction_created' || event.type === 'prediction_duplicate')),
      (events) => {
        const outcome: IngestOutcome = { completed: true, events };
        const lines = deriveIngestLogLines(outcome);
        expect(lines.filter((line) => line.event === INGEST_SUCCESS_EVENT)).toHaveLength(1);
      },
    ));
  });

  it('withholds ingest.success when the loop did not complete, even if predictions were written before the failure', () => {
    const outcome: IngestOutcome = {
      completed: false,
      events: [{ type: 'prediction_created', detail: 'predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz' }],
    };
    const lines = deriveIngestLogLines(outcome);
    expect(lines.some((line) => line.event === INGEST_SUCCESS_EVENT)).toBe(false);
  });

  it('emits one provider.error line per wave_source_unavailable event, carrying its failure reason', () => {
    const outcome: IngestOutcome = {
      completed: true,
      events: [
        { type: 'wave_source_unavailable', detail: 'error' },
        { type: 'wave_source_unavailable', detail: 'malformed' },
        { type: 'prediction_created', detail: 'predictions/v1/dt=2026-08-10/src=dwd_gwam/cyc=00Z/all.jsonl.gz' },
      ],
    };
    const lines = deriveIngestLogLines(outcome);
    const providerErrors = lines.filter((line) => line.event === PROVIDER_ERROR_EVENT);
    expect(providerErrors).toEqual([
      { event: PROVIDER_ERROR_EVENT, source: 'wave', reason: 'error' },
      { event: PROVIDER_ERROR_EVENT, source: 'wave', reason: 'malformed' },
    ]);
  });

  it('keeps the frozen-cycle alarm event structured and separate from generic provider errors', () => {
    const lines = deriveIngestLogLines({
      completed: true,
      events: [
        { type: 'health.provider.cycle_frozen', detail: 'older-than-24-hours' },
        { type: 'wave_source_unavailable', detail: 'cycle-frozen' },
      ],
    });
    expect(lines).toEqual([
      { event: CYCLE_FROZEN_EVENT, detail: 'older-than-24-hours' },
      { event: PROVIDER_ERROR_EVENT, source: 'wave', reason: 'cycle-frozen' },
    ]);
  });

  it('counts a completed unchanged provider cycle as dead-man success without inventing a prediction receipt', () => {
    const lines = deriveIngestLogLines({
      completed: true,
      events: [{ type: 'cycle_unchanged', detail: 'playa-venao/ncep_gfswave016' }],
    });
    expect(lines).toEqual([
      { event: UNCHANGED_CYCLE_EVENT, cycle: 'playa-venao/ncep_gfswave016' },
      { event: INGEST_SUCCESS_EVENT, predictions_created: 0, predictions_confirmed_duplicate: 0, unchanged_cycles: 1 },
    ]);
  });

  it('maps a wind-only source failure to provider.error without treating unsupported tide as a failure', () => {
    const lines = deriveIngestLogLines({
      completed: true,
      events: [
        { type: 'wind_source_unavailable', detail: 'error' },
        { type: 'prediction_created', detail: 'predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz' },
      ],
    });
    expect(lines).toContainEqual({ event: PROVIDER_ERROR_EVENT, source: 'wind', reason: 'error' });
    expect(lines).not.toContainEqual(expect.objectContaining({ source: 'tide' }));
  });
});

describe('deriveBuildLogLines (build.success honesty gate)', () => {
  it('emits build.success with the build id only when the build actually published', () => {
    const published: BuildOutcome = { published: true, build_id: 'b_2026-08-10T11Z' };
    expect(deriveBuildLogLines(published)).toEqual([{ event: BUILD_SUCCESS_EVENT, build_id: 'b_2026-08-10T11Z' }]);
  });

  it('never emits build.success when the build refused to publish, for any reason', () => {
    fc.assert(fc.property(fc.string(), (reason) => {
      const refused: BuildOutcome = { published: false, reason };
      const lines = deriveBuildLogLines(refused);
      expect(lines.some((line) => line.event === BUILD_SUCCESS_EVENT)).toBe(false);
    }));
  });
});
