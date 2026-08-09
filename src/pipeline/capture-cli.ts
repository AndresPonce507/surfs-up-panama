// One-time, out-of-band real-data capture. NOT the deterministic, tested
// `pipeline:build` path: this makes a real network call (Open-Meteo Marine +
// Weather APIs) and its output is meant to be committed once, then read
// repeatedly by `npm run pipeline:build`, which stays a pure function of the
// committed snapshot + an explicit --at (nw-tdd-methodology "Determinism
// Contract": real-adapter runs accept non-determinism as the cost of
// environmental realism; deterministic InMemory-style tests are the fast
// inner loop, this is the slow truth-checking outer step).
//
// Tide is not fetched: no per-spot tide station reference exists in the spot
// seed schema yet (04-ingest-pipeline.md §11, "DELIVER BLOCKER"), so this is
// recorded honestly in the provenance file rather than silently doing
// nothing.
//
// Usage: npm run pipeline:capture -- [--out <dir>]
// Default --out: data/predictions-capture (committed).

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { runIngestOnce } from './ingest';
import { FilesystemStore } from './adapters/filesystem-store';
import { OpenMeteoForecastSource } from './adapters/open-meteo-source';
import { loadLaunchSpotCoordinates } from './adapters/spot-coordinates';
import { loadLaunchSpotSeeds } from '../data/launch-spots';
import type { Clock, ForecastSource, IngestOutcome } from './ports';
import type { SpotSeed } from '../scoring/engine';

const DEFAULT_SNAPSHOT_ROOT = 'data/predictions-capture';

export type CaptureOverrides = {
  readonly source?: ForecastSource;
  readonly spots?: readonly SpotSeed[];
  readonly clock?: Clock;
};

export type CaptureResult = {
  readonly events: IngestOutcome['events'];
  readonly provenancePath: string;
};

export async function runCapture(argv: readonly string[], overrides: CaptureOverrides = {}): Promise<CaptureResult> {
  const root = resolve(option(argv, '--out') ?? DEFAULT_SNAPSHOT_ROOT);
  const clock = overrides.clock ?? { now: () => new Date() };
  const spots = overrides.spots ?? loadLaunchSpotSeeds();
  const source = overrides.source ?? defaultSource(spots, clock);
  const store = new FilesystemStore(root);

  const startedAt = clock.now().toISOString();
  const outcome = await runIngestOnce({ source, store, clock, spots: [...spots] });
  const coverage = await summarizeCoverage(store);

  const provenancePath = resolve(root, 'PROVENANCE.json');
  await mkdir(root, { recursive: true });
  await writeFile(
    provenancePath,
    `${JSON.stringify(
      {
        captured_at: startedAt,
        spots_requested: spots.length,
        wave_endpoint: 'https://marine-api.open-meteo.com/v1/marine',
        wind_endpoint: 'https://api.open-meteo.com/v1/forecast',
        models: ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'],
        tide: {
          fetched: false,
          reason: 'no per-spot tide station reference exists in the spot seed schema yet (04-ingest-pipeline.md section 11, DELIVER BLOCKER); reusing one station for every spot would misattribute a real number to spots hundreds of km away',
        },
        cycle_attribution: 'simplified candidate-cycle rule only (04-ingest-pipeline.md section 5 steps 1-2); no change-detection probe, since this is a first standalone capture with no prior cycle to compare against',
        events: outcome.events,
        coverage,
      },
      null,
      2,
    )}\n`,
  );

  return { events: outcome.events, provenancePath };
}

function defaultSource(spots: readonly SpotSeed[], clock: Clock): ForecastSource {
  const coordinates = loadLaunchSpotCoordinates();
  const bySpotId = new Map(coordinates.map((coordinate) => [coordinate.spot_id, coordinate]));
  for (const spot of spots) {
    if (!bySpotId.has(spot.spot_id)) {
      throw new Error(`pipeline:capture refused: WHAT ${spot.spot_id} has no registered coordinate; WHY the forecast source needs a real lat/lon per spot; HOW add it to data/spots/pa-pacific.yaml or pass an explicit source override.`);
    }
  }
  return new OpenMeteoForecastSource(bySpotId, clock);
}

async function summarizeCoverage(store: FilesystemStore): Promise<{ readonly date: string; readonly sources_present: string[] }[]> {
  const keys = await store.listPredictions('predictions/v1/');
  const byDate = new Map<string, Set<string>>();
  for (const key of keys) {
    const date = key.match(/dt=([^/]+)/)?.[1];
    const source = key.match(/src=([^/]+)/)?.[1];
    if (date === undefined || source === undefined) continue;
    const sources = byDate.get(date) ?? new Set<string>();
    sources.add(source);
    byDate.set(date, sources);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, sources]) => ({ date, sources_present: [...sources].sort() }));
}

function option(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

const invokedAsCli = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  const { events, provenancePath } = await runCapture(process.argv.slice(2));
  console.log(`pipeline:capture: ${events.length} ingest events; provenance at ${provenancePath}`);
}
