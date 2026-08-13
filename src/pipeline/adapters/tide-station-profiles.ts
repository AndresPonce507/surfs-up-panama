// Tide-station assignment is deliberately data, but the only shipped profile
// document is empty. A station becomes usable only when a future, auditable
// exact-spot record satisfies the Accepted ADR's hard limits. Candidates are
// not a weaker form of an assignment and are rejected before composition.

export type TideStationProfileDocument = {
  readonly version: 1;
  readonly profiles: readonly unknown[];
};

export type AcceptedTideStationProfile = {
  readonly source: 'noaa-coops';
  readonly status: 'accepted';
  readonly spot_id: string;
  readonly station_id: string;
  readonly validation: TideStationValidationRecord;
};

export type TideStationValidationRecord = {
  readonly local_reference: {
    readonly description: string;
    readonly lat: number;
    readonly lon: number;
    readonly timezone: string;
  };
  readonly events: readonly TideEventComparison[];
  readonly daily_ranges: readonly TidalRangeComparison[];
};

export type TideEventComparison = {
  readonly phase: 'high' | 'low';
  readonly local_date: string;
  readonly observed_at: string;
  readonly predicted_at: string;
};

export type TidalRangeComparison = {
  readonly local_date: string;
  readonly observed_m: number;
  readonly predicted_m: number;
};

/** The complete launch profile set. It intentionally contains no mappings. */
export const shippedTideStationProfiles: TideStationProfileDocument = Object.freeze({
  version: 1,
  profiles: Object.freeze([]),
});

/**
 * Smart constructor for the only values the NOAA CO-OPS adapter may receive.
 * It makes a candidate, an incomplete record, or an out-of-policy record fail
 * at composition rather than quietly becoming a live tide reading.
 */
export function validateAcceptedTideStationProfiles(document: unknown): readonly AcceptedTideStationProfile[] {
  const root = record(document, 'profile document');
  if (root.version !== 1 || !Array.isArray(root.profiles)) {
    throw new Error('tide station profiles refused: expected version 1 with a profiles array');
  }
  return root.profiles.map((profile, index) => validateAcceptedProfile(profile, index));
}

function validateAcceptedProfile(rawProfile: unknown, index: number): AcceptedTideStationProfile {
  const profile = record(rawProfile, `profile ${index}`);
  if (profile.status !== 'accepted') {
    throw new Error(`tide station profiles refused: profile ${index} is ${String(profile.status)}; candidates cannot be active mappings`);
  }
  if (profile.source !== 'noaa-coops') throw new Error(`tide station profiles refused: profile ${index} must name source noaa-coops`);
  const spot_id = nonEmptyString(profile.spot_id, `profile ${index} spot_id`);
  const station_id = nonEmptyString(profile.station_id, `profile ${index} station_id`);
  if (!/^\d{7}$/.test(station_id)) throw new Error(`tide station profiles refused: ${spot_id} has an invalid NOAA station id`);
  const validation = validateValidationRecord(profile.validation, spot_id);
  return { source: 'noaa-coops', status: 'accepted', spot_id, station_id, validation };
}

function validateValidationRecord(rawValidation: unknown, spotId: string): TideStationValidationRecord {
  const validation = record(rawValidation, `${spotId} validation`);
  const localReference = record(validation.local_reference, `${spotId} local_reference`);
  const local_reference = {
    description: nonEmptyString(localReference.description, `${spotId} local reference description`),
    lat: finiteNumber(localReference.lat, `${spotId} local reference latitude`),
    lon: finiteNumber(localReference.lon, `${spotId} local reference longitude`),
    timezone: nonEmptyString(localReference.timezone, `${spotId} local reference timezone`),
  };
  if (!Array.isArray(validation.events) || !Array.isArray(validation.daily_ranges)) {
    throw new Error(`tide station profiles refused: ${spotId} must carry observed events and daily ranges`);
  }
  const events = validation.events.map((event, index) => validateEvent(event, spotId, index));
  const daily_ranges = validation.daily_ranges.map((range, index) => validateRange(range, spotId, index));
  enforceEvidencePolicy(spotId, events, daily_ranges);
  return { local_reference, events, daily_ranges };
}

function validateEvent(rawEvent: unknown, spotId: string, index: number): TideEventComparison {
  const event = record(rawEvent, `${spotId} event ${index}`);
  if (event.phase !== 'high' && event.phase !== 'low') throw new Error(`tide station profiles refused: ${spotId} event ${index} needs high or low phase`);
  const observed_at = isoInstant(event.observed_at, `${spotId} event ${index} observed_at`);
  const predicted_at = isoInstant(event.predicted_at, `${spotId} event ${index} predicted_at`);
  return {
    phase: event.phase,
    local_date: localDate(event.local_date, `${spotId} event ${index} local_date`),
    observed_at,
    predicted_at,
  };
}

function validateRange(rawRange: unknown, spotId: string, index: number): TidalRangeComparison {
  const range = record(rawRange, `${spotId} daily range ${index}`);
  const observed_m = finiteNumber(range.observed_m, `${spotId} daily range ${index} observed_m`);
  const predicted_m = finiteNumber(range.predicted_m, `${spotId} daily range ${index} predicted_m`);
  if (predicted_m <= 0 || observed_m < 0) throw new Error(`tide station profiles refused: ${spotId} daily range ${index} must be non-negative with a positive prediction`);
  return { local_date: localDate(range.local_date, `${spotId} daily range ${index} local_date`), observed_m, predicted_m };
}

function enforceEvidencePolicy(
  spotId: string,
  events: readonly TideEventComparison[],
  dailyRanges: readonly TidalRangeComparison[],
): void {
  if (events.length < 28) throw new Error(`tide station profiles refused: ${spotId} needs at least 28 observed high/low events`);
  const dates = [...new Set(events.map((event) => event.local_date))].sort();
  if (!hasFourteenConsecutiveDays(dates)) throw new Error(`tide station profiles refused: ${spotId} needs 14 consecutive local days of observations`);
  const phaseErrorsMinutes = events.map((event) => Math.abs(Date.parse(event.observed_at) - Date.parse(event.predicted_at)) / 60_000).sort((left, right) => left - right);
  const p90 = phaseErrorsMinutes[Math.ceil(phaseErrorsMinutes.length * 0.9) - 1]!;
  if (p90 > 30) throw new Error(`tide station profiles refused: ${spotId} p90 phase error exceeds 30 minutes`);
  if (phaseErrorsMinutes.some((error) => error > 45)) throw new Error(`tide station profiles refused: ${spotId} has a phase error above 45 minutes`);
  const rangesByDate = new Map(dailyRanges.map((range) => [range.local_date, range]));
  for (const date of dates) {
    const range = rangesByDate.get(date);
    if (range === undefined) throw new Error(`tide station profiles refused: ${spotId} lacks a daily range for ${date}`);
    const ratio = range.observed_m / range.predicted_m;
    if (ratio < 0.8 || ratio > 1.2) throw new Error(`tide station profiles refused: ${spotId} daily range ratio is outside 0.80–1.20 on ${date}`);
  }
}

function hasFourteenConsecutiveDays(dates: readonly string[]): boolean {
  let runLength = 0;
  let previous: number | null = null;
  for (const date of dates) {
    const instant = Date.parse(`${date}T00:00:00Z`);
    runLength = previous !== null && instant - previous === 86_400_000 ? runLength + 1 : 1;
    if (runLength >= 14) return true;
    previous = instant;
  }
  return false;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`tide station profiles refused: ${label} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`tide station profiles refused: ${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`tide station profiles refused: ${label} must be finite`);
  return value;
}

function isoInstant(value: unknown, label: string): string {
  const instant = nonEmptyString(value, label);
  if (Number.isNaN(Date.parse(instant))) throw new Error(`tide station profiles refused: ${label} must be an ISO instant`);
  return instant;
}

function localDate(value: unknown, label: string): string {
  const date = nonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`tide station profiles refused: ${label} must be YYYY-MM-DD`);
  }
  return date;
}
