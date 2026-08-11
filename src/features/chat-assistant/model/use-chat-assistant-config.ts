'use client';

import { useEffect, useState } from 'react';
import type { PublicChatAssistantConfig } from '@/modules/chat-assistant/contracts/assistant-config';

type ConfigState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; value: PublicChatAssistantConfig }
  | { message: string; phase: 'error' };

export function useChatAssistantConfig(workspaceId?: string) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ConfigState>({ phase: 'idle' });

  useEffect(() => {
    if (!workspaceId) {
      setState({ phase: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ phase: 'loading' });
    void fetch('/api/chat/v1/config', {
      cache: 'no-store',
      headers: { 'x-workspace-id': workspaceId },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as Partial<PublicChatAssistantConfig> & { message?: string };
      if (!response.ok || typeof body.enabled !== 'boolean' || typeof body.model !== 'string') {
        throw new Error(body.message || 'Не удалось проверить конфигурацию ассистента.');
      }
      setState({ phase: 'ready', value: body as PublicChatAssistantConfig });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({
        message: error instanceof Error ? error.message : 'Не удалось проверить конфигурацию ассистента.',
        phase: 'error',
      });
    });
    return () => controller.abort();
  }, [reloadToken, workspaceId]);

  return { reload: () => setReloadToken((token) => token + 1), state };
}
