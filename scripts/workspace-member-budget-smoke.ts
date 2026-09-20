import assert from 'node:assert/strict';
import { OpenRouterRequestError } from '@prodactionpro/chat-connectors';
import { randomUUID } from 'node:crypto';
import { getDb, getPostgresPool } from '../src/shared/db/client.ts';
import { getCoordinationPool } from '../src/shared/db/coordination-pool.ts';
import {
  getMemberBudgets,
  updateMemberBudget,
  authorizeMemberDispatch,
} from '../src/modules/workspace-budgets/server/member-budget-service.ts';
import { withMemberChatBudget } from '../src/modules/workspace-budgets/server/chat-budget.ts';
import { markProviderCallDispatched } from '../src/modules/generation/server/generation-execution-repository.ts';
import { readMemberUsage } from '../src/modules/workspace-budgets/server/member-usage.ts';
import type { MemberBudgetPolicy } from '../src/modules/workspace-budgets/contracts/member-budget.ts';
import { resolveOpenRouterCredential } from '../src/modules/provider-connections/server/provider-connection-service.ts';
import { projectBudgetConnection } from '../src/modules/provider-connections/server/platform/budget-projection.ts';
import { ownedBudgetWorkspaces } from '../src/modules/provider-connections/server/platform/owned-workspaces.ts';

assert.match(new URL(process.env.DATABASE_URL ?? '').pathname, /^\/image_budget_test_[a-f0-9]+$/);
const db = getPostgresPool();
const owner = randomUUID(),
  member = randomUUID(),
  admin = randomUUID(),
  own = randomUUID(),
  other = randomUUID();
const issuer = process.env.REVERIE_IDENTITY_ISSUER!;
const defaults: MemberBudgetPolicy = {
  enabled: true,
  limitUsd: '1',
  period: 'lifetime',
  mode: 'observed',
  revision: 0,
};
async function policy(userId: string, changes: Partial<MemberBudgetPolicy> = {}) {
  const current = (await getMemberBudgets(owner, own)).members.find((m) => m.userId === userId)!;
  await updateMemberBudget(owner, own, userId, { ...defaults, revision: current.revision, ...changes });
}
async function usage(userId: string, period = 'lifetime') {
  return readMemberUsage(getDb(), own, userId, period);
}
async function job(userId: string, workspaceId = own, operation = 'generate_image') {
  const id = randomUUID();
  await db.query(
    `INSERT INTO generation_job (id,workspace_id,created_by_user_id,provider,model_id,operation,idempotency_key,status,attempt_count)
    VALUES ($1::uuid,$2,$3,'fake','fake-model',$4,$1::text,'running',1)`,
    [id, workspaceId, userId, operation],
  );
  return id;
}
async function event(
  id: string,
  userId: string,
  cost: string | null,
  revision = 0,
  operation = 'generate_image',
) {
  await db.query(
    `INSERT INTO usage_event(id,workspace_id,generation_job_id,created_by_user_id,provider,model_id,operation,attempt_count,call_index,succeeded,provider_cost_usd,total_tokens)
    VALUES($1,$2,$3,$4,'fake','fake-model',$5,1,$6,true,$7,10)`,
    [randomUUID(), own, id, userId, operation, revision, cost],
  );
}
const result = (costUsd?: number) => ({
  content: 'fake',
  model: 'fake',
  provider: 'fake',
  toolCalls: [],
  usage: { costUsd, promptTokens: 2, completionTokens: 3, totalTokens: 5 },
});
try {
  for (const [id, name] of [
    [owner, 'Owner'],
    [member, 'Member'],
    [admin, 'Admin'],
  ]) {
    await db.query(
      `INSERT INTO "user"(id,name,identity_subject,terms_accepted_at,terms_version) VALUES($1,$2,$3,now(),'test')`,
      [id, name, `${issuer}#${id}`],
    );
  }
  for (const id of [own, other])
    await db.query(
      `INSERT INTO workspace(id,name,kind,created_by_user_id) VALUES($1,'Budget QA','team',$2)`,
      [id, owner],
    );
  await db.query(
    `INSERT INTO membership(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member'),($1,$4,'admin'),($5,$2,'owner'),($5,$3,'member')`,
    [own, owner, member, admin, other],
  );
  assert.equal((await ownedBudgetWorkspaces(issuer, owner)).length, 2);
  assert.deepEqual(await ownedBudgetWorkspaces(issuer, member), []);
  const projected = {
    issuer,
    subject: owner,
    workspaceId: own,
    apiKey: 'fake-valid-credential',
    keyHash: `hash-${own}`,
  };
  assert.equal((await projectBudgetConnection(projected)).status, 200);
  for (const id of [owner, member, admin])
    assert.equal((await resolveOpenRouterCredential(id, own)).apiKey, projected.apiKey);
  await assert.rejects(getMemberBudgets(randomUUID(), own), /Нет доступа/);
  assert.equal((await getMemberBudgets(member, own)).members.length, 1);
  for (const actor of [member, admin])
    await assert.rejects(updateMemberBudget(actor, own, member, defaults), /владелец/);
  await policy(member);
  await assert.rejects(updateMemberBudget(owner, own, member, defaults), /уже изменён/);
  const first = await job(member),
    second = await job(member);
  const dispatch = await Promise.allSettled([
    markProviderCallDispatched(first, 1),
    markProviderCallDispatched(second, 1),
  ]);
  assert.equal(
    dispatch.filter((r) => r.status === 'fulfilled').length,
    1,
    'only one limited call may dispatch',
  );
  const admitted = dispatch[0].status === 'fulfilled' ? first : second;
  assert.equal((await usage(member)).unresolved, 1);
  await assert.rejects(
    withMemberChatBudget(own, member, 'fake', async () => assert.fail('pending image blocks chat')),
    /уточняется/,
  );
  await event(admitted, member, '0.75');
  await event(admitted, member, '0.80', 1);
  assert.equal((await usage(member)).spentUsd, '0.80000000');
  assert.equal((await usage(member)).requests, 1, 'reconciliation replaces rather than adds cost');
  await withMemberChatBudget(own, member, 'fake', async () => result(0.3));
  const over = await usage(member);
  assert.equal(over.spentUsd, '1.10000000');
  assert.equal(over.assistant, 1);
  assert.equal(over.totalTokens, '15');
  await assert.rejects(markProviderCallDispatched(await job(member), 1), /исчерпан/);
  await assert.rejects(
    withMemberChatBudget(own, member, 'fake', async () => assert.fail('exhausted budget')),
    /исчерпан/,
  );
  // An independent workspace and another participant are unaffected.
  await markProviderCallDispatched(await job(member, other), 1);
  await withMemberChatBudget(own, admin, 'fake', async () => result(0.15));
  assert.equal((await usage(admin)).spentUsd, '0.15000000');
  const video = await job(admin, own, 'generate_video');
  await markProviderCallDispatched(video, 1);
  await event(video, admin, '0.4', 0, 'generate_video');
  assert.equal((await usage(admin)).videos, 1);
  await assert.rejects(withMemberChatBudget(own, admin, 'fake', async () => {
    throw new OpenRouterRequestError('paid failure', 'provider_failure', false, 502, undefined, { costUsd: 0.1, totalTokens: 5, promptTokens: 2, completionTokens: 3 });
  }), /paid failure/);
  assert.equal((await usage(admin)).spentUsd, '0.65000000');
  assert.equal((await usage(admin)).unresolved, 0);
  await withMemberChatBudget(own, admin, 'fake', async () => result(0.0000001));
  assert.equal((await usage(admin)).spentUsd, '0.65000010');
  await policy(member, { limitUsd: '2' });
  await policy(admin, { enabled: false, limitUsd: null });
  await assert.rejects(
    withMemberChatBudget(own, admin, 'fake', async () => assert.fail('disabled member')),
    /отключил/,
  );
  await db.query(`DELETE FROM membership WHERE workspace_id=$1 AND user_id=$2`, [own, member]);
  await assert.rejects(markProviderCallDispatched(await job(member), 1), /отозвано/);
  assert.equal((await getMemberBudgets(owner, own)).members.find((m) => m.userId === member)?.role, null);
  await db.query(`INSERT INTO membership(workspace_id,user_id) VALUES($1,$2)`, [own, member]);
  assert.equal((await usage(member)).spentUsd, '1.10000000', 'rejoining does not reset spend');
  // Month cutoff affects known costs, never unsettled calls from the previous month.
  await db.query(
    `INSERT INTO workspace_ai_chat_call(id,workspace_id,user_id,model,status,cost_usd,created_at)
    VALUES($1,$2,$3,'fake','succeeded',9,date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 second')`,
    [randomUUID(), own, owner],
  );
  assert.equal((await usage(owner, 'month')).spentUsd, '0');
  assert.equal((await usage(owner)).spentUsd, '9.00000000');
  await policy(owner, { period: 'month', limitUsd: '1' });
  await db.query(
    `INSERT INTO workspace_ai_chat_call(id,workspace_id,user_id,model,created_at)
    VALUES($1,$2,$3,'fake',now()-interval '2 months')`,
    [randomUUID(), own, owner],
  );
  await assert.rejects(
    getDb().transaction((tx) => authorizeMemberDispatch(tx, own, owner)),
    /уточняется/,
  );
  await policy(member, { limitUsd: null });
  await assert.rejects(
    withMemberChatBudget(own, member, 'fake', async () => {
      throw new Error('lost response');
    }),
    /lost response/,
  );
  await policy(member, { limitUsd: '5' });
  await assert.rejects(
    withMemberChatBudget(own, member, 'fake', async () => assert.fail('unknown outcome')),
    /уточняется/,
  );
  // Ownership changes leave the same workspace credential and usage in place.
  await db.query(
    `UPDATE membership SET role=CASE WHEN user_id=$2 THEN 'member'::membership_role ELSE 'owner'::membership_role END WHERE workspace_id=$1 AND user_id IN ($2,$3)`,
    [own, owner, admin],
  );
  assert.equal((await projectBudgetConnection(projected)).status, 200);
  assert.equal((await resolveOpenRouterCredential(admin, own)).apiKey, projected.apiKey);
  assert.equal((await getMemberBudgets(admin, own)).canManage, true);
  assert.equal((await getMemberBudgets(owner, own)).canManage, false);
  assert.equal((await usage(member)).spentUsd, '1.10000000');
  console.info(
    'Workspace budgets: shared key, user attribution, access, concurrency, overrun, reconciliation, month boundary and ownership transfer passed',
  );
} finally {
  await Promise.all([db.end(), getCoordinationPool().end()]);
}
