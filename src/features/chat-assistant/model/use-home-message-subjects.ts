'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import { homeImagePreviewsSchema } from '@/modules/chat-assistant/contracts/home-image-settings';
import { messageImageSettingsId, presentHomeMessageSubjects, type HomeMessageSubjectPreviews } from './home-message-subjects';

export function useHomeMessageSubjects(messages: ChatMessage[], workspaceId: string, conversationId: string | undefined,
  local: HomeMessageSubjectPreviews) {
  const scope = `${workspaceId}:${conversationId}`;
  const [cache, setCache] = useState<{ scope: string; previews: HomeMessageSubjectPreviews }>({ scope, previews: {} });
  const previews = useMemo(() => ({ ...(cache.scope === scope ? cache.previews : {}), ...local }), [cache, scope, local]);
  const missing = JSON.stringify([...new Set(messages.map(messageImageSettingsId).filter((id): id is string => Boolean(id)))]
    .filter((id) => !(id in previews)));

  useEffect(() => {
    const ids = JSON.parse(missing) as string[];
    if (!ids.length || !conversationId || !workspaceId) return;
    const controller = new AbortController();
    void (async () => {
      const loaded: HomeMessageSubjectPreviews = {};
      // One bounded query per page, not one network request per message.
      for (let offset = 0; offset < ids.length; offset += 50) {
        const batch = ids.slice(offset, offset + 50);
        const query = new URLSearchParams({ conversationId });
        batch.forEach((id) => query.append('settingsId', id));
        const response = await fetch(`/api/chat/v1/home-image-settings?${query}`, {
          headers: { 'x-workspace-id': workspaceId }, cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (!response.ok) return;
        const result = homeImagePreviewsSchema.parse(await response.json());
        batch.forEach((id) => { loaded[id] = result[id] ?? []; });
      }
      if (!controller.signal.aborted) setCache((current) => ({ scope,
        previews: { ...(current.scope === scope ? current.previews : {}), ...loaded } }));
    })().catch(() => { /* A preview failure must not interrupt the conversation. */ });
    return () => controller.abort();
  }, [missing, scope, workspaceId, conversationId]);

  return useMemo(() => presentHomeMessageSubjects(messages, previews), [messages, previews]);
}
