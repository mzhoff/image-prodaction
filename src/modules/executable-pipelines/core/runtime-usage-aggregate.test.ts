import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeUsageSchema } from '../contracts/runtime-usage-contracts';
import { aggregateRuntimeUsage, type RuntimeUsageCall } from './runtime-usage-aggregate';

const call = (physicalCallId: string, changes: Partial<RuntimeUsageCall> = {}): RuntimeUsageCall => ({
  physicalCallId, revision: 0, inputTokens: '10', outputTokens: '4', totalTokens: '14',
  providerCostUsd: '0.00000001', canReconcile: false, ...changes,
});

test('terminal success, paid failure and cancellation retain every physical attempt', () => {
  for (const status of ['succeeded', 'failed', 'canceled']) {
    const result = aggregateRuntimeUsage({
      calls: [call('text:1'), call('structured-repair:1'), call('image:1'), call('image:2')],
      terminal: Boolean(status), deterministic: false,
    });
    assert.equal(result.state, 'COMPLETE');
    assert.equal(result.actualProviderCostUsd, '0.00000004');
    assert.equal(result.providerCallCount, 4);
    assert.equal(result.totalTokens, '56');
    assert.deepEqual(runtimeUsageSchema.parse(result), result);
  }
});

test('reconciliation supersedes a usage snapshot and never adds a provider call', () => {
  const pending = call('job:1', { providerCostUsd: null, canReconcile: true });
  const late = call('job:1', { revision: 1, providerCostUsd: '0.12345678' });
  const result = aggregateRuntimeUsage({
    calls: [pending, late, pending, late], terminal: true, deterministic: false,
  });
  assert.equal(result.providerCallCount, 1);
  assert.equal(result.pricedCallCount, 1);
  assert.equal(result.actualProviderCostUsd, '0.12345678');
  assert.equal(result.totalTokens, '14');
});

test('partial usage exposes a subtotal while total cost and unknown tokens remain null', () => {
  const result = aggregateRuntimeUsage({ calls: [
    call('priced'), call('missing', { providerCostUsd: null, totalTokens: null }),
  ], terminal: true, deterministic: false });
  assert.equal(result.state, 'PARTIAL');
  assert.equal(result.actualProviderCostUsd, null);
  assert.equal(result.knownProviderCostUsd, '0.00000001');
  assert.equal(result.totalTokens, null);
});

test('unknown terminal dispatch is unavailable, recoverable cost is pending, neither is zero', () => {
  for (const canReconcile of [true, false]) {
    const result = aggregateRuntimeUsage({
      calls: [call('unknown', { providerCostUsd: null, canReconcile })],
      terminal: true, deterministic: false,
    });
    assert.equal(result.state, canReconcile ? 'PENDING' : 'UNAVAILABLE');
    assert.equal(result.actualProviderCostUsd, null);
    assert.equal(result.knownProviderCostUsd, null);
  }
});

test('zero is asserted only with evidence: deterministic terminal no-dispatch or provider-reported zero', () => {
  const completed = aggregateRuntimeUsage({ calls: [], terminal: true, deterministic: true });
  assert.equal(completed.state, 'COMPLETE');
  assert.equal(completed.actualProviderCostUsd, '0.00000000');
  assert.equal(completed.providerCallCount, 0);
  const pending = aggregateRuntimeUsage({ calls: [], terminal: false, deterministic: true });
  assert.equal(pending.actualProviderCostUsd, null);
  const paid = aggregateRuntimeUsage({ calls: [], terminal: true, deterministic: false });
  assert.equal(paid.state, 'UNAVAILABLE');
  assert.equal(paid.actualProviderCostUsd, null);
  const free = aggregateRuntimeUsage({ calls: [call('free', { providerCostUsd: '0' })], terminal: true, deterministic: false });
  assert.equal(free.actualProviderCostUsd, '0.00000000');
});
