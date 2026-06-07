import type { ReactNode } from 'react';

interface BaseContextMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export interface ContextMenuItemAction extends BaseContextMenuAction {
  kind?: 'item';
  onSelect: () => void;
}

export interface ContextMenuColorAction extends BaseContextMenuAction {
  kind: 'color';
  value: string;
  onCommit: (value: string) => void;
  onPreview?: (value: string) => void;
}

export interface ContextMenuSubmenuAction extends BaseContextMenuAction {
  kind: 'submenu';
  actions: ContextMenuAction[];
}

export type ContextMenuAction = ContextMenuItemAction | ContextMenuColorAction | ContextMenuSubmenuAction;

export interface ContextMenuState {
  x: number;
  y: number;
  minWidth?: number;
  actions: ContextMenuAction[];
}
