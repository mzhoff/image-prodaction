import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { membership } from '@/shared/db/schema/workspace';
import { workspaceAiMemberPolicy } from '@/shared/db/schema/workspace-budget';
import type { MemberBudgetData, MemberBudgetPolicy } from '../contracts/member-budget';
import { checkMemberBudget, MemberBudgetError, usdUnits } from '../core/member-budget-policy';
import { readMemberUsage, type BudgetTransaction } from './member-usage';

export async function lockMemberBudget(tx: BudgetTransaction, workspaceId: string, userId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`member-budget:${workspaceId}:${userId}`},0))`,
  );
}
export async function authorizeMemberDispatch(tx: BudgetTransaction, workspaceId: string, userId: string) {
  await lockMemberBudget(tx, workspaceId, userId);
  const [member] = await tx
    .select()
    .from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
    .for('share');
  if (!member)
    throw new MemberBudgetError('workspace_membership_required', 'Участие в пространстве отозвано.');
  const [stored] = await tx
    .select()
    .from(workspaceAiMemberPolicy)
    .where(
      and(eq(workspaceAiMemberPolicy.workspaceId, workspaceId), eq(workspaceAiMemberPolicy.userId, userId)),
    );
  const policy = stored ?? { enabled: true, limitUsd: null, period: 'lifetime', mode: 'observed' };
  const usage =
    policy.limitUsd === null
      ? { spentUsd: '0', unresolved: 0 }
      : await readMemberUsage(tx, workspaceId, userId, policy.period);
  checkMemberBudget(
    { ...policy, mode: policy.mode as MemberBudgetPolicy['mode'] },
    usage.spentUsd,
    usage.unresolved,
  );
}
export async function getMemberBudgets(actorId: string, workspaceId: string): Promise<MemberBudgetData> {
  return getDb().transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, actorId)))
      .for('share');
    if (!actor) throw new MemberBudgetError('workspace_membership_required', 'Нет доступа к пространству.');
    const canManage = actor.role === 'owner';
    const rows = await tx.execute(sql`
      WITH people AS (
        SELECT user_id FROM membership WHERE workspace_id=${workspaceId}::uuid
        UNION SELECT created_by_user_id FROM usage_event WHERE workspace_id=${workspaceId}::uuid
        UNION SELECT user_id FROM workspace_ai_chat_call WHERE workspace_id=${workspaceId}::uuid
      ) SELECT u.id AS "userId",u.name,m.role FROM people p JOIN "user" u ON u.id=p.user_id
      LEFT JOIN membership m ON m.user_id=u.id AND m.workspace_id=${workspaceId}::uuid
      WHERE ${canManage} OR u.id=${actorId} ORDER BY u.name,u.id`);
    const members = [];
    for (const raw of rows.rows) {
      const person = raw as { userId: string; name: string; role: 'owner' | 'admin' | 'member' | null };
      const [stored] = await tx
        .select()
        .from(workspaceAiMemberPolicy)
        .where(
          and(
            eq(workspaceAiMemberPolicy.workspaceId, workspaceId),
            eq(workspaceAiMemberPolicy.userId, person.userId),
          ),
        );
      const policy = stored ?? {
        enabled: true,
        limitUsd: null,
        period: 'lifetime',
        mode: 'observed',
        revision: 0,
      };
      members.push({
        ...person,
        enabled: policy.enabled,
        limitUsd: policy.limitUsd,
        period: policy.period as MemberBudgetPolicy['period'],
        mode: policy.mode as MemberBudgetPolicy['mode'],
        revision: policy.revision,
        ...(await readMemberUsage(tx, workspaceId, person.userId, policy.period)),
      });
    }
    return { workspaceId, canManage, members };
  });
}
export async function updateMemberBudget(
  actorId: string,
  workspaceId: string,
  userId: string,
  input: MemberBudgetPolicy,
) {
  if (input.limitUsd !== null) usdUnits(input.limitUsd);
  await getDb().transaction(async (tx) => {
    await lockMemberBudget(tx, workspaceId, userId);
    const [actor] = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, actorId)))
      .for('share');
    if (actor?.role !== 'owner')
      throw new MemberBudgetError(
        'workspace_owner_required',
        'Лимитами участников управляет владелец пространства.',
      );
    const [member] = await tx
      .select()
      .from(membership)
      .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId)))
      .for('share');
    if (!member)
      throw new MemberBudgetError(
        'workspace_membership_required',
        'Участник больше не состоит в пространстве.',
      );
    const [prior] = await tx
      .select()
      .from(workspaceAiMemberPolicy)
      .where(
        and(eq(workspaceAiMemberPolicy.workspaceId, workspaceId), eq(workspaceAiMemberPolicy.userId, userId)),
      );
    if ((prior?.revision ?? 0) !== input.revision)
      throw new MemberBudgetError('member_budget_conflict', 'Лимит уже изменён. Обновите данные.', 409);
    const values = {
      workspaceId,
      userId,
      enabled: input.enabled,
      limitUsd: input.limitUsd,
      period: input.period,
      mode: input.mode,
      revision: input.revision + 1,
      updatedBy: actorId,
      updatedAt: new Date(),
    };
    await tx
      .insert(workspaceAiMemberPolicy)
      .values(values)
      .onConflictDoUpdate({
        target: [workspaceAiMemberPolicy.workspaceId, workspaceAiMemberPolicy.userId],
        set: values,
      });
  });
}
