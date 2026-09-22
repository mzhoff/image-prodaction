'use client';

import { useEffect } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { bindDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';

export function useDocumentConversationBinding(documentId: string | undefined, workspaceId: string) {
  const runtime = useChatRuntime();
  const { conversationId } = useChatRuntimeState();
  useEffect(() => {
    if (!documentId || !conversationId) return;
    const controller = new AbortController();
    void bindDocumentConversation({ conversationId, documentId, signal: controller.signal, workspaceId }).then((boundId) => {
      if (controller.signal.aborted || boundId === conversationId) return;
      // One durable conversation per document, including across browser tabs.
      if (runtime.getSnapshot().phase === 'idle') void runtime.loadConversation(boundId).catch(() => undefined);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [documentId, runtime, conversationId, workspaceId]);
}
