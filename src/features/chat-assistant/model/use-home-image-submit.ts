'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ConversationIntent } from '@/modules/chat-assistant/adapters/client/conversation-start';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';

import { useChatRuntime, useChatRuntimeState, type useChatAttachments } from '@prodactionpro/chat-runtime-react';
import { useEffect, useRef, useState } from 'react';
import { createTextMessage, type ChatMessage } from '@prodactionpro/chat-domain';
import { trackBehavior } from '@/shared/analytics/client';
import { homeImageSettingsSelector, homeSubjectPreviewSchema } from '@/modules/chat-assistant/contracts/home-image-settings';
import type { HomeImageSelection } from './home-image-selection';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import type { HomeMessageSubjectPreviews } from './home-message-subjects';

export type HomeAttachments = ReturnType<typeof useChatAttachments> & { lockForSubmit: () => () => void };

export function useHomeImageSubmit(workspaceId: string, attachments: HomeAttachments, onStart?: () => void, ensureConversation?: (intent: ConversationIntent) => Promise<string>) {
  const tUi = useTranslations();
  const runtime = useChatRuntime();
  const accessGate = useAiAccessGate();
  const state = useChatRuntimeState();
  const active = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null);
  const [subjectPreviews, setSubjectPreviews] = useState<HomeMessageSubjectPreviews>({});
  useEffect(() => () => active.current?.abort(), []);

  const submit = async (settings: HomeImageSelection, subjects: HomeSubjectChoice[]) => {
    if (active.current || ['loading', 'submitting', 'streaming'].includes(state.phase)
      || attachments.isUploading || attachments.hasFailures) return;
    if (!state.inputValue.trim()) return;
    if (attachments.attachments.some((item) => item.kind !== 'image')) {
      setError(tUi("Для генерации изображения нужны JPG, PNG или WebP. Текст, видео и аудио можно обсудить в текстовом чате или Storyboard."));
      return;
    }
    const prompt = state.inputValue;
    const controller = new AbortController();
    active.current = controller;
    setPreparing(true); setError('');
    const unlockAttachments = attachments.lockForSubmit();
    try {
      if (!await accessGate.ensure() || controller.signal.aborted || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) return;
      const submitOptions = attachments.createSubmitOptions();
      const preview = createTextMessage({ content: prompt.trim(), role: 'user', conversationId: state.conversationId });
      preview.metadata = { attachments: submitOptions.attachments, homePreparing: true,
        homeSubjectPreviews: subjects.map(({ id, name, imageAssetIds }) => ({ id, name, assetId: imageAssetIds[0] })) };
      onStart?.();
      setPendingMessage(preview);
      runtime.setInputValue('');
      const conversationId = state.conversationId ?? await ensureConversation!({ message: prompt, attachments: submitOptions.attachments });
      const response = await fetch('/api/chat/v1/home-image-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
        body: JSON.stringify({ conversationId, ...settings, subjectIds: subjects.map((subject) => subject.id),
          uploadedReferenceCount: attachments.attachments.length, submitAuthorized: true }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.settingsId !== 'string') {
        const message = body?.error?.message;
        throw Object.assign(new Error(typeof message === 'string' && /[а-яё]/i.test(message) ? message
          : tUi("Не удалось подготовить генерацию. Проверьте настройки и попробуйте ещё раз.")), { code: body?.error?.code });
      }
      if (controller.signal.aborted) return;
      const pinnedPreviews = homeSubjectPreviewSchema.array().parse(body.subjectPreviews);
      setSubjectPreviews((current) => ({ ...current, [body.settingsId]: pinnedPreviews }));
      runtime.setContext(homeImageSettingsSelector(body.settingsId));
      runtime.setMode('image-generation');
      trackBehavior('ip_assistant_message_sent', { source: 'home' });
      await runtime.submit(prompt, { ...submitOptions, onOptimisticCommit: ({ optimisticMessageId }) => {
        setSubjectPreviews((current) => ({ ...current, [optimisticMessageId]: pinnedPreviews }));
        setPendingMessage(null);
        // Keep attachments until the server accepts the turn.
      } });
      await attachments.clearAfterSend();
    } catch (caught) {
      if (!controller.signal.aborted) {
        const accessDenied = accessGate.onError(caught);
        setError(accessDenied || runtime.getSnapshot().errorDetails ? '' : caught instanceof Error && /[а-яё]/i.test(caught.message)
          ? caught.message : tUi("Не удалось отправить запрос. Проверьте соединение и повторите попытку."));
        setPendingMessage(null);
        if (!runtime.getSnapshot().inputValue) runtime.setInputValue(prompt);
      }
    } finally {
      unlockAttachments();
      if (active.current === controller) { active.current = null; setPreparing(false); }
    }
  };
  return { submit, preparing, error, pendingMessage, subjectPreviews };
}
