// Read-only PublishedCall history port. The production adapter is deliberately
// outside this module; scoring sees receipt text and no storage SDK.
//
// WHY-NEW-FILE: src/scoring/published-call-history.ts
//   CLOSEST-EXISTING: src/scoring/confidence.ts
//   EXTENSION-COST: confidence.ts owns today's scoring and confidence copy;
//     adding receipt validation would couple it to storage-shaped history.
//   PARALLEL-RATIONALE: this reader has a separate source-port lifecycle and
//     validates immutable records before pure scoring receives their values.

import { SPREAD_VARIABLES, type SpreadTerms } from './confidence';

export type PublishedCallHistoryScope = {
  readonly region_id: string;
  readonly prefix: 'log/calls/v1/';
};

export type PublishedCallHistorySource = {
  list(scope: PublishedCallHistoryScope): Promise<readonly string[]>;
  read(key: string): Promise<string>;
};

export type HistorySpot = { readonly spot_id: string; readonly timezone: string };

type PublishedCallRow = {
  readonly spot_id: string;
  readonly valid_ts: string;
  readonly members_used: number;
  readonly confidence_reason: { readonly spread_terms: SpreadTerms };
};

const CANONICAL_CALL_KEY = /^log\/calls\/v1\/dt=(\d{4}-\d{2}-\d{2})\/build=11Z\/([^/]+)\.jsonl\.gz$/;
const CANONICAL_VALID_TIME = /T18:00Z$/;

/** A history fault never becomes an empty, apparently thin history. */
export class PublishedCallHistoryError extends Error {
  constructor(readonly reason: 'unavailable' | 'malformed') {
    super(`published call history ${reason}`);
  }
}

export async function readCompletedSpreadHistory(
  source: PublishedCallHistorySource,
  scope: PublishedCallHistoryScope,
  spots: readonly HistorySpot[],
  currentInstant: Date,
): Promise<ReadonlyMap<string, readonly number[]>> {
  try {
    const spotById = new Map(spots.map((spot) => [spot.spot_id, spot]));
    const valuesBySpot = new Map<string, number[]>();
    const seenSpotDays = new Set<string>();
    const keys = await source.list(scope);

    for (const key of keys) {
      const partitionDate = canonicalPartitionDate(key, scope);
      const body = await source.read(key);
      for (const row of parseRows(body)) {
        const spot = spotById.get(row.spot_id);
        if (spot === undefined) throw new PublishedCallHistoryError('malformed');
        if (!CANONICAL_VALID_TIME.test(row.valid_ts)) continue;
        const localDay = spotLocalDate(row.valid_ts, spot.timezone);
        if (localDay !== partitionDate) throw new PublishedCallHistoryError('malformed');
        if (localDay >= spotLocalDate(currentInstant.toISOString(), spot.timezone)) continue;

        const spotDay = `${row.spot_id}\u0000${localDay}`;
        if (seenSpotDays.has(spotDay)) throw new PublishedCallHistoryError('malformed');
        seenSpotDays.add(spotDay);
        if (row.members_used < 2) continue;

        const history = valuesBySpot.get(row.spot_id) ?? [];
        history.push(spreadPenalty(row.confidence_reason.spread_terms));
        valuesBySpot.set(row.spot_id, history);
      }
    }

    return valuesBySpot;
  } catch (error) {
    if (error instanceof PublishedCallHistoryError) throw error;
    throw new PublishedCallHistoryError(error instanceof SyntaxError ? 'malformed' : 'unavailable');
  }
}

/** The existing absolute confidence penalty, reconstructed from published terms. */
export function spreadPenalty(terms: SpreadTerms): number {
  return 1 - Math.exp(-SPREAD_VARIABLES.reduce((sum, variable) => sum + terms[variable], 0));
}

function canonicalPartitionDate(key: string, scope: PublishedCallHistoryScope): string {
  const match = CANONICAL_CALL_KEY.exec(key);
  if (match?.[1] === undefined || match[2] !== scope.region_id) throw new PublishedCallHistoryError('malformed');
  return match[1];
}

function parseRows(body: string): PublishedCallRow[] {
  return body.split('\n').filter((line) => line !== '').map((line) => parseRow(line));
}

function parseRow(line: string): PublishedCallRow {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed)
    || typeof parsed.spot_id !== 'string'
    || typeof parsed.valid_ts !== 'string'
    || typeof parsed.members_used !== 'number'
    || !Number.isSafeInteger(parsed.members_used)
    || parsed.members_used < 0
    || !isRecord(parsed.confidence_reason)
    || !isSpreadTerms(parsed.confidence_reason.spread_terms)) throw new PublishedCallHistoryError('malformed');
  return parsed as PublishedCallRow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSpreadTerms(value: unknown): value is SpreadTerms {
  return isRecord(value) && SPREAD_VARIABLES.every((variable) =>
    typeof value[variable] === 'number' && Number.isFinite(value[variable]) && value[variable] >= 0,
  );
}

function spotLocalDate(instant: string, timezone: string): string {
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime())) throw new PublishedCallHistoryError('malformed');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const year = part('year'); const month = part('month'); const day = part('day');
  if (year === undefined || month === undefined || day === undefined) throw new PublishedCallHistoryError('malformed');
  return `${year}-${month}-${day}`;
}
