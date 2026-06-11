'use client';

import { Download, Frame, Maximize2, MousePointer2, Redo2, Trash2, Undo2, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

type CanvasTool = 'select' | 'section';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  canRedo: boolean;
  canUndo: boolean;
  onDeleteSelected: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
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
  onExportProject,
  onImportProject,
  onRedo,
  onSelectTool,
  onUndo,
  onZoomToFit,
}: CanvasToolbarProps) {
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const handleJsonFileChange = (event: ChangeEvent<HTMLInputElement>, onFile: (file: File) => void) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };

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
      <span className="canvas-toolbar-separator" aria-hidden="true" />
      <ProTooltip label="Export document">
        <button type="button" aria-label="Export document" onClick={onExportProject}>
          <Download size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Import document">
        <button type="button" aria-label="Import document" onClick={() => projectInputRef.current?.click()}>
          <Upload size={16} />
        </button>
      </ProTooltip>
      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => handleJsonFileChange(event, onImportProject)}
      />
      <span className="canvas-toolbar-separator" aria-hidden="true" />
      <ProTooltip label="Delete selected" shortcut="Del">
        <button type="button" aria-label="Delete selected" onClick={onDeleteSelected}>
          <Trash2 size={16} />
        </button>
      </ProTooltip>
    </div>
  );
}
