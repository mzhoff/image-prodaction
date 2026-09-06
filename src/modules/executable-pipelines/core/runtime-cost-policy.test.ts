import assert from 'node:assert/strict';
import test from 'node:test';
import { sumUsd, strictestUsdLimit, usdUnits } from './runtime-cost-decimal';
import { checkRuntimeDispatchBudget, prepareRuntimeCostSnapshot, RuntimeCostError } from './runtime-cost-policy';

test('currency is exact and the strictest configured cap wins', () => {
  assert.equal(sumUsd(['99999999999.12345678', '0.00000001']), '99999999999.12345679');
  assert.equal(strictestUsdLimit(null, '0.00000003', '0.00000002'), '0.00000002');
  for (const invalid of ['-1', 'NaN', '1e-8', '0.123456789', '']) assert.throws(() => usdUnits(invalid));
});

test('strict unsupported provider is rejected before enqueue; deterministic pipeline has a trusted zero snapshot', () => {
  assert.throws(() => prepareRuntimeCostSnapshot({
    hasProviderCalls: true, grantPolicy: { mode: 'STRICT', maximumProviderCostUsd: '1' },
  }), (error: unknown) => error instanceof RuntimeCostError && error.code === 'cost_enforcement_unsupported');
  const result = prepareRuntimeCostSnapshot({
    hasProviderCalls: false, requestMaximumProviderCostUsd: '0',
    grantPolicy: { mode: 'STRICT', maximumProviderCostUsd: '1' },
  });
  assert.equal(result.effectiveMaximumProviderCostUsd, '0.00000000');
  assert.equal(result.enforcement, 'ENFORCED');
  assert.equal(result.estimate?.max, '0.00000000');
});

test('best-effort says unsupported and blocks exhausted known budget without claiming a hard bound', () => {
  const cost = prepareRuntimeCostSnapshot({
    hasProviderCalls: true, grantPolicy: { mode: 'BEST_EFFORT', maximumProviderCostUsd: '0.1' },
  });
  assert.equal(cost.enforcement, 'UNSUPPORTED');
  assert.equal(cost.estimate, null);
  assert.throws(() => checkRuntimeDispatchBudget({
    cost, spentUsd: '0.1', reservedUsd: '0', unresolvedCalls: 0, bound: null,
  }), /cost limit/);
});

test('each retry and repair call must fit spent plus concurrent reservations with a trusted upper bound', () => {
  const cost = { ...prepareRuntimeCostSnapshot({
    hasProviderCalls: true, grantPolicy: { mode: 'BEST_EFFORT', maximumProviderCostUsd: '0.10' },
  }), mode: 'STRICT' as const, enforcement: 'ENFORCED' as const };
  const bound = { maximumUsd: '0.04', pricingSnapshotId: 'fake-fixture-only', guaranteed: true };
  assert.deepEqual(checkRuntimeDispatchBudget({
    cost, spentUsd: '0.03', reservedUsd: '0.02', unresolvedCalls: 0, bound,
  }), { reservedUsd: '0.04000000' });
  assert.throws(() => checkRuntimeDispatchBudget({
    cost, spentUsd: '0.03', reservedUsd: '0.04', unresolvedCalls: 0, bound,
  }), /cost limit/);
  assert.throws(() => checkRuntimeDispatchBudget({
    cost, spentUsd: '0', reservedUsd: '0', unresolvedCalls: 1, bound,
  }), /estimate is unavailable/);
  assert.throws(() => checkRuntimeDispatchBudget({
    cost, spentUsd: '0', reservedUsd: '0', unresolvedCalls: 0, bound: { ...bound, guaranteed: false },
  }), /guaranteed cost bound/);
});
