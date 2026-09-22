import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeBudgetWorkspaces, type BudgetWorkspaceRecord } from './budget-summary';

const record: BudgetWorkspaceRecord = {
  id: 'w1', userId: 'u1', name: 'Personal', role: 'member', status: 'connected', credentialId: 'secret-id',
};
const now = () => new Date('2026-09-20T08:00:00Z');
test('budget summary preserves zero/overshoot and distinguishes unknown, missing and disabled', async () => {
  const rows = [record, { ...record, id: 'zero' }, { ...record, id: 'unknown' },
    { ...record, id: 'missing', credentialId: null }, { ...record, id: 'invalid', status: 'invalid' as const },
    { ...record, id: 'offline' }];
  const calls: string[] = [];
  const result = await summarizeBudgetWorkspaces('issuer', 'subject', new AbortController().signal, {
    list: async (issuer, subject) => { assert.equal(issuer, 'issuer'); assert.equal(subject, 'subject'); return rows; },
    balance: async (row) => {
      calls.push(row.id);
      if (row.id === 'offline') throw new Error('private gateway details');
      return row.id === 'zero' ? '0' : row.id === 'unknown' ? null : '-0.05';
    }, now,
  });
  assert.deepEqual(result.map((row) => [row.connectionStatus, row.balanceUSD]), [
    ['ready', -0.05], ['ready', 0], ['ready', null], ['missing', null], ['disabled', null], ['unavailable', null],
  ]);
  assert.equal(result[0].balanceCheckedAt, now().toISOString());
  assert.equal(result[5].balanceCheckedAt, null);
  assert.deepEqual(calls.sort(), ['offline', 'unknown', 'w1', 'zero']);
  assert.doesNotMatch(JSON.stringify(result), /secret-id|userId|private gateway/);
});
test('expired menu deadline makes balances unknown without new provider requests', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await summarizeBudgetWorkspaces('issuer', 'subject', controller.signal, {
    list: async () => [record], balance: async () => { throw new Error('must not call'); }, now,
  });
  assert.equal(result[0].connectionStatus, 'unavailable');
  assert.equal(result[0].balanceUSD, null);
});
test('invalid numeric provider values are unknown, not zero', async () => {
  for (const balance of ['Infinity', 'NaN', '']) {
    const result = await summarizeBudgetWorkspaces('issuer', 'subject', new AbortController().signal, {
      list: async () => [record], balance: async () => balance, now,
    });
    assert.equal(result[0].balanceUSD, null);
  }
});
