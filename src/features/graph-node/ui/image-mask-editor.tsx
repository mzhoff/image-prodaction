'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  clearCanvas,
  getCanvasPoint,
  getPointerTool,
  hasAlphaPixels,
  hideBrushCursorElement,
} from '@/shared/lib/canvas-drawing';
import { cn } from '@/shared/lib/cn';
import {
  drawMaskSegment,
  getMaskCanvasDataUrl,
  loadMaskImage,
  paintStoredMask,
  updateMaskCursor,
  type MaskTool,
} from '../lib/image-mask-canvas';
import { applyMaskEditorState, getMaskEditorState, type MaskHistoryEntry } from '../lib/mask-editor-state';

export type { MaskTool } from '../lib/image-mask-canvas';

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
  initialMaskDataUrl?: string | null;
  onHistoryChange?: () => void;
  onMaskChange?: (maskDataUrl: string | null) => void;
  onPreviewToolChange?: (tool: MaskTool | null) => void;
  tool: MaskTool;
  width: number;
}

const MAX_MASK_HISTORY = 40;

export const ImageMaskEditor = forwardRef<ImageMaskEditorHandle, ImageMaskEditorProps>(function ImageMaskEditor({
  brushSize,
  className,
  enabled,
  height,
  initialMaskDataUrl,
  onHistoryChange,
  onMaskChange,
  onPreviewToolChange,
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
  const maskApplyRunRef = useRef(0);
  const knownMaskDataUrlRef = useRef<string | null>(initialMaskDataUrl ?? null);
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
    void applyInitialMaskDataUrl(initialMaskDataUrl ?? null, true);
  }, [height, width]);

  useEffect(() => {
    void applyInitialMaskDataUrl(initialMaskDataUrl ?? null);
  }, [initialMaskDataUrl]);

  useEffect(() => {
    if (!enabled) {
      hideBrushCursorElement(cursorRef.current);
      onPreviewToolChange?.(null);
    }
  }, [enabled, onPreviewToolChange]);

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
      return getCurrentMaskDataUrl();
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

  async function applyInitialMaskDataUrl(maskDataUrl: string | null, force = false) {
    if (!force && knownMaskDataUrlRef.current === maskDataUrl) return;
    knownMaskDataUrlRef.current = maskDataUrl;
    const runId = maskApplyRunRef.current + 1;
    maskApplyRunRef.current = runId;
    const visibleCanvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!visibleCanvas || !maskCanvas) return;

    clearCanvas(visibleCanvas);
    clearCanvas(maskCanvas);
    undoStackRef.current = [];
    redoStackRef.current = [];

    if (!maskDataUrl) {
      onHistoryChange?.();
      return;
    }

    try {
      const image = await loadMaskImage(maskDataUrl);
      if (maskApplyRunRef.current !== runId) return;
      paintStoredMask({ image, maskCanvas, visibleCanvas });
      onHistoryChange?.();
    } catch {
      if (maskApplyRunRef.current !== runId) return;
      clearCanvas(visibleCanvas);
      clearCanvas(maskCanvas);
      onHistoryChange?.();
    }
  }

  function getCurrentMaskDataUrl() {
    return getMaskCanvasDataUrl(maskCanvasRef.current);
  }

  function emitMaskChange() {
    const maskDataUrl = getCurrentMaskDataUrl();
    knownMaskDataUrlRef.current = maskDataUrl;
    onMaskChange?.(maskDataUrl);
  }

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
    emitMaskChange();
  };

  const resetMask = () => {
    if (canvasRef.current) clearCanvas(canvasRef.current);
    if (maskCanvasRef.current) clearCanvas(maskCanvasRef.current);
    undoStackRef.current = [];
    redoStackRef.current = [];
    onHistoryChange?.();
    emitMaskChange();
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
    emitMaskChange();
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
    emitMaskChange();
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
    onPreviewToolChange?.(activeTool);
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
    onPreviewToolChange?.(activeTool === tool && !drawingRef.current ? null : activeTool);
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
    onPreviewToolChange?.(null);
    emitMaskChange();
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
        onPointerEnter={(event) => {
          const activeTool = getPointerTool(event.buttons, tool);
          onPreviewToolChange?.(activeTool === tool ? null : activeTool);
          updateMaskCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width, activeTool);
        }}
        onPointerLeave={() => {
          if (!drawingRef.current) {
            hideBrushCursorElement(cursorRef.current);
            onPreviewToolChange?.(null);
          }
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
