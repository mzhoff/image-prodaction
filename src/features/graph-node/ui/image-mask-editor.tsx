'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  clearCanvas,
  drawCanvasSegment,
  getCanvasPoint,
  getPointerTool,
  hasAlphaPixels,
  hideBrushCursorElement,
  updateBrushCursorElement,
} from '@/shared/lib/canvas-drawing';
import { cn } from '@/shared/lib/cn';
import { applyMaskEditorState, getMaskEditorState, type MaskHistoryEntry } from '../lib/mask-editor-state';

export type MaskTool = 'brush' | 'eraser';

export interface ImageMaskEditorHandle {
  canRedo: () => boolean;
  canUndo: () => boolean;
  clear: () => void;
  getMaskDataUrl: () => string | null;
  redo: () => void;
  reset: () => void;
  undo: () => void;
}

interface ImageMaskEditorProps {
  brushSize: number;
  className?: string;
  enabled: boolean;
  height: number;
  onHistoryChange?: () => void;
  tool: MaskTool;
  width: number;
}

const MAX_MASK_HISTORY = 40;

export const ImageMaskEditor = forwardRef<ImageMaskEditorHandle, ImageMaskEditorProps>(function ImageMaskEditor({
  brushSize,
  className,
  enabled,
  height,
  onHistoryChange,
  tool,
  width,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeToolRef = useRef<MaskTool>(tool);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const redoStackRef = useRef<MaskHistoryEntry[]>([]);
  const undoStackRef = useRef<MaskHistoryEntry[]>([]);

  useEffect(() => {
    const visibleCanvas = canvasRef.current;
    if (!visibleCanvas) return;
    visibleCanvas.width = width;
    visibleCanvas.height = height;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    maskCanvasRef.current = maskCanvas;
    clearCanvas(visibleCanvas);
    undoStackRef.current = [];
    redoStackRef.current = [];
    onHistoryChange?.();
  }, [height, onHistoryChange, width]);

  useEffect(() => {
    if (!enabled) hideBrushCursorElement(cursorRef.current);
  }, [enabled]);

  useEffect(() => {
    const handleGlobalPointerEnd = () => finishDrawing(activeCanvasRef.current);

    window.addEventListener('pointerup', handleGlobalPointerEnd, { capture: true });
    window.addEventListener('pointercancel', handleGlobalPointerEnd, { capture: true });
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd, { capture: true });
      window.removeEventListener('pointercancel', handleGlobalPointerEnd, { capture: true });
    };
  }, []);

  useImperativeHandle(ref, () => ({
    canRedo: () => redoStackRef.current.length > 0,
    canUndo: () => undoStackRef.current.length > 0,
    clear: () => {
      clearMask();
    },
    getMaskDataUrl: () => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas || !hasAlphaPixels(maskCanvas)) return null;

      const output = document.createElement('canvas');
      output.width = maskCanvas.width;
      output.height = maskCanvas.height;
      const context = output.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#000';
      context.fillRect(0, 0, output.width, output.height);
      context.drawImage(maskCanvas, 0, 0);
      return output.toDataURL('image/png');
    },
    redo: () => {
      restoreNextMaskState();
    },
    reset: () => {
      resetMask();
    },
    undo: () => {
      restorePreviousMaskState();
    },
  }));

  const pushUndoState = () => {
    const visibleCanvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!visibleCanvas || !maskCanvas) return false;
    const state = getMaskEditorState(visibleCanvas, maskCanvas);
    if (!state) return false;
    undoStackRef.current.push(state);
    if (undoStackRef.current.length > MAX_MASK_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    return true;
  };

  const clearMask = () => {
    const visibleCanvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!visibleCanvas || !maskCanvas) return;
    if (hasAlphaPixels(visibleCanvas) || hasAlphaPixels(maskCanvas)) {
      pushUndoState();
    }
    clearCanvas(visibleCanvas);
    clearCanvas(maskCanvas);
    onHistoryChange?.();
  };

  const resetMask = () => {
    if (canvasRef.current) clearCanvas(canvasRef.current);
    if (maskCanvasRef.current) clearCanvas(maskCanvasRef.current);
    undoStackRef.current = [];
    redoStackRef.current = [];
    onHistoryChange?.();
  };

  const restorePreviousMaskState = () => {
    const previous = undoStackRef.current.pop();
    const visibleCanvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!previous || !visibleCanvas || !maskCanvas) return;
    const current = getMaskEditorState(visibleCanvas, maskCanvas);
    if (current) redoStackRef.current.push(current);
    applyMaskEditorState(visibleCanvas, maskCanvas, previous);
    onHistoryChange?.();
  };

  const restoreNextMaskState = () => {
    const next = redoStackRef.current.pop();
    const visibleCanvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!next || !visibleCanvas || !maskCanvas) return;
    const current = getMaskEditorState(visibleCanvas, maskCanvas);
    if (current) {
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > MAX_MASK_HISTORY) undoStackRef.current.shift();
    }
    applyMaskEditorState(visibleCanvas, maskCanvas, next);
    onHistoryChange?.();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const activeTool = event.button === 2 ? 'eraser' : tool;
    activeCanvasRef.current = event.currentTarget;
    activePointerIdRef.current = event.pointerId;
    activeToolRef.current = activeTool;
    event.currentTarget.setPointerCapture(event.pointerId);
    pushUndoState();
    onHistoryChange?.();
    updateMaskCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width, activeTool);
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY, width, height);
    drawingRef.current = true;
    lastPointRef.current = point;
    drawMaskSegment({ canvas: event.currentTarget, from: point, to: point, brushSize, tool: activeTool });
    if (maskCanvasRef.current) drawMaskSegment({ canvas: maskCanvasRef.current, from: point, to: point, brushSize, tool: activeTool, mask: true });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (drawingRef.current && event.buttons === 0) {
      finishDrawing(event.currentTarget);
      return;
    }
    const activeTool = drawingRef.current ? activeToolRef.current : getPointerTool(event.buttons, tool);
    updateMaskCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width, activeTool);
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY, width, height);
    drawMaskSegment({ canvas: event.currentTarget, from: lastPointRef.current, to: point, brushSize, tool: activeTool });
    if (maskCanvasRef.current) drawMaskSegment({ canvas: maskCanvasRef.current, from: lastPointRef.current, to: point, brushSize, tool: activeTool, mask: true });
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
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    finishDrawing(event.currentTarget);
  };

  return (
    <div className={cn('image-mask-layer', enabled && 'image-mask-layer-enabled', className)}>
      <canvas
        ref={canvasRef}
        className="image-mask-canvas"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={handlePointerDown}
        onPointerEnter={(event) => updateMaskCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width, getPointerTool(event.buttons, tool))}
        onPointerLeave={() => {
          if (!drawingRef.current) hideBrushCursorElement(cursorRef.current);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={(event) => {
          stopDrawing(event);
          hideBrushCursorElement(cursorRef.current);
        }}
      />
      <div ref={cursorRef} className={cn('image-mask-brush-cursor', tool === 'eraser' && 'image-mask-brush-cursor-eraser')} />
    </div>
  );
});

function drawMaskSegment({
  brushSize,
  canvas,
  from,
  mask,
  to,
  tool,
}: {
  brushSize: number;
  canvas: HTMLCanvasElement;
  from: { x: number; y: number };
  mask?: boolean;
  to: { x: number; y: number };
  tool: MaskTool;
}) {
  drawCanvasSegment({
    brushSize,
    canvas,
    color: mask ? '#fff' : 'rgba(31, 98, 255, 0.55)',
    eraserCompositeOperation: 'destination-out',
    from,
    to,
    tool,
  });
}

function updateMaskCursor(
  canvas: HTMLCanvasElement,
  cursor: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  brushSize: number,
  sourceWidth: number,
  tool: MaskTool,
) {
  updateBrushCursorElement({ brushSize, canvas, clientX, clientY, cursor, sourceWidth, tool });
}
