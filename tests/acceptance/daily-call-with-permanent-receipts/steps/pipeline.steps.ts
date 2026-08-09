// Step definitions for the daily-call-with-permanent-receipts acceptance
// scenarios. Steps delegate to the production driving ports (runIngestOnce,
// runBuildOnce) and observe exclusively through the object-store universe.
// No business logic lives here.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { runIngestOnce } from '../../../../src/pipeline/ingest';
import { venaoSeed, venaoMorningMembers, VALID_HOURS_UTC } from './support/fixtures';
import { CrashingStore } from './support/fakes';
import { assertStateDelta } from './support/state-delta';
import type { PipelineWorld } from './support/world';
import './support/world';

const YESTERDAY = '2026-08-07';

// ---------- background ----------

Given('the spot {string} and its scoring constants', function (this: PipelineWorld, name: string) {
  assert.equal(name, 'Playa Venao', 'the slice-01 fixture is the worked-example spot');
  this.spots = [venaoSeed];
});

Given('the four wave models reported their morning opinions for it', function (this: PipelineWorld) {
  this.source.members = venaoMorningMembers;
});

Given('the wind and tide sources reported their morning readings', function (this: PipelineWorld) {
  this.source.windDark = false;
  this.source.tideDark = false;
});

// ---------- acting ----------

When('the hourly ingest run completes', async function (this: PipelineWorld) {
  await this.runIngest();
  this.takeSnapshot('after-ingest', 'predictions/');
});

When('the build publishes the morning call', async function (this: PipelineWorld) {
  this.clock.set(`${this.today}T11:22:00Z`);
  await this.runBuild();
});

When('the scoring build crashes before publishing anything', async function (this: PipelineWorld) {
  this.clock.set(`${this.today}T11:22:00Z`);
  const crashing = new CrashingStore(this.store, ['log/', 'pub/']);
  await this.runBuild('build (crash injected before publish)', crashing);
});

When('the same run fires a second time', async function (this: PipelineWorld) {
  this.takeSnapshot('before-second-run', 'predictions/');
  try {
    this.secondIngestOutcome = await runIngestOnce({
      source: this.source,
      store: this.store,
      clock: this.clock,
      spots: this.spots,
    });
  } catch (error) {
    this.failures.push({ label: 'duplicate ingest run', error });
  }
});

When('the build attempts to publish', async function (this: PipelineWorld) {
  this.takeSnapshot('before-refused-build-pub', 'pub/');
  this.takeSnapshot('before-refused-build-calls', 'log/calls/');
  this.clock.set(`${this.today}T11:22:00Z`);
  await this.runBuild('build with no usable data');
});

// ---------- the snapshot (prediction log) ----------

Then('the prediction log holds one row per model per forecast hour', async function (this: PipelineWorld) {
  const rows = await this.predictionRows();
  const expectedSources = venaoMorningMembers.map((m) => m.source);
  assert.ok(
    rows.length > 0,
    `expected prediction-log rows for ${expectedSources.length} models, found none.${this.failureContext()}`,
  );
  for (const source of expectedSources) {
    const forSource = rows.filter((r) => r.source === source);
    assert.equal(
      forSource.length,
      VALID_HOURS_UTC.length,
      `model ${source}: expected one row per forecast hour (${VALID_HOURS_UTC.length}), found ${forSource.length}.${this.failureContext()}`,
    );
    const distinctHours = new Set(forSource.map((r) => r.valid_ts));
    assert.equal(
      distinctHours.size,
      forSource.length,
      `model ${source}: duplicate rows for the same forecast hour`,
    );
  }
});

Then(
  'every row carries its natural key of spot, model, model run and forecast hour',
  async function (this: PipelineWorld) {
    const rows = await this.predictionRows();
    assert.ok(rows.length > 0, `no prediction-log rows found.${this.failureContext()}`);
    for (const row of rows) {
      assert.equal(row.spot_id, 'playa-venao');
      assert.ok(
        venaoMorningMembers.some((m) => m.source === row.source),
        `unknown source in log row: ${row.source}`,
      );
      assert.equal(row.run_ts, this.source.runTs, 'row must carry the model run it came from');
      assert.ok(row.valid_ts.startsWith(this.today), 'row must carry its forecast hour');
      const validHour = Number(row.valid_ts.slice(11, 13));
      const runHour = Number(row.run_ts.slice(11, 13));
      assert.equal(row.lead_h, validHour - runHour, 'lead_h must be valid_ts minus run_ts in hours');
    }
  },
);

Then('every row records exactly what that model said, unchanged', async function (this: PipelineWorld) {
  const rows = await this.predictionRows();
  assert.ok(rows.length > 0, `no prediction-log rows found.${this.failureContext()}`);
  for (const spec of venaoMorningMembers) {
    for (const hour of VALID_HOURS_UTC) {
      const row = rows.find(
        (r) => r.source === spec.source && Number(r.valid_ts.slice(11, 13)) === hour,
      );
      assert.ok(row, `missing row for ${spec.source} at hour ${hour}.${this.failureContext()}`);
      assert.equal(row.swell_h_m, spec.h_m, `${spec.source}: height must be logged unchanged`);
      assert.equal(row.swell_t_s, spec.t_s, `${spec.source}: period must be logged unchanged`);
      assert.equal(row.swell_dir_deg, spec.dir_deg, `${spec.source}: direction must be logged unchanged`);
      assert.equal(row.land_masked, false);
    }
  }
});

Then('every snapshotted row is still readable, unchanged', async function (this: PipelineWorld) {
  const before = this.getSnapshot('after-ingest');
  assert.ok(
    before.size > 0,
    `nothing was snapshotted before the crash, so survival cannot be shown.${this.failureContext()}`,
  );
  assertStateDelta({
    before,
    after: this.store.snapshot('predictions/'),
    universe: 'predictions/',
    expected: 'identical',
    context: `The snapshot must survive any downstream crash.${this.failureContext()}`,
  });
});

Then('the repeat is acknowledged as a duplicate, not an error', function (this: PipelineWorld) {
  assert.ok(
    this.secondIngestOutcome,
    `the duplicate run did not complete.${this.failureContext()}`,
  );
  assert.equal(
    this.secondIngestOutcome.completed,
    true,
    'a duplicate write must be treated as a duplicate ack, never a failure',
  );
});

Then('the prediction log re-reads byte-identical', function (this: PipelineWorld) {
  const before = this.getSnapshot('before-second-run');
  assert.ok(
    before.size > 0,
    `no prediction-log rows existed before the repeat, so immutability cannot be shown.${this.failureContext()}`,
  );
  assertStateDelta({
    before,
    after: this.store.snapshot('predictions/'),
    universe: 'predictions/',
    expected: 'identical',
    context: 'First write wins; a repeated run may never rewrite the log.',
  });
});

// ---------- the published call (worked example, 05 section 11) ----------

Then('the published call for six in the evening carries a score of {int}', async function (this: PipelineWorld, score: number) {
  const row = await this.workedExampleCallRow();
  assert.equal(
    row.score_q,
    score,
    `the worked example (05 section 11) pins this morning's Venao score to ${score}`,
  );
});

Then('its size band is waist to chest', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.size_band, 'waist_chest');
});

Then('the call records four used models and zero absent models', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.members_used, 4, 'all four declared wave members must feed a healthy blend');
  assert.equal(row.members_null, 0, 'a healthy four-member source registry has no absent members');
});

Then("its confidence level is low, from the models' own disagreement", async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.conf_level, 'low');
  assert.ok(
    row.conf_value >= 0.29 && row.conf_value <= 0.33,
    `the worked example pins c_total near 0.31; got ${row.conf_value}`,
  );
});

Then('the call names size as what held the day back', async function (this: PipelineWorld) {
  const bundle = await this.bundle();
  const today = bundle.days.at(0);
  assert.ok(today, 'bundle must carry a today day array');
  const venao = today.spots.find((s) => s.spot_id === 'playa-venao');
  assert.ok(venao, 'bundle must carry the spot');
  assert.equal(venao.weakest_link, 'size', 'the weakest link is the argmax of log-damage, size here');
});

Then('the published bundle carries the Spanish call a surfer reads', async function (this: PipelineWorld) {
  const bundle = await this.bundle();
  const today = bundle.days.at(0);
  const venao = today?.spots.find((spot) => spot.spot_id === 'playa-venao');
  assert.ok(venao, 'bundle must carry Playa Venao in the current day');
  assert.equal(typeof venao.call.es, 'string', 'the public bundle needs a Spanish call string');
  assert.ok(venao.call.es.trim().length > 0, 'the Spanish call must be readable copy, not an empty field');
  assert.ok(!venao.call.es.includes('placeholder'), 'the public Spanish call must never ship as placeholder text');
});

// ---------- correction inertness ----------

Given('no learned correction exists for the spot', async function (this: PipelineWorld) {
  const keys = await this.store.list('learned/corrections/');
  assert.deepEqual(keys, [], 'launch state: no correction file anywhere');
});

Then('the published score is exactly the physics score, with no bias applied', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.bias_applied, 0, 'no correction file means bias applied must be exactly zero');
  assert.equal(row.score_q, 80, 'Q_final must equal Q exactly when the hook is inert (law L8)');
});

Then('the record shows the correction gate closed with no file', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.bias_gate, 'no_file');
});

// ---------- partial failure ----------

Given('the wave model {string} went dark this morning', function (this: PipelineWorld, source: string) {
  this.darkModel = source;
  this.source.dark.add(source);
});

Given('every wave model went dark this morning', function (this: PipelineWorld) {
  this.source.configureMorning(this.today);
  for (const m of venaoMorningMembers) this.source.dark.add(m.source);
});

Given('only wave model {string} is usable this morning', function (this: PipelineWorld, usable: string) {
  assert.ok(
    venaoMorningMembers.some((member) => member.source === usable),
    `unknown fixture wave model: ${usable}`,
  );
  for (const member of venaoMorningMembers) {
    if (member.source !== usable) this.source.dark.add(member.source);
  }
});

Given('the forecast provider returned {string} this morning', function (this: PipelineWorld, failure: string) {
  assert.ok(
    ['error', 'malformed', 'stale', 'dark'].includes(failure),
    `unknown source-failure fixture: ${failure}`,
  );
  this.source.configureMorning(this.today);
  this.source.waveFailure = failure as 'error' | 'malformed' | 'stale' | 'dark';
});

Then('the prediction log holds no rows for the dark model this cycle', async function (this: PipelineWorld) {
  const rows = await this.predictionRows();
  assert.ok(
    rows.length > 0,
    `the remaining models' rows must still be logged; found none.${this.failureContext()}`,
  );
  const dark = this.darkModel;
  assert.ok(dark, 'test bug: no dark model was declared');
  assert.deepEqual(
    rows.filter((r) => r.source === dark).map((r) => r.valid_ts),
    [],
    `a dark model must leave no rows this cycle`,
  );
});

Then('the spot still gets a score from the three remaining models', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(Number.isInteger(row.score_q) && row.score_q >= 0 && row.score_q <= 100);
  assert.equal(row.members_used, 3, 'the blend must count exactly the three live members');
  assert.equal(row.members_null, 1, 'the absent declared member must be visible in the call receipt');
});

Then('the spot still gets a score from the one usable model', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(Number.isInteger(row.score_q) && row.score_q >= 0 && row.score_q <= 100);
  assert.equal(row.members_used, 1, 'one usable source must still be scored rather than discarded');
});

Then('the call records one used model and three absent models', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.members_used, 1);
  assert.equal(row.members_null, 3, 'three unavailable declared members must not disappear from the receipt');
});

Then('the single-member confidence is capped honestly', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.conf_level, 'low', 'one model cannot claim medium or high confidence');
  assert.ok(row.conf_value <= 0.4, `one member must cap confidence at 0.4; got ${row.conf_value}`);
});

Given("yesterday's dawn build published a call", async function (this: PipelineWorld) {
  this.source.members = venaoMorningMembers;
  await this.publishMorning('yesterday-dawn', YESTERDAY);
});

Then('it refuses to publish', function (this: PipelineWorld) {
  assert.ok(this.buildOutcome, `the build run did not complete.${this.failureContext()}`);
  assert.equal(
    this.buildOutcome.published,
    false,
    'with zero usable members everywhere the build must refuse, never fabricate',
  );
});

Then("yesterday's published call keeps serving, untouched", async function (this: PipelineWorld) {
  const record = this.published.get('yesterday-dawn');
  assert.ok(
    record,
    `yesterday's dawn build left no published call to keep serving.${this.failureContext()}`,
  );
  assert.equal(
    await this.store.get(record.key),
    record.body,
    'the previous published call must keep serving byte-identical',
  );
  assertStateDelta({
    before: this.getSnapshot('before-refused-build-pub'),
    after: this.store.snapshot('pub/'),
    universe: 'pub/',
    expected: 'identical',
    context: 'a refused publish must not advance the manifest or touch any published artifact',
  });
  assertStateDelta({
    before: this.getSnapshot('before-refused-build-calls'),
    after: this.store.snapshot('log/calls/'),
    universe: 'log/calls/',
    expected: 'identical',
    context: 'a refused publish must leave the call log untouched',
  });
});

Given('the wind source went dark this morning', function (this: PipelineWorld) {
  this.source.windDark = true;
});

Given('the tide source went dark this morning', function (this: PipelineWorld) {
  this.source.tideDark = true;
});

Then('the spot still gets a score, from swell and tide alone', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(
    Number.isInteger(row.score_q) && row.score_q >= 0 && row.score_q <= 100,
    'the spot must still be scored from the factors we know',
  );
  assert.ok(typeof row.sub.size === 'number', 'size must still participate');
  assert.ok(typeof row.sub.tide === 'number', 'tide must still participate');
});

Then('the record shows wind as absent, not as a number', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(
    row.sub.wind,
    null,
    'a missing observation is recorded as null, never a fabricated sub-score',
  );
  assert.ok(row.missing.includes('wind'), 'the call log must name wind as missing, not only omit its score');
});

Then('the missing-wind confidence is capped honestly', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(row.conf_value <= 0.4, `missing wind must cap confidence at 0.4; got ${row.conf_value}`);
});

Then('the spot still gets a score, from swell and wind alone', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(
    Number.isInteger(row.score_q) && row.score_q >= 0 && row.score_q <= 100,
    'the spot must still be scored from the factors we know',
  );
  assert.ok(typeof row.sub.size === 'number', 'size must still participate');
  assert.ok(typeof row.sub.wind === 'number', 'wind must still participate');
});

Then('the record shows tide as absent, not as a number', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.sub.tide, null, 'a missing tide observation is recorded as null, never a fabricated sub-score');
  assert.ok(row.missing.includes('tide'), 'the call log must name tide as missing, not only omit its score');
});

Then('the missing-tide confidence is capped honestly', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.ok(row.conf_value <= 0.7, `missing tide must cap confidence at 0.7; got ${row.conf_value}`);
});

Given('the wave model {string} reported the fake flat sea for this spot', function (this: PipelineWorld, source: string) {
  this.maskedModel = source;
  this.source.masked.add(source);
});

Then("that model's rows are flagged as land masked in the log", async function (this: PipelineWorld) {
  const masked = this.maskedModel;
  assert.ok(masked, 'test bug: no masked model was declared');
  const rows = (await this.predictionRows()).filter((r) => r.source === masked);
  assert.ok(
    rows.length > 0,
    `the masked model's rows must still be logged, flagged.${this.failureContext()}`,
  );
  for (const row of rows) {
    assert.equal(row.land_masked, true, 'a masked grid cell is recorded, never passed off as flat sea');
  }
});

Then('the call is blended from the three real opinions only', async function (this: PipelineWorld) {
  const row = await this.workedExampleCallRow();
  assert.equal(row.members_used, 3, 'a land-masked member must never be averaged into the blend');
  assert.equal(row.members_null, 1, 'a land-masked member must be visible as unavailable, not silently dropped');
});

// ---------- yesterday's numbers, still readable ----------

Given("today's dawn build published a call", async function (this: PipelineWorld) {
  this.source.members = venaoMorningMembers;
  await this.publishMorning('today-dawn', this.today);
});

When("today's dawn build publishes a new call", async function (this: PipelineWorld) {
  this.source.members = venaoMorningMembers;
  await this.publishMorning('today-dawn', this.today);
});

Given('the swell picked up during the morning', function (this: PipelineWorld) {
  this.bumpNext = 0.4;
});

When('the mid-morning build publishes an updated call', async function (this: PipelineWorld) {
  await this.publishMorning('today-midmorning', this.today, {
    cycleHour: '12',
    buildHourUtc: 14,
    bump: this.bumpNext,
  });
});

Then("yesterday's published call re-reads byte-identical", async function (this: PipelineWorld) {
  const record = this.published.get('yesterday-dawn');
  assert.ok(
    record,
    `yesterday's dawn build left no published call to re-read.${this.failureContext()}`,
  );
  assert.equal(
    await this.store.get(record.key),
    record.body,
    "yesterday's receipt must re-read byte for byte as published",
  );
});

Then("today's call is its own new record", async function (this: PipelineWorld) {
  const yesterday = this.published.get('yesterday-dawn');
  const today = this.published.get('today-dawn');
  assert.ok(today, `today's dawn build left no published call.${this.failureContext()}`);
  assert.ok(yesterday, `yesterday's record is missing.${this.failureContext()}`);
  assert.notEqual(today.key, yesterday.key, 'each day appends its own record');
  assert.ok(today.body.trim().length > 0, "today's record must carry rows");
});

Then("each build's record exists under its own build stamp", function (this: PipelineWorld) {
  const dawn = this.published.get('today-dawn');
  const mid = this.published.get('today-midmorning');
  assert.ok(dawn, `the dawn build left no published call.${this.failureContext()}`);
  assert.ok(mid, `the mid-morning build left no published call.${this.failureContext()}`);
  assert.ok(dawn.key.includes('build=11Z'), `dawn record must carry the dawn build stamp: ${dawn.key}`);
  assert.ok(mid.key.includes('build=14Z'), `mid-morning record must carry its own stamp: ${mid.key}`);
  assert.notEqual(dawn.key, mid.key);
});

Then("the dawn build's record is byte-identical to what it published", async function (this: PipelineWorld) {
  const dawn = this.published.get('today-dawn');
  assert.ok(dawn, `the dawn build left no published call.${this.failureContext()}`);
  assert.equal(
    await this.store.get(dawn.key),
    dawn.body,
    'no later build may rewrite what the dawn build said',
  );
});
