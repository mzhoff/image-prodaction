'use client';

import { Ellipsis, Minimize2 } from '@prodactionpro/ui-core/icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { NodeIcon } from '@/entities/production-graph/ui/node-icon';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';

const NodeTitleRenameNodeContext = createContext<string | null>(null);
const NodeTitleOptionsMenuContext = createContext<((event: ReactMouseEvent<HTMLButtonElement>) => void) | null>(null);
const NODE_TITLE_RENAME_REQUEST_EVENT = 'production-node-title-rename-request';

export function requestNodeTitleRename(nodeId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NODE_TITLE_RENAME_REQUEST_EVENT, { detail: { nodeId } }));
}

export function NodeTitleNodeIdProvider({
  children,
  nodeId,
  onOpenOptionsMenu,
}: {
  children: ReactNode;
  nodeId: string;
  onOpenOptionsMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <NodeTitleRenameNodeContext.Provider value={nodeId}>
      <NodeTitleOptionsMenuContext.Provider value={onOpenOptionsMenu ?? null}>
        {children}
      </NodeTitleOptionsMenuContext.Provider>
    </NodeTitleRenameNodeContext.Provider>
  );
}

export function NodeTitle({
  title,
  muted,
  action,
  nodeType,
  onRename,
}: {
  title: string;
  muted?: boolean;
  action?: ReactNode;
  nodeType: ProductionNodeType;
  onRename?: (title: string) => void;
}) {
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const nodeId = useContext(NodeTitleRenameNodeContext);
  const renameContextNode = useCallback((nextTitle: string) => {
    if (nodeId) renameNode(nodeId, nextTitle);
  }, [nodeId, renameNode]);
  const onRenameNode = onRename ?? (nodeId ? renameContextNode : undefined);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(title);
    }
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginEditing = useCallback(() => {
    setDraftTitle(title);
    setEditing(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [title]);

  useEffect(() => {
    if (!nodeId || !onRenameNode) return undefined;

    const handleRenameRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId !== nodeId) return;
      beginEditing();
    };

    window.addEventListener(NODE_TITLE_RENAME_REQUEST_EVENT, handleRenameRequest);
    return () => window.removeEventListener(NODE_TITLE_RENAME_REQUEST_EVENT, handleRenameRequest);
  }, [beginEditing, nodeId, onRenameNode]);

  const commitTitle = () => {
    setEditing(false);
    if (!onRenameNode) return;

    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setDraftTitle(title);
      return;
    }
    if (nextTitle !== title) onRenameNode(nextTitle);
  };

  return (
    <h2 className={cn('node-title', muted && 'node-title-muted')}>
      <span className="node-title-main">
        <NodeIcon nodeType={nodeType} />
        {editing ? (
          <input
            ref={inputRef}
            className="node-title-input"
            value={draftTitle}
            onBlur={commitTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftTitle(title);
                setEditing(false);
              }
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          />
        ) : (
          <span
            className={onRenameNode ? 'node-title-editable-label' : undefined}
            onDoubleClick={(event) => {
              if (!onRenameNode) return;
              event.preventDefault();
              event.stopPropagation();
              beginEditing();
            }}
          >
            {title}
          </span>
        )}
      </span>
      {action ?? (
        <NodeTitleActions>
          <NodeTitleOptionsButton />
        </NodeTitleActions>
      )}
    </h2>
  );
}

export function NodeTitleActions({ children }: { children: ReactNode }) {
  return <span className="node-title-actions">{children}</span>;
}

export function NodeTitleOptionsButton() {
  const openOptionsMenu = useContext(NodeTitleOptionsMenuContext);

  return (
    <button
      type="button"
      className="node-title-action"
      aria-label="Node options"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openOptionsMenu?.(event);
      }}
    >
      <Ellipsis size={16} />
    </button>
  );
}

export function TextNodeTitleActions({
  collapsed,
  count,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  count?: string;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  return (
    <NodeTitleActions>
      {count ? <span className="node-title-count">{count}</span> : null}
      <button
        type="button"
        className="node-title-action"
        aria-label={collapsed ? 'Expand node' : 'Collapse node'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCollapsedChange?.(!collapsed);
        }}
      >
        <Minimize2 size={16} />
      </button>
      <NodeTitleOptionsButton />
    </NodeTitleActions>
  );
}
