// In-memory fakes honouring the same port contracts production uses
// (Pillar 3: only external, non-deterministic ports are faked; each fake
// keeps the real contract, including S3's conditional-PUT semantics that the
// prediction log's insert-only guarantee rides on).

import type {
  Clock,
  BuildStore,
  ForecastSource,
  IngestStore,
  MemberSeries,
  PublishedCallHistoryProbe,
  PublishedCallHistoryScope,
  RawProviderPayload,
  SourceFailure,
  SourceResult,
  TideHour,
  WindHour,
} from '../../../../../src/pipeline/ports';
import {
  utcHourKey,
  VALID_HOURS_UTC,
  venaoMorningMembers,
  venaoTideCurve,
  venaoWind,
  type MemberSpec,
} from './fixtures';

export class InMemoryStore implements IngestStore, BuildStore {
  readonly objects = new Map<string, string>();
  readonly rawObjects = new Map<string, RawProviderPayload>();

  async putIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    // S3 If-None-Match:* semantics: first write wins, the duplicate never
    // overwrites. This is the substrate the log's append-only promise rides on.
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  async put(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async get(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async list(prefix: string): Promise<string[]> {
    return [...new Set([...this.objects.keys(), ...this.rawObjects.keys()])].filter((k) => k.startsWith(prefix)).sort();
  }

  async putRaw(key: string, body: RawProviderPayload): Promise<void> {
    this.rawObjects.set(key, body);
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.get(key);
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return this.list(prefix);
  }

  async getCorrection(key: string): Promise<string | null> {
    return this.get(key);
  }

  async listPublishedCallKeys(scope: { region_id: string; prefix: 'log/calls/v1/' }): Promise<readonly string[]> {
    return (await this.list(scope.prefix)).filter((key) => key.endsWith(`/${scope.region_id}.jsonl.gz`));
  }

  async getPublishedCall(key: string): Promise<string> {
    const body = await this.get(key);
    if (body === null) throw new Error(`published call receipt unavailable: ${key}`);
    return body;
  }

  async probePublishedCallHistory(scope: PublishedCallHistoryScope): Promise<PublishedCallHistoryProbe> {
    return probeInMemoryPublishedCallHistory(this.objects, scope);
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async putBundle(key: string, body: string): Promise<void> {
    return this.put(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    return this.put(key, body);
  }

  /** Universe snapshot for state-delta assertions: every key under a prefix. */
  snapshot(prefix: string): Map<string, string> {
    return new Map([...this.objects].filter(([k]) => k.startsWith(prefix)));
  }
}

/**
 * Fault injection at the port boundary: a store that crashes on any write to
 * the given prefixes. Simulates a build dying before it publishes, so the
 * scenario can prove the snapshot survives everything downstream of it.
 */
export class CrashingStore implements BuildStore {
  constructor(
    private readonly inner: InMemoryStore,
    private readonly crashOnPrefixes: readonly string[],
  ) {}

  private guard(key: string): void {
    if (this.crashOnPrefixes.some((p) => key.startsWith(p))) {
      throw new Error(`injected crash: write to ${key}`);
    }
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.inner.getPrediction(key);
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return this.inner.listPredictions(prefix);
  }

  async getCorrection(key: string): Promise<string | null> {
    return this.inner.getCorrection(key);
  }

  async listPublishedCallKeys(scope: { region_id: string; prefix: 'log/calls/v1/' }): Promise<readonly string[]> {
    return this.inner.listPublishedCallKeys(scope);
  }

  async getPublishedCall(key: string): Promise<string> {
    return this.inner.getPublishedCall(key);
  }

  async probePublishedCallHistory(scope: PublishedCallHistoryScope): Promise<PublishedCallHistoryProbe> {
    return this.inner.probePublishedCallHistory(scope);
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    this.guard(key);
    return this.inner.putCallIfAbsent(key, body);
  }

  async putBundle(key: string, body: string): Promise<void> {
    this.guard(key);
    return this.inner.putBundle(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    this.guard(key);
    return this.inner.putManifest(key, body);
  }
}

/** The in-memory driven-port double preserves the production history fault
 * contract. It is intentionally strict so acceptance tests cannot turn a
 * malformed archive into a harmless empty history. */
export async function probeInMemoryPublishedCallHistory(
  objects: ReadonlyMap<string, string>,
  scope: PublishedCallHistoryScope,
): Promise<PublishedCallHistoryProbe> {
  const keys = [...objects.keys()].filter((key) => key.startsWith(scope.prefix) && key.endsWith(`/${scope.region_id}.jsonl.gz`)).sort();
  const grains = new Set<string>();
  try {
    for (const key of keys) {
      const match = historyKey(scope, key);
      if (match === null) return { ok: false, reason: 'malformed', detail: `key:${key}` };
      const body = objects.get(key);
      if (body === undefined) return { ok: false, reason: 'unavailable', detail: 'listed-key-disappeared' };
      for (const line of body.split('\n').filter((value) => value !== '')) {
        const row = JSON.parse(line) as Record<string, unknown>;
        if (!validHistoryRow(row)) return { ok: false, reason: 'malformed', detail: `receipt:${key}` };
        if (match.hour !== '11' || !row.valid_ts.startsWith(`${match.date}T18:00`)) continue;
        const grain = `${row.spot_id}\u0000${match.date}`;
        if (grains.has(grain)) return { ok: false, reason: 'malformed', detail: `duplicate:${key}` };
        grains.add(grain);
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof SyntaxError ? 'malformed' : 'unavailable', detail: 'receipt-read' };
  }
}

function historyKey(scope: PublishedCallHistoryScope, key: string): { date: string; hour: string } | null {
  const region = scope.region_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${scope.prefix}dt=(\\d{4}-\\d{2}-\\d{2})/build=(\\d{2})Z/${region}\\.jsonl\\.gz$`).exec(key);
  if (match === null || !validDate(match[1]!) || Number(match[2]!) > 23) return null;
  return { date: match[1]!, hour: match[2]! };
}

function validHistoryRow(row: Record<string, unknown>): row is Record<string, string | number> & { spot_id: string; valid_ts: string } {
  return typeof row.spot_id === 'string' && row.spot_id.length > 0
    && typeof row.valid_ts === 'string' && validTimestamp(row.valid_ts)
    && typeof row.members_used === 'number' && Number.isSafeInteger(row.members_used) && row.members_used >= 0
    && (row.spread_penalty === undefined || (typeof row.spread_penalty === 'number' && Number.isFinite(row.spread_penalty)));
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toISOString().slice(0, 10) === value;
}

function validTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(value)
    && !Number.isNaN(new Date(value).getTime()) && validDate(value.slice(0, 10));
}

export class FixedClock implements Clock {
  constructor(private iso: string) {}

  now(): Date {
    return new Date(this.iso);
  }

  set(iso: string): void {
    this.iso = iso;
  }
}

/**
 * The fixture forecast source. Speaks the post-ACL domain language of
 * ForecastSourcePort: normalized units, UTC, land-mask already a flag,
 * run_ts already attributed (the wire-format ladder is the adapter's own
 * unit-tested concern in DELIVER, per 04 section 3 step 5).
 */
export class FixtureSource implements ForecastSource {
  members: readonly MemberSpec[] = venaoMorningMembers;
  date = '2026-08-08';
  cycleHour = '06';
  /** Added to every member's h_m: "the swell picked up". */
  bump = 0;
  readonly dark = new Set<string>();
  readonly masked = new Set<string>();
  windDark = false;
  tideDark = false;
  waveFailure: SourceFailure | null = null;

  configureMorning(date: string, cycleHour = '06', bump = 0): void {
    this.date = date;
    this.cycleHour = cycleHour;
    this.bump = bump;
  }

  get runTs(): string {
    return `${this.date}T${this.cycleHour}:00Z`;
  }

  async fetchWaveMembers(_spot_id: string): Promise<SourceResult<MemberSeries[]>> {
    if (this.waveFailure !== null) return { ok: false, reason: this.waveFailure };
    const series: MemberSeries[] = this.members
      .filter((m) => !this.dark.has(m.source))
      .map((m) => ({
        source: m.source,
        run_ts: this.runTs,
        hours: [this.date, nextCivilDate(this.date)].flatMap((date, day) => VALID_HOURS_UTC.map((h) => ({
          valid_ts: utcHourKey(date, h),
          swell: this.masked.has(m.source)
            ? { h_m: 0, t_s: 0, dir_deg: 0 }
            : { h_m: m.h_m + this.bump + day * 0.4, t_s: m.t_s, dir_deg: m.dir_deg },
          swell2: null,
          land_masked: this.masked.has(m.source),
        }))),
      }));
    return {
      ok: true,
      verbatim: JSON.stringify({ provider: 'open-meteo-marine', run_ts: this.runTs, members: series.map((s) => s.source) }),
      data: series,
    };
  }

  async fetchWind(_spot_id: string): Promise<SourceResult<WindHour[]>> {
    if (this.windDark) return { ok: false, reason: 'dark' };
    return {
      ok: true,
      verbatim: JSON.stringify({ provider: 'open-meteo-wind', date: this.date }),
      data: [this.date, nextCivilDate(this.date)].flatMap((date) => VALID_HOURS_UTC.map((h) => ({
        valid_ts: utcHourKey(date, h),
        wind: { speed_kt: venaoWind.speed_kt, dir_deg: venaoWind.dir_deg },
      }))),
    };
  }

  async fetchTide(_spot_id: string): Promise<SourceResult<TideHour[]>> {
    if (this.tideDark) return { ok: false, reason: 'dark' };
    return {
      ok: true,
      verbatim: JSON.stringify({ provider: 'coops', date: this.date }),
      data: [this.date, nextCivilDate(this.date)].flatMap((date) => venaoTideCurve.map(([h, m]) => ({ valid_ts: utcHourKey(date, h), tide_m: m }))),
    };
  }
}

function nextCivilDate(date: string): string { const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); return tomorrow.toISOString().slice(0, 10); }
