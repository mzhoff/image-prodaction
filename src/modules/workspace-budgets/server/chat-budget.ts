import { and, eq, isNull } from 'drizzle-orm';
import { OpenRouterRequestError, type ToolCallingLanguageModelResult } from '@prodactionpro/chat-connectors';
import { getDb } from '@/shared/db/client';
import { workspaceAiChatCall } from '@/shared/db/schema/workspace-budget';
import { createUuidV7 } from '@/shared/lib/id';
import { normalizeProviderCostUsd } from '@/shared/lib/provider-cost-decimal';
import { authorizeMemberDispatch } from './member-budget-service';

export async function withMemberChatBudget(
  workspaceId: string,
  userId: string,
  model: string,
  call: () => Promise<ToolCallingLanguageModelResult>,
) {
  const id = createUuidV7();
  await getDb().transaction(async (tx) => {
    await authorizeMemberDispatch(tx, workspaceId, userId);
    await tx.insert(workspaceAiChatCall).values({ id, workspaceId, userId, model });
  });
  try {
    const result = await call();
    await settle(id, 'succeeded', result.usage);
    return result;
  } catch (error) {
    // An ambiguous failure never releases spending authority as an invented zero cost.
    await settle(id, 'failed', error instanceof OpenRouterRequestError ? error.usage : undefined).catch(
      () => undefined,
    );
    throw error;
  }
}
async function settle(id: string, status: string, usage?: ToolCallingLanguageModelResult['usage']) {
  const raw = usage?.costUsd;
  const decimal =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1e12
      ? normalizeProviderCostUsd(raw.toFixed(12))
      : null;
  const costUsd = decimal === '0' && raw !== 0 ? null : decimal;
  const token = (value: number | undefined) =>
    value !== undefined && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  await getDb()
    .update(workspaceAiChatCall)
    .set({
      status: costUsd === null ? 'unknown' : status,
      costUsd,
      inputTokens: token(usage?.promptTokens),
      outputTokens: token(usage?.completionTokens),
      totalTokens: token(usage?.totalTokens),
    })
    .where(and(eq(workspaceAiChatCall.id, id), isNull(workspaceAiChatCall.costUsd)));
}
