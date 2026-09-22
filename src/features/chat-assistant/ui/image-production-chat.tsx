'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAssistantRuntime } from '@/shared/assistant/model/use-assistant-runtime';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';

import { AiAccessBoundary } from '@/features/ai-access/ui/ai-access-boundary';

import {
  type ChatContextSelectors,
  type ToolLifecycleEvent,
} from '@prodactionpro/chat-domain';
import {
  ChatRuntimeProvider,
  type ChatAttachmentDropTarget,
} from '@prodactionpro/chat-runtime-react';
import { useMemo } from 'react';
import { CreatedDocumentMessage } from './created-document-message';
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
  const tUi = useTranslations();
  const { reload, state } = useChatAssistantConfig(workspaceId);
  if (!workspaceId) return <AssistantNotice>{tUi("Workspace ещё загружается…")}</AssistantNotice>;
  if (state.phase === 'idle' || state.phase === 'loading') {
    return <AssistantNotice>{tUi("Проверяю подключение ассистента…")}</AssistantNotice>;
  }
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel={tUi("Повторить")}>{state.message}</AssistantNotice>;
  }
  if (!state.value.enabled) {
    return (
      <AssistantNotice>
        {tUi("Ассистент пока недоступен. Администратор бета-теста должен завершить его настройку. Ваши проекты сохранены.")}</AssistantNotice>
    );
  }
  return (
    <AiAccessBoundary key={workspaceId} workspaceId={workspaceId}><ConfiguredChatSession
      key={`${workspaceId}:${state.value.model}:${context.document?.id ?? 'workspace'}`}
      context={context}
      documentId={context.document?.id}
      model={state.value.model}
      onFocusNode={onFocusNode}
      onPipelineChanged={onPipelineChanged}
      registerAttachmentDropTarget={registerAttachmentDropTarget}
      workspaceId={workspaceId}
    /></AiAccessBoundary>
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
  const tUi = useTranslations();
  const { reload, state } = useDocumentConversation(props.documentId, props.workspaceId);
  if (state.phase === 'loading') return <AssistantNotice>{tUi("Восстанавливаю историю ассистента…")}</AssistantNotice>;
  if (state.phase === 'error') {
    return <AssistantNotice action={reload} actionLabel={tUi("Повторить")}>{state.message}</AssistantNotice>;
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
  const transport = useMemo(() => createImageProductionChatClient(workspaceId, documentId ? { kind: 'flow', id: documentId } : undefined), [workspaceId, documentId]);
  const stableContext = useMemo(() => context, [context]);
  const runtime = useAssistantRuntime({
    context: stableContext,
    conversationId: initialConversationId, model, mode: 'product-copilot',
    onEvent: (event) => {
      if (event.event === 'done' || event.event === 'error') notifyProviderUsageUpdated(workspaceId);
    },
    onToolLifecycleEvent: (event: ToolLifecycleEvent) => {
      if (event.status === 'succeeded'
        && (event.toolName === PIPELINE_BUILD_TOOL || event.toolName === PIPELINE_UPDATE_TOOL)) {
        onPipelineChanged?.();
      }
    },
    transport,
  });
  return (
    <ChatRuntimeProvider runtime={runtime}>
      {documentId ? <CreatedDocumentMessage workspaceId={workspaceId} kind="flow" documentId={documentId} /> : null}
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
