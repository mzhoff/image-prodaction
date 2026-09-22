import { AI_BUDGET_NOT_ACTIVATED, AI_CONNECTION_UNAVAILABLE, aiAccessErrorMessage } from '@/modules/provider-connections/core/ai-access-messages';

export type WorkspaceAiAccess = { status: 'connected' } | {
  status: 'not-activated' | 'unavailable' | 'budget-exhausted' | 'member-limit' | 'member-disabled';
  message: string;
};

const DENIAL_CODES = {
  provider_not_configured: 'not-activated', CHAT_WORKSPACE_PROVIDER_REQUIRED: 'not-activated',
  invalid_credential: 'unavailable', provider_connection_unavailable: 'unavailable', CHAT_WORKSPACE_PROVIDER_UNAVAILABLE: 'unavailable',
  payment_required: 'budget-exhausted', CHAT_WORKSPACE_BUDGET_REQUIRED: 'budget-exhausted',
  member_budget_exhausted: 'member-limit', CHAT_MEMBER_BUDGET_EXHAUSTED: 'member-limit',
  member_ai_disabled: 'member-disabled', CHAT_MEMBER_AI_DISABLED: 'member-disabled',
} as const;

/** Only exact server codes are evidence. HTTP status, prose and network failures are not. */
export function workspaceAiAccessFromError(error: unknown): WorkspaceAiAccess | undefined {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
  const nested = record?.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : undefined;
  const descriptor = record?.descriptor && typeof record.descriptor === 'object' ? record.descriptor as Record<string, unknown> : undefined;
  const code = typeof error === 'string' ? error : record?.code ?? nested?.code ?? descriptor?.code;
  if (typeof code !== 'string' || !Object.hasOwn(DENIAL_CODES, code)) return undefined;
  return { status: DENIAL_CODES[code as keyof typeof DENIAL_CODES], message: aiAccessErrorMessage(code)! };
}

export function isWorkspaceAiAccessError(error: unknown): boolean { return Boolean(workspaceAiAccessFromError(error)); }

/** Membership-protected, local connection state only. No provider call or invented zero balance. */
export async function fetchWorkspaceAiAccess(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceAiAccess> {
  const checkFailed = 'Не удалось проверить доступ к AI в этом пространстве. Повторите проверку. Это не означает, что баланс исчерпан.';
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/providers`, {
    cache: 'no-store', credentials: 'same-origin', signal: signal ?? AbortSignal.timeout(15_000),
  }).catch(() => { throw new Error(checkFailed); });
  if (!response.ok) throw new Error(checkFailed);
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('providers' in body) || !Array.isArray(body.providers)) {
    throw new Error('Не удалось прочитать состояние AI-подключения. Повторите проверку.');
  }
  const provider = body.providers.find((item: unknown) => item && typeof item === 'object' && 'provider' in item && item.provider === 'openrouter');
  if (provider?.status === 'connected') return { status: 'connected' };
  if (provider?.status === 'disconnected') return { status: 'not-activated', message: AI_BUDGET_NOT_ACTIVATED };
  if (provider?.status === 'invalid') return { status: 'unavailable', message: AI_CONNECTION_UNAVAILABLE };
  throw new Error('Состояние AI-подключения пока неизвестно. Повторите проверку.');
}
