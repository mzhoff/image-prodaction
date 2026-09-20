import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMemberBudget, MemberBudgetError, usdUnits } from './member-budget-policy';

test('observed personal budgets use exact USD, stop at cap and retain unknown outcomes', () => {
  const policy = { enabled: true, limitUsd: '1.00000001', mode: 'observed' as const };
  assert.equal(usdUnits('1.00000001') - usdUnits('1'), BigInt(1));
  assert.doesNotThrow(() => checkMemberBudget(policy, '1', 0));
  for (const spend of ['1.00000001', '2'])
    assert.throws(
      () => checkMemberBudget(policy, spend, 0),
      (error: unknown) => error instanceof MemberBudgetError && error.code === 'member_budget_exhausted',
    );
  assert.throws(() => checkMemberBudget(policy, '0', 1), /уточняется/);
  assert.throws(() => checkMemberBudget({ ...policy, limitUsd: '0' }, '0', 0), /исчерпан/);
  assert.doesNotThrow(() => checkMemberBudget({ ...policy, limitUsd: null }, '99', 5));
  assert.throws(() => checkMemberBudget({ ...policy, enabled: false, limitUsd: null }, '0', 0), /отключил/);
  for (const value of ['-1', 'NaN', '1e2', '0.000000001', '1000000000000'])
    assert.throws(() => usdUnits(value));
});
