import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { replayRetryDelay } from '../../src/report/replay';

describe('offline throttling backoff', () => {
  it('keeps retries polite, bounded, and jittered in the page that owns the credential', () => {
    const random = () => 0.5;
    const delays = Array.from({ length: 10 }, (_, attempt) => replayRetryDelay(attempt, random));

    assert.ok(delays[0]! >= 30_000 && delays[0]! < 60_000, 'the first retry waits 30 seconds plus bounded jitter');
    assert.ok(delays[1]! >= 60_000 && delays[1]! < 120_000, 'the second retry doubles before jitter');
    assert.ok(delays.every((delay) => delay <= 60 * 60 * 1000), 'no retry delay exceeds the settled one-hour cap');
    assert.equal(delays.at(-1), 60 * 60 * 1000, 'the ladder reaches and holds the one-hour cap');
  });
});
