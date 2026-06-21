'use client';

import { ChevronDown, ChevronRight, Eye, EyeOff, Link2, Lock } from 'lucide-react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { CompositionLayerTreeDragItem } from '../../model/use-composition-node-model';

export function CompositionLayerTreeRow({
  active,
  collapsed,
  dragItem,
  dropIndicator,
  expandable,
  hidden,
  icon,
  label,
  linkedSource,
  locked,
  onClick,
  onDetachSource,
  onDragItem,
  onDragOver,
  onDrop,
  onHoverChange,
  onRename,
  onToggleCollapse,
  onToggleLock,
  onToggleVisibility,
}: {
  active: boolean;
  collapsed?: boolean;
  dragItem: CompositionLayerTreeDragItem;
  dropIndicator?: 'after' | 'before' | 'inside';
  expandable?: boolean;
  hidden: boolean;
  icon: ReactNode;
  label: string;
  linkedSource?: boolean;
  locked: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDetachSource?: () => void;
  onDragItem: (item: CompositionLayerTreeDragItem | undefined) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  onHoverChange?: (hovered: boolean) => void;
  onRename?: (name: string) => void;
  onToggleCollapse?: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const className = [
    'composition-layer-row',
    active ? 'composition-layer-row-active' : '',
    dropIndicator ? `composition-layer-row-drop-${dropIndicator}` : '',
    hidden ? 'composition-layer-row-hidden' : '',
    locked ? 'composition-layer-row-locked' : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!renaming) setDraftLabel(label);
  }, [label, renaming]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const startRenaming = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraftLabel(label);
    setRenaming(true);
  };
  const commitRename = () => {
    const nextLabel = draftLabel.trim();
    setRenaming(false);
    if (nextLabel && nextLabel !== label) onRename?.(nextLabel);
    else setDraftLabel(label);
  };
  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') {
      setDraftLabel(label);
      setRenaming(false);
    }
  };

  return (
    <div
      className={className}
      draggable={!renaming}
      onDragEnd={() => onDragItem(undefined)}
      onDragOver={onDragOver}
      onDragStart={(event) => {
        if (renaming) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-composition-layer-tree-item', JSON.stringify(dragItem));
        hideNativeDragPreview(event);
        onDragItem(dragItem);
      }}
      onDrop={onDrop}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
    >
      {expandable ? (
        <button
          type="button"
          className="composition-layer-collapse"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      ) : <span className="composition-layer-collapse-spacer" />}
      {renaming ? (
        <span className="composition-layer-main composition-layer-main-editing">
          <span className="composition-layer-row-icon">{icon}</span>
          <input
            ref={inputRef}
            className="composition-layer-rename-input"
            value={draftLabel}
            onBlur={commitRename}
            onChange={(event) => setDraftLabel(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={handleRenameKeyDown}
          />
        </span>
      ) : (
        <button type="button" className="composition-layer-main" onClick={onClick} onDoubleClick={startRenaming}>
          <span className="composition-layer-row-icon">{icon}</span>
          <span className="composition-layer-row-label">{label}</span>
        </button>
      )}
      <span className={linkedSource ? 'composition-layer-actions composition-layer-actions-persistent' : 'composition-layer-actions'}>
        <button
          type="button"
          className={hidden ? 'composition-layer-action composition-layer-action-persistent' : 'composition-layer-action'}
          aria-label={hidden ? 'Show layer' : 'Hide layer'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisibility();
          }}
        >
          {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          type="button"
          className={locked ? 'composition-layer-action composition-layer-action-persistent' : 'composition-layer-action'}
          aria-label={locked ? 'Unlock layer' : 'Lock layer'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleLock();
          }}
        >
          <Lock size={13} />
        </button>
        {linkedSource ? (
          <button
            type="button"
            className="composition-layer-action composition-layer-action-persistent"
            aria-label="Detach source"
            onClick={(event) => {
              event.stopPropagation();
              onDetachSource?.();
            }}
          >
            <Link2 size={13} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

let transparentDragImage: HTMLElement | undefined;

function hideNativeDragPreview(event: ReactDragEvent<HTMLElement>) {
  if (!transparentDragImage) {
    transparentDragImage = document.createElement('span');
    transparentDragImage.style.position = 'fixed';
    transparentDragImage.style.left = '-1000px';
    transparentDragImage.style.top = '-1000px';
    transparentDragImage.style.width = '1px';
    transparentDragImage.style.height = '1px';
    transparentDragImage.style.opacity = '0';
    transparentDragImage.style.pointerEvents = 'none';
    document.body.appendChild(transparentDragImage);
  }
  event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
}
