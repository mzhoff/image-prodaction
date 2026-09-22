import assert from 'node:assert/strict';
import test from 'node:test';
import { usageNeedsFunding } from './usage-empty-state';

test('funding is offered for a confirmed disconnected or exhausted budget', () => {
  assert.equal(usageNeedsFunding({ status: 'disconnected' }, false), true);
  for (const remaining of [0, -0.01, 10, null]) {
    const balance = { status: 'connected' as const, budget: { remaining, limit: 10, spentFromLimit: 0, limitReset: null, updatedAt: '' } };
    assert.equal(usageNeedsFunding(balance, false), remaining !== null && remaining <= 0);
  }
});
test('a failed or missing balance check never implies that payment is required', () => {
  assert.equal(usageNeedsFunding(null, false), false);
  assert.equal(usageNeedsFunding(null, true), false);
  assert.equal(usageNeedsFunding({ status: 'disconnected' }, true), false);
});
