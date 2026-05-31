'use client';

import { Eraser, Paintbrush, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { useSketchNodeModel } from '../model/use-sketch-node-model';
import { sketchPalette } from '../model/use-sketch-node-model';
import { DarkSelect } from '@/shared/ui/dark-select';
import { SketchCanvas, type SketchCanvasHandle, type SketchTool } from './sketch-canvas';

type SketchNodeModel = ReturnType<typeof useSketchNodeModel>;

interface SketchEditorOverlayProps {
  model: SketchNodeModel;
  onClose: () => void;
}

export function SketchEditorOverlay({ model, onClose }: SketchEditorOverlayProps) {
  const canvasRef = useRef<SketchCanvasHandle | null>(null);
  const [, setHistoryVersion] = useState(0);
  const [tool, setTool] = useState<SketchTool>('brush');
  const aspectRatioStyle = `${model.canvasSize.width} / ${model.canvasSize.height}`;
  const aspectRatioNumber = model.canvasSize.width / model.canvasSize.height;
  const canRedo = canvasRef.current?.canRedo() ?? false;
  const canUndo = canvasRef.current?.canUndo() ?? false;
  const refreshHistory = useCallback(() => setHistoryVersion((version) => version + 1), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        canvasRef.current?.redo();
        refreshHistory();
        return;
      }
      canvasRef.current?.undo();
      refreshHistory();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [refreshHistory]);

  return (
    <div
      className="image-viewer-overlay sketch-editor-overlay"
      data-node-interactive
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="image-viewer-backdrop" aria-label="Close sketch editor" onClick={onClose} />
      <div className="sketch-editor-content">
        <button type="button" className="image-viewer-close" aria-label="Close sketch editor" onClick={onClose}>
          <X size={18} />
        </button>
        <div
          className="sketch-editor-stage"
          style={{
            '--sketch-editor-aspect': aspectRatioNumber,
            aspectRatio: aspectRatioStyle,
          } as CSSProperties}
        >
          <SketchCanvas
            ref={canvasRef}
            asset={model.asset}
            brushColor={model.brushColor}
            brushSize={model.brushSize}
            className="sketch-editor-canvas-wrap"
            height={model.canvasSize.height}
            onCommit={model.saveCanvas}
            onHistoryChange={refreshHistory}
            tool={tool}
            width={model.canvasSize.width}
          />
        </div>
      </div>
      <div className="sketch-editor-panel">
        <div className="sketch-toolbar" data-node-interactive>
          <button type="button" className={`sketch-tool-button ${tool === 'brush' ? 'sketch-tool-button-active' : ''}`} onClick={() => setTool('brush')} aria-label="Brush">
            <Paintbrush size={14} />
          </button>
          <button type="button" className={`sketch-tool-button ${tool === 'eraser' ? 'sketch-tool-button-active' : ''}`} onClick={() => setTool('eraser')} aria-label="Eraser">
            <Eraser size={14} />
          </button>
          <button type="button" className="sketch-tool-button" onClick={() => canvasRef.current?.undo()} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button type="button" className="sketch-tool-button" onClick={() => canvasRef.current?.redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <label className="sketch-size-control">
            <span>{model.brushSize}px</span>
            <input type="range" min="8" max="180" value={model.brushSize} onChange={(event) => model.handleBrushSizeChange(Number(event.target.value))} />
          </label>
          <div className="sketch-aspect-control">
            <span>Aspect</span>
            <DarkSelect value={model.aspectRatio} options={model.aspectRatioOptions} onChange={model.handleAspectRatioChange} />
          </div>
          <button type="button" className="sketch-tool-button" onClick={() => canvasRef.current?.clear()} aria-label="Clear sketch">
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="sketch-palette" data-node-interactive>
          {sketchPalette.map((color) => (
            <button
              key={color}
              type="button"
              className={`sketch-color-swatch ${model.brushColor.toLowerCase() === color.toLowerCase() ? 'sketch-color-swatch-active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                setTool('brush');
                model.handleBrushColorChange(color);
              }}
              aria-label={`Use color ${color}`}
            />
          ))}
          <label className="sketch-color-picker" aria-label="Custom color">
            <input
              type="color"
              value={model.brushColor}
              onChange={(event) => {
                setTool('brush');
                model.handleBrushColorChange(event.target.value);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
