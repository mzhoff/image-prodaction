'use client';

import { useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodeIdsInsideSectionTree } from '@/entities/production-graph/model/graph-section-membership';
import type { GraphPoint, GraphSection, ProductionNode } from '@/entities/production-graph/model/types';

interface UseSectionDragParams {
  closeContextMenu: () => void;
  moveSectionBy: (sectionId: string, delta: GraphPoint, nodeIds?: string[]) => void;
  moveSelectedNodesBy: (delta: GraphPoint) => void;
  nodes: ProductionNode[];
  pushHistory: () => void;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
  selectSection: (sectionId: string, additive?: boolean) => void;
  selectedNodeSet: Set<string>;
  selectedSectionSet: Set<string>;
  sections: GraphSection[];
}

export function useSectionDrag({
  closeContextMenu,
  moveSectionBy,
  moveSelectedNodesBy,
  nodes,
  pushHistory,
  screenToWorld,
  selectSection,
  selectedNodeSet,
  selectedSectionSet,
  sections,
}: UseSectionDragParams) {
  return useCallback((section: GraphSection, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (section.locked) return;

    const target = event.target as HTMLElement;
    if (target.closest('input,button,textarea,select,[data-node-interactive]')) return;

    const startPoint = screenToWorld(event.nativeEvent);
    if (!startPoint) return;

    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();

    const wasSelected = selectedSectionSet.has(section.id);
    if (!wasSelected) selectSection(section.id, event.shiftKey);

    const startClient = { x: event.clientX, y: event.clientY };
    const containedNodeIds = getNodeIdsInsideSectionTree(section.id, sections, nodes);
    const shouldMoveSelectedItems = wasSelected && (selectedSectionSet.size + selectedNodeSet.size > 1);
    let didStartDrag = false;
    let previousPoint = startPoint;
    let previousBodyCursor = '';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToWorld(moveEvent);
      if (!nextPoint) return;

      const distance = Math.hypot(moveEvent.clientX - startClient.x, moveEvent.clientY - startClient.y);
      if (!didStartDrag && distance < 4) return;
      if (!didStartDrag) {
        didStartDrag = true;
        pushHistory();
        previousBodyCursor = document.body.style.cursor;
        document.body.style.cursor = 'move';
      }

      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const delta = { x: nextPoint.x - previousPoint.x, y: nextPoint.y - previousPoint.y };
      if (shouldMoveSelectedItems) moveSelectedNodesBy(delta);
      else moveSectionBy(section.id, delta, containedNodeIds);
      previousPoint = nextPoint;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (didStartDrag) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        document.body.style.cursor = previousBodyCursor;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [
    closeContextMenu,
    moveSectionBy,
    moveSelectedNodesBy,
    nodes,
    pushHistory,
    screenToWorld,
    selectSection,
    selectedNodeSet,
    selectedSectionSet,
    sections,
  ]);
}
