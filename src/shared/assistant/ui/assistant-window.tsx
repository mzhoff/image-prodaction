'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Bot, ChevronRight, Maximize2, Minimize2, Settings2, X } from '@prodactionpro/ui-core/icons';
import { useChatAttachmentDropZone, type ChatAttachmentDropTarget } from '@prodactionpro/chat-runtime-react';
import { ChatAttachmentDropOverlay } from '@prodactionpro/chat-ui';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { AssistantAttachmentTargetContext } from '../model/assistant-attachment-target';
import { useAssistantWindow } from '../model/use-assistant-window';

const DISABLED_DROP_TARGET: ChatAttachmentDropTarget = {
  acceptsFile: () => false, acceptsMimeType: () => false, addFiles: () => undefined, canAdd: false,
};

export interface AssistantWindowProps {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  title?: string;
  contextLabel: string;
  icon?: ReactNode;
  placement?: 'floating' | 'docked' | 'fullscreen';
  className?: string;
  notice?: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
  expandWithinLayout?: boolean;
  dropEnabled?: boolean;
  settings?: (close: () => void) => ReactNode;
}

/** One window for canvas, timeline and story. Contents stay mounted in every state. */
export function AssistantWindow({ children, open, onClose, onOpen, title = 'AI Assistant', contextLabel, icon,
  placement = 'floating', className = '', notice, settings, dropEnabled = true, expanded: controlledExpanded, onExpandedChange, expandWithinLayout = false }: AssistantWindowProps) {
  const tUi = useTranslations();
  const windowState = useAssistantWindow(open, onClose);
  const { expanded: localExpanded, setExpanded: setLocalExpanded, settingsOpen, setSettingsOpen, settingsRef, settingsButtonRef, closeSettings, close: closeWindow, size, startResize, resizeWithKeyboard } = windowState;
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = (value: boolean) => { setLocalExpanded(value); onExpandedChange?.(value); };
  const close = () => { setExpanded(false); closeWindow(); };
  const [target, setTarget] = useState<ChatAttachmentDropTarget>();
  const drop = useChatAttachmentDropZone({ disabled: !open || !dropEnabled || placement === 'fullscreen', eventIsolation: 'accepted', target: target ?? DISABLED_DROP_TARGET });
  const id = useId();
  const dockedClosed = placement === 'docked' && !open;
  const floatingClosed = placement === 'floating' && !open;
  return <AssistantAttachmentTargetContext value={setTarget}>
    <section {...drop.handlers} className={[
      placement === 'fullscreen' ? '' : 'assistant-shell', `assistant-window-${placement}`, open ? 'assistant-shell-open' : '',
      expanded && !expandWithinLayout ? 'assistant-shell-expanded' : 'assistant-shell-compact', notice ? 'assistant-shell-with-notice' : '', className,
    ].filter(Boolean).join(' ')} aria-label={title} aria-hidden={floatingClosed || undefined} inert={floatingClosed}
      data-canvas-wheel-block="true" data-assistant-window={placement} data-open={open} data-snapshot-exclude
      data-assistant-drop-active={drop.isFileDragActive} data-view={expanded ? 'expanded' : 'compact'}
      style={{ '--assistant-shell-height': `${size.height}px`, '--assistant-shell-width': `${size.width}px` } as CSSProperties}>
      <ChatAttachmentDropOverlay active={drop.isFileDragActive} className="assistant-shell-drop-overlay"
        label={tUi("Отпустите файлы здесь")} hint={tUi("Добавим материалы к сообщению ассистенту")} />
      {placement === 'floating' ? (['top', 'left', 'top-left'] as const).map((direction) => <button key={direction} type="button"
        aria-label={direction === 'top' ? tUi("Изменить высоту окна ассистента") : direction === 'left' ? tUi("Изменить ширину окна ассистента") : tUi("Изменить размер окна ассистента")}
        className={`assistant-shell-resize-handle assistant-shell-resize-handle-${direction}`} tabIndex={open && !expanded ? 0 : -1}
        onKeyDown={(event) => resizeWithKeyboard(event, direction)} onPointerDown={(event) => startResize(event, direction)} />) : null}
      <header className="assistant-shell-header" hidden={placement === 'fullscreen'}>
        <div className="assistant-shell-title" hidden={dockedClosed}><span>{icon ?? <Bot size={18} />}</span><div><strong>{title}</strong><small>{contextLabel}</small></div></div>
        <div className="assistant-shell-header-controls">
          {dockedClosed ? <ProTooltip label={tUi("Развернуть ассистента")}><button type="button" aria-label={tUi("Развернуть ассистента")} aria-expanded={false} aria-controls={id} onClick={onOpen}><ChevronRight size={18} /></button></ProTooltip> : <>
            <ProTooltip label={expanded ? tUi("Свернуть") : tUi("Развернуть")}><button type="button" aria-label={expanded ? tUi("Свернуть окно ассистента") : tUi("Развернуть окно ассистента")} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></ProTooltip>
            {settings ? <div className="assistant-shell-settings" ref={settingsRef}>
              <ProTooltip label={tUi("Настройки")}><button ref={settingsButtonRef} type="button" aria-label={tUi("Настройки ассистента")} aria-expanded={settingsOpen} aria-controls={`${id}-settings`} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /></button></ProTooltip>
              {settingsOpen ? <div id={`${id}-settings`} className="assistant-shell-settings-menu"><strong>{tUi("Настройки ассистента")}</strong>{settings(closeSettings)}</div> : null}
            </div> : null}
            <ProTooltip label={placement === 'docked' ? tUi("Свернуть") : tUi("Закрыть")}><button type="button" aria-label={placement === 'docked' ? tUi("Свернуть ассистента") : tUi("Закрыть ассистента")} aria-controls={id} onClick={close}><X size={18} /></button></ProTooltip>
          </>}
        </div>
      </header>
      {notice ? <div className="assistant-shell-notice" hidden={!open}>{typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}</div> : null}
      <div id={id} className="assistant-window-content" hidden={dockedClosed}>{children}</div>
    </section>
  </AssistantAttachmentTargetContext>;
}
