'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useAssistantConversation } from '@/shared/assistant/model/use-assistant-conversation';
import { loadEditorConversation } from '../api/editor-conversation-api';
import { useAssistantRuntime } from '@/shared/assistant/model/use-assistant-runtime';

import { StoryCharacterChatProvider, type StoryCharacterChatContext } from './story-character-chat';
import { CreatedDocumentMessage } from './created-document-message';
import { StoryAuthoringProvider } from './story-authoring-provider';

import { AiAccessBoundary, useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChatRuntimeProvider } from '@prodactionpro/chat-runtime-react';
import { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';
import { useChatAssistantConfig } from '../model/use-chat-assistant-config';
import { AssistantNotice } from './chat-attachment-presentation';
import { ChatContent } from './image-production-chat-content';
import type { HomeSubjectChoice } from '../api/home-subject-api';

export interface StoryChatPresentation {
  fullscreen?: boolean;
  isNew?: boolean;
  ensurePersisted?: () => Promise<unknown>;
  revision: number;
  onBlueprintSaved?: (revision: number, view: 'blueprint' | 'storyboard' | 'characters') => Promise<void>;
  sceneRequest?: number;
  characterContext?: StoryCharacterChatContext;
  characterRequest?: { id: number; text: string };
  onBusyChange?: (busy: boolean) => void;
  subjects?: HomeSubjectChoice[];
  onSubjectsChange?: (subjects: HomeSubjectChoice[]) => void;
}

export function StoryBlueprintChat({ id, workspaceId, dirty, ...presentation }: { id: string; workspaceId: string; dirty: boolean } & StoryChatPresentation) {
  const tUi = useTranslations();
  const config = useChatAssistantConfig(workspaceId);
  const [newSession] = useState(Boolean(presentation.isNew));
  const load = useCallback((signal: AbortSignal) => newSession ? Promise.resolve(undefined) : loadEditorConversation({ id, workspaceId, kind: 'story', signal }), [id, workspaceId, newSession]);
  const binding = useAssistantConversation(`${workspaceId}:${id}`, load);
  const conversationId = binding.state.phase === 'ready' ? binding.state.conversationId : undefined;
  if (binding.state.phase === 'error') return <AssistantNotice action={binding.reload} actionLabel={tUi("Повторить")}>{binding.state.message}</AssistantNotice>;
  if (config.state.phase === 'error') return <AssistantNotice action={config.reload} actionLabel={tUi("Повторить")}>{config.state.message}</AssistantNotice>;
  if (config.state.phase !== 'ready' || binding.state.phase !== 'ready') return <AssistantNotice>{tUi("Подключаю соавтора…")}</AssistantNotice>;
  if (!config.state.value.enabled) return <AssistantNotice action={config.reload} actionLabel={tUi("Проверить доступ")}>{tUi("Ассистент пока недоступен.")}</AssistantNotice>;
  return <AiAccessBoundary key={workspaceId} workspaceId={workspaceId}><StoryChatRuntime key={`${workspaceId}:${id}`} workspaceId={workspaceId} id={id} conversationId={conversationId} model={config.state.value.model} dirty={dirty} {...presentation} /></AiAccessBoundary>;
}
function StoryChatRuntime({ workspaceId, id, conversationId, model, dirty, ...presentation }: { workspaceId: string; id: string; conversationId?: string; model: string; dirty: boolean; accessNotice?: ReactNode } & StoryChatPresentation) {
  const tUi = useTranslations();
  const accessGate = useAiAccessGate();
  const prepare = useRef(presentation.ensurePersisted);
  useLayoutEffect(() => { prepare.current = presentation.ensurePersisted; }, [presentation.ensurePersisted]);
  const transport = useMemo(() => createImageProductionChatClient(workspaceId, { kind: 'story', id }, () => prepare.current?.() ?? Promise.resolve()), [workspaceId, id]);
  const focusedCharacterId = presentation.characterContext?.focused?.id;
  const context = useMemo(() => ({ route: `/stories/${id}?view=blueprint${focusedCharacterId ? `&character=${focusedCharacterId}` : ''}`, document: { id, revision: String(presentation.revision) } }), [id, presentation.revision, focusedCharacterId]);
  const runtime = useAssistantRuntime({ context, transport, conversationId, model, mode: 'general-chat' });
  const sentCharacterRequest = useRef(0);
  useEffect(() => {
    const request = presentation.characterRequest;
    if (!request || request.id === sentCharacterRequest.current || dirty) return;
    sentCharacterRequest.current = request.id;
    let draft = '';
    void accessGate.ensure().then((allowed) => { if (!allowed || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return; draft = runtime.getSnapshot().inputValue; return runtime.submit(request.text); }).catch((error) => { accessGate.onError(error); }).finally(() => { if (draft && !runtime.getSnapshot().inputValue) runtime.setInputValue(draft); });
  }, [presentation.characterRequest, dirty, runtime, accessGate]);
  const sentSceneRequest = useRef(0);
  useEffect(() => {
    if (!presentation.sceneRequest || presentation.sceneRequest === sentSceneRequest.current || dirty) return;
    sentSceneRequest.current = presentation.sceneRequest;
    let draft = '';
    void accessGate.ensure().then((allowed) => { if (!allowed || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return; draft = runtime.getSnapshot().inputValue; return runtime.submit('Собери первую раскадровку по сохранённому blueprint: сцены, описания кадров и длительности. Используй story_create_scenes. Медиа пока не генерируй.'); }).catch((error) => { accessGate.onError(error); }).finally(() => { if (draft && !runtime.getSnapshot().inputValue) runtime.setInputValue(draft); });
  }, [presentation.sceneRequest, dirty, runtime, accessGate]);
  return <ChatRuntimeProvider runtime={runtime}><CreatedDocumentMessage workspaceId={workspaceId} kind="storyboard" documentId={id} /><StoryAuthoringProvider id={id} revision={presentation.revision} dirty={dirty} onSaved={presentation.onBlueprintSaved} onBusyChange={presentation.onBusyChange}><StoryCharacterChatProvider value={presentation.characterContext}><ChatContent model={model} workspaceId={workspaceId} story={{
    ...presentation, saving: dirty,
    welcome: <div className="story-chat-welcome"><span>{tUi("Начнём с идеи")}</span><h3>{presentation.fullscreen ? tUi("Какую историю расскажем?") : <>{tUi("Какую историю")}<br />{tUi("расскажем?")}</>}</h3><p>{tUi("Обсудим замысел, найдём конфликт или вместе напишем первую сцену.")}</p></div>,
    notice: dirty ? <p className="story-chat-notice">{tUi("Сохраните правки, чтобы продолжить с соавтором.")}</p> : null,
  }} /></StoryCharacterChatProvider></StoryAuthoringProvider></ChatRuntimeProvider>;
}
