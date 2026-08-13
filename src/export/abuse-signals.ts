// The night's coordination signals: 07-write-path.md section 7.4's four
// tripwires, computed in the same pass that writes the rows.
//
// WHY-NEW-FILE: src/export/abuse-signals.ts
//   CLOSEST-EXISTING: src/export/observation-row.ts
//   EXTENSION-COST: observation-row.ts is the ONE place that decides what an
//     accepted report becomes, and its whole contract is that it reads items
//     whose sort key is REPORT and enumerates a fixed list of row fields.
//     Signals read a different item shape entirely (CRED#/MINT, for src_hash,
//     which R5 forbids that module from ever touching) and produce a document
//     that is not a row. Extending it would mean one module with two input
//     selections and two outputs, and the field that must never cross between
//     them living inside the module that maps both.
//   PARALLEL-RATIONALE: incompatible input set and incompatible output type --
//     the mint ledger is an input observation-row.ts must never read, and the
//     no-src_hash-in-a-row rule is enforced by that module not knowing the
//     field exists.
//
// Two decisions from adr-observation-export.md Decision 5 are load-bearing
// here and are the reason the bucket type carries four fields instead of two:
//
//   - Buckets keep section 7.4's (spot, LOCAL day) grouping. Regrouping by the
//     file's UTC day would silently redefine the signal.
//   - Panama is UTC-5, so a UTC-day file spans local 19:00 of the previous day
//     to 19:00 of the named day and NO local day is ever whole inside one
//     file. Every bucket therefore carries the UTC window it was actually
//     computed over and says outright when the file's boundary cut it short.
//     A median over a partial day that presented as whole would claim more
//     certainty than the data earns, which is the one move this project
//     forbids. A consumer that wants a true local day must merge two adjacent
//     files; that is a real cost, stated rather than hidden.

import type { ObservationRow } from './observation-row';

/** ops/abuse-signals/v1/ -- an operator's tripwire, not a consumer contract. */
export const ABUSE_SIGNALS_PREFIX = 'ops/abuse-signals/v1/';

/** The sort key of a mint-ledger item. Positive selection, exactly as the row reader does it. */
export const MINT_SORT_KEY = 'MINT';

/** Gaps under this are machine cadence, not two people paddling in (section 7.4). */
const BURST_GAP_MS = 500;

/** Section 7.4 computes band dispersion "across >= 3 devices". Below that there is no spread to report. */
const MINIMUM_DEVICES_FOR_DISPERSION = 3;

/** The mint signal's lookback, in whole days ending at the close of the exported day. */
const MINT_TRAILING_DAYS = 7;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** A half-open span of real time, `from` inclusive and `to` exclusive. */
export type UtcWindow = {
  readonly from: string;
  readonly to: string;
};

/** One (spot, local day) bucket, and the UTC hours it was really built from. */
export type SpotLocalDaySignals = {
  readonly spot_id: string;
  readonly local_day: string;
  /** The local day intersected with the file's UTC day: the hours that actually contributed. */
  readonly utc_window: UtcWindow;
  /** False when the file's UTC boundary cut the local day short, which in Panama is always. */
  readonly complete: boolean;
  readonly reports: number;
  readonly distinct_devices: number;
  /** Null when no report in the bucket carries a readable credential age. */
  readonly median_credential_age_days: number | null;
  /** Distinct size bands over reports. Null below three devices: one voice has no spread. */
  readonly band_dispersion: number | null;
  /** Null with fewer than two reports: zero would read as "instantaneous" rather than "not applicable". */
  readonly min_interarrival_ms: number | null;
  readonly burst_clusters: number;
};

/** One host's mints inside the trailing week. Hosts with none are absent, never listed as zero. */
export type SrcHashMintCount = {
  readonly src_hash: string;
  readonly mints: number;
};

export type AbuseSignals = {
  readonly schema: 'abuse-signals/1';
  readonly dt: string;
  readonly timezone: string;
  /** The UTC day this file covers, which is what clips every bucket below. */
  readonly file_utc_window: UtcWindow;
  readonly spot_local_days: readonly SpotLocalDaySignals[];
  readonly mints_per_src_hash: {
    readonly utc_window: UtcWindow;
    readonly counts: readonly SrcHashMintCount[];
  };
};

/** One mint-ledger item, read for the only two fields the signal needs. */
export type MintLedgerEntry = {
  readonly issued_at: string;
  readonly src_hash: string;
};

/** ops/abuse-signals/v1/dt=<date>.json -- plain JSON, beside the day's gzipped rows. */
export function abuseSignalsKey(day: string): string {
  return `${ABUSE_SIGNALS_PREFIX}dt=${day}.json`;
}

/**
 * The mint-ledger entries in a scan, and nothing else.
 *
 * The selection is POSITIVE and the read is narrow for the same reason the row
 * reader's is: an item shape nobody has written yet contributes nothing rather
 * than crashing the night, and the two fields taken here are the only two the
 * signal is allowed to see. `device_id` is deliberately NOT read -- the signal
 * counts mints per host, and a per-device join has no consumer.
 */
export function mintLedgerEntriesOf(items: readonly unknown[]): readonly MintLedgerEntry[] {
  const entries: MintLedgerEntry[] = [];
  for (const item of items) {
    if (!isRecord(item) || item['sk'] !== MINT_SORT_KEY) continue;
    const issued_at = textAt(item, 'issued_at');
    const src_hash = textAt(item, 'src_hash');
    if (issued_at === null || src_hash === null) continue;
    entries.push({ issued_at, src_hash });
  }
  return entries;
}

/** The whole night's signals document, from the same rows the log received. */
export function abuseSignalsFor(
  day: string,
  rows: readonly ObservationRow[],
  mints: readonly MintLedgerEntry[],
  timezone: string,
): AbuseSignals {
  const file = utcDayWindow(day);
  return {
    schema: 'abuse-signals/1',
    dt: day,
    timezone,
    file_utc_window: file,
    spot_local_days: spotLocalDayBuckets(rows, file, timezone),
    mints_per_src_hash: mintsPerSrcHash(mints, trailingWindowEndingAt(file.to)),
  };
}

/** The UTC day a file covers: `[<day>T00:00Z, next dayT00:00Z)`. */
export function utcDayWindow(day: string): UtcWindow {
  const opened = Date.parse(`${day}T00:00:00Z`);
  return { from: isoAt(opened), to: isoAt(opened + MILLISECONDS_PER_DAY) };
}

/** The civil day an instant falls on in this zone, as `YYYY-MM-DD`. */
export function localDayOf(instant: string, timezone: string): string {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.parse(instant)));
  const part = (type: Intl.DateTimeFormatPartTypes): string => fields.find((field) => field.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The real-time span one civil day occupies in this zone. */
export function localDayUtcWindow(localDay: string, timezone: string): UtcWindow {
  return {
    from: isoAt(localMidnightAt(localDay, timezone)),
    to: isoAt(localMidnightAt(dayAfter(localDay), timezone)),
  };
}

/**
 * The part of `bucket` that `file` actually held, and whether it held all of it.
 *
 * Both halves are computed from the two windows rather than assumed from the
 * zone, so `complete` is a real predicate: a local day that fits inside the
 * file's window reports true. In Panama none ever does, and that is a fact
 * about the data, not a constant in the code.
 */
export function clipToFile(bucket: UtcWindow, file: UtcWindow): { readonly window: UtcWindow; readonly complete: boolean } {
  const from = Math.max(Date.parse(bucket.from), Date.parse(file.from));
  const to = Math.min(Date.parse(bucket.to), Date.parse(file.to));
  return {
    window: { from: isoAt(from), to: isoAt(to) },
    complete: Date.parse(bucket.from) >= Date.parse(file.from) && Date.parse(bucket.to) <= Date.parse(file.to),
  };
}

// ------------------------------------------------------------- the buckets --

function spotLocalDayBuckets(
  rows: readonly ObservationRow[],
  file: UtcWindow,
  timezone: string,
): readonly SpotLocalDaySignals[] {
  const grouped = new Map<string, ObservationRow[]>();
  for (const row of rows) {
    const key = `${row.spot_id} ${localDayOf(row.received_at, timezone)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return [...grouped]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, bucketRows]) => {
      const [spot_id = '', local_day = ''] = key.split(' ');
      const clipped = clipToFile(localDayUtcWindow(local_day, timezone), file);
      return {
        spot_id,
        local_day,
        utc_window: clipped.window,
        complete: clipped.complete,
        reports: bucketRows.length,
        distinct_devices: distinctCount(bucketRows.map((row) => row.device_id)),
        median_credential_age_days: medianCredentialAgeDays(bucketRows),
        band_dispersion: bandDispersion(bucketRows),
        min_interarrival_ms: minimumInterarrivalMs(bucketRows),
        burst_clusters: burstClusters(bucketRows),
      };
    });
}

/**
 * How old the credentials behind a bucket's reports were when the reports
 * landed. A young cohort agreeing at a cold spot is what this catches.
 */
function medianCredentialAgeDays(rows: readonly ObservationRow[]): number | null {
  const ages = rows
    .map((row) => (Date.parse(row.received_at) - Date.parse(row.credential_issued_at)) / MILLISECONDS_PER_DAY)
    .filter((age) => Number.isFinite(age));
  return ages.length === 0 ? null : rounded(medianOf(ages));
}

/**
 * Distinct size answers over reports, and null below three devices.
 *
 * The direction matters: LOW dispersion is the suspicious reading, because
 * coordinated lies agree with each other more than honest surfers do. The
 * signal flags implausible consistency; it never rewards it.
 */
function bandDispersion(rows: readonly ObservationRow[]): number | null {
  if (distinctCount(rows.map((row) => row.device_id)) < MINIMUM_DEVICES_FOR_DISPERSION) return null;
  return rounded(distinctCount(rows.map((row) => row.size_band)) / rows.length);
}

/** The closest two arrivals in the bucket, in milliseconds. */
function minimumInterarrivalMs(rows: readonly ObservationRow[]): number | null {
  const gaps = arrivalGapsMs(rows);
  return gaps.length === 0 ? null : Math.min(...gaps);
}

/** How many runs of back-to-back arrivals under half a second the bucket holds. */
function burstClusters(rows: readonly ObservationRow[]): number {
  let clusters = 0;
  let inside = false;
  for (const gap of arrivalGapsMs(rows)) {
    if (gap >= BURST_GAP_MS) {
      inside = false;
      continue;
    }
    if (!inside) clusters += 1;
    inside = true;
  }
  return clusters;
}

/** The bucket's arrivals in order, as the gaps between them. */
function arrivalGapsMs(rows: readonly ObservationRow[]): readonly number[] {
  const arrivals = rows.map((row) => Date.parse(row.received_at)).sort((left, right) => left - right);
  return arrivals.slice(1).map((arrival, index) => arrival - (arrivals[index] ?? arrival));
}

// ------------------------------------------------------------- the ledger --

/** The seven whole days ending where the exported day closed. */
function trailingWindowEndingAt(end: string): UtcWindow {
  const closed = Date.parse(end);
  return { from: isoAt(closed - (MINT_TRAILING_DAYS * MILLISECONDS_PER_DAY)), to: isoAt(closed) };
}

/**
 * How many credentials each host minted inside the window. A host with no
 * mints in it is absent rather than listed as zero: the file reports what was
 * seen, and the table holds mints from every night the ledger has ever kept.
 */
function mintsPerSrcHash(
  mints: readonly MintLedgerEntry[],
  window: UtcWindow,
): { readonly utc_window: UtcWindow; readonly counts: readonly SrcHashMintCount[] } {
  const opened = Date.parse(window.from);
  const closed = Date.parse(window.to);
  const counts = new Map<string, number>();
  for (const mint of mints) {
    const at = Date.parse(mint.issued_at);
    if (!(at >= opened && at < closed)) continue;
    counts.set(mint.src_hash, (counts.get(mint.src_hash) ?? 0) + 1);
  }
  return {
    utc_window: window,
    counts: [...counts]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([src_hash, mints_made]) => ({ src_hash, mints: mints_made })),
  };
}

// -------------------------------------------------------------- arithmetic --

function localMidnightAt(localDay: string, timezone: string): number {
  const asIfUtc = Date.parse(`${localDay}T00:00:00Z`);
  const firstGuess = asIfUtc - (zoneOffsetMinutesAt(asIfUtc, timezone) * 60 * 1000);
  // One correction pass: at a zone's own clock change the offset in force at
  // midnight is not the offset in force at the instant the guess landed on.
  return asIfUtc - (zoneOffsetMinutesAt(firstGuess, timezone) * 60 * 1000);
}

/** How far ahead of UTC the zone runs at this instant, in minutes. */
function zoneOffsetMinutesAt(instant: number, timezone: string): number {
  const named = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(instant))
    .find((field) => field.type === 'timeZoneName')?.value ?? 'GMT';
  // Intl spells a zero offset plain "GMT"; every other zone reads "GMT-05:00".
  const offset = named.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (offset === null) return 0;
  const [, sign, hours = '0', minutes = '0'] = offset;
  return (sign === '-' ? -1 : 1) * ((Number(hours) * 60) + Number(minutes));
}

function dayAfter(day: string): string {
  return isoAt(Date.parse(`${day}T00:00:00Z`) + MILLISECONDS_PER_DAY).slice(0, 10);
}

function isoAt(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function distinctCount(values: readonly string[]): number {
  return new Set(values).size;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return (((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/**
 * Two decimals. This is a tripwire an operator reads, not an input to a fit,
 * and a credential age printed to fifteen digits of float noise reads as a
 * precision the clock never had.
 */
function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}
