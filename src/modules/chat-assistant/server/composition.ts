import {
  ChatAttachmentApplicationService,
  ChatConversationApplicationService,
  PersistentConversationEventBus,
  ToolCallingChatAgent,
  type ChatApplicationOptions,
} from '@prodactionpro/chat-application';
import { S3AttachmentObjectStorage } from '@prodactionpro/chat-attachments-s3';
import {
  DrizzleAttachmentStore,
  DrizzleConversationEventStore,
  DrizzleConversationStore,
  PostgresConversationEventWakeup,
} from '@prodactionpro/chat-persistence-drizzle';
import {
  createNextAttachmentCompleteUploadRoute,
  createNextAttachmentContentRoute,
  createNextAttachmentDeleteRoute,
  createNextAttachmentMetadataRoute,
  createNextAttachmentPrepareUploadRoute,
  createNextChatRetryStreamRoute,
  createNextChatStreamRoute,
  createNextChatTurnRoute,
  createNextConversationCollectionRoute,
  createNextConversationEventsRoute,
  createNextConversationMessagesRoute,
  createNextConversationRoute,
  createNextToolConfirmRoute,
  createNextToolRejectRoute,
} from '@prodactionpro/chat-runtime-next/server';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { buildImageProductionSystemPrompt } from '../core/system-prompt';
import { imageProductionTools } from '../contracts/image-production-tools';
import { designElementSelectionTool } from '../contracts/design-element-selection';
import { resolveChatPrincipal } from './auth';
import { readChatAssistantConfig } from './config';
import { ImageProductionToolGateway } from './knowledge-tool-gateway';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway';
import { admitChatTurn } from './turn-admission';
import { resolveVerifiedChatContext } from './verified-context';
import { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge';

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
  const attachmentStore = new DrizzleAttachmentStore(getDb());
  const s3AttachmentStorage = new S3AttachmentObjectStorage({
    accessKeyId: config.attachmentS3AccessKeyId,
    bucket: config.attachmentBucket!,
    endpoint: config.attachmentEndpoint,
    forcePathStyle: config.attachmentForcePathStyle,
    keyPrefix: config.attachmentKeyPrefix,
    readTtlSeconds: config.attachmentReadTtlSeconds,
    region: config.attachmentRegion,
    secretAccessKey: config.attachmentS3SecretAccessKey,
    uploadTtlSeconds: config.attachmentUploadTtlSeconds,
  });
  const attachmentService = new ChatAttachmentApplicationService(
    attachmentStore,
    s3AttachmentStorage,
    {
      maxFileBytes: config.attachmentMaxBytes,
      maxFilesPerMessage: config.attachmentMaxCount,
    },
    {
      modelDelivery: {
        defaultImageDelivery: config.attachmentModelDelivery,
        maxInlineBytes: config.attachmentMaxBytes,
      },
    },
  );
  const eventWakeup = new PostgresConversationEventWakeup(getPostgresPool(), {
    onError: (error) => console.error('[chat-assistant-event-wakeup-error]', error),
  });
  const eventBus = new PersistentConversationEventBus(
    new DrizzleConversationEventStore(getDb()),
    {
      onError: (error) => console.error('[chat-assistant-event-replay-error]', error),
      wakeup: eventWakeup,
    },
  );
  const toolGateway = new ImageProductionToolGateway(
    new ChatAttachmentAssetBridge(store, attachmentService),
  );
  const options: ChatApplicationOptions = {
    agent: {
      maxCostUsdPerTurn: config.maxCostUsdPerTurn,
      maxDurationMs: config.serverTurnDeadlineMs,
      maxSteps: config.maxToolCallsPerTurn + 1,
      maxToolCallsPerTurn: config.maxToolCallsPerTurn,
      toolCallRecovery: {
        maxAttempts: 2,
        multipleCalls: 'request-single',
      },
      tools: [...imageProductionTools, designElementSelectionTool],
    },
    allowedModelIdsByMode: {
      'knowledge-base': [config.model],
      'product-copilot': [config.model],
    },
    assistantProviderResolver: () => ({
      capabilities: {
        inputModalities: ['text', 'image'],
        supportsImageInputWithTools: true,
        toolCalling: true,
      },
      connectionId: 'env:chat-openrouter',
      providerId: 'openrouter',
      toolCallingLanguageModelGateway: new LimitedOpenRouterGateway({
        apiKey: config.apiKey!,
        appTitle: 'Reverie Image Production Assistant',
        baseUrl: config.openRouterBaseUrl,
        httpReferer: config.openRouterSiteUrl,
        maxOutputTokens: config.maxOutputTokens,
        maxAttempts: config.providerMaxAttempts,
        retryDeadlineMs: config.providerRetryDeadlineMs,
        retryBaseDelayMs: config.providerRetryBaseDelayMs,
        timeoutMs: config.providerRequestTimeoutMs,
      }),
    }),
    attachmentMessageCoordinator: store,
    attachmentService,
    capabilities: {
      attachments: true,
      imageGeneration: false,
      models: [config.model],
      modes: ['knowledge-base', 'product-copilot'],
      supportHandoff: false,
      toolCalls: true,
      voiceInput: false,
    },
    defaultModel: config.model,
    eventBus,
    limits: {
      maxAttachmentBytes: config.attachmentMaxBytes,
      maxAttachments: config.attachmentMaxCount,
      maxContextAttachments: config.attachmentMaxContextImages,
      maxContextMessages: 20,
      maxMessageCharacters: 4_000,
      maxTotalAttachmentBytes: config.attachmentMaxBytes * config.attachmentMaxCount,
    },
    modelCapabilitiesById: {
      [config.model]: {
        inputModalities: ['text', 'image'],
        supportsImageInputWithTools: true,
        toolCalling: true,
      },
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
  const routeOptions = {
    backend,
    eventBus,
    resolvePrincipal: resolveChatPrincipal,
    serverTurnDeadlineMs: config.serverTurnDeadlineMs,
    service,
  };
  const messageRoutes = createNextConversationMessagesRoute(routeOptions);
  const attachmentRouteOptions = {
    attachmentService,
    resolvePrincipal: resolveChatPrincipal,
  };

  return {
    config,
    routes: {
      attachmentComplete: createNextAttachmentCompleteUploadRoute(attachmentRouteOptions),
      attachmentContent: createNextAttachmentContentRoute(attachmentRouteOptions),
      attachmentDelete: createNextAttachmentDeleteRoute(attachmentRouteOptions),
      attachmentMetadata: createNextAttachmentMetadataRoute(attachmentRouteOptions),
      attachmentPrepare: createNextAttachmentPrepareUploadRoute(attachmentRouteOptions),
      conversation: createNextConversationRoute(routeOptions),
      conversations: createNextConversationCollectionRoute(routeOptions),
      events: createNextConversationEventsRoute(routeOptions),
      messagesGet: messageRoutes.GET,
      messagesPost: messageRoutes.POST,
      toolConfirm: createNextToolConfirmRoute(routeOptions),
      toolReject: createNextToolRejectRoute(routeOptions),
      turn: createNextChatTurnRoute(routeOptions),
      turnRetryStream: createNextChatRetryStreamRoute(routeOptions),
      turnStream: createNextChatStreamRoute(routeOptions),
    },
  };
}
