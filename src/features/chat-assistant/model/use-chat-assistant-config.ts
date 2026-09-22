'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useState } from 'react';
import type { PublicChatAssistantConfig } from '@/modules/chat-assistant/contracts/assistant-config';
import { type WorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access';

import { loadWorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';

type ConfigState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { access: WorkspaceAiAccess; phase: 'ready'; value: PublicChatAssistantConfig; workspaceId: string }
  | { message: string; phase: 'error' };

export function useChatAssistantConfig(workspaceId?: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ConfigState>({ phase: 'idle' });
  const [checking, setChecking] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    if (!workspaceId) {
      setState({ phase: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    setChecking(true); setRefreshError('');
    // Rechecking access must keep the mounted conversation, draft and attachments.
    setState((current) => current.phase === 'ready' && current.workspaceId === workspaceId ? current : { phase: 'loading' });
    const config = fetch('/api/chat/v1/config', {
      cache: 'no-store',
      headers: { 'x-workspace-id': workspaceId },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as Partial<PublicChatAssistantConfig> & { message?: string };
      if (!response.ok || typeof body.enabled !== 'boolean' || typeof body.model !== 'string') {
        throw new Error(body.message || tEffect("Не удалось проверить конфигурацию ассистента."));
      }
      return body as PublicChatAssistantConfig;
    });
    void Promise.all([config, loadWorkspaceAiAccess(workspaceId)])
      .then(([value, access]) => {
        if (!controller.signal.aborted) setState({ phase: 'ready', value, access, workspaceId });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : tEffect("Не удалось проверить конфигурацию ассистента.");
        setRefreshError(message);
        setState((current) => current.phase === 'ready' && current.workspaceId === workspaceId ? current : { phase: 'error', message });
      }).finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [reloadToken, workspaceId]);

  const currentState: ConfigState = state.phase === 'ready' && state.workspaceId !== workspaceId ? { phase: 'loading' } : state;
  return { reload: () => setReloadToken((token) => token + 1), state: currentState, checking, refreshError };
}
