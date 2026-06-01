'use client';

import { useRef } from 'react';
import type { CropRect } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { aspectRatioValue, clamp, normalizeCrop } from '../lib/crop-geometry';

type CropAction = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface CropEditorProps {
  aspectRatio: string;
  crop: CropRect;
  imageHeight?: number;
  imageWidth?: number;
  locked: boolean;
  onCropChange: (crop: CropRect) => void;
  onCropDragStart?: () => void;
  url?: string;
}

interface DragState {
  action: CropAction;
  clientX: number;
  clientY: number;
  crop: CropRect;
  containerHeight: number;
  containerWidth: number;
}

export function CropEditor({
  aspectRatio,
  crop,
  imageHeight = 1,
  imageWidth = 1,
  locked,
  onCropChange,
  onCropDragStart,
  url,
}: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const imageAspectRatio = imageWidth / imageHeight;
  const targetRatio = aspectRatioValue(aspectRatio, crop, imageWidth, imageHeight);
  const editorStyle = {
    aspectRatio: imageWidth > 0 && imageHeight > 0 ? `${imageWidth} / ${imageHeight}` : '1 / 1',
  };

  const startDrag = (action: CropAction, event: React.PointerEvent<HTMLElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    onCropDragStart?.();
    dragRef.current = {
      action,
      clientX: event.clientX,
      clientY: event.clientY,
      containerHeight: rect.height,
      containerWidth: rect.width,
      crop,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - drag.clientX) / drag.containerWidth;
      const dy = (moveEvent.clientY - drag.clientY) / drag.containerHeight;
      onCropChange(getNextCrop({
        action: drag.action,
        crop: drag.crop,
        dx,
        dy,
        imageAspectRatio,
        locked,
        targetRatio,
      }));
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const cropStyle = {
    height: `${crop.height * 100}%`,
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
  };

  return (
    <div ref={containerRef} className="crop-editor" style={editorStyle} data-node-interactive>
      {url ? (
        <>
          <img
            src={url}
            alt="Crop source"
            className="crop-editor-image"
            draggable={false}
          />
          <div className="crop-editor-mask">
            <div className="crop-editor-box" style={cropStyle} onPointerDown={(event) => startDrag('move', event)}>
              <div className="crop-editor-grid" />
              {(['n', 's', 'e', 'w'] as CropAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-label={`Resize crop ${action}`}
                  className={cn('crop-editor-edge', `crop-editor-edge-${action}`)}
                  onPointerDown={(event) => startDrag(action, event)}
                />
              ))}
              {(['nw', 'ne', 'sw', 'se'] as CropAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-label={`Resize crop ${action}`}
                  className={cn('crop-editor-handle', `crop-editor-handle-${action}`)}
                  onPointerDown={(event) => startDrag(action, event)}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="crop-editor-empty">Connect image</div>
      )}
    </div>
  );
}

function getNextCrop({
  action,
  crop,
  dx,
  dy,
  imageAspectRatio,
  locked,
  targetRatio,
}: {
  action: CropAction;
  crop: CropRect;
  dx: number;
  dy: number;
  imageAspectRatio: number;
  locked: boolean;
  targetRatio: number | null;
}) {
  if (action === 'move') {
    return normalizeCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
  }

  if (locked && targetRatio) {
    return resizeLockedCrop(crop, action, dx, dy, targetRatio / imageAspectRatio);
  }

  return resizeFreeCrop(crop, action, dx, dy);
}

function resizeFreeCrop(crop: CropRect, action: CropAction, dx: number, dy: number) {
  let left = crop.x;
  let right = crop.x + crop.width;
  let top = crop.y;
  let bottom = crop.y + crop.height;

  if (action.includes('w')) left += dx;
  if (action.includes('e')) right += dx;
  if (action.includes('n')) top += dy;
  if (action.includes('s')) bottom += dy;

  left = clamp(left, 0, right - 0.03);
  right = clamp(right, left + 0.03, 1);
  top = clamp(top, 0, bottom - 0.03);
  bottom = clamp(bottom, top + 0.03, 1);
  return normalizeCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

function resizeLockedCrop(crop: CropRect, action: CropAction, dx: number, dy: number, normalizedRatio: number) {
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = crop.width;
  let height = crop.height;
  let x = crop.x;
  let y = crop.y;

  if (action === 'e' || action === 'w') {
    width = action === 'e' ? crop.width + dx : crop.width - dx;
    height = width / normalizedRatio;
    x = action === 'e' ? crop.x : right - width;
    y = centerY - height / 2;
    return containLockedCrop({ x, y, width, height }, normalizedRatio);
  }

  if (action === 'n' || action === 's') {
    height = action === 's' ? crop.height + dy : crop.height - dy;
    width = height * normalizedRatio;
    x = centerX - width / 2;
    y = action === 's' ? crop.y : bottom - height;
    return containLockedCrop({ x, y, width, height }, normalizedRatio);
  }

  const horizontalSize = action.includes('e') ? crop.width + dx : crop.width - dx;
  const verticalSize = action.includes('s') ? crop.height + dy : crop.height - dy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    width = horizontalSize;
    height = width / normalizedRatio;
  } else {
    height = verticalSize;
    width = height * normalizedRatio;
  }

  x = action.includes('w') ? right - width : crop.x;
  y = action.includes('n') ? bottom - height : crop.y;
  return containLockedCrop({ x, y, width, height }, normalizedRatio);
}

function containLockedCrop(crop: CropRect, normalizedRatio: number) {
  let width = clamp(crop.width, 0.03, 1);
  let height = width / normalizedRatio;
  if (height > 1) {
    height = 1;
    width = height * normalizedRatio;
  }
  return normalizeCrop({ ...crop, width, height });
}
