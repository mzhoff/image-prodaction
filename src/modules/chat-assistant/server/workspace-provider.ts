import { withMemberChatBudget } from '@/modules/workspace-budgets/server/chat-budget';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';
import type { ToolCallingLanguageModelGateway } from '@prodactionpro/chat-connectors';
import { withPaidCredential } from '@/modules/provider-connections/server/paid-request-guard';
import { AgentTurnError, type ChatApplicationOptions } from '@prodactionpro/chat-application';
import { resolveOpenRouterCredential, markOpenRouterProviderUsed } from '@/modules/provider-connections/server/provider-connection-service';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/core/provider-connection-errors';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import type { ChatAssistantServerConfig } from './config';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway';

type Resolver = NonNullable<ChatApplicationOptions['assistantProviderResolver']>;

interface Dependencies {
  resolve(userId: string, workspaceId: string): Promise<{ apiKey: string; connection: { id: string } }>;
  markUsed(connectionId: string): Promise<void>;
  gateway(apiKey: string): ToolCallingLanguageModelGateway;
}
export function createWorkspaceProviderResolver(config: ChatAssistantServerConfig, dependencies: Dependencies = {
  resolve: resolveOpenRouterCredential,
  markUsed: markOpenRouterProviderUsed,
  gateway: (apiKey: string) => new LimitedOpenRouterGateway({
    apiKey, appTitle: 'Reverie Image Production Assistant', baseUrl: config.openRouterBaseUrl,
    httpReferer: config.openRouterSiteUrl, maxOutputTokens: config.maxOutputTokens,
    // A retry is a separate paid admission, never a hidden call within one ledger entry.
    maxAttempts: 1, retryDeadlineMs: config.providerRetryDeadlineMs,
    retryBaseDelayMs: config.providerRetryBaseDelayMs, timeoutMs: config.providerRequestTimeoutMs,
  }),
}): Resolver {
  return async ({ principal }) => {
    if (principal.productId !== CHAT_ASSISTANT_PRODUCT_ID || !principal.userId || !principal.tenantId) {
      throw new AgentTurnError('Рабочее пространство недоступно.', 'WORKSPACE_REQUIRED', 403, false);
    }
    try {
      // Resolve membership and the current credential on every turn. The composition is shared;
      // credentials and gateways are deliberately not cached across users or workspaces.
      const { apiKey, connection } = await dependencies.resolve(principal.userId, principal.tenantId);
      await dependencies.markUsed(connection.id);
      const gateway = dependencies.gateway(apiKey);
      return {
        capabilities: { inputModalities: ['text', 'image'], supportsImageInputWithTools: true, toolCalling: true },
        connectionId: connection.id,
        providerId: 'openrouter',
        toolCallingLanguageModelGateway: {
          completeWithTools: async (input) => {
            try { return await withPaidCredential(apiKey, () => withMemberChatBudget(principal.tenantId!,principal.userId,input.model,() => gateway.completeWithTools(input))); }
            catch (error) {
              if (error instanceof MemberBudgetError) throw new AgentTurnError(error.message,error.code,error.status,false);
              throw error;
            }
          },
        },
      };
    } catch (error) {
      if (error instanceof ProviderConnectionNotConfiguredError) {
        throw new AgentTurnError('Подключите AI-бюджет в настройках пространства. Генерации и Ask AI используют один баланс.',
          'WORKSPACE_PROVIDER_REQUIRED', 409, false);
      }
      throw error;
    }
  };
}
