'use client';

import { Crop, Download, Ellipsis, Eye, FileInput, ImageIcon, ListPlus, Minimize2, Paintbrush, Repeat2, Scissors, Send, Slice, SlidersHorizontal, Text, WandSparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';

export function NodeTitle({
  title,
  muted,
  action,
  nodeType,
}: {
  title: string;
  muted?: boolean;
  action?: ReactNode;
  nodeType?: ProductionNodeType;
}) {
  const Icon = getNodeIcon(title, nodeType);
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

function getNodeIcon(title: string, nodeType?: ProductionNodeType) {
  if (nodeType) {
    if (nodeType === 'importImage') return FileInput;
    if (nodeType === 'imageToText') return WandSparkles;
    if (nodeType === 'referenceComposer') return ImageIcon;
    if (nodeType === 'generateImage') return ImageIcon;
    if (nodeType === 'textPrompt') return Text;
    if (nodeType === 'textConcat') return ListPlus;
    if (nodeType === 'textGeneration') return Text;
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
