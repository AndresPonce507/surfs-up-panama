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

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { runExport } from '../../../../src/export/run-export';
import type { ExportOutcome } from '../../../../src/export/ports';
import {
  A_LIVE_CALL,
  FrozenClock,
  InMemoryItemReader,
  InMemoryLogStore,
  NON_REPORT_ITEMS,
  SEEDED_SPOTS,
  halfWrittenReportItem,
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

type ExportWorld = {
  store: InMemoryItemReader;
  log: InMemoryLogStore;
  clock: FrozenClock;
  outcome: ExportOutcome | null;
  failure: unknown;
};

let world: ExportWorld;

Before({ tags: SCOPE }, function () {
  world = {
    store: new InMemoryItemReader(),
    log: new InMemoryLogStore(),
    clock: new FrozenClock(new Date('2026-08-13T00:30:00Z')),
    outcome: null,
    failure: null,
  };
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

// -------------------------------------------------------------------- When --

When('the nightly observation export runs', async function () {
  try {
    world.outcome = await runExport({
      store: world.store,
      log: world.log,
      clock: world.clock,
      spots: SEEDED_SPOTS,
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

// ----------------------------------------------------------------- reading --

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
