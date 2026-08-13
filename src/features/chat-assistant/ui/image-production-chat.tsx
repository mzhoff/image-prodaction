'use client';

import {
  type ChatContextSelectors,
  type ChatModelOption,
  type ToolLifecycleEvent,
} from '@prodactionpro/chat-domain';
import {
  ChatRuntimeProvider,
  useChatRuntimeActions,
  useChatRuntimeState,
  useCreateChatRuntime,
} from '@prodactionpro/chat-runtime-react';
import {
  ChatModuleShell,
} from '@prodactionpro/chat-ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { bindDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';
import {
  PIPELINE_BUILD_TOOL,
  PIPELINE_UPDATE_TOOL,
} from '@/modules/chat-assistant/contracts/image-production-tools';
import { describeToolActivity } from '../model/chat-activity';
import { prepareChatMessagesForPresentation } from '../model/chat-message-presentation';
import { canSafelyRetryChatTurn, getLatestUserPrompt } from '../model/chat-turn-feedback';
import { useDocumentConversation } from '../model/use-document-conversation';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { ChatActivityLabel, ChatErrorRecovery } from './chat-turn-feedback';
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
  context: ChatContextSelectors;
  onPipelineChanged?: () => void;
  workspaceId?: string;
}

export function ImageProductionChat({ context, onPipelineChanged, workspaceId }: ImageProductionChatProps) {
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
      context={context}
      documentId={context.document?.id}
      model={state.value.model}
      onPipelineChanged={onPipelineChanged}
      workspaceId={workspaceId}
    />
  );
}

function ConfiguredChatSession(props: {
  context: ChatContextSelectors;
  documentId?: string;
  model: string;
  onPipelineChanged?: () => void;
  workspaceId: string;
}) {
  const { reload, state } = useDocumentConversation(props.documentId, props.workspaceId);
  if (state.phase === 'loading') return <AssistantNotice>Восстанавливаю историю ассистента…</AssistantNotice>;
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel="Повторить">{state.message}</AssistantNotice>;
  }
  return <ConfiguredChat {...props} initialConversationId={state.conversationId} />;
}

function ConfiguredChat({ context, documentId, initialConversationId, model, onPipelineChanged, workspaceId }: {
  context: ChatContextSelectors;
  documentId?: string;
  initialConversationId?: string;
  model: string;
  onPipelineChanged?: () => void;
  workspaceId: string;
}) {
  const [toolActivityLabel, setToolActivityLabel] = useState<string>();
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const stableContext = useMemo(() => context, [context]);
  const runtime = useCreateChatRuntime({
    context: stableContext,
    initialState: {
      selectedMode: 'product-copilot',
      selectedModel: model,
    },
    onToolLifecycleEvent: (event: ToolLifecycleEvent) => {
      setToolActivityLabel(describeToolActivity(event));
      if (event.status === 'succeeded'
        && (event.toolName === PIPELINE_BUILD_TOOL || event.toolName === PIPELINE_UPDATE_TOOL)) {
        onPipelineChanged?.();
      }
    },
    transport,
    welcomeMessage: initialConversationId ? false : {
      id: 'image-production-welcome:ru:v1',
      locale: 'ru',
      blocks: [{
        type: 'markdown',
        content: 'Расскажи, что хочешь создать. Я предложу план пайплайна, а после твоего согласия подготовлю ноды и связи на холсте.',
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
        model={model}
        documentId={documentId}
        onTurnStarted={() => setToolActivityLabel(undefined)}
        toolActivityLabel={toolActivityLabel}
        workspaceId={workspaceId}
      />
    </ChatRuntimeProvider>
  );
}

function ChatContent({ documentId, model, onTurnStarted, toolActivityLabel, workspaceId }: {
  documentId?: string;
  model: string;
  onTurnStarted: () => void;
  toolActivityLabel?: string;
  workspaceId: string;
}) {
  const state = useChatRuntimeState();
  const actions = useChatRuntimeActions();
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
  const canRetry = canSafelyRetryChatTurn({
    error: state.error,
    messages: state.messages,
    toolCalls: state.pendingToolCalls,
  });
  const retryPrompt = getLatestUserPrompt(state.messages);
  const presentedMessages = useMemo(
    () => prepareChatMessagesForPresentation(
      state.messages,
      {
        collapseConsecutiveDuplicateUserMessages: true,
        hideRuntimeErrors: true,
        hideToolStatusBlocks: true,
      },
    ),
    [state.messages],
  );
  const modelOption: ChatModelOption = {
    id: model,
    label: compactModelLabel(model),
    provider: 'OpenRouter',
    description: 'Фиксированная модель пилота; меняется владельцем на сервере.',
  };

  return (
    <div className="image-production-chat-host">
      <ChatModuleShell
        activityLabel={(
          <ChatActivityLabel
            active={isTyping}
            statusLabel={state.statusLabel}
            toolActivityLabel={toolActivityLabel}
          />
        )}
        allModelOptions={[modelOption]}
        allowedModelIdsByMode={createAllowedModels(model)}
        appearance={APPEARANCE}
        chatStyleOptions={CHAT_STYLES}
        className="image-production-chat"
        fontOptions={FONT_OPTIONS}
        iconLibraryOptions={ICON_OPTIONS}
        inputValue={state.inputValue}
        isTyping={isTyping}
        messages={presentedMessages}
        messagePresentation={MESSAGE_PRESENTATION}
        modeOptions={MODE_OPTIONS}
        modelOptions={[]}
        onAppearanceChange={() => undefined}
        onCancel={() => {
          onTurnStarted();
          actions.cancel();
        }}
        onConfirmToolCall={(id) => { void actions.confirmToolCall(id); }}
        onInputChange={actions.setInputValue}
        onModeChange={actions.setMode}
        onModelChange={actions.setModel}
        onRejectToolCall={(id) => { void actions.rejectToolCall(id); }}
        onSubmit={() => {
          onTurnStarted();
          void actions.submit().catch(() => undefined);
        }}
        onToggleModelForMode={() => undefined}
        radiusOptions={RADIUS_OPTIONS}
        selectedMode={state.selectedMode}
        selectedModel={state.selectedModel}
        scrollPolicy={SCROLL_POLICY}
        showAppearanceSettings={false}
        showAssistantSettings={false}
        slots={{
          beforeComposer: state.error ? (
            <ChatErrorRecovery
              canRetry={canRetry && Boolean(retryPrompt)}
              error={state.error}
              onRetry={() => {
                if (!retryPrompt) return;
                onTurnStarted();
                void actions.submit(retryPrompt).catch(() => undefined);
              }}
            />
          ) : undefined,
        }}
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

function AssistantNotice({ action, actionLabel, children }: {
  action?: () => void;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="assistant-chat-notice" role="status">
      <p>{children}</p>
      {action ? <button onClick={action} type="button">{actionLabel}</button> : null}
    </div>
  );
}

function compactModelLabel(model: string) {
  return model.split('/').at(-1) ?? model;
}
