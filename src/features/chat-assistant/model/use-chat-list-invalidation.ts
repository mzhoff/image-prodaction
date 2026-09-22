'use client';
import { useEffect, useRef } from 'react';
import { notifyChatsChanged } from './use-production-chats';

/** Opening a saved conversation is a read, not a reason to reload the sidebar. */
export function useChatListInvalidation(phase: string, workspaceId?: string) {
  const hadTurn = useRef(false);
  useEffect(() => {
    if (phase === 'submitting' || phase === 'streaming') hadTurn.current = true;
    if (hadTurn.current && (phase === 'idle' || phase === 'error')) {
      hadTurn.current = false;
      notifyChatsChanged(workspaceId);
    }
  }, [phase, workspaceId]);
}
