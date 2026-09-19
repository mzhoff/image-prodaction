'use client';

import type { ChatAttachment, ChatMessage, ChatModelOption } from '@prodactionpro/chat-domain';
import { ManagedAttachmentPreview, useChatAttachments, useChatRuntime, useChatRuntimeActions, useChatRuntimeState, type ChatAttachmentDropTarget } from '@prodactionpro/chat-runtime-react';
import { ChatModuleShell } from '@prodactionpro/chat-ui';
import { useTheme } from '@prodactionpro/ui-core/theme';
import { useEffect, useMemo } from 'react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { bindDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';
import { prepareChatMessagesForPresentation } from '../model/chat-message-presentation';
import { getDocumentActivityActionNode, mergeDocumentActivityMessages } from '../model/document-activity-messages';
import { useDocumentActivity } from '../model/use-document-activity';
import { useRegisterHostedChatLauncher } from '../model/chat-launcher-host';
import { compactModelLabel } from './chat-attachment-presentation';
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


const EMPTY_CHAT_WELCOME: ChatMessage = {
  id: 'image-production-welcome:ru:v2',
  role: 'assistant',
  createdAt: new Date().toISOString(),
  blocks: [{
    type: 'markdown',
    content: 'Расскажи, что хочешь создать. Я быстро подготовлю рабочий черновик пайплайна; перед изменением холста ты увидишь одно подтверждение.',
  }],
  metadata: { animate: false },
};

export function ChatContent({ documentId, model, onFocusNode, registerAttachmentDropTarget, workspaceId }: {
  documentId?: string;
  model: string;
  onFocusNode?: (nodeId: string) => void;
  registerAttachmentDropTarget?: (target?: ChatAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const runtime = useChatRuntime();
  const { resolvedTheme } = useTheme();
  const appearance = useMemo(() => ({ ...APPEARANCE, visualProfile: `product-${resolvedTheme}` }), [resolvedTheme]);
  const state = useChatRuntimeState();
  const documentActivity = useDocumentActivity(documentId, workspaceId);
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
  useRegisterHostedChatLauncher(
    runtime,
    attachmentController.items.length > 0,
    state.phase,
  );
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
    }).then((conversationId) => {
      if (controller.signal.aborted || conversationId === state.conversationId) return;
      const current = runtime.getSnapshot();
      // A document has one durable conversation, even when opened in multiple tabs.
      if (current.phase === 'idle') void runtime.loadConversation(conversationId).catch(() => undefined);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [documentId, runtime, state.conversationId, workspaceId]);
  const isTyping = ['loading', 'submitting', 'streaming'].includes(state.phase);
  const messages = useMemo(
    () => mergeDocumentActivityMessages(state.messages, documentActivity, state.conversationId),
    [documentActivity, state.conversationId, state.messages],
  );
  const presentedMessages = useMemo(
    () => prepareChatMessagesForPresentation(messages.length || state.phase !== 'idle' ? messages : [EMPTY_CHAT_WELCOME]),
    [messages, state.phase],
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
        appearance={appearance}
        attachmentPresentation={{
          composerPreview: 'thumbnails',
          dragAndDrop: 'custom-zone',
        }}
        chatStyleOptions={CHAT_STYLES}
        className="image-production-chat"
        composerKeyboardPolicy="focused"
        errorDetails={state.errorDetails}
        fontOptions={FONT_OPTIONS}
        iconLibraryOptions={ICON_OPTIONS}
        inputValue={state.inputValue}
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
        onAction={(selection) => {
          const nodeId = getDocumentActivityActionNode(selection, messages);
          if (nodeId) onFocusNode?.(nodeId);
        }}
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
