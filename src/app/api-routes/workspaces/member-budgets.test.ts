import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMemberBudgets } from './member-budgets';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';

test('member budget API authenticates, checks exact origins, binds session actor and rejects forged policy', async () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  type Ports = NonNullable<Parameters<typeof handleMemberBudgets>[2]>;
  const updates: unknown[] = [];
  const ports: Ports = {
    session: async () => ({ user: { id: 'session-user' } }) as Awaited<ReturnType<Ports['session']>>,
    origins: () => ['https://production.example.test'],
    read: async (actor, id) => {
      assert.equal(actor, 'session-user');
      assert.equal(id, workspaceId);
      return { workspaceId, canManage: true, members: [] };
    },
    update: async (...args) => {
      updates.push(args);
    },
  };
  const payload = { userId: 'member', enabled: true, limitUsd: '1.25', period: 'lifetime', revision: 0 };
  const request = (body: unknown = payload, origin = ports.origins()[0]) =>
    new Request(`https://production.example.test/api/workspaces/${workspaceId}/member-budgets`, {
      method: 'PATCH',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await handleMemberBudgets(request(), workspaceId, ports)).status, 200);
  assert.deepEqual(updates[0], [
    'session-user',
    workspaceId,
    'member',
    { enabled: true, limitUsd: '1.25', period: 'lifetime', revision: 0, mode: 'observed' },
  ]);
  assert.equal(
    (await handleMemberBudgets(request(payload, 'https://evil.test'), workspaceId, ports)).status,
    403,
  );
  assert.equal(
    (await handleMemberBudgets(request({ ...payload, actorId: 'owner' }), workspaceId, ports)).status,
    400,
  );
  assert.equal(
    (await handleMemberBudgets(request({ ...payload, mode: 'strict' }), workspaceId, ports)).status,
    400,
  );
  assert.equal(
    (await handleMemberBudgets(request({ ...payload, limitUsd: '-1' }), workspaceId, ports)).status,
    400,
  );
  assert.equal((await handleMemberBudgets(request('x'.repeat(4097)), workspaceId, ports)).status, 413);
  assert.equal(updates.length, 1);
  assert.equal(
    (await handleMemberBudgets(request(), workspaceId, { ...ports, session: async () => null })).status,
    401,
  );
  const denied = await handleMemberBudgets(request(), workspaceId, {
    ...ports,
    update: async () => {
      throw new MemberBudgetError('workspace_owner_required', 'Owner required');
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
});
