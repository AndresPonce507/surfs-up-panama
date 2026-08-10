// The total read boundary for a stored spot correction. The reader owns byte
// parsing and the units pin; gate re-checking belongs to the next apply step.

export type CorrectionReadEvent = { type: string; detail?: string };

export type CorrectionReadReport = {
  record: unknown | null;
  outcome: 'loaded' | 'absent' | 'rejected-as-absent';
  events: CorrectionReadEvent[];
};

export type CorrectionReadStore = {
  get(key: string): Promise<string | null>;
};

export async function loadStoredCorrection(input: {
  store: CorrectionReadStore;
  key: string;
}): Promise<CorrectionReadReport> {
  try {
    const body = await input.store.get(input.key);
    if (body === null) return { record: null, outcome: 'absent', events: [] };

    const parsed: unknown = JSON.parse(body);
    const rejection = correctionRejection(parsed);
    if (rejection !== null) return rejectedAsAbsent(rejection);

    return { record: parsed, outcome: 'loaded', events: [] };
  } catch (error) {
    return rejectedAsAbsent(`could not read correction bytes: ${errorDetail(error)}`);
  }
}

function correctionRejection(value: unknown): string | null {
  if (!isRecord(value)) return 'correction file must contain one JSON object';
  if (value['schema'] !== 'spot-correction/1') return 'correction file does not name schema spot-correction/1';

  const scoreDelta = value['score_delta'];
  if (scoreDelta === undefined) return null;
  if (!isRecord(scoreDelta)) return 'score_delta must be an object when present';
  if (scoreDelta['units'] !== 'display_points') {
    return `score_delta.units must be display_points, found ${JSON.stringify(scoreDelta['units'])}`;
  }

  return null;
}

function rejectedAsAbsent(detail: string): CorrectionReadReport {
  return {
    record: null,
    outcome: 'rejected-as-absent',
    events: [{ type: 'correction-read-rejected', detail }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
