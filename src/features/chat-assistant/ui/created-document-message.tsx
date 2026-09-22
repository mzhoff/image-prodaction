'use client';

import { useEffect, useRef } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { useSession } from '@/shared/auth/client';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';
import { claimCreationMessage, clearCreationMessage, readCreationMessage, type CreationMessageKind } from '../model/created-document-message';

/** Transfers the user's explicit first Send into the newly bound document chat. */
export function CreatedDocumentMessage({ workspaceId, kind, documentId }: { workspaceId: string; kind: CreationMessageKind; documentId: string }) {
  const runtime = useChatRuntime(), state = useChatRuntimeState(), gate = useAiAccessGate();
  const { data: session } = useSession(); const userId = session?.user.id;
  const handled = useRef(false);
  useEffect(() => {
    if (!userId || handled.current || !['idle', 'error'].includes(state.phase)) return;
    const scope = { userId, workspaceId, kind, documentId };
    const pending = readCreationMessage(scope); if (!pending) return;
    handled.current = true;
    if (runtime.getSnapshot().messages.some((message) => message.role === 'user')) { clearCreationMessage(scope); return; }
    const claim = claimCreationMessage(scope);
    const restore = () => { if (!runtime.getSnapshot().inputValue) runtime.setInputValue(pending.prompt); };
    if (!claim) { restore(); clearCreationMessage(scope); return; }
    void gate.ensure().then(async (allowed) => {
      if (!allowed || ['loading', 'submitting', 'streaming'].includes(runtime.getSnapshot().phase)) { restore(); return; }
      await runtime.submit(claim.prompt);
      if (runtime.getSnapshot().phase === 'error') restore();
      else clearCreationMessage(scope);
    }).catch((error) => { gate.onError(error); restore(); });
  }, [userId, workspaceId, kind, documentId, state.phase, runtime, gate]);
  return null;
}
