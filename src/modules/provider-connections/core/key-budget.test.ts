import assert from 'node:assert/strict';
import test from 'node:test';
import { keyBudget } from './key-budget';
const base = { limit: 20, limitRemaining: 5, limitReset: null, updatedAt: '2026-09-21T10:00:00Z' };

test('20 dollar limit, 15 spent leaves 5 available; lifetime usage cannot change the current limit', () => {
  const withLifetimeUsage = { ...base, usage: 115 };
  assert.deepEqual(keyBudget(withLifetimeUsage), { limit: 20, remaining: 5, spentFromLimit: 15, limitReset: null, updatedAt: base.updatedAt });
  assert.equal(keyBudget({ ...withLifetimeUsage, limitRemaining: 18, limitReset: 'monthly' }).spentFromLimit, 2);
});

test('unknown remaining balance and unlimited keys stay unknown, never zero or fabricated funds', () => {
  assert.equal(keyBudget({ ...base, limitRemaining: null }).remaining, null);
  assert.equal(keyBudget({ ...base, limitRemaining: null }).spentFromLimit, null);
  assert.equal(keyBudget({ ...base, limit: null }).spentFromLimit, null);
  assert.equal(keyBudget({ ...base, limitRemaining: NaN }).remaining, null);
  assert.equal(keyBudget({ ...base, limit: 0, limitRemaining: 0 }).remaining, 0);
  assert.equal(keyBudget({ ...base, limit: 0.3, limitRemaining: 0.2 }).spentFromLimit, 0.1);
});
