import { AgentTurnError } from '@prodactionpro/chat-application';
import { OpenRouterRequestError } from '@prodactionpro/chat-connectors';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/core/provider-connection-errors';
import { ProviderAdapterError } from '@/modules/provider-connections/core/provider-errors';
import { aiAccessErrorMessage, AI_BUDGET_PAYMENT_REQUIRED, AI_CONNECTION_UNAVAILABLE } from '@/modules/provider-connections/core/ai-access-messages';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';

/** ChatModule's public error contract requires CHAT_* codes, including custom product errors. */
export function toWorkspaceChatError(error: unknown): unknown {
  if (error instanceof ProviderConnectionNotConfiguredError) {
    return new AgentTurnError(error.message,
      error.unavailable ? 'CHAT_WORKSPACE_PROVIDER_UNAVAILABLE' : 'CHAT_WORKSPACE_PROVIDER_REQUIRED',
      409, false, 'conflict', 'not-started');
  }
  if (error instanceof MemberBudgetError) {
    return new AgentTurnError(aiAccessErrorMessage(error.code) ?? error.message,
      `CHAT_${error.code.toUpperCase()}`, error.status, false, 'authorization', 'not-started');
  }
  if (error instanceof OpenRouterRequestError) {
    if (error.statusCode === 402) {
      return new AgentTurnError(AI_BUDGET_PAYMENT_REQUIRED, 'CHAT_WORKSPACE_BUDGET_REQUIRED',
        402, false, 'authorization', 'not-started', undefined, error.usage);
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new AgentTurnError(AI_CONNECTION_UNAVAILABLE, 'CHAT_WORKSPACE_PROVIDER_UNAVAILABLE',
        error.statusCode, false, 'authorization', 'not-started', undefined, error.usage);
    }
  }
  if (error instanceof ProviderAdapterError && error.descriptor.code === 'rate_limited') {
    return new AgentTurnError('В этом пространстве уже выполняется AI-запрос. Дождитесь результата и повторите.',
      'CHAT_WORKSPACE_AI_BUSY', 429, true, 'rate-limit', 'not-started', error.descriptor.retryAfterMs ?? undefined);
  }
  return error;
}
