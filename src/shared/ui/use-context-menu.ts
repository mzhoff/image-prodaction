'use client';

import { useCallback, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ContextMenuAction, ContextMenuState } from './context-menu-types';

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openContextMenu = useCallback((event: ReactMouseEvent, actions: ContextMenuAction[], minWidth?: number) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      minWidth,
      actions,
    });
  }, []);

  return {
    menu,
    openContextMenu,
    closeContextMenu,
  };
}
