// Slice-03 acceptance steps. They drive the production seed entry and the
// existing ingest/build entry points, then inspect only published artifacts.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runBuildOnce } from '../../../../src/pipeline/build';
import { runIngestOnce } from '../../../../src/pipeline/ingest';
import { venaoMorningMembers } from './support/fixtures';
import type { PipelineWorld } from './support/world';
import './support/world';

type LaunchPolicy = {
  readonly launch_spot_ids: readonly string[];
  readonly excluded: Readonly<Record<string, string>>;
};

type PublishedDay = {
  readonly spots: readonly { readonly spot_id: string; readonly score_q?: number; readonly call: { readonly es: string } }[];
};

type RankedWorld = PipelineWorld & {
  firstDay?: PublishedDay;
  secondDay?: PublishedDay;
  isolatedPolicy?: { readonly root: string; readonly path: string };
  isolatedPolicyFailure?: unknown;
};

const policy: LaunchPolicy = JSON.parse(
  readFileSync(new URL('../../../../data/spots/pa-pacific-launch-v1.json', import.meta.url), 'utf8'),
) as LaunchPolicy;

const sourceSpotIds = [...readFileSync(
  new URL('../../../../data/spots/pa-pacific.yaml', import.meta.url),
  'utf8',
).matchAll(/^\s+- spot_id: ([^\n]+)$/gm)].map((match) => match[1]!);

function rankedWorld(world: PipelineWorld): RankedWorld {
  return world as RankedWorld;
}

function observedDay(body: string | null): PublishedDay {
  if (body === null) return { spots: [] };
  const parsed = JSON.parse(body) as { days?: PublishedDay[] };
  return parsed.days?.[0] ?? { spots: [] };
}

function publishedDay(world: PipelineWorld): Promise<PublishedDay> {
  return world.store.get('pub/v1/regions/pa-pacific/bundle.json').then(observedDay);
}

async function publishLaunchMorning(world: PipelineWorld, date: string): Promise<PublishedDay> {
  world.source.configureMorning(date);
  world.clock.set(`${date}T11:22:00Z`);
  await world.runIngest('Pacific launch ingest');
  await world.runBuild('Pacific launch build');
  return publishedDay(world);
}

Given('existe una política publicada para el lanzamiento del Pacífico', function (this: PipelineWorld) {
  assert.equal(policy.launch_spot_ids.length, 20, 'test fixture error: the launch policy must name 20 spots');
  assert.equal(sourceSpotIds.length, 23, 'test fixture error: the human-owned source seed must name 23 spots');
});

Given('existe una política aislada con {int} spots de lanzamiento', function (this: PipelineWorld, count: number) {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-03-policy-'));
  const path = join(root, 'launch-policy.json');
  writeFileSync(path, `${JSON.stringify({
    ...policy,
    launch_spot_ids: policy.launch_spot_ids.slice(0, count),
  })}\n`);
  rankedWorld(this).isolatedPolicy = { root, path };
});

When('la mañana del Pacífico se publica para la home', async function (this: PipelineWorld) {
  await publishLaunchMorning(this, '2026-08-08');
});

When('la mañana del Pacífico intenta publicarse con esa política', async function (this: PipelineWorld) {
  const world = rankedWorld(this);
  assert.ok(world.isolatedPolicy, 'test fixture error: an isolated launch policy is required');
  this.source.configureMorning('2026-08-08');
  this.clock.set('2026-08-08T11:22:00Z');
  try {
    await runIngestOnce({
      source: this.source,
      store: this.store,
      clock: this.clock,
      launchData: { policyPath: world.isolatedPolicy.path },
    });
    await runBuildOnce({
      store: this.store,
      clock: this.clock,
      region_id: 'pa-pacific',
      launchData: { policyPath: world.isolatedPolicy.path },
    });
  } catch (error) {
    world.isolatedPolicyFailure = error;
  }
});

Then('la home rechaza la política incompleta y no muestra una costa parcial', function (this: PipelineWorld) {
  const world = rankedWorld(this);
  const root = world.isolatedPolicy?.root;
  try {
    assert.ok(
      world.isolatedPolicyFailure instanceof Error,
      'WHAT: a zero- or one-spot policy reached publication. WHY: home must not disguise a partial coast as the complete launch list. HOW: reject any policy whose launch selection is not exactly twenty before ingest or build.',
    );
    assert.match(
      world.isolatedPolicyFailure.message,
      /exactly 20|exactamente 20/i,
      'WHAT: the incomplete-policy refusal does not name the 20-spot launch rule. WHY: the data editor needs a repairable error. HOW: state that the policy must select exactly 20 spots.',
    );
    assert.equal(
      this.store.snapshot('pub/v1/regions/pa-pacific/').size,
      0,
      'WHAT: an incomplete launch policy left a public home bundle. WHY: surfers must never be shown a partial coast as complete. HOW: reject before publishing any region bundle.',
    );
  } finally {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

Then('la publicación de la home contiene exactamente los veinte spots publicados', async function (this: PipelineWorld) {
  const day = await publishedDay(this);
  assert.equal(
    day.spots.length,
    policy.launch_spot_ids.length,
    `WHAT: home publication has ${day.spots.length} spots, not ${policy.launch_spot_ids.length}. WHY: home ranking promises the entire twenty-spot launch coast. HOW: have the production morning publication load the policy-selected seed records.`,
  );
  assert.deepEqual(
    new Set(day.spots.map((spot) => spot.spot_id)),
    new Set(policy.launch_spot_ids),
    'WHAT: visible home IDs differ from the data policy. WHY: adding or removing a spot must be a data decision. HOW: publish exactly the policy-selected IDs, then rank them by their computed scores rather than policy-file order.',
  );
});

Then('cada spot publicado conserva su identidad de datos', function (this: PipelineWorld) {
  const ids = policy.launch_spot_ids;
  for (const spotId of ids) {
    assert.ok(
      sourceSpotIds.includes(spotId),
      `WHAT: ${spotId} is not an identity in the human-owned Pacific source seed. WHY: a ranked row must name a real spot, not a placeholder. HOW: select only source identities through the production morning publication.`,
    );
  }
});

Then('los veintitrés spots fuente quedan repartidos entre los veinte publicados y tres exclusiones nombradas', function (this: PipelineWorld) {
  const inclusion = new Set(policy.launch_spot_ids);
  const exclusion = Object.keys(policy.excluded);
  assert.equal(
    inclusion.size + exclusion.length,
    sourceSpotIds.length,
    `WHAT: launch policy partitions to ${inclusion.size + exclusion.length}, not ${sourceSpotIds.length} source spots. WHY: an omitted coast spot needs an explicit launch decision. HOW: name every launch spot or named exclusion in the data policy.`,
  );
  assert.equal(
    new Set([...inclusion, ...exclusion]).size,
    sourceSpotIds.length,
    'WHAT: an excluded spot overlaps the published set. WHY: a safety exclusion cannot quietly be ranked. HOW: keep exclusions outside the loaded launch seeds.',
  );
  assert.deepEqual(
    new Set([...inclusion, ...exclusion]),
    new Set(sourceSpotIds),
    'WHAT: the policy does not classify the exact human-owned source population. WHY: every omitted source spot needs a visible decision. HOW: make the policy IDs and exclusions a disjoint exhaustive partition of data/spots/pa-pacific.yaml.',
  );
  for (const excluded of exclusion) {
    assert.ok(
      policy.excluded[excluded]?.trim().length,
      `WHAT: ${excluded} has no exclusion reason. WHY: a launch safety omission must be reviewable. HOW: record a non-empty reason in the policy data.`,
    );
  }
});

Then('ningún spot excluido llega a la publicación de la home', async function (this: PipelineWorld) {
  const day = await publishedDay(this);
  for (const excluded of Object.keys(policy.excluded)) {
    assert.ok(
      !day.spots.some((spot) => spot.spot_id === excluded),
      `WHAT: ${excluded} reached the home publication. WHY: its data is not safe for launch ranking. HOW: honor the explicit policy exclusion in the production morning publication.`,
    );
  }
});

Then('la publicación de la home contiene las veinte filas de lanzamiento', async function (this: PipelineWorld) {
  const day = await publishedDay(this);
  assert.equal(
    day.spots.length,
    policy.launch_spot_ids.length,
    `WHAT: public bundle has ${day.spots.length} rows, not 20. WHY: the home page must let a surfer compare the whole launch coast. HOW: publish every loaded launch seed into today's ranked day.`,
  );
  assert.deepEqual(
    new Set(day.spots.map((spot) => spot.spot_id)),
    new Set(policy.launch_spot_ids),
    'WHAT: public rows do not match the launch policy. WHY: the ranked surface must be data-defined. HOW: carry exactly the selected IDs into the public bundle.',
  );
});

Then('ningún puntaje mayor aparece debajo de un puntaje menor', async function (this: PipelineWorld) {
  const day = observedDay(await this.store.get('pub/v1/regions/pa-pacific/bundle.json'));
  for (let index = 1; index < day.spots.length; index += 1) {
    const previous = day.spots[index - 1]?.score_q;
    const current = day.spots[index]?.score_q;
    assert.ok(
      typeof previous === 'number' && typeof current === 'number' && previous >= current,
      `WHAT: row ${index + 1} has score ${String(current)} after ${String(previous)}. WHY: a surfer trusts the first row to be the best current call. HOW: sort published rows descending by computed score with a deterministic tie-break.`,
    );
  }
});

Then('cada fila trae un llamado en español para el surfista', async function (this: PipelineWorld) {
  const day = observedDay(await this.store.get('pub/v1/regions/pa-pacific/bundle.json'));
  for (const spot of day.spots) {
    assert.ok(
      typeof spot.call.es === 'string' && spot.call.es.trim().length > 0,
      `WHAT: ${spot.spot_id} has no Spanish call. WHY: every ranked row must be readable before the surfer taps it. HOW: publish the deterministic Spanish call for every launch spot.`,
    );
  }
});

When('el swell gira entre dos mañanas publicadas', async function (this: PipelineWorld) {
  this.source.members = venaoMorningMembers.map((member) => ({ ...member, dir_deg: 180 }));
  rankedWorld(this).firstDay = await publishLaunchMorning(this, '2026-08-08');

  this.source.members = venaoMorningMembers.map((member) => ({ ...member, dir_deg: 250 }));
  rankedWorld(this).secondDay = await publishLaunchMorning(this, '2026-08-09');
});

Then('las dos mañanas tienen las veinte filas de lanzamiento', function (this: PipelineWorld) {
  const world = rankedWorld(this);
  assert.equal(world.firstDay?.spots.length, policy.launch_spot_ids.length, 'WHAT: the south-swell day lacks twenty rows. WHY: an order comparison needs the same complete coast. HOW: publish every launch spot on each valid morning.');
  assert.equal(world.secondDay?.spots.length, policy.launch_spot_ids.length, 'WHAT: the west-swell day lacks twenty rows. WHY: an order comparison needs the same complete coast. HOW: publish every launch spot on each valid morning.');
});

Then('las dos mañanas no conservan el mismo orden de spots', function (this: PipelineWorld) {
  const world = rankedWorld(this);
  const first = world.firstDay?.spots.map((spot) => spot.spot_id) ?? [];
  const second = world.secondDay?.spots.map((spot) => spot.spot_id) ?? [];
  assert.notDeepEqual(
    second,
    first,
    'WHAT: a south swell and west swell produced the same ranking. WHY: different spot exposure must affect the surfer’s best-first call. HOW: score every seed’s own direction window and sort the published rows from that result.',
  );
});
