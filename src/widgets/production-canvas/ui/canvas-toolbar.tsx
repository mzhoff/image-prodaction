'use client';

import { Frame, Maximize2, MousePointer2, Redo2, Trash2, Undo2 } from 'lucide-react';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

type CanvasTool = 'select' | 'section';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  canRedo: boolean;
  canUndo: boolean;
  onDeleteSelected: () => void;
  onRedo: () => void;
  onSelectTool: (tool: CanvasTool) => void;
  onUndo: () => void;
  onZoomToFit: () => void;
}

export function CanvasToolbar({
  activeTool,
  canRedo,
  canUndo,
  onDeleteSelected,
  onRedo,
  onSelectTool,
  onUndo,
  onZoomToFit,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" aria-label="Canvas tools">
      <ProTooltip label="Select" shortcut="V">
        <button
          type="button"
          aria-label="Select"
          className={activeTool === 'select' ? 'canvas-toolbar-active' : undefined}
          onClick={() => onSelectTool('select')}
        >
          <MousePointer2 size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Draw section" shortcut="Shift+S">
        <button
          type="button"
          aria-label="Draw section"
          className={activeTool === 'section' ? 'canvas-toolbar-active' : undefined}
          onClick={() => onSelectTool('section')}
        >
          <Frame size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Undo" shortcut="Ctrl+Z">
        <button type="button" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Redo" shortcut="Shift+Ctrl+Z">
        <button type="button" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Zoom to fit">
        <button type="button" aria-label="Zoom to fit" onClick={onZoomToFit}>
          <Maximize2 size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Delete selected" shortcut="Del">
        <button type="button" aria-label="Delete selected" onClick={onDeleteSelected}>
          <Trash2 size={16} />
        </button>
      </ProTooltip>
    </div>
  );
}
