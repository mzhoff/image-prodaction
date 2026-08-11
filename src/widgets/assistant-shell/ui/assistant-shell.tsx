'use client';

import { Bot, MessageSquareText, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { ImageProductionChat } from '@/features/chat-assistant/ui/image-production-chat';
import { useAssistantShellResize } from '../model/use-assistant-shell-resize';
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
  const { resizeWithKeyboard, size, startResize } = useAssistantShellResize();
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
      data-canvas-wheel-block="true"
      data-snapshot-exclude
      aria-hidden={!open}
      aria-label="Assistant and feedback"
      style={{
        '--assistant-shell-height': `${size.height}px`,
        '--assistant-shell-width': `${size.width}px`,
      } as CSSProperties}
    >
      <button
        aria-label="Изменить высоту окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-top"
        onKeyDown={(event) => resizeWithKeyboard(event, 'top')}
        onPointerDown={(event) => startResize(event, 'top')}
        tabIndex={open ? 0 : -1}
        type="button"
      />
      <button
        aria-label="Изменить ширину окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-left"
        onKeyDown={(event) => resizeWithKeyboard(event, 'left')}
        onPointerDown={(event) => startResize(event, 'left')}
        tabIndex={open ? 0 : -1}
        type="button"
      />
      <button
        aria-label="Изменить размер окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-top-left"
        onKeyDown={(event) => resizeWithKeyboard(event, 'top-left')}
        onPointerDown={(event) => startResize(event, 'top-left')}
        tabIndex={open ? 0 : -1}
        type="button"
      />
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

      <div
        aria-label="Assistant"
        className="assistant-shell-assistant-panel"
        hidden={activeTab !== 'assistant'}
        id="assistant-shell-assistant-panel"
        role="tabpanel"
      >
        <ImageProductionChat context={chatContext} workspaceId={workspaceId} />
      </div>
      <div
        aria-label="Feedback"
        className="assistant-shell-feedback-panel"
        hidden={activeTab !== 'feedback'}
        id="assistant-shell-feedback-panel"
        role="tabpanel"
      >
        <FeedbackPanel contextLabel={contextLabel} />
      </div>
    </section>
  );
}
