'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import {
  drawCanvasSegment,
  fillCanvas,
  getCanvasPoint,
  getCanvasState,
  getPointerTool,
  hideBrushCursorElement,
  putCanvasState,
  updateBrushCursorElement,
} from '@/shared/lib/canvas-drawing';
import { cn } from '@/shared/lib/cn';

export type SketchTool = 'brush' | 'eraser';

export interface SketchCanvasHandle {
  canRedo: () => boolean;
  canUndo: () => boolean;
  clear: () => void;
  redo: () => void;
  undo: () => void;
}

interface SketchCanvasProps {
  asset?: AssetRecord;
  brushColor: string;
  brushSize: number;
  className?: string;
  height: number;
  onCommit: (canvas: HTMLCanvasElement) => Promise<void> | void;
  onHistoryChange?: () => void;
  style?: CSSProperties;
  tool: SketchTool;
  width: number;
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, SketchCanvasProps>(function SketchCanvas({
  asset,
  brushColor,
  brushSize,
  className,
  height,
  onCommit,
  onHistoryChange,
  style,
  tool,
  width,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeToolRef = useRef<SketchTool>(tool);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const redoStackRef = useRef<ImageData[]>([]);
  const suppressNextAssetReloadRef = useRef(false);
  const undoStackRef = useRef<ImageData[]>([]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const assetId = asset?.id;

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sizeChanged = sizeRef.current.width !== width || sizeRef.current.height !== height;
    if (!sizeChanged && suppressNextAssetReloadRef.current) {
      suppressNextAssetReloadRef.current = false;
      return undefined;
    }

    sizeRef.current = { width, height };
    canvas.width = width;
    canvas.height = height;
    redoStackRef.current = [];
    undoStackRef.current = [];
    onHistoryChange?.();
    fillCanvas(canvas);

    if (!asset) return;

    void loadAssetBlob(asset).then((blob) => {
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        if (!cancelled) {
          const context = canvas.getContext('2d');
          if (context) context.drawImage(image, 0, 0, width, height);
        }
        URL.revokeObjectURL(url);
      };
      image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
    });

    return () => {
      cancelled = true;
    };
  }, [asset, assetId, height, onHistoryChange, width]);

  useEffect(() => {
    const handleGlobalPointerEnd = () => finishDrawing(activeCanvasRef.current);

    window.addEventListener('pointerup', handleGlobalPointerEnd, { capture: true });
    window.addEventListener('pointercancel', handleGlobalPointerEnd, { capture: true });
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd, { capture: true });
      window.removeEventListener('pointercancel', handleGlobalPointerEnd, { capture: true });
    };
  }, []);

  const pushUndoState = (canvas: HTMLCanvasElement, clearRedo = true) => {
    const state = getCanvasState(canvas);
    if (!state) return;
    undoStackRef.current.push(state);
    if (undoStackRef.current.length > MAX_SKETCH_HISTORY) undoStackRef.current.shift();
    if (clearRedo) redoStackRef.current = [];
    onHistoryChange?.();
  };

  const commitCanvas = (canvas: HTMLCanvasElement) => {
    suppressNextAssetReloadRef.current = true;
    void onCommit(canvas);
  };

  useImperativeHandle(ref, () => ({
    canRedo: () => redoStackRef.current.length > 0,
    canUndo: () => undoStackRef.current.length > 0,
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      pushUndoState(canvas);
      fillCanvas(canvas);
      commitCanvas(canvas);
    },
    redo: () => {
      const canvas = canvasRef.current;
      const nextState = redoStackRef.current.pop();
      if (!canvas || !nextState) return;
      pushUndoState(canvas, false);
      putCanvasState(canvas, nextState);
      onHistoryChange?.();
      commitCanvas(canvas);
    },
    undo: () => {
      const canvas = canvasRef.current;
      const previousState = undoStackRef.current.pop();
      if (!canvas || !previousState) return;
      const currentState = getCanvasState(canvas);
      if (currentState) redoStackRef.current.push(currentState);
      putCanvasState(canvas, previousState);
      onHistoryChange?.();
      commitCanvas(canvas);
    },
  }), [onCommit, onHistoryChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const activeTool = event.button === 2 ? 'eraser' : tool;
    activeCanvasRef.current = event.currentTarget;
    activePointerIdRef.current = event.pointerId;
    activeToolRef.current = activeTool;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSketchCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, activeTool);
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY);
    pushUndoState(event.currentTarget);
    drawingRef.current = true;
    lastPointRef.current = point;
    drawSketchSegment({ canvas: event.currentTarget, from: point, to: point, brushColor, brushSize, tool: activeTool });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (drawingRef.current && event.buttons === 0) {
      finishDrawing(event.currentTarget);
      return;
    }
    const activeTool = drawingRef.current ? activeToolRef.current : getPointerTool(event.buttons, tool);
    updateSketchCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, activeTool);
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY);
    drawSketchSegment({ canvas: event.currentTarget, from: lastPointRef.current, to: point, brushColor, brushSize, tool: activeTool });
    lastPointRef.current = point;
  };

  const finishDrawing = (canvas: HTMLCanvasElement | null) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (canvas && activePointerIdRef.current !== null && canvas.hasPointerCapture(activePointerIdRef.current)) {
      canvas.releasePointerCapture(activePointerIdRef.current);
    }
    activeCanvasRef.current = null;
    activePointerIdRef.current = null;
    if (canvas) commitCanvas(canvas);
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    finishDrawing(event.currentTarget);
  };

  return (
    <div className={cn('sketch-canvas-wrap', className)} data-node-interactive style={style}>
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerCancel={(event) => {
          stopDrawing(event);
          hideBrushCursorElement(cursorRef.current);
        }}
        onPointerDown={handlePointerDown}
        onPointerEnter={(event) => updateSketchCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, getPointerTool(event.buttons, tool))}
        onPointerLeave={() => {
          if (!drawingRef.current) hideBrushCursorElement(cursorRef.current);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
      />
      <div ref={cursorRef} className={cn('sketch-brush-cursor', tool === 'eraser' && 'sketch-brush-cursor-eraser')} />
    </div>
  );
});

const MAX_SKETCH_HISTORY = 40;

function drawSketchSegment({
  brushColor,
  brushSize,
  canvas,
  from,
  to,
  tool,
}: {
  brushColor: string;
  brushSize: number;
  canvas: HTMLCanvasElement;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tool: SketchTool;
}) {
  drawCanvasSegment({ brushSize, canvas, color: brushColor, eraserColor: '#fff', from, to, tool });
}

function updateSketchCursor(
  canvas: HTMLCanvasElement,
  cursor: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  brushSize: number,
  tool: SketchTool,
) {
  updateBrushCursorElement({ brushSize, canvas, clientX, clientY, cursor, tool });
}
