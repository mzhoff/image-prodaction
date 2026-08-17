'use client';

import { Bot, ImagePlus, MessageSquareText, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import {
  ImageProductionChat,
  type AssistantAttachmentDropTarget,
} from '@/features/chat-assistant/ui/image-production-chat';
import { shouldCaptureAssistantAttachmentDrop } from '../model/assistant-attachment-drop';
import { useAssistantShellResize } from '../model/use-assistant-shell-resize';
import { FeedbackPanel } from './feedback-panel';

interface AssistantShellProps {
  open: boolean;
  contextLabel: string;
  documentId?: string;
  documentRevision?: string;
  onPipelineChanged?: () => void;
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
  onPipelineChanged,
  route,
  selectionIds,
  workspaceId,
}: AssistantShellProps) {
  const [activeTab, setActiveTab] = useState<AssistantShellTab>('assistant');
  const [attachmentDropActive, setAttachmentDropActive] = useState(false);
  const attachmentDropDepthRef = useRef(0);
  const attachmentDropTargetRef = useRef<AssistantAttachmentDropTarget | undefined>(undefined);
  const { resizeWithKeyboard, size, startResize } = useAssistantShellResize();
  const chatContext = useMemo(() => ({
    ...(documentId ? {
      document: {
        id: documentId,
        ...(documentRevision === undefined ? {} : { revision: documentRevision }),
      },
    } : {}),
    ...(route ? { route } : {}),
    ...(selectionIds?.length ? { selection: { ids: selectionIds.slice(0, 100) } } : {}),
  }), [documentId, documentRevision, route, selectionIds]);

  const resetAttachmentDrop = useCallback(() => {
    attachmentDropDepthRef.current = 0;
    setAttachmentDropActive(false);
  }, []);
  const registerAttachmentDropTarget = useCallback((target?: AssistantAttachmentDropTarget) => {
    attachmentDropTargetRef.current = target;
    if (!target) resetAttachmentDrop();
  }, [resetAttachmentDrop]);
  const shouldCaptureDrop = useCallback((event: DragEvent<HTMLElement>) => (
    shouldCaptureAssistantAttachmentDrop({
      activeTab,
      fileCount: event.dataTransfer.files.length,
      hasDropTarget: Boolean(attachmentDropTargetRef.current),
      isOpen: open,
      types: event.dataTransfer.types,
    })
  ), [activeTab, open]);
  const captureDragEvent = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  useEffect(() => {
    if (!open || activeTab !== 'assistant') resetAttachmentDrop();
  }, [activeTab, open, resetAttachmentDrop]);

  return (
    <section
      className={`assistant-shell ${open ? 'assistant-shell-open' : ''}`}
      data-canvas-wheel-block="true"
      data-assistant-drop-active={attachmentDropActive ? 'true' : 'false'}
      data-snapshot-exclude
      aria-hidden={!open}
      aria-label="Assistant and feedback"
      onDragEnterCapture={(event) => {
        if (!shouldCaptureDrop(event)) return;
        captureDragEvent(event);
        attachmentDropDepthRef.current += 1;
        setAttachmentDropActive(true);
      }}
      onDragLeaveCapture={(event) => {
        if (!shouldCaptureDrop(event) && attachmentDropDepthRef.current === 0) return;
        captureDragEvent(event);
        attachmentDropDepthRef.current = Math.max(0, attachmentDropDepthRef.current - 1);
        if (attachmentDropDepthRef.current === 0) setAttachmentDropActive(false);
      }}
      onDragOverCapture={(event) => {
        if (!shouldCaptureDrop(event)) return;
        captureDragEvent(event);
        setAttachmentDropActive(true);
      }}
      onDropCapture={(event) => {
        if (!shouldCaptureDrop(event)) return;
        captureDragEvent(event);
        const files = Array.from(event.dataTransfer.files);
        resetAttachmentDrop();
        if (files.length > 0) attachmentDropTargetRef.current?.(files);
      }}
      style={{
        '--assistant-shell-height': `${size.height}px`,
        '--assistant-shell-width': `${size.width}px`,
      } as CSSProperties}
    >
      {attachmentDropActive ? (
        <div className="assistant-shell-drop-overlay" role="status">
          <span aria-hidden="true"><ImagePlus size={28} strokeWidth={1.8} /></span>
          <strong>Отпустите изображение здесь</strong>
          <small>Оно добавится к сообщению ассистенту</small>
        </div>
      ) : null}
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
        <ImageProductionChat
          context={chatContext}
          onPipelineChanged={onPipelineChanged}
          registerAttachmentDropTarget={registerAttachmentDropTarget}
          workspaceId={workspaceId}
        />
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
