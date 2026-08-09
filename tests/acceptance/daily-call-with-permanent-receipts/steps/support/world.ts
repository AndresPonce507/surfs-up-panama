// The cucumber World: composition of the driving ports plus captured
// outcomes. Steps ACT by driving the production entry points in-process
// (runIngestOnce / runBuildOnce) and OBSERVE only through the object store,
// the port-exposed universe. Action steps capture failures; Then steps turn
// them into assertion failures with the captured context attached, so an
// unimplemented seam fails as active-RED with the reason in the message.

import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { runIngestOnce } from '../../../../../src/pipeline/ingest';
import { runBuildOnce } from '../../../../../src/pipeline/build';
import type { BuildOutcome, BuildStore, IngestOutcome } from '../../../../../src/pipeline/ports';
import type { SpotSeed } from '../../../../../src/scoring/engine';
import { FixedClock, FixtureSource, InMemoryStore } from './fakes';
import type { UniverseSnapshot } from './state-delta';

export type PredictionRow = {
  spot_id: string;
  source: string;
  run_ts: string;
  valid_ts: string;
  lead_h: number;
  swell_h_m: number;
  swell_t_s: number;
  swell_dir_deg: number;
  wind_speed_kt: number | null;
  wind_dir_deg: number | null;
  tide_m: number | null;
  land_masked: boolean;
};

export type CallRow = {
  spot_id: string;
  build_id: string;
  valid_ts: string;
  score_q: number;
  conf_value: number;
  conf_level: string;
  sub: { dir: number; size: number; wind: number | null; tide: number | null };
  size_band: string;
  bias_applied: number;
  bias_gate: string;
  members_used: number;
  members_null: number;
  missing: ('wind' | 'tide')[];
};

export type PublishedRecord = { key: string; body: string };

export class PipelineWorld extends World {
  readonly store = new InMemoryStore();
  readonly clock = new FixedClock('2026-08-08T11:02:14Z');
  readonly source = new FixtureSource();
  spots: SpotSeed[] = [];
  today = '2026-08-08';

  ingestOutcome: IngestOutcome | null = null;
  secondIngestOutcome: IngestOutcome | null = null;
  buildOutcome: BuildOutcome | null = null;
  darkModel: string | null = null;
  maskedModel: string | null = null;
  bumpNext = 0;
  readonly failures: { label: string; error: unknown }[] = [];
  readonly published = new Map<string, PublishedRecord>();
  readonly snapshots = new Map<string, UniverseSnapshot>();

  constructor(options: IWorldOptions) {
    super(options);
  }

  // ---------- acting through the driving ports ----------

  async runIngest(label = 'ingest run'): Promise<IngestOutcome | null> {
    try {
      this.ingestOutcome = await runIngestOnce({
        source: this.source,
        store: this.store,
        clock: this.clock,
        ...(this.spots.length === 0 ? {} : { spots: this.spots }),
      });
      return this.ingestOutcome;
    } catch (error) {
      this.failures.push({ label, error });
      return null;
    }
  }

  async runBuild(label = 'build run', store: BuildStore = this.store): Promise<BuildOutcome | null> {
    try {
      this.buildOutcome = await runBuildOnce({
        store,
        clock: this.clock,
        ...(this.spots.length === 0 ? {} : { spots: this.spots }),
        region_id: 'pa-pacific',
      });
      return this.buildOutcome;
    } catch (error) {
      this.failures.push({ label, error });
      return null;
    }
  }

  /**
   * A full morning: fetch at :02 past the hour, build at :22, per the real
   * hourly sequence. Records the published-call file for later byte-identity
   * assertions. buildHourUtc 11 is the dawn build (6 am in Panama).
   */
  async publishMorning(
    label: string,
    date: string,
    opts: { cycleHour?: string; buildHourUtc?: number; bump?: number } = {},
  ): Promise<void> {
    const cycle = opts.cycleHour ?? '06';
    const buildHour = String(opts.buildHourUtc ?? 11).padStart(2, '0');
    this.source.configureMorning(date, cycle, opts.bump ?? 0);
    this.clock.set(`${date}T${buildHour}:02:14Z`);
    await this.runIngest(`${label}: ingest`);
    this.clock.set(`${date}T${buildHour}:22:00Z`);
    await this.runBuild(`${label}: build`);
    const keys = await this.store.list(`log/calls/v1/dt=${date}/build=${buildHour}Z/`);
    const key = keys.at(0);
    if (key !== undefined) {
      const body = await this.store.get(key);
      if (body !== null) this.published.set(label, { key, body });
    }
  }

  // ---------- observing through the store universe ----------

  failureContext(): string {
    if (this.failures.length === 0) return '';
    const lines = this.failures.map(
      (f) => `${f.label}: ${f.error instanceof Error ? f.error.message : String(f.error)}`,
    );
    return ` (captured pipeline failures: ${lines.join(' | ')})`;
  }

  async predictionRows(): Promise<PredictionRow[]> {
    const keys = await this.store.list('predictions/v1/');
    const rows: PredictionRow[] = [];
    for (const key of keys) {
      const body = await this.store.get(key);
      if (body === null) continue;
      for (const line of body.trim().split('\n')) {
        if (line.trim() === '') continue;
        rows.push(JSON.parse(line) as PredictionRow);
      }
    }
    return rows;
  }

  async callRows(): Promise<CallRow[]> {
    const keys = await this.store.list('log/calls/v1/');
    const rows: CallRow[] = [];
    for (const key of keys) {
      const body = await this.store.get(key);
      if (body === null) continue;
      for (const line of body.trim().split('\n')) {
        if (line.trim() === '') continue;
        rows.push(JSON.parse(line) as CallRow);
      }
    }
    return rows;
  }

  /** The published-call row for the worked-example hour, 18:00Z. */
  async workedExampleCallRow(date = this.today): Promise<CallRow> {
    const rows = await this.callRows();
    const row = rows.find(
      (r) => r.spot_id === 'playa-venao' && r.valid_ts.startsWith(`${date}T18:00`),
    );
    assert.ok(
      row,
      `no published call row found for playa-venao at ${date}T18:00Z; ` +
        `the build did not publish.${this.failureContext()}`,
    );
    return row;
  }

  async bundle(): Promise<{
    days: {
      date: string;
      spots: {
        spot_id: string;
        weakest_link: string | null;
        call: { es: string; en?: string };
      }[];
    }[];
  }> {
    const body = await this.store.get('pub/v1/regions/pa-pacific/bundle.json');
    assert.ok(
      body,
      `no region bundle was published at pub/v1/regions/pa-pacific/bundle.json.${this.failureContext()}`,
    );
    return JSON.parse(body) as {
      days: {
        date: string;
        spots: {
          spot_id: string;
          weakest_link: string | null;
          call: { es: string; en?: string };
        }[];
      }[];
    };
  }

  takeSnapshot(name: string, prefix: string): void {
    this.snapshots.set(name, this.store.snapshot(prefix));
  }

  getSnapshot(name: string): UniverseSnapshot {
    const snap = this.snapshots.get(name);
    assert.ok(snap, `test bug: no snapshot named ${name}`);
    return snap;
  }
}

setWorldConstructor(PipelineWorld);
