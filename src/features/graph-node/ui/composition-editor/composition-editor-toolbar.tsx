'use client';

import { ChevronDown, Circle, Hand, MousePointer2, Redo2, Square, Star, Triangle, Type, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import type { CompositionEditorTool, CompositionShapeTool } from './composition-types';

export function CompositionEditorToolbar({
  activeTool,
  canRedo,
  canUndo,
  onRedo,
  onSelectShape,
  onSelectTool,
  onUndo,
  shapeMenuOpen,
  shapeTool,
  toggleShapeMenu,
  zoom,
}: {
  activeTool: CompositionEditorTool;
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onSelectShape: (shape: CompositionShapeTool) => void;
  onSelectTool: (tool: CompositionEditorTool) => void;
  onUndo: () => void;
  shapeMenuOpen: boolean;
  shapeTool: CompositionShapeTool;
  toggleShapeMenu: () => void;
  zoom: number;
}) {
  return (
    <div className="composition-editor-toolbar" data-node-interactive>
      <ProTooltip label="Select" shortcut="V">
        <button
          type="button"
          aria-label="Select"
          className={activeTool === 'select' ? 'composition-editor-toolbar-active' : undefined}
          onClick={() => onSelectTool('select')}
        >
          <MousePointer2 size={16} />
        </button>
      </ProTooltip>
      <ProTooltip label="Hand" shortcut="H">
        <button
          type="button"
          aria-label="Hand"
          className={activeTool === 'hand' ? 'composition-editor-toolbar-active' : undefined}
          onClick={() => onSelectTool('hand')}
        >
          <Hand size={16} />
        </button>
      </ProTooltip>
      <div className="composition-shape-tool-wrap">
        <ProTooltip label="Shape">
          <button
            type="button"
            aria-label="Shape"
            className={activeTool === 'shape' ? 'composition-editor-toolbar-active' : undefined}
            onClick={toggleShapeMenu}
          >
            {shapeTool === 'ellipse' ? <Circle size={16} /> : null}
            {shapeTool === 'rectangle' ? <Square size={16} /> : null}
            {shapeTool === 'star' ? <Star size={16} /> : null}
            {shapeTool === 'triangle' ? <Triangle size={16} /> : null}
          </button>
        </ProTooltip>
        {shapeMenuOpen ? (
          <div className="composition-shape-menu">
            <ShapeMenuItem icon={<Square size={14} />} label="Rectangle" shortcut="R" onClick={() => onSelectShape('rectangle')} />
            <ShapeMenuItem icon={<Circle size={14} />} label="Ellipse" shortcut="O" onClick={() => onSelectShape('ellipse')} />
            <ShapeMenuItem icon={<Triangle size={14} />} label="Triangle" onClick={() => onSelectShape('triangle')} />
            <ShapeMenuItem icon={<Star size={14} />} label="Star" onClick={() => onSelectShape('star')} />
          </div>
        ) : null}
      </div>
      <ProTooltip label="Text">
        <button
          type="button"
          aria-label="Text"
          className={activeTool === 'text' ? 'composition-editor-toolbar-active' : undefined}
          onClick={() => onSelectTool('text')}
        >
          <Type size={16} />
        </button>
      </ProTooltip>
      <span className="composition-editor-toolbar-separator" aria-hidden="true" />
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
      <span className="composition-editor-toolbar-separator" aria-hidden="true" />
      <button type="button" className="composition-editor-zoom-button" aria-label="Zoom">
        <span>{Math.round(zoom * 100)}%</span>
        <ChevronDown size={14} />
      </button>
    </div>
  );
}

function ShapeMenuItem({
  icon,
  label,
  onClick,
  shortcut,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button type="button" onClick={onClick}>
      <span>{icon}</span>
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}
