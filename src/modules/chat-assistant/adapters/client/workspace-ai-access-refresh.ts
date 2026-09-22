import { AI_BUDGET_PAYMENT_REQUIRED, aiAccessErrorMessage } from '@/modules/provider-connections/core/ai-access-messages';
import { fetchWorkspaceAiAccess, type WorkspaceAiAccess } from './workspace-ai-access';

const CHECK_FAILED = 'Не удалось подтвердить доступ к AI. Проверьте подключение и повторите проверку. Это не означает, что баланс равен нулю.';

/** Extra budget reads happen only after an explicit refresh of a known denial. */
export async function refreshWorkspaceAiAccess(workspaceId: string, previous: WorkspaceAiAccess | undefined, force: boolean): Promise<WorkspaceAiAccess> {
  const connection = await fetchWorkspaceAiAccess(workspaceId);
  if (connection.status !== 'connected' || !force) return connection;
  if (previous?.status === 'budget-exhausted') {
    const body = await readJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/providers/openrouter/usage`);
    const usage = object(body.keyUsage);
    const remaining = usage?.limitRemaining;
    // Null can mean unavailable or unbounded; it is not proof of either zero or recovery.
    if (typeof remaining !== 'number' || !Number.isFinite(remaining)
      || typeof usage?.updatedAt !== 'string' || !Number.isFinite(Date.parse(usage.updatedAt))) throw new Error(CHECK_FAILED);
    return remaining > 0 ? connection : { status: 'budget-exhausted', message: AI_BUDGET_PAYMENT_REQUIRED };
  }
  if (previous?.status === 'member-limit' || previous?.status === 'member-disabled') {
    const [session, data] = await Promise.all([
      readJson('/api/auth/get-session'), readJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/member-budgets`),
    ]);
    const userId = object(session.user)?.id;
    if (typeof userId !== 'string' || data.workspaceId !== workspaceId || !Array.isArray(data.members)) throw new Error(CHECK_FAILED);
    const member = data.members.map(object).find((row) => row?.userId === userId);
    if (!member || typeof member.enabled !== 'boolean') throw new Error(CHECK_FAILED);
    if (!member.enabled) return { status: 'member-disabled', message: aiAccessErrorMessage('member_ai_disabled')! };
    if (member.limitUsd !== null) {
      const limit = usdUnits(member.limitUsd), spent = usdUnits(member.spentUsd);
      if (limit === undefined || spent === undefined) throw new Error(CHECK_FAILED);
      if (spent >= limit) return { status: 'member-limit', message: aiAccessErrorMessage('member_budget_exhausted')! };
    }
  }
  return connection;
}

async function readJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15_000) })
    .catch(() => { throw new Error(CHECK_FAILED); });
  if (!response.ok) throw new Error(CHECK_FAILED);
  const body = object(await response.json().catch(() => null));
  if (!body) throw new Error(CHECK_FAILED);
  return body;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function usdUnits(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,8})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, '0'));
}
