'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadBoundDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';

type BindingState =
  | { phase: 'loading' }
  | { phase: 'ready'; conversationId?: string }
  | { phase: 'error'; message: string };

export function useDocumentConversation(documentId: string | undefined, workspaceId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BindingState>(() => (
    documentId ? { phase: 'loading' } : { phase: 'ready' }
  ));

  useEffect(() => {
    if (!documentId) {
      setState({ phase: 'ready' });
      return;
    }
    const controller = new AbortController();
    setState({ phase: 'loading' });
    void loadBoundDocumentConversation({ documentId, workspaceId, signal: controller.signal })
      .then((conversationId) => setState({ conversationId, phase: 'ready' }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          message: error instanceof Error ? error.message : 'Не удалось восстановить историю ассистента.',
          phase: 'error',
        });
      });
    return () => controller.abort();
  }, [attempt, documentId, workspaceId]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { reload, state };
}
