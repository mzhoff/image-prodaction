import assert from 'node:assert/strict';
import test from 'node:test';
import { createExponentialBackoffPolicy } from './retry-policy';

test('exponential backoff grows by attempt, caps, and applies injected jitter', () => {
  const noJitter = createExponentialBackoffPolicy({
    baseDelayMs: 1_000,
    maxDelayMs: 5_000,
    jitterRatio: 0,
  });
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((attempt) => noJitter.nextDelayMs(attempt)),
    [1_000, 2_000, 4_000, 5_000, 5_000],
  );

  const lowJitter = createExponentialBackoffPolicy({
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    jitterRatio: 0.25,
    random: () => 0,
  });
  const highJitter = createExponentialBackoffPolicy({
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    jitterRatio: 0.25,
    random: () => 1,
  });
  assert.equal(lowJitter.nextDelayMs(2), 1_500);
  assert.equal(highJitter.nextDelayMs(2), 2_500);
});

test('retry policy rejects unsafe configuration and attempt values', () => {
  assert.throws(
    () => createExponentialBackoffPolicy({ baseDelayMs: 2_000, maxDelayMs: 1_000 }),
    /Maximum retry delay/,
  );
  assert.throws(
    () => createExponentialBackoffPolicy({ jitterRatio: 1.1 }),
    /jitter ratio/,
  );
  assert.throws(
    () => createExponentialBackoffPolicy().nextDelayMs(0),
    /Attempt count/,
  );
});
