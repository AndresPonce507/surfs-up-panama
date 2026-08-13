// Step definitions for the observation-export acceptance scenarios.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver: the DES Stop
// hook misanchors on this repository. Evidence is the recorded RED, the
// focused acceptance run and the gate logs.
//
// Every step drives the production driving port `runExport(deps)` and observes
// exclusively through the two injected ports: what the log store holds, and
// what the run said it did. No business logic lives here -- in particular, no
// step computes a tile, a key or a row shape for itself. The tiles below are
// pinned literals so the assertion is an oracle rather than the implementation
// agreeing with itself; `d1qf` is the same value the landed spot-index test
// already pins for Playa Venao.
//
// The surface is non-visual: pure functions and a driving port writing
// S3-shaped objects through in-memory doubles. Observables are stored objects
// and a returned outcome. No page, component, style or pixel. U1-U7/U8 N/A.

import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';

import { runExport } from '../../../../src/export/run-export';
import type { AbuseSignalsStore, ExportOutcome, ObservationLogStore } from '../../../../src/export/ports';
import { FilesystemStore } from '../../../../src/pipeline/adapters/filesystem-store';
import {
  A_LIVE_CALL,
  FrozenClock,
  InMemoryItemReader,
  InMemoryLogStore,
  NON_REPORT_ITEMS,
  SEEDED_SPOTS,
  halfWrittenReportItem,
  mintLedgerItem,
  storedReportItem,
} from './support/observation-export-world';

const SCOPE = '@feature-f-observation-export';

/** The tile each seeded beach sits in, pinned rather than recomputed. */
const VENAO_TILE = 'd1qf';
const CATALINA_TILE = 'd1q5';
const CLOSED_DAY = '2026-08-12';

/** The whole row contract, in one place: exactly these keys, no more. */
const ROW_KEYS = [
  'credential_issued_at',
  'device_id',
  'observed_at',
  'predicted',
  'quality',
  'received_at',
  'report_id',
  'size_band',
  'size_band_schema',
  'spot_id',
  'submitted_at',
  'trigger',
  'wind',
];

/** The zone every launch-seed row declares. The signals bucket by ITS civil day, not the file's UTC day. */
const SEED_TIMEZONE = 'America/Panama';

/** ops/abuse-signals/v1/dt=<date>.json -- plain JSON beside the gzipped rows, written in the same pass. */
const SIGNALS_KEY = `ops/abuse-signals/v1/dt=${CLOSED_DAY}.json`;

/**
 * Where a scenario sends the night's writes when it wants real bytes on a real
 * disk instead of strings in a map. Only the gzip scenario asks for this: the
 * claim it makes is about BYTES, and no in-memory double can carry that claim.
 */
type DiskWrites = {
  readonly root: string;
  readonly log: ObservationLogStore;
  readonly signals: AbuseSignalsStore;
};

type ExportWorld = {
  store: InMemoryItemReader;
  log: InMemoryLogStore;
  signals: InMemoryLogStore;
  disk: DiskWrites | null;
  clock: FrozenClock;
  outcome: ExportOutcome | null;
  /** What the FIRST run left behind, captured before a re-run is allowed to touch it. */
  firstRun: { readonly outcome: ExportOutcome; readonly objects: Readonly<Record<string, string>> } | null;
  failure: unknown;
};

let world: ExportWorld;

Before({ tags: SCOPE }, function () {
  world = {
    store: new InMemoryItemReader(),
    log: new InMemoryLogStore(),
    signals: new InMemoryLogStore(),
    disk: null,
    clock: new FrozenClock(new Date('2026-08-13T00:30:00Z')),
    outcome: null,
    firstRun: null,
    failure: null,
  };
});

After({ tags: SCOPE }, async function () {
  if (world.disk !== null) await rm(world.disk.root, { recursive: true, force: true });
});

// ------------------------------------------------------------------- Given --

Given('the launch seed places Playa Venao and Santa Catalina', function () {
  assert.deepEqual(
    SEEDED_SPOTS.map((spot) => spot.spot_id),
    ['playa-venao', 'santa-catalina-la-punta'],
    'these scenarios read the two beaches the human-owned seed names',
  );
});

Given('the nightly observation export is due at {int}:{int} UTC on {word}', function (hour: number, minute: number, day: string) {
  world.clock.set(`${day}T${pad(hour)}:${pad(minute)}:00Z`);
});

Given('the write store holds two reports accepted on {word}', function (day: string) {
  world.store.add(storedReportItem({
    report_id: '01JVENAO0000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_first',
    received_at: `${day}T13:05:00Z`,
    predicted: A_LIVE_CALL,
  }));
  world.store.add(storedReportItem({
    report_id: '01JVENAO0000000000000002',
    spot_id: 'playa-venao',
    device_id: 'd_second',
    received_at: `${day}T18:40:00Z`,
    predicted: null,
  }));
});

Given('the write store holds one report accepted on {word} whose surfer was shown a live call', function (day: string) {
  world.store.add(storedReportItem({
    report_id: '01JCALL00000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_shown',
    received_at: `${day}T13:05:00Z`,
    predicted: A_LIVE_CALL,
  }));
});

Given('the write store holds one report accepted on {word} whose surfer was shown no call', function (day: string) {
  world.store.add(storedReportItem({
    report_id: '01JCALL00000000000000002',
    spot_id: 'playa-venao',
    device_id: 'd_unshown',
    received_at: `${day}T14:05:00Z`,
    predicted: null,
  }));
});

Given('the write store holds one report accepted on {word} at each of the two beaches', function (day: string) {
  world.store.add(storedReportItem({
    report_id: '01JTILE00000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_venao',
    received_at: `${day}T13:05:00Z`,
    predicted: A_LIVE_CALL,
  }));
  world.store.add(storedReportItem({
    report_id: '01JTILE00000000000000002',
    spot_id: 'santa-catalina-la-punta',
    device_id: 'd_catalina',
    received_at: `${day}T15:25:00Z`,
    predicted: null,
  }));
});

Given('the write store also holds a credential, a device quota and a spot counter', function () {
  for (const item of NON_REPORT_ITEMS) world.store.add(item);
});

Given('the write store holds one report accepted on {word}', function (day: string) {
  world.store.add(storedReportItem({
    report_id: '01JONLY00000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_only',
    received_at: `${day}T13:05:00Z`,
    predicted: A_LIVE_CALL,
  }));
});

Given('the write store holds a half-written report item missing its record', function () {
  world.store.add(halfWrittenReportItem('01JHALF00000000000000001'));
});

Given('the write store holds one report accepted at {int}:{int} UTC on {word}', function (hour: number, minute: number, day: string) {
  world.store.add(storedReportItem({
    report_id: '01JLATE00000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_late',
    received_at: `${day}T${pad(hour)}:${pad(minute)}:00Z`,
    predicted: A_LIVE_CALL,
  }));
});

/**
 * Three devices, three freshly minted credentials, one beach, one size answer
 * between them, two of the three reports 300 ms apart. Every number the four
 * signals report is present in this one fixture, and their received instants
 * (02:00 UTC on the 12th) are 21:00 the previous evening in Panama -- which is
 * what makes the local-day bucket a different day from the file's.
 */
const PILE_ON = [
  { report_id: '01JPILE00000000000000001', device_id: 'd_cohort_a', received_at: '2026-08-12T02:00:00.000Z', credential_issued_at: '2026-08-10T02:00:00.000Z' },
  { report_id: '01JPILE00000000000000002', device_id: 'd_cohort_b', received_at: '2026-08-12T02:00:00.300Z', credential_issued_at: '2026-08-09T02:00:00.300Z' },
  { report_id: '01JPILE00000000000000003', device_id: 'd_cohort_c', received_at: '2026-08-12T02:00:01.000Z', credential_issued_at: '2026-08-08T02:00:01.000Z' },
] as const;

/** The local days the two fixtures below fall on. Named so the Gherkin dates are load-bearing, not decoration. */
const PILE_ON_LOCAL_DAY = '2026-08-11';
const LONE_REPORT_LOCAL_DAY = '2026-08-12';

Given('the write store holds a young-cohort pile-on at Playa Venao late on {word} local time', function (day: string) {
  assert.equal(day, PILE_ON_LOCAL_DAY, 'these reports arrive at 02:00 UTC, which is the previous evening in Panama');
  for (const report of PILE_ON) {
    world.store.add(storedReportItem({
      report_id: report.report_id,
      spot_id: 'playa-venao',
      device_id: report.device_id,
      received_at: report.received_at,
      credential_issued_at: report.credential_issued_at,
      size_band: 'waist_chest',
      predicted: A_LIVE_CALL,
    }));
  }
});

Given('the write store holds one ordinary report at Santa Catalina on {word} local time', function (day: string) {
  assert.equal(day, LONE_REPORT_LOCAL_DAY, 'this report arrives at 18:00 UTC, which is the same civil day in Panama');
  world.store.add(storedReportItem({
    report_id: '01JLONE00000000000000001',
    spot_id: 'santa-catalina-la-punta',
    device_id: 'd_lone',
    received_at: '2026-08-12T18:00:00.000Z',
    credential_issued_at: '2026-06-12T18:00:00.000Z',
    size_band: 'head_high',
    predicted: null,
  }));
});

Given('the write store holds the mint ledger those credentials came from', function () {
  for (const report of PILE_ON) {
    world.store.add(mintLedgerItem({
      device_id: report.device_id,
      issued_at: report.credential_issued_at,
      src_hash: 'sh_one_host',
    }));
  }
  world.store.add(mintLedgerItem({
    device_id: 'd_lone',
    issued_at: '2026-06-12T18:00:00.000Z',
    src_hash: 'sh_long_ago',
  }));
});

/**
 * The house storage adapter, on a real temporary disk, wired exactly the way
 * the composition root wires the deployed one: the export's two narrow write
 * capabilities are two object literals over the adapter's one log-append
 * method, so the run can never reach anything else the adapter can do.
 */
Given('the night writes through the house storage adapter onto a real disk', async function () {
  const root = await mkdtemp(join(tmpdir(), 'observation-export-'));
  const store = new FilesystemStore(root);
  world.disk = {
    root,
    log: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
    signals: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
  };
});

// -------------------------------------------------------------------- When --

When('the nightly observation export runs', async function () {
  const writes = world.disk ?? { log: world.log, signals: world.signals };
  try {
    world.outcome = await runExport({
      store: world.store,
      log: writes.log,
      signals: writes.signals,
      clock: world.clock,
      spots: SEEDED_SPOTS,
      timezone: SEED_TIMEZONE,
    });
  } catch (error) {
    world.failure = error;
  }
});

/**
 * A second run of the SAME night, over a store that has changed underneath it.
 *
 * The extra report is what makes this test worth writing. It means the second
 * run genuinely recomputes a different body for a key the first run already
 * sealed, so the log's write-once property is being asked to refuse a real
 * competing write rather than to notice that nothing happened. This is the
 * exact property that makes a bug in night one unfixable in place
 * (adr-observation-export.md Decision 7), so it is pinned rather than assumed.
 */
When('that same night gains one more report and the export runs again', async function () {
  world.firstRun = { outcome: completedRun(), objects: writtenObjects() };
  world.store.add(storedReportItem({
    report_id: '01JAGAIN0000000000000001',
    spot_id: 'playa-venao',
    device_id: 'd_cohort_a',
    received_at: '2026-08-12T02:00:02.000Z',
    credential_issued_at: '2026-08-10T02:00:00.000Z',
    size_band: 'head_high',
    predicted: A_LIVE_CALL,
  }));
  try {
    world.outcome = await runExport({
      store: world.store,
      log: world.log,
      signals: world.signals,
      clock: world.clock,
      spots: SEEDED_SPOTS,
      timezone: SEED_TIMEZONE,
    });
  } catch (error) {
    world.failure = error;
  }
});

// -------------------------------------------------------------------- Then --

Then('the observation log carries one line per report accepted that day', function () {
  const lines = observedLines();
  assert.equal(
    lines.length,
    2,
    `the store accepted two reports on ${CLOSED_DAY}; the log carries ${lines.length} line(s).`,
  );
  assert.deepEqual(
    lines.map((line) => line['report_id']).sort(),
    ['01JVENAO0000000000000001', '01JVENAO0000000000000002'],
    'each accepted report is one line, keyed by its own report_id.',
  );
});

Then('every line carries the beach, the device, both timings and the surfer\'s answers at its top level', function () {
  for (const line of observedLines()) {
    assert.deepEqual(
      Object.keys(line).sort(),
      ROW_KEYS,
      `a line does not carry the settled flat row. Consumers read these fields at the TOP level; the store's nesting under record/receipt must never reach them.\n  line: ${JSON.stringify(line)}`,
    );
    assert.equal(line['spot_id'], 'playa-venao', 'the beach rides on every line');
    assert.equal(line['size_band'], 'waist_chest', 'the surfer\'s size answer rides on every line');
    assert.equal(line['wind'], 'choppy', 'the surfer\'s wind answer rides on every line');
    assert.equal(line['quality'], 'good', 'the surfer\'s quality answer rides on every line');
    assert.equal(
      line['credential_issued_at'],
      '2026-07-01T12:00:00Z',
      'credential_issued_at rides on every line from day one: the retroactive trust gate has no other input.',
    );
    assert.ok(
      typeof line['received_at'] === 'string' && line['received_at'].startsWith(CLOSED_DAY),
      `received_at rides on every line and belongs to the closed day; got ${JSON.stringify(line['received_at'])}`,
    );
  }
});

Then('no line names a person and no line carries a photo', function () {
  for (const line of observedLines()) {
    assert.ok(
      !('person_id' in line),
      'person_id must be ABSENT, never present-and-empty: the two landed C5 copies disagree on the empty string, and trust.ts would collapse every empty reporter into one.',
    );
    assert.ok(!('photo_ids' in line), 'a photo reference is not an observation and can never be un-shipped from an append-only log.');
    assert.ok(!('src_hash' in line), 'src_hash belongs to the abuse-signals file only.');
  }
});

Then('the shown call rides out with all five of its parts, none added and none dropped', function () {
  const line = lineFor('01JCALL00000000000000001');
  assert.deepEqual(
    line['predicted'],
    A_LIVE_CALL,
    'the call the surfer was shown rides out whole. A row carrying score_q but no conf_level yields zero calibration bins forever, which silently disarms the C_spread kill switch.',
  );
});

Then('the report that was shown no call rides out saying so, never guessing one', function () {
  const line = lineFor('01JCALL00000000000000002');
  assert.ok('predicted' in line, 'the key is present on every row; absence would read as "unknown" rather than "no call was live".');
  assert.equal(line['predicted'], null, 'no call was live, so the row says null and never invents one.');
});

Then('the log holds one object per beach tile, named for the day that closed', function () {
  assert.deepEqual(
    [...world.log.objects.keys()].sort(),
    [
      `log/observations/v1/dt=${CLOSED_DAY}/${VENAO_TILE}.jsonl.gz`,
      `log/observations/v1/dt=${CLOSED_DAY}/${CATALINA_TILE}.jsonl.gz`,
    ].sort(),
    'the log is partitioned by the received UTC day and the beach\'s own geohash4 tile.',
  );
});

Then('each beach\'s line is inside its own beach\'s tile object', function () {
  const venao = world.log.linesUnder(`log/observations/v1/dt=${CLOSED_DAY}/${VENAO_TILE}.jsonl.gz`);
  const catalina = world.log.linesUnder(`log/observations/v1/dt=${CLOSED_DAY}/${CATALINA_TILE}.jsonl.gz`);
  assert.deepEqual(venao.map((line) => line['spot_id']), ['playa-venao'], `the ${VENAO_TILE} object holds only Playa Venao's line.`);
  assert.deepEqual(
    catalina.map((line) => line['spot_id']),
    ['santa-catalina-la-punta'],
    `the ${CATALINA_TILE} object holds only Santa Catalina's line.`,
  );
});

Then('the export completes without refusing the night', function () {
  assert.equal(
    world.failure,
    null,
    `one unreadable item must never cost the night its export.\n  refused with: ${String(world.failure)}`,
  );
});

Then('only the accepted report became a line', function () {
  const lines = observedLines();
  assert.deepEqual(
    lines.map((line) => line['report_id']),
    ['01JONLY00000000000000001'],
    'the selection rule is positive: an item is exported when its sort key is REPORT and it reads whole, never because it failed to match a list of known non-reports.',
  );
});

Then('the export names {word} as the day it closed', function (day: string) {
  const outcome = completedRun();
  assert.equal(outcome.day, day, `a 00:30Z run exports the UTC day that just closed, not the one it is standing in.`);
});

Then('only the report received on that day became a line', function () {
  const lines = observedLines();
  assert.deepEqual(
    lines.map((line) => line['report_id']),
    ['01JONLY00000000000000001'],
    'a report received after 00:00Z today belongs to the next run; exporting it now would need this closed file rewritten, and the log is write-once.',
  );
});

Then('the night leaves one signals file beside its rows', function () {
  completedRun();
  assert.deepEqual(
    [...world.signals.objects.keys()],
    [SIGNALS_KEY],
    'the same pass that writes the night\'s rows writes exactly one ops signals file, named for the day that closed.',
  );
  assert.equal(
    signalsDocument()['dt'],
    CLOSED_DAY,
    'the signals file names the day it covers.',
  );
});

Then('the signals say how many devices reported at each beach and how old their credentials were', function () {
  assert.deepEqual(
    bucketsOf().map((bucket) => [bucket['spot_id'], bucket['distinct_devices'], bucket['median_credential_age_days']]),
    [['playa-venao', 3, 3], ['santa-catalina-la-punta', 1, 61]],
    'a young-cohort pile-on is three fresh credentials agreeing at one beach; the signal that catches it is the pair (distinct devices, median credential age in days).',
  );
});

Then('the signals say how alike the sizes were, and say nothing where too few devices reported', function () {
  const [pileOn, lone] = bucketsOf();
  assert.equal(
    pileOn?.['band_dispersion'],
    0.33,
    'three devices, one size answer between them: dispersion is distinct bands over reports, and low variance is what gets FLAGGED here, never rewarded.',
  );
  assert.equal(
    lone?.['band_dispersion'],
    null,
    'section 7.4 computes dispersion across three or more devices. One device has no dispersion to report, and printing a number for it would claim a spread the data never earned.',
  );
});

Then('the signals say how fast the reports arrived and how many arrived in a burst', function () {
  const [pileOn, lone] = bucketsOf();
  assert.equal(pileOn?.['min_interarrival_ms'], 300, 'the closest two reports in the bucket arrived 300 ms apart: machine cadence.');
  assert.equal(pileOn?.['burst_clusters'], 1, 'gaps under 500 ms make one burst cluster; the third report, 700 ms later, is not in it.');
  assert.equal(lone?.['min_interarrival_ms'], null, 'one report has no gap to another, and zero would read as "instantaneous" rather than "not applicable".');
  assert.equal(lone?.['burst_clusters'], 0, 'one report is never a burst.');
});

Then('the signals count the mints each source host made over the trailing week', function () {
  const mints = signalsDocument()['mints_per_src_hash'] as Record<string, unknown>;
  assert.deepEqual(
    mints['utc_window'],
    { from: '2026-08-06T00:00:00.000Z', to: '2026-08-13T00:00:00.000Z' },
    'the mint signal is the only one that is not a day bucket: it looks back seven whole days from the close of the exported day.',
  );
  assert.deepEqual(
    mints['counts'],
    [{ src_hash: 'sh_one_host', mints: 3 }],
    'three credentials minted from one host inside the trailing week is the signal. The mint from two months ago is outside the window and is not counted, and a host with nothing in the window is not listed at all.',
  );
});

Then('the source hash rides in the signals file and on no line of the log', function () {
  const signalsText = world.signals.objects.get(SIGNALS_KEY) ?? '';
  assert.ok(
    signalsText.includes('sh_one_host'),
    'src_hash lives on the mint ledger item and nowhere else, and the abuse-signals file is the ONE place section 7.4 sends it.',
  );
  for (const line of observedLines()) {
    assert.ok(!('src_hash' in line), 'src_hash must never reach an observation row: R5 forbids it and the log can never be repaired.');
    assert.ok(
      !JSON.stringify(line).includes('sh_'),
      `no part of a mint ledger item may ride out on a row, under any key.\n  line: ${JSON.stringify(line)}`,
    );
  }
});

Then('the signals group each beach by its own local day, never by the UTC day of the file', function () {
  assert.deepEqual(
    bucketsOf().map((bucket) => [bucket['spot_id'], bucket['local_day']]),
    [['playa-venao', '2026-08-11'], ['santa-catalina-la-punta', '2026-08-12']],
    'section 7.4 groups per (spot, LOCAL day). Panama is UTC-5, so reports received at 02:00Z on the 12th were made at 21:00 on the 11th, and regrouping them under the file\'s UTC day would silently redefine the signal.',
  );
});

Then('every bucket names the UTC window it was really computed over', function () {
  assert.deepEqual(
    bucketsOf().map((bucket) => bucket['utc_window']),
    [
      { from: '2026-08-12T00:00:00.000Z', to: '2026-08-12T05:00:00.000Z' },
      { from: '2026-08-12T05:00:00.000Z', to: '2026-08-13T00:00:00.000Z' },
    ],
    'a bucket carries the window it was ACTUALLY computed over, which is its local day intersected with the file\'s UTC day, so a reader can see exactly which hours the number came from.',
  );
});

Then('every bucket the file cut short says it is incomplete', function () {
  for (const bucket of bucketsOf()) {
    assert.equal(
      bucket['complete'],
      false,
      `Panama is UTC-5, so no local day is ever whole inside one received-UTC file: both ends of this one are cut. A median over a clipped day that presented as whole would claim more certainty than the data earns, which is the one move this project forbids.\n  bucket: ${JSON.stringify(bucket)}`,
    );
  }
});

Then('the second run recomputed the night and offered it under the same names', function () {
  const second = completedRun();
  const first = firstRun();
  assert.equal(second.day, first.outcome.day, 'a re-run closes the same night, so it names the same day.');
  assert.deepEqual(
    [...second.keys].sort(),
    [...first.outcome.keys].sort(),
    'the re-run recomputes the whole night and offers it under exactly the same object names. It does not skip the work; the log refuses the write.',
  );
  assert.ok(
    second.rows > first.outcome.rows,
    `the store gained a report for that night, so the second run really did compute a different night: ${first.outcome.rows} rows became ${second.rows}. Without that, this scenario would only prove that nothing happened twice.`,
  );
});

Then('every object still holds byte for byte what the first run wrote', function () {
  const first = firstRun();
  const now = writtenObjects();
  for (const [key, body] of Object.entries(first.objects)) {
    assert.equal(
      now[key],
      body,
      `${key} was rewritten by the second run. The observation log is immutable: the first bytes under a key are the only bytes, which is why a bug in night one is repaired by a new day and never by an overwrite.`,
    );
  }
});

Then('the second run left no object of its own behind', function () {
  assert.deepEqual(
    Object.keys(writtenObjects()).sort(),
    Object.keys(firstRun().objects).sort(),
    'a re-run of the same night adds no object at all: same day, same tiles, same signals file.',
  );
});

Then('the bytes under the beach\'s .gz key begin with the gzip magic number', async function () {
  const bytes = await storedBytes(`log/observations/v1/dt=${CLOSED_DAY}/${VENAO_TILE}.jsonl.gz`);
  assert.deepEqual(
    [bytes[0], bytes[1]],
    [0x1f, 0x8b],
    'a .gz key must carry real gzip. Reading the object back through the house adapter proves NOTHING here: its readGzip only unzips when these two bytes are present and otherwise hands back the text unchanged, so plain text under a .gz name would pass a round-trip and fail in production, where the learning lane\'s read path gunzips on the suffix unconditionally.',
  );
});

Then('unzipping those bytes gives back exactly the lines the run wrote', async function () {
  const bytes = await storedBytes(`log/observations/v1/dt=${CLOSED_DAY}/${VENAO_TILE}.jsonl.gz`);
  const lines = gunzipSync(bytes).toString('utf8').split('\n').filter((line) => line !== '');
  assert.deepEqual(
    lines.map((line) => (JSON.parse(line) as Record<string, unknown>)['report_id']),
    ['01JONLY00000000000000001'],
    'gunzipping the stored bytes yields the night\'s JSON lines, unchanged and parseable one per line.',
  );
});

Then('the signals file is plain readable JSON, not gzip wearing a .json name', async function () {
  const bytes = await storedBytes(SIGNALS_KEY);
  assert.notEqual(bytes[0], 0x1f, 'the ops file is named .json and must be plain JSON: an operator opens it during an incident.');
  assert.equal(
    (JSON.parse(bytes.toString('utf8')) as Record<string, unknown>)['dt'],
    CLOSED_DAY,
    'the signals bytes parse as JSON straight off the disk, with no unzip step.',
  );
});

// ----------------------------------------------------------------- reading --

/** The bytes an object really carries, read off the disk rather than back through the adapter. */
async function storedBytes(key: string): Promise<Buffer> {
  completedRun();
  assert.ok(world.disk !== null, 'this scenario asserts on bytes, so it must be the one that writes to a real disk');
  return readFile(join(world.disk.root, key));
}

/** Everything both write capabilities are holding, keyed by object name. */
function writtenObjects(): Readonly<Record<string, string>> {
  return { ...Object.fromEntries(world.log.objects), ...Object.fromEntries(world.signals.objects) };
}

function firstRun(): { readonly outcome: ExportOutcome; readonly objects: Readonly<Record<string, string>> } {
  assert.ok(world.firstRun !== null, 'this scenario compares against a first run that has not happened');
  return world.firstRun;
}

function signalsDocument(): Record<string, unknown> {
  completedRun();
  const body = world.signals.objects.get(SIGNALS_KEY);
  assert.ok(
    body !== undefined,
    `the run wrote no ${SIGNALS_KEY}; it holds ${JSON.stringify([...world.signals.objects.keys()])}.`,
  );
  return JSON.parse(body) as Record<string, unknown>;
}

function bucketsOf(): Record<string, unknown>[] {
  const buckets = signalsDocument()['spot_local_days'];
  assert.ok(Array.isArray(buckets), 'the signals file carries its per-beach-per-local-day buckets under spot_local_days.');
  return buckets as Record<string, unknown>[];
}


function completedRun(): ExportOutcome {
  assert.equal(world.failure, null, `the export refused the night: ${String(world.failure)}`);
  assert.ok(world.outcome !== null, 'the export produced no outcome at all');
  return world.outcome;
}

function observedLines(): Record<string, unknown>[] {
  completedRun();
  return world.log.lines();
}

function lineFor(reportId: string): Record<string, unknown> {
  const line = observedLines().find((row) => row['report_id'] === reportId);
  assert.ok(line !== undefined, `no line for report ${reportId}; the log carries ${observedLines().length} line(s).`);
  return line;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
