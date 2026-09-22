'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export type HomeJobSummary = Record<string, unknown> & { jobId: string };

type HomeConversationState =
  | { phase: 'loading' }
  | { phase: 'ready'; conversationId?: string; selectedMode: 'general-chat' | 'image-generation'; jobs: HomeJobSummary[] }
  | { phase: 'error'; message: string };

export function useHomeConversation(workspaceId: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const selectedId = useSearchParams()?.get('chat') ?? '';
  const loaded = useRef('');
  const [state, setState] = useState<HomeConversationState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => { loaded.current = ''; setAttempt((value) => value + 1); }, []);
  const markBound = useCallback((id: string) => { loaded.current = `${workspaceId}:${id}`; }, [workspaceId]);
  useEffect(() => {
    if (selectedId && loaded.current === `${workspaceId}:${selectedId}`) return;
    if (!selectedId) {
      loaded.current = '';
      setState({ phase: 'ready', selectedMode: 'image-generation', jobs: [] });
      return;
    }
    const controller = new AbortController();
    setState({ phase: 'loading' });
    void fetch(`/api/chat/v1/home-conversation${selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : ''}`, {
      headers: { 'x-workspace-id': workspaceId }, cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || (selectedId && typeof body.conversationId !== 'string')) throw new Error('unavailable');
      if (!controller.signal.aborted) { loaded.current = `${workspaceId}:${body.conversationId}`; setState({ phase: 'ready', conversationId: body.conversationId,
        jobs: Array.isArray(body.jobs) ? body.jobs.filter((job: unknown): job is HomeJobSummary => Boolean(job && typeof job === 'object' && 'jobId' in job && typeof job.jobId === 'string')) : [],
        selectedMode: body.selectedMode === 'general-chat' ? 'general-chat' : 'image-generation' }); }
    }).catch(() => {
      if (!controller.signal.aborted) setState({ phase: 'error', message: tEffect("Не удалось открыть разговор. Проверьте соединение и попробуйте ещё раз.") });
    });
    return () => controller.abort();
  }, [attempt, workspaceId, selectedId]);
  return { state, reload, markBound, version: attempt };
}
