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
  ReceivedSourcePayload,
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
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  async putRawIfAbsent(record: { readonly key: string; readonly verbatim: string }): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(record.key, record.verbatim);
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
 * Fixture bytes travel through the same receive-archive-parse boundary as the
 * real adapter. Its parse methods return deterministic normalized fixtures.
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

  async fetchWavePayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    if (this.waveFailure !== null) return { ok: false, reason: this.waveFailure };
    return { ok: true as const, verbatim: JSON.stringify({ provider: 'open-meteo-marine', run_ts: this.runTs }), provider: 'open-meteo-marine' };
  }

  parseWaveMembers(): SourceResult<MemberSeries[]> {
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
    return { ok: true, data: series };
  }

  async fetchWindPayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    if (this.windDark) return { ok: false, reason: 'dark' };
    return { ok: true as const, verbatim: JSON.stringify({ provider: 'open-meteo-wind', date: this.date }), provider: 'open-meteo-wind' };
  }

  parseWind(): SourceResult<WindHour[]> {
    return { ok: true, data: [this.date, nextCivilDate(this.date)].flatMap((date) => VALID_HOURS_UTC.map((h) => ({
        valid_ts: utcHourKey(date, h),
        wind: { speed_kt: venaoWind.speed_kt, dir_deg: venaoWind.dir_deg },
      }))) };
  }

  async fetchTidePayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    if (this.tideDark) return { ok: false, reason: 'dark' };
    return { ok: true as const, verbatim: JSON.stringify({ provider: 'coops', date: this.date }), provider: 'coops' };
  }

  parseTide(): SourceResult<TideHour[]> {
    return { ok: true, data: [this.date, nextCivilDate(this.date)].flatMap((date) => venaoTideCurve.map(([h, m]) => ({ valid_ts: utcHourKey(date, h), tide_m: m }))) };
  }
}

function nextCivilDate(date: string): string { const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); return tomorrow.toISOString().slice(0, 10); }
