'use client';

import { Bot, MessageSquareText, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ImageProductionChat } from '@/features/chat-assistant/ui/image-production-chat';
import { FeedbackPanel } from './feedback-panel';

interface AssistantShellProps {
  open: boolean;
  contextLabel: string;
  documentId?: string;
  documentRevision?: number;
  onClose: () => void;
  route?: string;
  selectionIds?: string[];
  workspaceId?: string;
}

type AssistantShellTab = 'assistant' | 'feedback';

export function AssistantShell({
  open,
  contextLabel,
  documentId,
  documentRevision,
  onClose,
  route,
  selectionIds,
  workspaceId,
}: AssistantShellProps) {
  const [activeTab, setActiveTab] = useState<AssistantShellTab>('assistant');
  const chatContext = useMemo(() => ({
    ...(documentId ? {
      document: {
        id: documentId,
        ...(documentRevision === undefined ? {} : { revision: String(documentRevision) }),
      },
    } : {}),
    ...(route ? { route } : {}),
    ...(selectionIds?.length ? { selection: { ids: selectionIds.slice(0, 100) } } : {}),
  }), [documentId, documentRevision, route, selectionIds]);

  return (
    <section
      className={`assistant-shell ${open ? 'assistant-shell-open' : ''}`}
      data-snapshot-exclude
      aria-hidden={!open}
      aria-label="Assistant and feedback"
    >
      <header className="assistant-shell-header">
        <div className="assistant-shell-title">
          <span>
            {activeTab === 'assistant' ? <Bot size={18} /> : <MessageSquareText size={18} />}
          </span>
          <div>
            <strong>{activeTab === 'assistant' ? 'AI Assistant' : 'Feedback'}</strong>
            <small>{contextLabel}</small>
          </div>
        </div>
        <button type="button" aria-label="Close assistant" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="assistant-shell-tabs" role="tablist" aria-label="Assistant panel">
        <button
          aria-controls="assistant-shell-assistant-panel"
          aria-selected={activeTab === 'assistant'}
          onClick={() => setActiveTab('assistant')}
          role="tab"
          type="button"
        >
          Assistant
        </button>
        <button
          aria-controls="assistant-shell-feedback-panel"
          aria-selected={activeTab === 'feedback'}
          onClick={() => setActiveTab('feedback')}
          role="tab"
          type="button"
        >
          Feedback
        </button>
      </div>

      {activeTab === 'assistant' ? (
        <div
          aria-label="Assistant"
          className="assistant-shell-assistant-panel"
          id="assistant-shell-assistant-panel"
          role="tabpanel"
        >
          <ImageProductionChat context={chatContext} workspaceId={workspaceId} />
        </div>
      ) : (
        <div
          aria-label="Feedback"
          className="assistant-shell-feedback-panel"
          id="assistant-shell-feedback-panel"
          role="tabpanel"
        >
          <FeedbackPanel contextLabel={contextLabel} />
        </div>
      )}
    </section>
  );
}
