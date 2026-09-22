import { storyAuthoringTools } from '../contracts/story-authoring';
import { assistantQuestionTool } from '../contracts/assistant-question';
import { buildStorySystemPrompt } from '../core/story-system-prompt';
import { buildTimelineSystemPrompt } from '../core/timeline-system-prompt';
import { PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import {
  ChatAttachmentApplicationService,
  ChatConversationApplicationService,
  ToolCallingChatAgent,
  type ChatApplicationOptions,
} from '@prodactionpro/chat-application';
import { S3AttachmentObjectStorage } from '@prodactionpro/chat-attachments-s3';
import {
  DrizzleAttachmentStore,
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
import { getDb } from '@/shared/db/client';
import { buildImageProductionSystemPrompt } from '../core/system-prompt';
import { imageProductionTools } from '../contracts/image-production-tools';
import { designElementSelectionTool } from '../contracts/design-element-selection';
import { resolveChatPrincipal } from './auth';
import { readChatAssistantConfig } from './config';
import { ImageProductionToolGateway } from './knowledge-tool-gateway';
import { createWorkspaceProviderResolver } from './workspace-provider';
import { admitChatTurn } from './turn-admission';
import { resolveVerifiedChatContext } from './verified-context';
import { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge';
import { CHAT_COMPOSER_MIME_TYPES } from '../contracts/composer-attachments';
import { createComposerAttachmentDelivery, verifyComposerAttachment } from './composer-attachment-delivery';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { homeGenerationTools } from '../contracts/home-generation';
import { HomeGenerationService } from './home-generation-service';
import { buildHomeSystemPrompt } from '../core/home-system-prompt';
import { effectiveHomeRequestMode } from './home-conversation-mode';
import { withProductionChatTitle } from './production-chat-title';
import { assertProductionChatWritable } from './production-chat-service';

export { getChatConversationInfrastructure } from './conversation-infrastructure';

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
  if (!config.enabled || !config.approvalSecret) {
    throw new ChatAssistantUnavailableError('Chat assistant is not configured.');
  }

  const { store, eventBus } = getChatConversationInfrastructure();
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
      allowedMimeTypes: CHAT_COMPOSER_MIME_TYPES,
    },
    {
      contentVerifier: verifyComposerAttachment,
      modelDelivery: {
        resolver: createComposerAttachmentDelivery(s3AttachmentStorage, config.attachmentMaxBytes, config.attachmentModelDelivery),
        defaultImageDelivery: config.attachmentModelDelivery,
        maxInlineBytes: config.attachmentMaxBytes,
      },
    },
  );
  const homeGeneration = new HomeGenerationService(store, attachmentService);
  const workspaceProvider = createWorkspaceProviderResolver(config);
  const toolGateway = new ImageProductionToolGateway(
    new ChatAttachmentAssetBridge(store, attachmentService),
    store,
    homeGeneration,
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
      tools: [...imageProductionTools, designElementSelectionTool, assistantQuestionTool, ...homeGenerationTools, ...storyAuthoringTools],
    },
    allowedModelIdsByMode: {
      'knowledge-base': [config.model],
      'product-copilot': [...new Set([config.model, ...PREFERRED_ANALYSIS_MODEL_IDS])],
      'general-chat': [...new Set([config.model, ...PREFERRED_ANALYSIS_MODEL_IDS])],
      'image-generation': [config.model],
    },
    assistantProviderResolver: async (input) => {
      const provider = await workspaceProvider({ ...input,
        request: { ...input.request, mode: await effectiveHomeRequestMode(input, store) } });
      return { ...provider, toolCallingLanguageModelGateway: provider.toolCallingLanguageModelGateway
        ? withProductionChatTitle(provider.toolCallingLanguageModelGateway, input.principal, input.conversationId) : undefined };
    },
    attachmentMessageCoordinator: store,
    attachmentService,
    capabilities: {
      attachments: true,
      imageGeneration: true,
      models: [...new Set([config.model, ...PREFERRED_ANALYSIS_MODEL_IDS])],
      modes: ['knowledge-base', 'product-copilot', 'general-chat', 'image-generation'],
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
      maxMessageCharacters: 20_000,
      maxTotalAttachmentBytes: config.attachmentMaxBytes * config.attachmentMaxCount,
    },
    modelCapabilitiesById: {
      ...Object.fromEntries(PREFERRED_ANALYSIS_MODEL_IDS.map((id) => [id, {
        inputModalities: ['text', 'image', 'document', 'file'], supportsImageInputWithTools: true, toolCalling: true,
      }])),
      [config.model]: {
        inputModalities: ['text', 'image', 'document', 'file'],
        supportsImageInputWithTools: true,
        toolCalling: true,
      },
    },
    systemPromptBuilder: (input) => input.requestContext?.timeline
      ? buildTimelineSystemPrompt(input.requestContext.timeline, input.requestContext.timelineHasUnsavedChanges === true)
      : input.requestContext?.storyBlueprint
      ? buildStorySystemPrompt(input.requestContext.storyBlueprint, input.requestContext.focusedStoryCharacterId)
      : input.requestContext?.homeConversation
      ? buildHomeSystemPrompt(input.requestContext.homeMode === 'general-chat' ? 'general-chat' : 'image-generation', input.requestContext.homeImageSettings)
      : buildImageProductionSystemPrompt(input),
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
    turnAdmissionHook: async (input) => {
      await admitChatTurn(input);
      if (input.conversationId) await assertProductionChatWritable(input.principal, input.conversationId);
    },
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
    homeGeneration,
    attachmentService,
    store,
    eventBus,
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
