// WHY-NEW-FILE: tests/unit/spread-climatology.test.ts
//   CLOSEST-EXISTING: tests/unit/model-agreement.test.ts
//   EXTENSION-COST: model-agreement.test.ts proves today's display agreement;
//     adding durable receipt fixtures would obscure that surface's pure-copy contract.
//   PARALLEL-RATIONALE: this test owns the immutable PublishedCall source port,
//     the 30-completed-local-day gate, and the fail-closed history boundary.

import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  agreementForSpreadClimatology,
  confidenceReasonEs,
  type ConfidenceLevel,
} from '../../src/scoring/confidence';
import {
  readCompletedSpreadHistory,
  type PublishedCallHistorySource,
} from '../../src/scoring/published-call-history';
import {
  SPREAD_CLIMATOLOGY_MINIMUM_HISTORY_DAYS,
  selectSpreadClimatology,
} from '../../src/scoring/spread-climatology';
import { s3PublishedCallHistorySource } from '../../src/scoring/s3-published-call-history';

const SPOT = { spot_id: 'playa-venao', timezone: 'America/Panama' };
const SCOPE = { region_id: 'pa-pacific', prefix: 'log/calls/v1/' as const };
const CURRENT = new Date('2026-08-13T12:00:00Z');
const TERMS = { height: 0.05, period: 1.2, direction: 0.02 } as const;

function canonicalKey(day: string): string {
  return `log/calls/v1/dt=${day}/build=11Z/pa-pacific.jsonl.gz`;
}

function priorDay(index: number): string {
  const date = new Date('2026-06-01T18:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function receipt(day: string, terms = { height: 0.01, period: 0.01, direction: 0.01 }): string {
  return JSON.stringify({
    spot_id: SPOT.spot_id,
    valid_ts: `${day}T18:00Z`,
    members_used: 3,
    confidence_reason: { spread_terms: terms },
  });
}

function sourceFor(days: number): PublishedCallHistorySource {
  const entries = Array.from({ length: days }, (_, index) => {
    const day = priorDay(index);
    return [canonicalKey(day), receipt(day)] as const;
  });
  const bodies = new Map(entries);
  return {
    list: async () => [...bodies.keys()],
    read: async (key) => bodies.get(key) ?? Promise.reject(new Error(`missing ${key}`)),
  };
}

describe('spread climatology activation', () => {
  it('keeps the normal-comparison sentence unreachable below 30 distinct completed local days', async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 0, max: SPREAD_CLIMATOLOGY_MINIMUM_HISTORY_DAYS - 1 }),
      async (dayCount) => {
        const history = await readCompletedSpreadHistory(sourceFor(dayCount), SCOPE, [SPOT], CURRENT);
        const selected = selectSpreadClimatology(history.get(SPOT.spot_id) ?? [], TERMS);
        const agreement = agreementForSpreadClimatology(TERMS, 'medium', { spread: true }, selected);
        const reason = confidenceReasonEs('medium', agreement);

        assert.equal(selected.kind, 'absolute');
        assert.doesNotMatch(reason, /m[aá]s de lo normal/iu);
      },
    ), { examples: [[2]] });
  });

  it('activates the spot-specific comparison only with 30 completed local days', async () => {
    const history = await readCompletedSpreadHistory(
      sourceFor(SPREAD_CLIMATOLOGY_MINIMUM_HISTORY_DAYS),
      SCOPE,
      [SPOT],
      CURRENT,
    );
    const selected = selectSpreadClimatology(history.get(SPOT.spot_id) ?? [], TERMS);
    const level: ConfidenceLevel = 'medium';
    const reason = confidenceReasonEs(level, agreementForSpreadClimatology(TERMS, level, { spread: true }, selected));

    assert.equal(selected.kind, 'climatology');
    assert.match(reason, /m[aá]s de lo normal/iu);
    assert.doesNotMatch(reason, /%|por ciento|probabilidad/iu);
  });

  it('fails closed when a canonical receipt is malformed', async () => {
    const source: PublishedCallHistorySource = {
      list: async () => [canonicalKey('2026-06-01')],
      read: async () => '{not-json}',
    };

    await assert.rejects(
      readCompletedSpreadHistory(source, SCOPE, [SPOT], CURRENT),
      /published call history malformed/,
    );
    await assert.rejects(
      readCompletedSpreadHistory({ list: async () => { throw new Error('S3 unavailable'); }, read: async () => '' }, SCOPE, [SPOT], CURRENT),
      /published call history unavailable/,
    );
  });

  it('keeps S3 at the source-adapter boundary and selects only the requested region', async () => {
    const selectedKey = canonicalKey('2026-06-01');
    const sender = {
      send: async (command: { input: Record<string, unknown> }) => {
        if (command.input.Prefix !== undefined) {
          return {
            Contents: [
              { Key: selectedKey },
              { Key: 'log/calls/v1/dt=2026-06-01/build=11Z/other-region.jsonl.gz' },
            ],
            IsTruncated: false,
          };
        }
        return { Body: { transformToByteArray: async () => gzipSync(receipt('2026-06-01')) } };
      },
    };
    const source = s3PublishedCallHistorySource(sender, 'calls-bucket');

    assert.deepEqual(await source.list(SCOPE), [selectedKey]);
    assert.equal(await source.read(selectedKey), receipt('2026-06-01'));
  });
});
