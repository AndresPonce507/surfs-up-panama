// What the scheduled export does when its environment is not what it needs.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// This is the one behaviour of the composition root that can be exercised
// without AWS, and it is the one that matters most on a job nobody watches: a
// nightly cron that quietly returns having written nothing looks exactly like a
// night with no reports. The refusal has to be loud and it has to say which
// variable, because the write stack sets `SITE_BUCKET`, not `BUCKET_NAME`, and
// a job that guessed the wrong one would fail on the same silent path.
//
// The composition is memoized, so the refusal must also not be cached: the
// next tick has to get a clean attempt rather than a container that poisoned
// itself for its whole lifetime.

import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, it } from 'vitest';

import { createComposition, handler } from '../../src/export/aws-lambda-adapter';

const OWNED_VARIABLES = ['WRITE_STORE_TABLE', 'SITE_BUCKET'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(OWNED_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of OWNED_VARIABLES) delete process.env[name];
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('the scheduled export refuses a night it cannot run', () => {
  // covers: R7
  it('names the missing variable, says why it matters and how to fix it, rather than exporting nothing', async () => {
    const refusal = await handler().then(() => null, (error: unknown) => error);

    assert.ok(refusal instanceof Error, 'a job that cannot be composed must throw, so the schedule records a failure rather than a quiet success');
    assert.match(
      refusal.message,
      /WRITE_STORE_TABLE/,
      'the refusal names the variable that is missing. This job reads one table and writes one bucket, and both names are set by the write stack.',
    );
    for (const clause of ['WHAT', 'WHY', 'HOW']) {
      assert.match(refusal.message, new RegExp(clause), `a refusal in this repository says ${clause}`);
    }
  });

  // covers: R7
  it('does not cache the refusal, so a repaired environment runs on the next tick', async () => {
    const first = await handler().then(() => null, (error: unknown) => error);
    process.env['WRITE_STORE_TABLE'] = 'surfs-up-panama-write-store';
    const second = await handler().then(() => null, (error: unknown) => error);

    assert.ok(first instanceof Error && second instanceof Error, 'both attempts refuse: the second still has no bucket');
    assert.doesNotMatch(
      second.message,
      /WRITE_STORE_TABLE/,
      'the second tick composed again instead of replaying the first tick\'s failure, so it got as far as the NEXT missing variable. A memoized rejection would have made the job dead for the life of the container.',
    );
    assert.match(second.message, /SITE_BUCKET/, 'and it names the one that is still missing -- SITE_BUCKET is the house name the write stack sets');
  });

  // covers: R3 R6
  it('hands a night every dependency it needs, with the beaches actually loaded', async () => {
    process.env['WRITE_STORE_TABLE'] = 'surfs-up-panama-write-store';
    process.env['SITE_BUCKET'] = 'surfs-up-panama-site';

    const deps = await createComposition();

    assert.deepEqual(
      Object.keys(deps).sort(),
      ['clock', 'log', 'signals', 'spots', 'store', 'timezone'],
      'a night is handed all six of its dependencies. A composition missing one would fail at the far end of a scheduled run nobody is watching.',
    );
    assert.equal(
      deps.timezone,
      'America/Panama',
      'the signals bucket by the zone every launch-seed row declares, and the composition root is where that fact enters the run',
    );
    assert.ok(
      deps.spots.length > 0 && deps.spots.every((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lon)),
      `the launch seed really loaded, with a real coordinate on every beach; got ${deps.spots.length}. This is the dependency that reads the world, and a run composed without it refuses at the first report it cannot tile -- on a schedule whose write-once keys make that night unrepairable.`,
    );
    assert.deepEqual(
      ['playa-venao', 'santa-catalina-la-punta'].filter((spotId) => !deps.spots.some((spot) => spot.spot_id === spotId)),
      [],
      'and it carries the beaches that already have accepted reports',
    );
  });
});
