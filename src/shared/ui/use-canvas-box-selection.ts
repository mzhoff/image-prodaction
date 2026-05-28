'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface SelectionRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function useCanvasBoxSelection({
  screenToWorld,
  onSelect,
}: {
  screenToWorld: (point: Pick<MouseEvent, 'clientX' | 'clientY'>) => { x: number; y: number } | null;
  onSelect: (rect: { x: number; y: number; width: number; height: number }) => void;
}) {
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  const startSelection = useCallback((event: ReactMouseEvent) => {
    setSelectionRect({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
  }, []);

  useEffect(() => {
    if (!selectionRect) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      setSelectionRect((current) => (
        current ? { ...current, currentX: event.clientX, currentY: event.clientY } : null
      ));
    };

    const handleMouseUp = () => {
      const start = screenToWorld({
        clientX: Math.min(selectionRect.startX, selectionRect.currentX),
        clientY: Math.min(selectionRect.startY, selectionRect.currentY),
      });
      const end = screenToWorld({
        clientX: Math.max(selectionRect.startX, selectionRect.currentX),
        clientY: Math.max(selectionRect.startY, selectionRect.currentY),
      });

      if (start && end) {
        onSelect({
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: end.y - start.y,
        });
      }
      setSelectionRect(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onSelect, screenToWorld, selectionRect]);

  const rectStyle = useMemo(() => {
    if (!selectionRect) return null;

    const x = Math.min(selectionRect.startX, selectionRect.currentX);
    const y = Math.min(selectionRect.startY, selectionRect.currentY);
    return {
      left: x,
      top: y,
      width: Math.abs(selectionRect.currentX - selectionRect.startX),
      height: Math.abs(selectionRect.currentY - selectionRect.startY),
    };
  }, [selectionRect]);

  return {
    isSelecting: selectionRect !== null,
    rectStyle,
    startSelection,
  };
}
