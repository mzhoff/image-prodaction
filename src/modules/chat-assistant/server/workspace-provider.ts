import { PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import { withMemberChatBudget } from '@/modules/workspace-budgets/server/chat-budget';
import type { ToolCallingLanguageModelGateway } from '@prodactionpro/chat-connectors';
import { withPaidCredential } from '@/modules/provider-connections/server/paid-request-guard';
import { AgentTurnError, type ChatApplicationOptions } from '@prodactionpro/chat-application';
import { resolveOpenRouterCredential, markOpenRouterProviderUsed } from '@/modules/provider-connections/server/provider-connection-service';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import type { ChatAssistantServerConfig } from './config';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway';
import { toWorkspaceChatError } from './workspace-provider-errors';
import { toolsForAssistantMode } from './home-tool-policy';
import { prepareComposerModelInput } from './composer-attachment-delivery';
import { readHomeTextSettings } from './home-text-settings-service';
import { createHomeTextGateway } from './home-text-gateway';

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
  return async ({ principal, request, conversationId }) => {
    if (principal.productId !== CHAT_ASSISTANT_PRODUCT_ID || !principal.userId || !principal.tenantId) {
      throw new AgentTurnError('Рабочее пространство недоступно.', 'CHAT_WORKSPACE_REQUIRED', 403, false);
    }
    try {
      // Resolve membership and the current credential on every turn. The composition is shared;
      // credentials and gateways are deliberately not cached across users or workspaces.
      const { apiKey, connection } = await dependencies.resolve(principal.userId, principal.tenantId);
      await dependencies.markUsed(connection.id);
      const story = conversationId?.startsWith('story:') ? await (await import('./story-conversation')).verifiedStoryContext(principal, conversationId) : undefined;
      const timeline = conversationId?.startsWith('timeline:') ? await (await import('./timeline-conversation')).verifiedTimelineContext(principal, conversationId) : undefined;
      const assistantModelAllowed = Boolean((story || timeline || request?.mode === 'product-copilot') && request.model && [config.model, ...PREFERRED_ANALYSIS_MODEL_IDS].includes(request.model));
      const settings = request?.mode === 'general-chat' ? await readHomeTextSettings(principal, conversationId, request.context) : undefined;
      if (request?.model && !assistantModelAllowed && (settings ? settings.model !== request.model : request.model !== config.model)) {
        throw new AgentTurnError('Выберите модель в настройках композера и отправьте запрос заново.', 'CHAT_TEXT_SETTINGS_REQUIRED', 400, false);
      }
      const gateway = settings ? createHomeTextGateway(apiKey, settings, config) : dependencies.gateway(apiKey);
      return {
        capabilities: { inputModalities: ['text', 'image', 'document', 'file'], supportsImageInputWithTools: true, toolCalling: true },
        connectionId: connection.id,
        providerId: 'openrouter',
        toolCallingLanguageModelGateway: {
          completeWithTools: async (input) => {
            try {
              const prepared = await prepareComposerModelInput(input);
              return await withPaidCredential(apiKey, () => withMemberChatBudget(principal.tenantId!,principal.userId,settings?.model ?? input.model,() => gateway.completeWithTools({ ...prepared, tools: toolsForAssistantMode(input.tools, request.mode, Boolean(story), Boolean(timeline)) })));
            }
            catch (error) {
              throw toWorkspaceChatError(error);
            }
          },
        },
      };
    } catch (error) {
      throw toWorkspaceChatError(error);
    }
  };
}
