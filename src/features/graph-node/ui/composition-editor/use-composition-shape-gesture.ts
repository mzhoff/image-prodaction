'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import type { CompositionRectangleBounds } from '../../model/composition-shape-actions';

export function useCompositionShapeGesture({
  canvasHeight,
  canvasWidth,
  enabled,
  onCreate,
  onFinish,
}: {
  canvasHeight: number;
  canvasWidth: number;
  enabled: boolean;
  onCreate?: (bounds: CompositionRectangleBounds) => void;
  onFinish?: () => void;
}) {
  const [draft, setDraft] = useState<CompositionRectangleBounds>();

  const startShapeGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0 || !onCreate) return false;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const start = toCanvasPoint(event.clientX, event.clientY, rect, canvasWidth, canvasHeight);
    let latest = start;
    setDraft(toBounds(start, latest));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latest = toCanvasPoint(moveEvent.clientX, moveEvent.clientY, rect, canvasWidth, canvasHeight);
      setDraft(toBounds(start, latest));
    };
    const finish = (cancelled: boolean) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      setDraft(undefined);
      if (!cancelled) onCreate(getCommittedBounds(start, latest, canvasWidth, canvasHeight));
      onFinish?.();
    };
    const handlePointerUp = () => finish(false);
    const handlePointerCancel = () => finish(true);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerCancel, { once: true });
    return true;
  };

  return { draft, startShapeGesture };
}

function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  canvasWidth: number,
  canvasHeight: number,
) {
  return {
    x: clamp((clientX - rect.left) * canvasWidth / Math.max(1, rect.width), 0, canvasWidth),
    y: clamp((clientY - rect.top) * canvasHeight / Math.max(1, rect.height), 0, canvasHeight),
  };
}

function getCommittedBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
) {
  const bounds = toBounds(start, end);
  if (bounds.width >= 8 || bounds.height >= 8) return bounds;
  const width = Math.min(320, canvasWidth * 0.36);
  const height = Math.min(200, canvasHeight * 0.2);
  return {
    height,
    width,
    x: clamp(start.x - width / 2, 0, canvasWidth - width),
    y: clamp(start.y - height / 2, 0, canvasHeight - height),
  };
}

function toBounds(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    height: Math.abs(end.y - start.y),
    width: Math.abs(end.x - start.x),
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
