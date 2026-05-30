'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { cn } from '@/shared/lib/cn';

export type MaskTool = 'brush' | 'eraser';

export interface ImageMaskEditorHandle {
  clear: () => void;
  getMaskDataUrl: () => string | null;
}

interface ImageMaskEditorProps {
  brushSize: number;
  className?: string;
  enabled: boolean;
  height: number;
  tool: MaskTool;
  width: number;
}

export const ImageMaskEditor = forwardRef<ImageMaskEditorHandle, ImageMaskEditorProps>(function ImageMaskEditor({
  brushSize,
  className,
  enabled,
  height,
  tool,
  width,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

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
  }, [height, width]);

  useEffect(() => {
    if (!enabled) hideBrushCursor(cursorRef.current);
  }, [enabled]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (canvasRef.current) clearCanvas(canvasRef.current);
      if (maskCanvasRef.current) clearCanvas(maskCanvasRef.current);
    },
    getMaskDataUrl: () => {
      const maskCanvas = maskCanvasRef.current;
      if (!maskCanvas || !hasMaskPixels(maskCanvas)) return null;

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
  }), []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateBrushCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width);
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY, width, height);
    drawingRef.current = true;
    lastPointRef.current = point;
    drawSegment({ canvas: event.currentTarget, from: point, to: point, brushSize, tool });
    if (maskCanvasRef.current) drawSegment({ canvas: maskCanvasRef.current, from: point, to: point, brushSize, tool, mask: true });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    updateBrushCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width);
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY, width, height);
    drawSegment({ canvas: event.currentTarget, from: lastPointRef.current, to: point, brushSize, tool });
    if (maskCanvasRef.current) drawSegment({ canvas: maskCanvasRef.current, from: lastPointRef.current, to: point, brushSize, tool, mask: true });
    lastPointRef.current = point;
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  return (
    <div className={cn('image-mask-layer', enabled && 'image-mask-layer-enabled', className)}>
      <canvas
        ref={canvasRef}
        className="image-mask-canvas"
        onPointerDown={handlePointerDown}
        onPointerEnter={(event) => updateBrushCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, width)}
        onPointerLeave={() => {
          if (!drawingRef.current) hideBrushCursor(cursorRef.current);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={(event) => {
          stopDrawing(event);
          hideBrushCursor(cursorRef.current);
        }}
      />
      <div ref={cursorRef} className={cn('image-mask-brush-cursor', tool === 'eraser' && 'image-mask-brush-cursor-eraser')} />
    </div>
  );
});

function drawSegment({
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
  const context = canvas.getContext('2d');
  if (!context) return;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = mask ? '#fff' : 'rgba(31, 98, 255, 0.55)';
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.1) {
    context.fillStyle = context.strokeStyle;
    context.beginPath();
    context.arc(from.x, from.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number, width: number, height: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  };
}

function updateBrushCursor(
  canvas: HTMLCanvasElement,
  cursor: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  brushSize: number,
  sourceWidth: number,
) {
  if (!cursor) return;
  const rect = canvas.getBoundingClientRect();
  const displayBrushSize = Math.max(4, brushSize * (rect.width / sourceWidth));
  cursor.style.display = 'block';
  cursor.style.width = `${displayBrushSize}px`;
  cursor.style.height = `${displayBrushSize}px`;
  cursor.style.transform = `translate(${clientX - rect.left}px, ${clientY - rect.top}px) translate(-50%, -50%)`;
}

function hideBrushCursor(cursor: HTMLDivElement | null) {
  if (!cursor) return;
  cursor.style.display = 'none';
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function hasMaskPixels(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}
