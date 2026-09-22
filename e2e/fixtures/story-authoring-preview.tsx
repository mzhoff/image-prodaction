'use client';

// UI fixture: synthetic transport; no model calls or writes to story storage.
import { useCallback, useMemo, useState } from 'react';
import type { ChatTransport } from '@prodactionpro/chat-sdk';
import type { ChatMessage, ToolCallRecord } from '@prodactionpro/chat-domain';
import { ChatRuntimeProvider, useCreateChatRuntime } from '@prodactionpro/chat-runtime-react';
import { StoryAuthoringProvider } from '@/features/chat-assistant/ui/story-authoring-provider';
import { ChatContent } from '@/features/chat-assistant/ui/image-production-chat-content';
import { STORY_BLUEPRINT_PRESENTATION, STORY_BLUEPRINT_TOOL, STORY_QUESTION_TOOL } from '@/modules/chat-assistant/contracts/story-authoring';
import { StoryBlueprintDocument } from '@/pages/stories/ui/story-blueprint-document';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';

const storyId = 'fixture-story', conversationId = 'fixture-story-conversation', now = new Date().toISOString();
const initial: StoryProject = { id: storyId, workspaceId: 'fixture', name: 'Бумажный кораблик', revision: 0, folderId: null, createdAt: now, updatedAt: now,
  snapshot: { schemaVersion: 2, settings: { format: 'advert', genre: 'comedy', presetVersion: 1, aspectRatio: '16:9', targetDurationSeconds: 30, language: 'ru' }, blueprint: { purpose: '', audience: '', script: '', visualStyle: '' }, scenes: [] } };
const blueprint = { purpose: 'Даже маленький шаг помогает найти друзей.', audience: 'Семейная аудитория, дети 6–10 лет.', script: 'Бумажный кораблик\n\nРаннее утро. Маленький кораблик стоит у края огромной лужи. Лёгкий ветерок подталкивает его в путь.\n\nВ середине лужи он замечает намокшую бумажную птицу. Кораблик поворачивает, подбирает её и вместе с ней достигает берега.\n\nНа берегу птица расправляет крылья. Оба смеются: их большое приключение только начинается.', visualStyle: 'Тактильная бумага, мягкий утренний свет и спокойные голубые оттенки.' };
const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', createdAt: now, blocks: [{ type: 'text', content: 'Давай сделаем короткую историю про бумажный кораблик, который ищет друга.' }] },
  { id: 'a1', role: 'assistant', createdAt: now, blocks: [{ type: 'markdown', content: 'Кораблик впервые покидает берег. Большая лужа становится для него целым океаном. Осталось выбрать настроение финала.' }] },
];
const question: ToolCallRecord = { id: 'q1', conversationId, messageId: 'u1', toolName: STORY_QUESTION_TOOL, status: 'completed', riskLevel: 'read', createdAt: now, updatedAt: now,
  output: { action: 'story-question', interactionId: 'q1', question: 'Как закончим путешествие кораблика?', options: [{ label: 'Тёплая встреча', description: 'Кораблик находит друга и возвращается с ним домой.' }, { label: 'Новое приключение', description: 'Герои отправляются дальше — финал остаётся открытым.' }] } };
const proposal: ToolCallRecord = { id: 'save1', conversationId, toolName: STORY_BLUEPRINT_TOOL, riskLevel: 'write', status: 'needs-confirmation', createdAt: now, updatedAt: now,
  approvalToken: 'fixture-only', approvalExpiresAt: '2099-01-01T00:00:00Z', presentationType: STORY_BLUEPRINT_PRESENTATION, safePreview: { submitAuthorized: true, storyId, expectedRevision: 0 } };
export default function StoryAuthoringPreview() {
  const workspace = useWorkspaceShell();
  const [story, setStory] = useState(initial), [expanded, setExpanded] = useState(false);
  const transport = useMemo(() => ({
    streamTurn: async (input, options) => {
      options?.onEvent?.({ event: 'tool_call_requested', data: proposal });
      return { conversationId, turnId: 'fixture-turn', userMessage: { id: 'u2', role: 'user', createdAt: new Date().toISOString(), blocks: [{ type: 'text', content: input.message }], metadata: { selectedAction: input.selectedAction } },
        assistantMessage: { id: 'a2', role: 'assistant', createdAt: new Date().toISOString(), blocks: [{ type: 'text', content: 'Собираю эту версию истории в blueprint.' }] } };
    },
    confirmToolCall: async () => ({ ...proposal, status: 'completed', output: { action: 'story-blueprint-saved', storyId, revision: 1 } }),
    subscribeConversationEvents: () => ({ close() {}, closed: new Promise<void>(() => {}), ready: Promise.resolve() }),
  } as Partial<ChatTransport> as ChatTransport), []);
  const runtime = useCreateChatRuntime({ transport, welcomeMessage: false, initialState: { conversationId, messages, phase: 'idle', selectedMode: 'general-chat', selectedModel: 'openai/gpt-5.4-nano', pendingToolCalls: [question] } });
  const saved = useCallback(async () => { setStory({ ...initial, revision: 1, snapshot: { ...initial.snapshot, blueprint } }); setExpanded(true); }, []);
  return <div className="production-home story-home" data-mode="storyboard"><header className="production-home-header"><h1>UI-проверка · тестовые ответы, без модели</h1><button onClick={() => setExpanded(!expanded)}>Blueprint</button></header>
    <section className={`production-home-conversation story-authoring-workspace ${expanded ? 'is-document-open' : ''}`}><aside className="story-authoring-chat"><header className="story-authoring-chat-header" hidden={!expanded}>Соавтор</header><div className="story-authoring-chat-content">
      <ChatRuntimeProvider runtime={runtime}><StoryAuthoringProvider id={storyId} revision={story.revision} dirty={false} onSaved={saved}>
        {workspace.activeWorkspace ? <ChatContent workspaceId={workspace.activeWorkspace.id} model="openai/gpt-5.4-nano" story={{ fullscreen: !expanded, notice: null, welcome: null }} /> : null}
      </StoryAuthoringProvider></ChatRuntimeProvider></div></aside>
      <div className="story-authoring-document"><StoryBlueprintDocument story={story} folders={[]} onChange={setStory} /></div>
    </section></div>;
}
