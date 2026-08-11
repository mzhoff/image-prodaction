import {
  ChatConversationApplicationService,
  InMemoryConversationEventBus,
  ToolCallingChatAgent,
  type ChatApplicationOptions,
} from '@prodactionpro/chat-application';
import { DrizzleConversationStore } from '@prodactionpro/chat-persistence-drizzle';
import {
  createNextChatStreamRoute,
  createNextChatTurnRoute,
  createNextConversationCollectionRoute,
  createNextConversationEventsRoute,
  createNextConversationMessagesRoute,
  createNextConversationRoute,
  createNextToolConfirmRoute,
  createNextToolRejectRoute,
} from '@prodactionpro/chat-runtime-next/server';
import { getDb } from '@/shared/db/client';
import { buildImageProductionSystemPrompt } from '../core/system-prompt';
import { imageProductionKnowledgeTools } from '../contracts/image-production-tools';
import { resolveChatPrincipal } from './auth';
import { readChatAssistantConfig } from './config';
import { ImageProductionKnowledgeToolGateway } from './knowledge-tool-gateway';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway';
import { admitChatTurn } from './turn-admission';
import { resolveVerifiedChatContext } from './verified-context';

export class ChatAssistantUnavailableError extends Error {
  readonly code = 'CHAT_ASSISTANT_UNAVAILABLE';
  readonly retryable = true;
  readonly statusCode = 503;
}

let compositionPromise: Promise<ReturnType<typeof createComposition>> | undefined;

export async function getChatAssistantComposition() {
  compositionPromise ??= Promise.resolve(createComposition());
  return compositionPromise;
}

function createComposition() {
  const config = readChatAssistantConfig();
  if (!config.enabled || !config.apiKey || !config.approvalSecret) {
    throw new ChatAssistantUnavailableError('Chat assistant is not configured.');
  }

  const store = new DrizzleConversationStore(getDb());
  const eventBus = new InMemoryConversationEventBus();
  const toolGateway = new ImageProductionKnowledgeToolGateway();
  const options: ChatApplicationOptions = {
    agent: {
      maxCostUsdPerTurn: config.maxCostUsdPerTurn,
      maxSteps: config.maxToolCallsPerTurn + 1,
      maxToolCallsPerTurn: config.maxToolCallsPerTurn,
      tools: imageProductionKnowledgeTools,
    },
    allowedModelIdsByMode: {
      'knowledge-base': [config.model],
    },
    assistantProviderResolver: () => ({
      connectionId: 'env:chat-openrouter',
      providerId: 'openrouter',
      toolCallingLanguageModelGateway: new LimitedOpenRouterGateway({
        apiKey: config.apiKey!,
        appTitle: 'Reverie Image Production Assistant',
        baseUrl: config.openRouterBaseUrl,
        httpReferer: config.openRouterSiteUrl,
        maxOutputTokens: config.maxOutputTokens,
      }),
    }),
    capabilities: {
      attachments: false,
      imageGeneration: false,
      models: [config.model],
      modes: ['knowledge-base'],
      supportHandoff: false,
      toolCalls: true,
      voiceInput: false,
    },
    defaultModel: config.model,
    eventBus,
    limits: {
      maxAttachmentBytes: 0,
      maxAttachments: 0,
      maxContextMessages: 20,
      maxMessageCharacters: 4_000,
      maxTotalAttachmentBytes: 0,
    },
    systemPromptBuilder: buildImageProductionSystemPrompt,
    toolCallingLanguageModelGateway: undefined,
    toolExecution: {
      allowReadWithoutApproval: true,
      approvalSecret: config.approvalSecret,
      protectedErrorReporter: ({ cause, principal, ...safeContext }) => {
        console.error('[chat-assistant-tool-error]', {
          ...safeContext,
          cause,
          productId: principal.productId,
          tenantId: principal.tenantId,
          userId: principal.userId,
        });
      },
    },
    toolGateway,
    turnAdmissionHook: admitChatTurn,
    verifiedContextResolver: resolveVerifiedChatContext,
  };
  const backend = new ToolCallingChatAgent(store, options);
  const service = new ChatConversationApplicationService(store, options, toolGateway, eventBus);
  const routeOptions = { backend, eventBus, resolvePrincipal: resolveChatPrincipal, service };
  const messageRoutes = createNextConversationMessagesRoute(routeOptions);

  return {
    config,
    routes: {
      conversation: createNextConversationRoute(routeOptions),
      conversations: createNextConversationCollectionRoute(routeOptions),
      events: createNextConversationEventsRoute(routeOptions),
      messagesGet: messageRoutes.GET,
      messagesPost: messageRoutes.POST,
      toolConfirm: createNextToolConfirmRoute(routeOptions),
      toolReject: createNextToolRejectRoute(routeOptions),
      turn: createNextChatTurnRoute(routeOptions),
      turnStream: createNextChatStreamRoute(routeOptions),
    },
  };
}
