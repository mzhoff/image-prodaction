import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenRouterRequestError } from '@prodactionpro/chat-connectors';
import { runWithProviderRetry } from './provider-retry.ts';

test('retries transient provider failures inside one logical turn', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await runWithProviderRetry({
    maxAttempts: 3,
    operation: async () => {
      calls += 1;
      if (calls < 3) throw new OpenRouterRequestError('temporary', 'OPENROUTER_NETWORK_ERROR', true);
      return 'ok';
    },
    retryBaseDelayMs: 750,
    sleep: async (delay) => { delays.push(delay); },
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [750, 1_500]);
});

test('does not retry authentication, balance or other permanent provider failures', async () => {
  let calls = 0;
  await assert.rejects(runWithProviderRetry({
    maxAttempts: 3,
    operation: async () => {
      calls += 1;
      throw new OpenRouterRequestError('balance', 'OPENROUTER_HTTP_402', false, 402);
    },
    retryBaseDelayMs: 1,
    sleep: async () => undefined,
  }), /balance/);
  assert.equal(calls, 1);
});

test('stops after the bounded number of transient attempts', async () => {
  let calls = 0;
  await assert.rejects(runWithProviderRetry({
    maxAttempts: 3,
    operation: async () => {
      calls += 1;
      throw new OpenRouterRequestError('offline', 'OPENROUTER_NETWORK_ERROR', true);
    },
    retryBaseDelayMs: 1,
    sleep: async () => undefined,
  }), /offline/);
  assert.equal(calls, 3);
});
