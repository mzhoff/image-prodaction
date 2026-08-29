'use client';

import {
  type ChatContextSelectors,
  type ChatAttachment,
  type ChatModelOption,
  type ToolLifecycleEvent,
} from '@prodactionpro/chat-domain';
import {
  ChatRuntimeProvider,
  ManagedAttachmentPreview,
  type ChatAttachmentDropTarget,
  useChatAttachments,
  useChatRuntime,
  useChatRuntimeActions,
  useChatRuntimeState,
  useCreateChatRuntime,
} from '@prodactionpro/chat-runtime-react';
import { ChatModuleShell } from '@prodactionpro/chat-ui';
import { useEffect, useMemo } from 'react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { bindDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';
import { PIPELINE_BUILD_TOOL, PIPELINE_UPDATE_TOOL } from '@/modules/chat-assistant/contracts/image-production-tools';
import { prepareChatMessagesForPresentation } from '../model/chat-message-presentation';
import { useDocumentConversation } from '../model/use-document-conversation';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { AssistantNotice, compactModelLabel } from './chat-attachment-presentation';
import {
  APPEARANCE,
  CHAT_STYLES,
  createAllowedModels,
  FONT_OPTIONS,
  ICON_OPTIONS,
  MESSAGE_PRESENTATION,
  MODE_OPTIONS,
  RADIUS_OPTIONS,
  SCROLL_POLICY,
  TOOL_CALL_PRESENTATION,
  TOOL_RENDERER_REGISTRY,
  VISUAL_OPTIONS,
} from './image-production-chat-options';

interface ImageProductionChatProps {
  composerKeyboardActive?: boolean;
  context: ChatContextSelectors;
  onPipelineChanged?: () => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId?: string;
}
export type AssistantAttachmentDropTarget = ChatAttachmentDropTarget;
export function ImageProductionChat({
  composerKeyboardActive = false,
  context,
  onPipelineChanged,
  registerAttachmentDropTarget,
  workspaceId,
}: ImageProductionChatProps) {
  const { reload, state } = useChatAssistantConfig(workspaceId);
  if (!workspaceId) return <AssistantNotice>Workspace ещё загружается…</AssistantNotice>;
  if (state.phase === 'idle' || state.phase === 'loading') {
    return <AssistantNotice>Проверяю подключение ассистента…</AssistantNotice>;
  }
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel="Повторить">{state.message}</AssistantNotice>;
  }
  if (!state.value.enabled) {
    return (
      <AssistantNotice>
        Ассистент безопасно выключен. Нужна серверная настройка: {state.value.missingSettings.join(', ')}.
      </AssistantNotice>
    );
  }
  return (
    <ConfiguredChatSession
      key={`${workspaceId}:${state.value.model}:${context.document?.id ?? 'workspace'}`}
      composerKeyboardActive={composerKeyboardActive}
      context={context}
      documentId={context.document?.id}
      model={state.value.model}
      onPipelineChanged={onPipelineChanged}
      registerAttachmentDropTarget={registerAttachmentDropTarget}
      workspaceId={workspaceId}
    />
  );
}

function ConfiguredChatSession(props: {
  composerKeyboardActive: boolean;
  context: ChatContextSelectors;
  documentId?: string;
  model: string;
  onPipelineChanged?: () => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const { reload, state } = useDocumentConversation(props.documentId, props.workspaceId);
  if (state.phase === 'loading') return <AssistantNotice>Восстанавливаю историю ассистента…</AssistantNotice>;
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel="Повторить">{state.message}</AssistantNotice>;
  }
  return <ConfiguredChat {...props} initialConversationId={state.conversationId} />;
}

function ConfiguredChat({
  composerKeyboardActive,
  context,
  documentId,
  initialConversationId,
  model,
  onPipelineChanged,
  registerAttachmentDropTarget,
  workspaceId,
}: {
  composerKeyboardActive: boolean;
  context: ChatContextSelectors;
  documentId?: string;
  initialConversationId?: string;
  model: string;
  onPipelineChanged?: () => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const stableContext = useMemo(() => context, [context]);
  const runtime = useCreateChatRuntime({
    context: stableContext,
    initialState: {
      selectedMode: 'product-copilot',
      selectedModel: model,
    },
    onToolLifecycleEvent: (event: ToolLifecycleEvent) => {
      if (event.status === 'succeeded'
        && (event.toolName === PIPELINE_BUILD_TOOL || event.toolName === PIPELINE_UPDATE_TOOL)) {
        onPipelineChanged?.();
      }
    },
    transport,
    welcomeMessage: initialConversationId ? false : {
      id: 'image-production-welcome:ru:v2',
      locale: 'ru',
      blocks: [{
        type: 'markdown',
        content: 'Расскажи, что хочешь создать. Я быстро подготовлю рабочий черновик пайплайна; перед изменением холста ты увидишь одно подтверждение.',
      }],
    },
  });
  useEffect(() => {
    if (!initialConversationId) return;
    void runtime.loadConversation(initialConversationId).catch(() => undefined);
  }, [initialConversationId, runtime]);
  return (
    <ChatRuntimeProvider runtime={runtime}>
      <ChatContent
        composerKeyboardActive={composerKeyboardActive}
        model={model}
        documentId={documentId}
        registerAttachmentDropTarget={registerAttachmentDropTarget}
        workspaceId={workspaceId}
      />
    </ChatRuntimeProvider>
  );
}

function ChatContent({ composerKeyboardActive, documentId, model, registerAttachmentDropTarget, workspaceId }: {
  composerKeyboardActive: boolean;
  documentId?: string;
  model: string;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const runtime = useChatRuntime();
  const state = useChatRuntimeState();
  const actions = useChatRuntimeActions();
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const attachmentController = useChatAttachments({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageOptimization: {
      maxSide: 2_048,
      outputMimeType: 'image/webp',
      quality: 0.88,
      targetFileBytes: 6 * 1024 * 1024,
    },
    maxFileBytes: 8 * 1024 * 1024,
    maxFiles: 3,
    transport,
  });
  useEffect(() => {
    if (!registerAttachmentDropTarget) return;
    registerAttachmentDropTarget(attachmentController.dropTarget);
    return () => registerAttachmentDropTarget(undefined);
  }, [attachmentController.dropTarget, registerAttachmentDropTarget]);
  useEffect(() => {
    if (!documentId || !state.conversationId) return;
    const controller = new AbortController();
    void bindDocumentConversation({
      conversationId: state.conversationId,
      documentId,
      signal: controller.signal,
      workspaceId,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [documentId, state.conversationId, workspaceId]);
  const isTyping = ['loading', 'submitting', 'streaming'].includes(state.phase);
  const presentedMessages = useMemo(
    () => prepareChatMessagesForPresentation(state.messages),
    [state.messages],
  );
  const modelOption: ChatModelOption = {
    id: model,
    label: compactModelLabel(model),
    provider: 'OpenRouter',
    description: 'Фиксированная мультимодальная модель пилота; меняется владельцем на сервере.',
    capabilities: {
      inputModalities: ['text', 'image'],
      supportsImageInputWithTools: true,
      toolCalling: true,
    },
  };

  const submit = async () => {
    if (isTyping || attachmentController.isUploading || attachmentController.hasFailures) return;
    if (!state.inputValue.trim() && attachmentController.attachments.length === 0) return;
    await runtime.submit(undefined, attachmentController.createSubmitOptions());
  };

  const renderAttachment = (attachment: ChatAttachment) => (
    'attachmentId' in attachment
      ? (
          <ManagedAttachmentPreview
            attachment={attachment}
            className="cm-message-attachment-image image-production-chat-message-attachment"
            transport={transport}
          />
        )
      : null
  );

  return (
    <div className="image-production-chat-host">
      <ChatModuleShell
        activity={state.activity}
        allModelOptions={[modelOption]}
        allowedModelIdsByMode={createAllowedModels(model)}
        appearance={APPEARANCE}
        attachmentPresentation={{
          composerPreview: 'thumbnails',
          dragAndDrop: 'custom-zone',
        }}
        chatStyleOptions={CHAT_STYLES}
        className="image-production-chat"
        errorDetails={state.errorDetails}
        fontOptions={FONT_OPTIONS}
        iconLibraryOptions={ICON_OPTIONS}
        inputValue={state.inputValue}
        isCommandMenuOpen={!composerKeyboardActive}
        isTyping={isTyping}
        messages={presentedMessages}
        managedAttachments={{
          acceptsFile: attachmentController.acceptsFile,
          acceptsMimeType: attachmentController.acceptsMimeType,
          canAdd: attachmentController.canAdd,
          inputProps: attachmentController.inputProps,
          items: attachmentController.items,
          onCancel: attachmentController.cancel,
          onRemove: attachmentController.remove,
          onRetry: attachmentController.retry,
        }}
        messagePresentation={MESSAGE_PRESENTATION}
        modeOptions={MODE_OPTIONS}
        modelOptions={[]}
        onAddFiles={(files) => { void attachmentController.addFiles(files); }}
        onAppearanceChange={() => undefined}
        onCancel={actions.cancel}
        onConfirmToolCall={(id) => { void actions.confirmToolCall(id); }}
        onInputChange={actions.setInputValue}
        onModeChange={actions.setMode}
        onModelChange={actions.setModel}
        onRejectToolCall={(id) => { void actions.rejectToolCall(id); }}
        onSubmit={() => { void submit().catch(() => undefined); }}
        onRetry={() => runtime.retryLastTurn()}
        onToggleModelForMode={() => undefined}
        radiusOptions={RADIUS_OPTIONS}
        renderAttachment={renderAttachment}
        selectedMode={state.selectedMode}
        selectedModel={state.selectedModel}
        scrollPolicy={SCROLL_POLICY}
        showAppearanceSettings={false}
        showAssistantSettings={false}
        subtitle="Image Production copilot"
        surface="side-panel"
        title="AI Assistant"
        toolCalls={state.pendingToolCalls}
        toolCallPresentation={TOOL_CALL_PRESENTATION}
        toolRendererRegistry={TOOL_RENDERER_REGISTRY}
        visualProfileOptions={VISUAL_OPTIONS}
        helperText={<span>Copilot · {compactModelLabel(model)}</span>}
      />
    </div>
  );
}
