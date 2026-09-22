'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { AiAccessBoundary } from '@/features/ai-access/ui/ai-access-boundary';

import { ChatRuntimeProvider, useCreateChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { useHomeConversation, type HomeJobSummary } from '../model/use-home-conversation';
import { AssistantNotice } from './chat-attachment-presentation';
import { ChatContent } from './image-production-chat-content';
import type { HomeComposerMode } from './home-composer-mode-switch';

interface ComposerModeProps { composerMode: HomeComposerMode; onComposerModeChange: (mode: HomeComposerMode) => void }

export function HomeProductionChat({ workspaceId, welcome, screen, ...composer }: { workspaceId: string; welcome: ReactNode; screen?: HomeComposerMode } & ComposerModeProps) {
  const tUi = useTranslations();
  const config = useChatAssistantConfig(workspaceId);
  if (config.state.phase === 'idle' || config.state.phase === 'loading') return <AssistantNotice>{tUi("Подключаю ассистента…")}</AssistantNotice>;
  if (config.state.phase === 'error') return <AssistantNotice action={config.reload} actionLabel={tUi("Повторить")}>{config.state.message}</AssistantNotice>;
  if (!config.state.value.enabled) return <AssistantNotice>{tUi("Ассистент пока недоступен. Обратитесь к администратору бета-теста.")}</AssistantNotice>;
  return <AiAccessBoundary key={workspaceId} workspaceId={workspaceId}><HomeChatSession workspaceId={workspaceId} model={config.state.value.model} welcome={welcome} screen={screen} {...composer} /></AiAccessBoundary>;
}

function HomeChatSession({ workspaceId, model, welcome, screen, ...composer }: { workspaceId: string; model: string; welcome: ReactNode; screen?: HomeComposerMode } & ComposerModeProps) {
  const tUi = useTranslations();
  const { state, reload, markBound, version } = useHomeConversation(workspaceId);
  if (state.phase === 'loading') return <AssistantNotice>{tUi("Восстанавливаю разговор…")}</AssistantNotice>;
  if (state.phase === 'error') return <AssistantNotice action={reload} actionLabel={tUi("Повторить")}>{state.message}</AssistantNotice>;
  return <HomeChatRuntime key={`${workspaceId}:${state.conversationId ?? "draft"}:${version}`} workspaceId={workspaceId}
    model={model} conversationId={state.conversationId} selectedMode={state.selectedMode} jobs={state.jobs} welcome={welcome} onNew={reload} onBound={markBound} screen={screen} {...composer} />;
}

function HomeChatRuntime({ workspaceId, model, conversationId, selectedMode, jobs, welcome, onNew, onBound, screen, composerMode, onComposerModeChange }: {
  workspaceId: string; model: string; conversationId?: string; welcome: ReactNode; onNew: () => void; onBound: (id: string) => void;
  selectedMode: 'general-chat' | 'image-generation';
  jobs: HomeJobSummary[];
  screen?: 'image' | 'video' | 'text';
} & ComposerModeProps) {
  const transport = useMemo(() => createImageProductionChatClient(workspaceId, { kind: 'home' }), [workspaceId]);
  const context = useMemo(() => ({ route: '/' }), []);
  const runtime = useCreateChatRuntime({
    context, transport, welcomeMessage: false,
    initialState: { conversationId, phase: conversationId ? 'loading' : 'idle', selectedMode, selectedModel: model },
  });
  const modeRef = useRef(selectedMode);
  modeRef.current = composerMode === 'image' ? 'image-generation' : 'general-chat';
  useEffect(() => {
    let active = true;
    if (conversationId) void runtime.loadConversation(conversationId).then(() => { if (active) runtime.setMode(modeRef.current); }).catch(() => undefined);
    return () => { active = false; };
  }, [conversationId, runtime]);
  useEffect(() => {
    runtime.setMode(composerMode === 'image' ? 'image-generation' : 'general-chat');
  }, [runtime, composerMode]);
  return <ChatRuntimeProvider runtime={runtime}>
    <HomeConversationUrlSync onBound={onBound} />
    <ChatContent model={model} workspaceId={workspaceId} home={{ welcome, onNew, ensureConversation: (intent) => runtime.getSnapshot().conversationId ? Promise.resolve(runtime.getSnapshot().conversationId!) : transport.startConversation!(intent), jobs, screen, composerMode, onComposerModeChange }} />
  </ChatRuntimeProvider>;
}

function HomeConversationUrlSync({ onBound }: { onBound: (id: string) => void }) {
  const { conversationId } = useChatRuntimeState();
  useEffect(() => {
    if (!conversationId) return;
    onBound(conversationId);
    const url = new URL(window.location.href);
    if (url.searchParams.get('chat') !== conversationId) {
      url.searchParams.set('chat', conversationId);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
  }, [onBound, conversationId]);
  return null;
}
