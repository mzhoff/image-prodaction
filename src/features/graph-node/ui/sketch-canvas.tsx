'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { loadAssetBlob } from '@/shared/lib/asset-db';
import { cn } from '@/shared/lib/cn';

export type SketchTool = 'brush' | 'eraser';

export interface SketchCanvasHandle {
  clear: () => void;
}

interface SketchCanvasProps {
  asset?: AssetRecord;
  brushColor: string;
  brushSize: number;
  className?: string;
  height: number;
  onCommit: (canvas: HTMLCanvasElement) => Promise<void> | void;
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
  style,
  tool,
  width,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
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
  }, [asset, height, width]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      fillCanvas(canvas);
      void onCommit(canvas);
    },
  }), [onCommit]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, tool);
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY);
    drawingRef.current = true;
    lastPointRef.current = point;
    drawSegment({ canvas: event.currentTarget, from: point, to: point, brushColor, brushSize, tool });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    updateCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, tool);
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getCanvasPoint(event.currentTarget, event.clientX, event.clientY);
    drawSegment({ canvas: event.currentTarget, from: lastPointRef.current, to: point, brushColor, brushSize, tool });
    lastPointRef.current = point;
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    drawingRef.current = false;
    lastPointRef.current = null;
    void onCommit(event.currentTarget);
  };

  return (
    <div className={cn('sketch-canvas-wrap', className)} data-node-interactive style={style}>
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
        onPointerCancel={(event) => {
          stopDrawing(event);
          hideCursor(cursorRef.current);
        }}
        onPointerDown={handlePointerDown}
        onPointerEnter={(event) => updateCursor(event.currentTarget, cursorRef.current, event.clientX, event.clientY, brushSize, tool)}
        onPointerLeave={() => {
          if (!drawingRef.current) hideCursor(cursorRef.current);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
      />
      <div ref={cursorRef} className={cn('sketch-brush-cursor', tool === 'eraser' && 'sketch-brush-cursor-eraser')} />
    </div>
  );
});

function drawSegment({
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
  const context = canvas.getContext('2d');
  if (!context) return;
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.strokeStyle = tool === 'eraser' ? '#fff' : brushColor;
  context.fillStyle = context.strokeStyle;
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.1) {
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

function fillCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function updateCursor(
  canvas: HTMLCanvasElement,
  cursor: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  brushSize: number,
  tool: SketchTool,
) {
  if (!cursor) return;
  const rect = canvas.getBoundingClientRect();
  const displayBrushSize = Math.max(4, brushSize * (rect.width / canvas.width));
  cursor.style.display = 'block';
  cursor.style.width = `${displayBrushSize}px`;
  cursor.style.height = `${displayBrushSize}px`;
  cursor.style.transform = `translate(${clientX - rect.left}px, ${clientY - rect.top}px) translate(-50%, -50%)`;
  cursor.dataset.tool = tool;
}

function hideCursor(cursor: HTMLDivElement | null) {
  if (!cursor) return;
  cursor.style.display = 'none';
}
