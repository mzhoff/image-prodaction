'use client';

import { useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GraphPoint, GraphSection } from '@/entities/production-graph/model/types';

export type SectionResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_SECTION_WIDTH = 120;
const MIN_SECTION_HEIGHT = 80;
const SECTION_RESIZE_CURSOR_CLASSES = [
  'canvas-section-resizing-horizontal',
  'canvas-section-resizing-vertical',
  'canvas-section-resizing-diagonal',
  'canvas-section-resizing-diagonal-2',
];

interface UseSectionResizeParams {
  pushHistory: () => void;
  resizeSection: (sectionId: string, rect: { x: number; y: number; width: number; height: number }) => void;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
}

export function useSectionResize({ pushHistory, resizeSection, screenToWorld }: UseSectionResizeParams) {
  return useCallback((section: GraphSection, handle: SectionResizeHandle, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    const startPoint = screenToWorld(event.nativeEvent);
    if (!startPoint) return;

    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    const cursorClass = getCursorClass(handle);
    document.documentElement.classList.remove(...SECTION_RESIZE_CURSOR_CLASSES);
    document.documentElement.classList.add(cursorClass);

    const startRect = {
      x: section.position.x,
      y: section.position.y,
      width: section.size.width,
      height: section.size.height,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToWorld(moveEvent);
      if (!nextPoint) return;

      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      resizeSection(section.id, getNextRect(startRect, handle, {
        x: nextPoint.x - startPoint.x,
        y: nextPoint.y - startPoint.y,
      }));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.documentElement.classList.remove(cursorClass);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [pushHistory, resizeSection, screenToWorld]);
}

function getCursorClass(handle: SectionResizeHandle) {
  if (handle === 'n' || handle === 's') return 'canvas-section-resizing-vertical';
  if (handle === 'e' || handle === 'w') return 'canvas-section-resizing-horizontal';
  if (handle === 'ne' || handle === 'sw') return 'canvas-section-resizing-diagonal';
  return 'canvas-section-resizing-diagonal-2';
}

function getNextRect(
  rect: { x: number; y: number; width: number; height: number },
  handle: SectionResizeHandle,
  delta: GraphPoint,
) {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes('w')) left = Math.min(left + delta.x, right - MIN_SECTION_WIDTH);
  if (handle.includes('e')) right = Math.max(right + delta.x, left + MIN_SECTION_WIDTH);
  if (handle.includes('n')) top = Math.min(top + delta.y, bottom - MIN_SECTION_HEIGHT);
  if (handle.includes('s')) bottom = Math.max(bottom + delta.y, top + MIN_SECTION_HEIGHT);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
