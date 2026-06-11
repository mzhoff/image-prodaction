'use client';

import {
  Crop,
  Download,
  Ellipsis,
  Eye,
  FileInput,
  ImageIcon,
  ListPlus,
  Minimize2,
  Paintbrush,
  Repeat2,
  Scissors,
  Send,
  Slice,
  SlidersHorizontal,
  Text,
  Type,
  Volume2,
  WandSparkles,
} from 'lucide-react';
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
  nodeType?: ProductionNodeType;
  onRename?: (title: string) => void;
}) {
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const nodeId = useContext(NodeTitleRenameNodeContext);
  const onRenameNode = onRename ?? (nodeId ? (nextTitle: string) => renameNode(nodeId, nextTitle) : undefined);

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

  const Icon = getNodeIcon(title, nodeType);

  return (
    <h2 className={cn('node-title', muted && 'node-title-muted')}>
      <span className="node-title-main">
        {Icon ? <Icon size={16} /> : null}
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

function getNodeIcon(title: string, nodeType?: ProductionNodeType) {
  if (nodeType) {
    if (nodeType === 'importImage') return FileInput;
    if (nodeType === 'imageToText') return WandSparkles;
    if (nodeType === 'referenceComposer') return ImageIcon;
    if (nodeType === 'generateImage') return ImageIcon;
    if (nodeType === 'textPrompt') return Type;
    if (nodeType === 'textConcat') return ListPlus;
    if (nodeType === 'textGeneration') return Text;
    if (nodeType === 'textToSpeech') return Volume2;
    if (nodeType === 'textFormatter') return Text;
    if (nodeType === 'textSplitter') return Slice;
    if (nodeType === 'iterator') return Repeat2;
    if (nodeType === 'subjectBuilder') return WandSparkles;
    if (nodeType === 'locationBuilder') return WandSparkles;
    if (nodeType === 'telegramPublication') return Send;
    if (nodeType === 'sketch') return Paintbrush;
    if (nodeType === 'cropImage') return Crop;
    if (nodeType === 'adjustment') return SlidersHorizontal;
    if (nodeType === 'curves') return SlidersHorizontal;
    if (nodeType === 'frequencyRetouch') return Paintbrush;
    if (nodeType === 'refineImage') return Paintbrush;
    if (nodeType === 'removeBackground') return Scissors;
    if (nodeType === 'exportImage') return Download;
    if (nodeType === 'preview') return Eye;
  }
  if (title === 'Import') return FileInput;
  if (title === 'Extract') return WandSparkles;
  if (title === 'Generate Image') return ImageIcon;
  if (title === 'Concatenate') return ListPlus;
  if (title === 'Text Generate (LLM)' || title === 'Text Gen') return Text;
  if (title === 'Formatter') return Text;
  if (title === 'Text Split' || title === 'Splitter') return Slice;
  if (title === 'Iterator') return Repeat2;
  if (title === 'Telegram Post') return Send;
  if (title === 'Sketch') return Paintbrush;
  if (title === 'Retouch') return Paintbrush;
  if (title === 'Crop') return Crop;
  if (title === 'Adjustments') return SlidersHorizontal;
  if (title === 'Remove BG') return Scissors;
  if (title === 'Export') return Download;
  if (title === 'Preview') return Eye;
  if (title === 'Prompt') return Text;
  return null;
}
