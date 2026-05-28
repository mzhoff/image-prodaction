'use client';

import { Maximize2, MousePointer2, Redo2, Trash2, Undo2 } from 'lucide-react';

interface CanvasToolbarProps {
  canRedo: boolean;
  canUndo: boolean;
  onDeleteSelected: () => void;
  onRedo: () => void;
  onUndo: () => void;
  onZoomToFit: () => void;
}

export function CanvasToolbar({
  canRedo,
  canUndo,
  onDeleteSelected,
  onRedo,
  onUndo,
  onZoomToFit,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" aria-label="Canvas tools">
      <button type="button" title="Select">
        <MousePointer2 size={16} />
      </button>
      <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={16} />
      </button>
      <button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={16} />
      </button>
      <button type="button" title="Zoom to fit" onClick={onZoomToFit}>
        <Maximize2 size={16} />
      </button>
      <button type="button" title="Delete selected" onClick={onDeleteSelected}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}
