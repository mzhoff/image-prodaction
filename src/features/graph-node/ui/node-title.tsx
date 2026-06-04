'use client';

import { Crop, Download, Ellipsis, Eye, FileInput, ImageIcon, ListPlus, Minimize2, Paintbrush, PencilLine, Scissors, Slice, SlidersHorizontal, Text, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function NodeTitle({ title, muted, action }: { title: string; muted?: boolean; action?: ReactNode }) {
  const Icon = getNodeIcon(title);
  return (
    <h2 className={cn('node-title', muted && 'node-title-muted')}>
      <span className="node-title-main">
        {Icon ? <Icon size={16} /> : null}
        <span>{title}</span>
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
  return (
    <button
      type="button"
      className="node-title-action"
      aria-label="Node options"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
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

function getNodeIcon(title: string) {
  if (title === 'Import') return FileInput;
  if (title === 'Extract') return WandSparkles;
  if (title === 'Generate Image') return ImageIcon;
  if (title === 'Concatenate') return ListPlus;
  if (title === 'Text Generate (LLM)' || title === 'Text Gen') return Text;
  if (title === 'Text Split' || title === 'Splitter') return Slice;
  if (title === 'Sketch') return Paintbrush;
  if (title === 'Retouch') return Paintbrush;
  if (title === 'Crop') return Crop;
  if (title === 'Adjustments') return SlidersHorizontal;
  if (title === 'Remove BG') return Scissors;
  if (title === 'Export') return Download;
  if (title === 'Preview') return Eye;
  if (title === 'Prompt') return PencilLine;
  return null;
}
