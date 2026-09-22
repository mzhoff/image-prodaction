'use client';

import type { ChatLauncher } from '@prodactionpro/chat-runtime-core';
import { useEffect, useMemo, useRef } from 'react';
import { ImageProductionChat } from '@/features/chat-assistant/ui/image-production-chat';
import { ChatLauncherHostProvider } from '@/features/chat-assistant/model/chat-launcher-host';
import type { AssistantNotice } from '@/features/assistant-pet/model/assistant-pet-contract';
import { AssistantPanel } from './assistant-panel';
import { trackBehavior } from '@/shared/analytics/client';

interface AssistantShellProps {
  open: boolean;
  contextLabel: string;
  documentId?: string;
  documentRevision?: string;
  notice?: AssistantNotice | null;
  onOpen?: () => void;
  onPipelineChanged?: () => void;
  onClose: () => void;
  onFocusNode?: (nodeId: string) => void;
  registerChatLauncher?: (launcher: ChatLauncher) => () => void;
  route?: string;
  selectionIds?: string[];
  workspaceId?: string;
}


export function AssistantShell({ open, contextLabel, documentId, documentRevision, notice, onClose,
  onFocusNode, onOpen, onPipelineChanged, registerChatLauncher, route, selectionIds, workspaceId }: AssistantShellProps) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) trackBehavior('ip_assistant_opened', { source: documentId ? 'editor' : 'workspace' });
    wasOpen.current = open;
  }, [documentId, open]);
  const chatContext = useMemo(() => ({
    ...(documentId ? { document: { id: documentId, ...(documentRevision === undefined ? {} : { revision: documentRevision }) } } : {}),
    ...(route ? { route } : {}),
    ...(selectionIds?.length ? { selection: { ids: selectionIds.slice(0, 100) } } : {}),
  }), [documentId, documentRevision, route, selectionIds]);
  return <AssistantPanel open={open} contextLabel={contextLabel} onClose={onClose}
    notice={notice ? <div role={notice.status === 'error' ? 'alert' : 'status'}><strong>{notice.title}</strong>{notice.subtitle ? <small>{notice.subtitle}</small> : null}</div> : null}>
    {(showAssistant) => <ChatLauncherHostProvider openSurface={() => { showAssistant(); onOpen?.(); }} registerLauncher={registerChatLauncher}>
      <ImageProductionChat context={chatContext} onPipelineChanged={onPipelineChanged} onFocusNode={onFocusNode} workspaceId={workspaceId} />
    </ChatLauncherHostProvider>}
  </AssistantPanel>;
}
