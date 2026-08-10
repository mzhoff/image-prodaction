'use client';

import type { PointerEventHandler, RefObject } from 'react';
import { getPointerTool } from '@/shared/lib/canvas-drawing';
import { hideBrushCursorElement } from '@/shared/lib/canvas-drawing';
import { cn } from '@/shared/lib/cn';
import { updateMaskCursor, type MaskTool } from '../lib/image-mask-canvas';

interface Props {
  brushSize: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  className?: string;
  cursorRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  isDrawing: () => boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerStop: PointerEventHandler<HTMLCanvasElement>;
  onPreviewToolChange?: (tool: MaskTool | null) => void;
  tool: MaskTool;
  width: number;
}

export function ImageMaskCanvasLayer(props: Props) {
  return (
    <div className={cn('image-mask-layer', props.enabled && 'image-mask-layer-enabled', props.className)}>
      <canvas
        ref={props.canvasRef}
        className="image-mask-canvas"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={props.onPointerDown}
        onPointerEnter={(event) => {
          const activeTool = getPointerTool(event.buttons, props.tool);
          props.onPreviewToolChange?.(activeTool === props.tool ? null : activeTool);
          updateMaskCursor(
            event.currentTarget,
            props.cursorRef.current,
            event.clientX,
            event.clientY,
            props.brushSize,
            props.width,
            activeTool,
          );
        }}
        onPointerLeave={() => {
          if (!props.isDrawing()) {
            hideBrushCursorElement(props.cursorRef.current);
            props.onPreviewToolChange?.(null);
          }
        }}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerStop}
        onPointerCancel={(event) => {
          props.onPointerStop(event);
          hideBrushCursorElement(props.cursorRef.current);
        }}
      />
      <div
        ref={props.cursorRef}
        className={cn('image-mask-brush-cursor', props.tool === 'eraser' && 'image-mask-brush-cursor-eraser')}
      />
    </div>
  );
}
