'use client';

import { useChatAttachmentDropZone } from '@prodactionpro/chat-runtime-react';
import type { ChatLauncher } from '@prodactionpro/chat-runtime-core';
import { ChatAttachmentDropOverlay } from '@prodactionpro/chat-ui';
import {
  Bot,
  Check,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Settings2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ImageProductionChat,
  type AssistantAttachmentDropTarget,
} from '@/features/chat-assistant/ui/image-production-chat';
import { ChatLauncherHostProvider } from '@/features/chat-assistant/model/chat-launcher-host';
import { useAssistantShellResize } from '../model/use-assistant-shell-resize';
import { FeedbackPanel } from './feedback-panel';

interface AssistantShellProps {
  open: boolean;
  contextLabel: string;
  documentId?: string;
  documentRevision?: string;
  onOpen?: () => void;
  onPipelineChanged?: () => void;
  onClose: () => void;
  registerChatLauncher?: (launcher: ChatLauncher) => () => void;
  route?: string;
  selectionIds?: string[];
  workspaceId?: string;
}

type AssistantShellView = 'assistant' | 'feedback';

const DISABLED_ATTACHMENT_DROP_TARGET: AssistantAttachmentDropTarget = {
  acceptsFile: () => false,
  acceptsMimeType: () => false,
  addFiles: () => undefined,
  canAdd: false,
};

export function AssistantShell({
  open,
  contextLabel,
  documentId,
  documentRevision,
  onClose,
  onOpen,
  onPipelineChanged,
  registerChatLauncher,
  route,
  selectionIds,
  workspaceId,
}: AssistantShellProps) {
  const [activeView, setActiveView] = useState<AssistantShellView>('assistant');
  const [attachmentDropTarget, setAttachmentDropTarget] = useState<AssistantAttachmentDropTarget>();
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
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

  const attachmentDropZone = useChatAttachmentDropZone({
    disabled: !open || activeView !== 'assistant',
    eventIsolation: 'accepted',
    target: attachmentDropTarget ?? DISABLED_ATTACHMENT_DROP_TARGET,
  });

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (settingsRef.current?.contains(event.target as Node)) return;
      setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [settingsOpen]);

  const selectView = (view: AssistantShellView) => {
    setActiveView(view);
    setSettingsOpen(false);
  };
  const openAssistantSurface = useCallback(() => {
    setActiveView('assistant');
    setSettingsOpen(false);
    onOpen?.();
  }, [onOpen]);
  const closeAssistant = () => {
    setActiveView('assistant');
    setExpanded(false);
    setSettingsOpen(false);
    onClose();
  };

  return (
    <section
      {...attachmentDropZone.handlers}
      className={[
        'assistant-shell',
        open ? 'assistant-shell-open' : '',
        expanded ? 'assistant-shell-expanded' : 'assistant-shell-compact',
      ].filter(Boolean).join(' ')}
      data-canvas-wheel-block="true"
      data-assistant-drop-active={attachmentDropZone.isFileDragActive ? 'true' : 'false'}
      data-view={expanded ? 'expanded' : 'compact'}
      data-snapshot-exclude
      aria-hidden={!open}
      aria-label="Assistant and feedback"
      style={{
        '--assistant-shell-height': `${size.height}px`,
        '--assistant-shell-width': `${size.width}px`,
      } as CSSProperties}
    >
      <ChatAttachmentDropOverlay
        active={attachmentDropZone.isFileDragActive}
        className="assistant-shell-drop-overlay"
        hint="Изображение добавится к сообщению ассистенту"
        label="Отпустите изображение здесь"
      />
      <button
        aria-label="Изменить высоту окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-top"
        onKeyDown={(event) => resizeWithKeyboard(event, 'top')}
        onPointerDown={(event) => startResize(event, 'top')}
        tabIndex={open && !expanded ? 0 : -1}
        type="button"
      />
      <button
        aria-label="Изменить ширину окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-left"
        onKeyDown={(event) => resizeWithKeyboard(event, 'left')}
        onPointerDown={(event) => startResize(event, 'left')}
        tabIndex={open && !expanded ? 0 : -1}
        type="button"
      />
      <button
        aria-label="Изменить размер окна ассистента"
        className="assistant-shell-resize-handle assistant-shell-resize-handle-top-left"
        onKeyDown={(event) => resizeWithKeyboard(event, 'top-left')}
        onPointerDown={(event) => startResize(event, 'top-left')}
        tabIndex={open && !expanded ? 0 : -1}
        type="button"
      />
      <header className="assistant-shell-header">
        <div className="assistant-shell-title">
          <span>
            {activeView === 'assistant' ? <Bot size={18} /> : <MessageSquareText size={18} />}
          </span>
          <div>
            <strong>{activeView === 'assistant' ? 'AI Assistant' : 'Feedback'}</strong>
            <small>{contextLabel}</small>
          </div>
        </div>
        <div className="assistant-shell-header-controls">
          <button
            aria-label={expanded ? 'Свернуть окно ассистента' : 'Развернуть окно ассистента'}
            aria-pressed={expanded}
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? 'Свернуть' : 'Развернуть'}
            type="button"
          >
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <div className="assistant-shell-settings" ref={settingsRef}>
            <button
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              aria-label="Настройки ассистента"
              onClick={() => setSettingsOpen((value) => !value)}
              title="Настройки"
              type="button"
            >
              <Settings2 size={17} />
            </button>
            {settingsOpen ? (
              <div className="assistant-shell-settings-menu" role="menu">
                <strong>Настройки ассистента</strong>
                <button onClick={() => selectView('assistant')} role="menuitem" type="button">
                  <Bot size={16} />
                  <span>
                    <b>Ассистент</b>
                    <small>Вернуться к диалогу</small>
                  </span>
                  {activeView === 'assistant' ? <Check size={15} /> : null}
                </button>
                <button onClick={() => selectView('feedback')} role="menuitem" type="button">
                  <MessageSquareText size={16} />
                  <span>
                    <b>Обратная связь</b>
                    <small>Оценить продукт или сообщить о проблеме</small>
                  </span>
                  {activeView === 'feedback' ? <Check size={15} /> : null}
                </button>
              </div>
            ) : null}
          </div>
          <button aria-label="Закрыть ассистента" onClick={closeAssistant} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </div>
      </header>

      <div
        aria-label="Assistant"
        className="assistant-shell-assistant-panel"
        hidden={activeView !== 'assistant'}
        id="assistant-shell-assistant-panel"
      >
        <ChatLauncherHostProvider
          openSurface={openAssistantSurface}
          registerLauncher={registerChatLauncher}
        >
          <ImageProductionChat
            context={chatContext}
            onPipelineChanged={onPipelineChanged}
            registerAttachmentDropTarget={setAttachmentDropTarget}
            workspaceId={workspaceId}
          />
        </ChatLauncherHostProvider>
      </div>
      <div
        aria-label="Feedback"
        className="assistant-shell-feedback-panel"
        hidden={activeView !== 'feedback'}
        id="assistant-shell-feedback-panel"
      >
        <FeedbackPanel contextLabel={contextLabel} />
      </div>
    </section>
  );
}
