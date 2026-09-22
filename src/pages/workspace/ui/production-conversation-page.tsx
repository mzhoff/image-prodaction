'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { ChatRuntimeProvider, useCreateChatRuntime } from '@prodactionpro/chat-runtime-react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useChatAssistantConfig } from '@/features/chat-assistant/model/use-chat-assistant-config';
import { ChatContent } from '@/features/chat-assistant/ui/image-production-chat-content';
import { AiAccessBoundary } from '@/features/ai-access/ui/ai-access-boundary';
import { useWorkspaceShell } from './workspace-shell-context';
import { useDocumentReturnHref } from './document-navigation';
import styles from './production-chats.module.css';

export function ProductionConversationPage({ id }: { id: string }) {
  const tUi = useTranslations();
  const { activeWorkspace } = useWorkspaceShell();
  return activeWorkspace ? <ConversationConfig key={`${activeWorkspace.id}:${id}`} id={id} workspaceId={activeWorkspace.id} /> : <p>{tUi("Загружаем пространство…")}</p>;
}
function ConversationConfig({ id, workspaceId }: { id: string; workspaceId: string }) {
  const tUi = useTranslations();
  const config = useChatAssistantConfig(workspaceId);
  if (config.state.phase !== 'ready') return <p role="status">{config.state.phase === 'error' ? config.state.message : tUi("Открываем разговор…")}</p>;
  return <AiAccessBoundary key={workspaceId} workspaceId={workspaceId}><Conversation id={id} workspaceId={workspaceId} model={config.state.value.model} /></AiAccessBoundary>;
}
function Conversation({ id, workspaceId, model }: { id: string; workspaceId: string; model: string }) {
  const tUi = useTranslations();
  const returnHref = useDocumentReturnHref();
  const transport = useMemo(() => createImageProductionChatClient(workspaceId), [workspaceId]);
  const runtime = useCreateChatRuntime({ transport, welcomeMessage: false, initialState: { conversationId: id, selectedMode: 'general-chat', selectedModel: model, phase: 'loading' } });
  useEffect(() => { void runtime.loadConversation(id).catch(() => undefined); }, [id, runtime]);
  return <div className={styles.conversation}><header><Link href={returnHref}>{tUi("← Назад")}</Link></header><ChatRuntimeProvider runtime={runtime}><ChatContent workspaceId={workspaceId} model={model} /></ChatRuntimeProvider></div>;
}
