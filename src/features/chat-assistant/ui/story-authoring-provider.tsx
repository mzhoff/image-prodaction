'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import type { StoryQuestion } from '@/modules/chat-assistant/contracts/story-authoring';
import { STORY_WRITING_TOOLS, STORY_SCENES_TOOL, STORY_CHARACTERS_TOOL } from '@/modules/chat-assistant/contracts/story-authoring';
import { canAutoSaveStory, isStoryQuestionAnswered } from '../model/story-interactions';

type ActiveQuestion = { question: StoryQuestion; messageId: string };
const Context = createContext<{
  active?: ActiveQuestion; open: (question: ActiveQuestion) => void; close: () => void;
  storyId: string; revision: number; stop: () => void;
  busy: boolean; error: string; retry: () => void;
}>({ open: () => {}, close: () => {}, storyId: '', revision: 0, stop: () => {}, busy: false, error: '', retry: () => {} });
export const useStoryAuthoring = () => useContext(Context);

export function StoryAuthoringProvider({ children, id, revision, dirty, onSaved, onBusyChange }: {
  children: ReactNode; id: string; revision: number; dirty: boolean;
  onSaved?: (revision: number, view: 'blueprint' | 'storyboard' | 'characters') => Promise<void>; onBusyChange?: (busy: boolean) => void;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const runtime = useChatRuntime(), state = useChatRuntimeState();
  const [active, setActive] = useState<ActiveQuestion>();
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const attempted = useRef(new Set<string>()), delivered = useRef(new Set<string>()), inFlight = useRef(false);
  const canceledTurns = useRef(new Set<string>());
  const busy = saving || ['loading', 'submitting', 'streaming'].includes(state.phase);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    if (active && isStoryQuestionAnswered(state.messages, active.question.interactionId)) setActive(undefined);
  }, [active, state.messages]);
  useEffect(() => {
    if (dirty || inFlight.current || !['idle', 'error'].includes(state.phase)) return;
    const saved = state.pendingToolCalls.find((tool) => STORY_WRITING_TOOLS.includes(tool.toolName)
      && tool.status === 'completed' && ['story-blueprint-saved', 'story-scenes-saved', 'story-characters-saved'].includes(String(tool.output?.action)) && tool.output?.storyId === id
      && typeof tool.output?.revision === 'number' && tool.output.revision > revision && !delivered.current.has(tool.id));
    const proposal = state.pendingToolCalls.find((tool) => tool.conversationId === state.conversationId
      && canAutoSaveStory(tool, id, revision) && !attempted.current.has(tool.id));
    if (!saved && !proposal) return;
    inFlight.current = true; setSaving(true); setError('');
    void (async () => {
      if (saved) {
        delivered.current.add(saved.id);
        await onSaved?.(saved.output!.revision as number, saved.toolName === STORY_CHARACTERS_TOOL ? 'characters' : saved.toolName === STORY_SCENES_TOOL ? 'storyboard' : 'blueprint');
      } else if (proposal) {
        attempted.current.add(proposal.id);
        if (proposal.turnId && canceledTurns.current.has(proposal.turnId)) { await runtime.rejectToolCall(proposal.id, tEffect("Ответ остановлен пользователем.")); return; }
        const result = await runtime.confirmToolCall(proposal.id);
        if (result.status !== 'completed') throw new Error(result.errorMessage || tEffect("Не удалось сохранить blueprint. Обновите историю и попробуйте снова."));
        if (typeof result.output?.revision === 'number') {
          await onSaved?.(result.output.revision, result.toolName === STORY_CHARACTERS_TOOL ? 'characters' : result.toolName === STORY_SCENES_TOOL ? 'storyboard' : 'blueprint');
          delivered.current.add(result.id);
        }
      }
    })().catch((caught) => {
      if (saved) delivered.current.delete(saved.id);
      setError(caught instanceof Error && /[а-яё]/i.test(caught.message) ? caught.message : tEffect("Не удалось получить сохранённый blueprint. Проверьте соединение."));
    }).finally(() => { inFlight.current = false; setSaving(false); });
  }, [dirty, id, onSaved, revision, retryCount, runtime, state.conversationId, state.pendingToolCalls, state.phase]);
  const retry = () => {
    if (busy) return;
    setError('');
    // Reconcile the same signed operation; never generate a second blueprint on a transport retry.
    void runtime.loadConversation(state.conversationId!).then(() => { attempted.current.clear(); delivered.current.clear(); setRetryCount((n) => n + 1); })
      .catch(() => setError(tUi("Не удалось обновить разговор. Проверьте соединение.")));
  };
  const stop = () => {
    const snapshot = runtime.getSnapshot();
    if (snapshot.activity?.turnId) canceledTurns.current.add(snapshot.activity.turnId);
    for (const tool of snapshot.pendingToolCalls) {
      if (tool.status === 'needs-confirmation' && STORY_WRITING_TOOLS.includes(tool.toolName) && tool.turnId) canceledTurns.current.add(tool.turnId);
    }
  };
  return <Context.Provider value={{ storyId: id, revision, stop, active, open: setActive, close: () => setActive(undefined), busy: busy || dirty, error, retry }}>{children}</Context.Provider>;
}
