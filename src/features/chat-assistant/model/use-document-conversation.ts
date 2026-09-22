'use client';

import { useCallback } from 'react';
import { useAssistantConversation } from '@/shared/assistant/model/use-assistant-conversation';
import { loadBoundDocumentConversation } from '@/modules/chat-assistant/adapters/client/document-conversation-client';

export function useDocumentConversation(documentId: string | undefined, workspaceId: string) {
  const load = useCallback((signal: AbortSignal) => documentId
    ? loadBoundDocumentConversation({ documentId, workspaceId, signal })
    : Promise.resolve(undefined), [documentId, workspaceId]);
  return useAssistantConversation(`${workspaceId}:${documentId ?? 'workspace'}`, load);
}
