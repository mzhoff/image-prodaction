'use client';

import { useEffect, useState } from 'react';
import { loadDocumentAssistantActivity } from '@/modules/chat-assistant/adapters/client/document-activity-client';
import type { DocumentAssistantActivity } from '@/modules/chat-assistant/contracts/document-assistant-activity';

/** Refresh only factual messages; never reload/reset an active chat turn or its composer. */
export function useDocumentActivity(documentId: string | undefined, workspaceId: string) {
  const [events, setEvents] = useState<DocumentAssistantActivity[]>([]);
  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    let loading = false;
    let pending = false;
    const load = async () => {
      if (loading) { pending = true; return; }
      loading = true;
      try {
        const result = await loadDocumentAssistantActivity({ documentId, workspaceId, signal: controller.signal });
        if (!controller.signal.aborted) setEvents(result);
      } catch { /* Persisted chat history remains available; retry on focus or next refresh. */ }
      finally {
        loading = false;
        if (pending && !controller.signal.aborted) { pending = false; void load(); }
      }
    };
    const reload = (event: Event) => {
      if ((event as CustomEvent<{ documentId?: string }>).detail?.documentId === documentId) void load();
    };
    const refreshVisible = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    // Other tabs can finish a generation while this conversation is open.
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener('image-production:document-activity-updated', reload);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('image-production:document-activity-updated', reload);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [documentId, workspaceId]);
  return events;
}
