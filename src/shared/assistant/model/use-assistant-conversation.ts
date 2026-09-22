'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useState } from 'react';

type BindingState = { phase: 'loading' } | { phase: 'ready'; conversationId?: string } | { phase: 'error'; message: string };

/** The caller resolves the product-specific document binding. Stale results cannot cross documents. */
export function useAssistantConversation(key: string, load: (signal: AbortSignal) => Promise<string | undefined>) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; state: BindingState }>({ key, state: { phase: 'loading' } });
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot({ key, state: { phase: 'loading' } });
    void load(controller.signal).then((conversationId) => {
      if (!controller.signal.aborted) setSnapshot({ key, state: { phase: 'ready', conversationId } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setSnapshot({ key, state: { phase: 'error', message: error instanceof Error ? error.message : tEffect("Не удалось открыть разговор.") } });
    });
    return () => controller.abort();
  }, [attempt, key, load]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const state: BindingState = snapshot.key === key ? snapshot.state : { phase: 'loading' };
  return { state, reload };
}
