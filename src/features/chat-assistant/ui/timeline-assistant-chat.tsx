'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAssistantConversation } from '@/shared/assistant/model/use-assistant-conversation';
import { loadEditorConversation } from '../api/editor-conversation-api';
import { useAssistantRuntime } from '@/shared/assistant/model/use-assistant-runtime';

import { useCallback, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ChatRuntimeProvider } from '@prodactionpro/chat-runtime-react';
import { AiAccessBoundary } from '@/features/ai-access/ui/ai-access-boundary';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { AssistantNotice } from './chat-attachment-presentation';
import { ChatContent } from './image-production-chat-content';
import { CreatedDocumentMessage } from './created-document-message';

interface Props { id: string; workspaceId: string; revision: number; dirty: boolean; isNew?: boolean; ensurePersisted?: () => Promise<unknown> }
export function TimelineAssistantChat(props: Props) {
  const tUi = useTranslations();
  const { id, workspaceId } = props;
  const config = useChatAssistantConfig(workspaceId);
  const [newSession] = useState(Boolean(props.isNew));
  const load = useCallback((signal: AbortSignal) => newSession ? Promise.resolve(undefined) : loadEditorConversation({ id, workspaceId, kind: 'timeline', signal }), [id, workspaceId, newSession]);
  const binding = useAssistantConversation(`${workspaceId}:${id}`, load);
  const conversationId = binding.state.phase === 'ready' ? binding.state.conversationId : undefined;
  if (binding.state.phase === 'error') return <AssistantNotice action={binding.reload} actionLabel={tUi("Повторить")}>{binding.state.message}</AssistantNotice>;
  if (config.state.phase === 'error') return <AssistantNotice action={config.reload} actionLabel={tUi("Повторить")}>{config.state.message}</AssistantNotice>;
  if (config.state.phase !== 'ready' || binding.state.phase !== 'ready') return <AssistantNotice>{tUi("Подключаю монтажного помощника…")}</AssistantNotice>;
  if (!config.state.value.enabled) return <AssistantNotice action={config.reload} actionLabel={tUi("Проверить доступ")}>{tUi("Ассистент пока недоступен.")}</AssistantNotice>;
  return <AiAccessBoundary key={workspaceId} workspaceId={workspaceId}><TimelineChatRuntime key={`${workspaceId}:${id}`} {...props} conversationId={conversationId} model={config.state.value.model} /></AiAccessBoundary>;
}
function TimelineChatRuntime({ id, workspaceId, revision, dirty, ensurePersisted, conversationId, model }: Props & { conversationId?: string; model: string }) {
  const tUi = useTranslations();
  const prepare = useRef(ensurePersisted);
  useLayoutEffect(() => { prepare.current = ensurePersisted; }, [ensurePersisted]);
  const transport = useMemo(() => createImageProductionChatClient(workspaceId, { kind: 'timeline', id }, () => prepare.current?.() ?? Promise.resolve()), [workspaceId, id]);
  const context = useMemo(() => ({ route: `/create?type=timeline&document=${id}`,
    document: { id, revision: `${dirty ? 'unsaved:' : ''}${revision}` } }), [id, revision, dirty]);
  const runtime = useAssistantRuntime({ context, transport, conversationId, model, mode: 'general-chat' });
  return <ChatRuntimeProvider runtime={runtime}>
    <CreatedDocumentMessage workspaceId={workspaceId} kind="timeline" documentId={id} />
    <ChatContent workspaceId={workspaceId} model={model} timeline={{
      welcome: <div className="story-chat-welcome"><span>{tUi("Ровер · монтажный помощник")}</span><h3>{tUi("Что соберём?")}</h3><p>{tUi("Помогу с порядком кадров, темпом и параметрами. Изменения в монтаж вносите в редакторе.")}</p></div>,
      notice: dirty ? <p className="story-chat-notice" role="status">{tUi("Есть несохранённые правки. Ассистент видит последнюю сохранённую версию.")}</p> : null,
    }} />
  </ChatRuntimeProvider>;
}
