'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ConversationIntent } from '@/modules/chat-assistant/adapters/client/conversation-start';
import { notifyChatsChanged } from './use-production-chats';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';

import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { createTextMessage, type ChatMessage } from '@prodactionpro/chat-domain';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
import { trackBehavior } from '@/shared/analytics/client';
import type { HomeAttachments } from './use-home-image-submit';
import type { HomeJobSummary } from './use-home-conversation';
import type { HomeVideoSelection } from './home-video-selection';
import { clearHomeVideoAttempt, homeVideoAttemptKey } from './home-video-attempt';
import type { HomeVideoIntent } from '@/shared/media/home-video-intent';

export function useHomeVideoSubmit(workspaceId: string, attachments: HomeAttachments, enabled: boolean, onStart?: () => void, ensureConversation?: (intent: ConversationIntent) => Promise<string>) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const runtime = useChatRuntime();
  const accessGate = useAiAccessGate();
  const state = useChatRuntimeState();
  const active = useRef<AbortController | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<HomeJobSummary[]>([]);
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!enabled || !state.conversationId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ workspaceId, conversationId: state.conversationId });
    void fetch(`/api/chat/v1/home-video-generations?${query}`, {
      headers: { 'x-workspace-id': workspaceId }, signal: controller.signal, cache: 'no-store',
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.jobs)) throw new Error('unavailable');
      if (!controller.signal.aborted) setJobs(body.jobs.filter((job: HomeJobSummary) => typeof job?.jobId === 'string'));
    }).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось восстановить список видео. Обновите статус перед повторной отправкой.")); });
    return () => controller.abort();
  }, [enabled, revision, state.conversationId, workspaceId]);

  const submit = async (selection: HomeVideoSelection, intent?: HomeVideoIntent) => {
    if (!enabled || active.current || !state.inputValue.trim()
      || ['loading', 'submitting', 'streaming'].includes(state.phase) || attachments.isUploading || attachments.hasFailures) return;
    const prompt = state.inputValue;
    const controller = new AbortController(); active.current = controller;
    setPreparing(true); setError('');
    const unlockAttachments = attachments.lockForSubmit();
    try {
      if (!await accessGate.ensure() || controller.signal.aborted || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
      const conversationId = state.conversationId ?? await ensureConversation!({ message: prompt, attachments: attachments.attachments });
      const preview = createTextMessage({ content: prompt.trim(), role: 'user', conversationId });
      preview.metadata = { attachments: attachments.attachments, homePreparing: true, homeVideoIntent: intent };
      const payload = { workspaceId, conversationId, request: { ...selection, prompt: prompt.trim(), references: [] },
        attachmentIds: intent ? [] : attachments.attachments.map((item) => item.attachmentId), ...(intent ? { intent } : {}) };
      const signature = JSON.stringify(payload);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      onStart?.();
      setPendingMessage(preview); runtime.setInputValue('');
      const idempotencyKey = await homeVideoAttemptKey(conversationId, signature, attempt.current.key);
      const response = await fetch('/api/chat/v1/home-video-generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
        body: JSON.stringify({ ...payload, idempotencyKey }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.result?.jobId !== 'string') throw Object.assign(new Error(
        typeof body?.error?.message === 'string' && /[а-яё]/i.test(body.error.message) ? body.error.message
          : tUi("Не удалось подтвердить отправку. Обновите статус или повторите запрос — повторное нажатие не создаст дубликат.")), { code: body?.error?.code });
      if (controller.signal.aborted) return;
      setJobs((previous) => [...previous.filter((job) => job.jobId !== body.result.jobId), body.result]);
      setPendingMessage({ ...preview, id: body.userMessageId });
      attempt.current = null;
      clearHomeVideoAttempt(conversationId);
      trackBehavior('ip_generation_requested', { source: 'home', operation: 'generate_video' });
      await attachments.clearAfterSend().catch(() => undefined);
      await runtime.loadConversation(conversationId).then(() => setPendingMessage(null)).catch(() => undefined);
      runtime.setMode('general-chat');
      notifyChatsChanged(workspaceId);
    } catch (caught) {
      if (!controller.signal.aborted) {
        const accessDenied = accessGate.onError(caught);
        setError(accessDenied ? '' : caught instanceof Error && /[а-яё]/i.test(caught.message) ? caught.message
          : tUi("Не удалось подтвердить отправку. Обновите статус перед повторной попыткой."));
        setPendingMessage(null);
        if (!runtime.getSnapshot().inputValue) runtime.setInputValue(prompt);
      }
    } finally {
      unlockAttachments();
      if (active.current === controller) { active.current = null; setPreparing(false); }
    }
  };
  return { submit, preparing, error, pendingMessage, jobs, refresh: () => { setError(''); setRevision((value) => value + 1); } };
}
