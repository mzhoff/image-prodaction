'use client';

import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';
import type { ContextMenuState } from './context-menu-types';

function getMenuPosition(menu: ContextMenuState) {
  const minWidth = menu.minWidth ?? 220;
  const estimatedHeight = 12 + menu.actions.length * 36 + menu.actions.filter((action) => action.separatorBefore).length * 9;
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
  if (!menu) return null;

  return createPortal(
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(event) => event.preventDefault()} />
      <div
        className="context-menu"
        style={getMenuPosition(menu)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.actions.map((action) => (
          <div key={action.id}>
            {action.separatorBefore ? <div className="context-menu-separator" /> : null}
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
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
