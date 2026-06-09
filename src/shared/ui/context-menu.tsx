'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';
import type { ContextMenuAction, ContextMenuColorAction, ContextMenuState } from './context-menu-types';
import { FLOATING_CONTEXT_MENU_CLOSE_EVENT } from './floating-context-menu';

function getMenuPosition(menu: ContextMenuState) {
  const minWidth = menu.minWidth ?? 188;
  const estimatedHeight = 12
    + menu.actions.reduce((height, action) => height + (action.kind === 'color' ? 32 : 28), 0)
    + menu.actions.filter((action) => action.separatorBefore).length * 8;
  const pad = 8;
  const bottomSafe = 24;
  let left = menu.x;
  let top = menu.y;

  if (left + minWidth > window.innerWidth - pad) left = window.innerWidth - minWidth - pad;
  if (top + estimatedHeight > window.innerHeight - bottomSafe) top = Math.max(pad, menu.y - estimatedHeight);

  return {
    left: Math.max(pad, left),
    top: Math.max(pad, top),
    minWidth,
  };
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!menu) return undefined;

    document.addEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, onClose);
    return () => document.removeEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, onClose);
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(event) => event.preventDefault()} />
      <div
        className="context-menu"
        style={getMenuPosition(menu)}
        data-floating-context-menu="true"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <ContextMenuActionList actions={menu.actions} onClose={onClose} />
      </div>
    </>,
    document.body,
  );
}

function ContextMenuActionList({
  actions,
  onClose,
}: {
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  return actions.map((action) => (
    <div key={action.id} className={action.kind === 'submenu' ? 'context-menu-submenu-wrap' : undefined}>
      {action.separatorBefore ? <div className="context-menu-separator" /> : null}
      {action.kind === 'color' ? (
        <ContextMenuColorItem action={action} />
      ) : action.kind === 'submenu' ? (
        <>
          <button
            type="button"
            disabled={action.disabled}
            className={cn(
              'context-menu-item context-menu-submenu-trigger',
              action.destructive && 'context-menu-item-danger',
              action.disabled && 'context-menu-item-disabled',
            )}
          >
            {action.icon ? <span className="context-menu-icon">{action.icon}</span> : null}
            <span className="context-menu-label">{action.label}</span>
            <ChevronRight className="context-menu-submenu-chevron" size={14} />
          </button>
          {!action.disabled ? (
            <div className="context-menu context-menu-submenu">
              <ContextMenuActionList actions={action.actions} onClose={onClose} />
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          disabled={action.disabled}
          className={cn(
            'context-menu-item',
            action.destructive && 'context-menu-item-danger',
            action.disabled && 'context-menu-item-disabled',
          )}
          onClick={() => {
            if (action.disabled) return;
            onClose();
            action.onSelect();
          }}
        >
          {action.icon ? <span className="context-menu-icon">{action.icon}</span> : null}
          <span className="context-menu-label">{action.label}</span>
          {action.shortcut ? <span className="context-menu-shortcut">{action.shortcut}</span> : null}
        </button>
      )}
    </div>
  ));
}

function ContextMenuColorItem({ action }: { action: ContextMenuColorAction }) {
  const [value, setValue] = useState(action.value);
  const latestValueRef = useRef(action.value);
  const committedValueRef = useRef(action.value);
  const removeCommitListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setValue(action.value);
    latestValueRef.current = action.value;
    committedValueRef.current = action.value;
  }, [action.value]);

  useEffect(() => {
    return () => removeCommitListenersRef.current?.();
  }, []);

  const previewValue = (nextValue: string) => {
    latestValueRef.current = nextValue;
    setValue(nextValue);
    action.onPreview?.(nextValue);
  };

  const commitLatestValue = () => {
    removeCommitListenersRef.current?.();
    removeCommitListenersRef.current = null;
    const nextValue = latestValueRef.current;
    if (nextValue === committedValueRef.current) return;
    committedValueRef.current = nextValue;
    action.onCommit(nextValue);
  };

  const beginSelection = () => {
    removeCommitListenersRef.current?.();

    const handlePointerUp = () => commitLatestValue();
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('mouseup', handlePointerUp, true);
    removeCommitListenersRef.current = () => {
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('mouseup', handlePointerUp, true);
    };
  };

  return (
    <label className={cn('context-menu-item context-menu-color-item', action.disabled && 'context-menu-item-disabled')}>
      {action.icon ? <span className="context-menu-icon">{action.icon}</span> : null}
      <span className="context-menu-label">{action.label}</span>
      <input
        type="color"
        value={value}
        disabled={action.disabled}
        onPointerDown={beginSelection}
        onInput={(event) => previewValue(event.currentTarget.value)}
        onChange={(event) => previewValue(event.currentTarget.value)}
        onBlur={commitLatestValue}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') commitLatestValue();
        }}
      />
    </label>
  );
}
