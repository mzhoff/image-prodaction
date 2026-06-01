'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface SectionDraft {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const MIN_SECTION_SCREEN_SIZE = 24;

export function useSectionDrawing({
  onFinish,
  onCreateSection,
  screenToWorld,
}: {
  onCreateSection: (rect: { x: number; y: number; width: number; height: number }) => void;
  onFinish?: () => void;
  screenToWorld: (point: Pick<MouseEvent, 'clientX' | 'clientY'>) => { x: number; y: number } | null;
}) {
  const [draft, setDraft] = useState<SectionDraft | null>(null);

  const startSectionDrawing = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDraft({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
  }, []);

  useEffect(() => {
    if (!draft) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      setDraft((current) => (
        current ? { ...current, currentX: event.clientX, currentY: event.clientY } : null
      ));
    };

    const handleMouseUp = () => {
      const screenWidth = Math.abs(draft.currentX - draft.startX);
      const screenHeight = Math.abs(draft.currentY - draft.startY);
      const start = screenToWorld({
        clientX: Math.min(draft.startX, draft.currentX),
        clientY: Math.min(draft.startY, draft.currentY),
      });
      const end = screenToWorld({
        clientX: Math.max(draft.startX, draft.currentX),
        clientY: Math.max(draft.startY, draft.currentY),
      });

      if (start && end && screenWidth >= MIN_SECTION_SCREEN_SIZE && screenHeight >= MIN_SECTION_SCREEN_SIZE) {
        onCreateSection({
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: end.y - start.y,
        });
      }
      setDraft(null);
      onFinish?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draft, onCreateSection, onFinish, screenToWorld]);

  const rectStyle = useMemo(() => {
    if (!draft) return null;

    const x = Math.min(draft.startX, draft.currentX);
    const y = Math.min(draft.startY, draft.currentY);
    return {
      left: x,
      top: y,
      width: Math.abs(draft.currentX - draft.startX),
      height: Math.abs(draft.currentY - draft.startY),
    };
  }, [draft]);

  return {
    isDrawingSection: draft !== null,
    sectionDraftStyle: rectStyle,
    startSectionDrawing,
  };
}
