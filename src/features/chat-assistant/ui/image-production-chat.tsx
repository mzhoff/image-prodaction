'use client';

import {
  type ChatContextSelectors,
  type ToolLifecycleEvent,
} from '@prodactionpro/chat-domain';
import {
  ChatRuntimeProvider,
  type ChatAttachmentDropTarget,
  useCreateChatRuntime,
} from '@prodactionpro/chat-runtime-react';
import { useEffect, useMemo } from 'react';
import { ChatContent } from './image-production-chat-content';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { PIPELINE_BUILD_TOOL, PIPELINE_UPDATE_TOOL } from '@/modules/chat-assistant/contracts/image-production-tools';
import { useDocumentConversation } from '../model/use-document-conversation';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { AssistantNotice } from './chat-attachment-presentation';
interface ImageProductionChatProps {
  context: ChatContextSelectors;
  onPipelineChanged?: () => void;
  onFocusNode?: (nodeId: string) => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId?: string;
}
export type AssistantAttachmentDropTarget = ChatAttachmentDropTarget;
export function ImageProductionChat({
  context,
  onPipelineChanged,
  onFocusNode,
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
      context={context}
      documentId={context.document?.id}
      model={state.value.model}
      onFocusNode={onFocusNode}
      onPipelineChanged={onPipelineChanged}
      registerAttachmentDropTarget={registerAttachmentDropTarget}
      workspaceId={workspaceId}
    />
  );
}

function ConfiguredChatSession(props: {
  context: ChatContextSelectors;
  documentId?: string;
  model: string;
  onFocusNode?: (nodeId: string) => void;
  onPipelineChanged?: () => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const { reload, state } = useDocumentConversation(props.documentId, props.workspaceId);
  if (state.phase === 'loading') return <AssistantNotice>Восстанавливаю историю ассистента…</AssistantNotice>;
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel="Повторить">{state.message}</AssistantNotice>;
  }
  return <ConfiguredChat {...props} initialConversationId={state.conversationId} onFocusNode={props.onFocusNode} />;
}

function ConfiguredChat({
  context,
  documentId,
  initialConversationId,
  model,
  onPipelineChanged,
  onFocusNode,
  registerAttachmentDropTarget,
  workspaceId,
}: {
  context: ChatContextSelectors;
  documentId?: string;
  initialConversationId?: string;
  model: string;
  onPipelineChanged?: () => void;
  onFocusNode?: (nodeId: string) => void;
  registerAttachmentDropTarget?: (target?: AssistantAttachmentDropTarget) => void;
  workspaceId: string;
}) {
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const stableContext = useMemo(() => context, [context]);
  const runtime = useCreateChatRuntime({
    context: stableContext,
    initialState: {
      conversationId: initialConversationId,
      phase: initialConversationId ? 'loading' : 'idle',
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
    welcomeMessage: false,
  });
  useEffect(() => {
    if (!initialConversationId) return;
    void runtime.loadConversation(initialConversationId).catch(() => undefined);
  }, [initialConversationId, runtime]);
  return (
    <ChatRuntimeProvider runtime={runtime}>
      <ChatContent
        model={model}
        onFocusNode={onFocusNode}
        documentId={documentId}
        registerAttachmentDropTarget={registerAttachmentDropTarget}
        workspaceId={workspaceId}
      />
    </ChatRuntimeProvider>
  );
}
