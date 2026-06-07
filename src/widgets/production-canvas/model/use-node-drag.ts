'use client';

import { useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';

interface UseNodeDragParams {
  closeContextMenu: () => void;
  moveNode: (nodeId: string, position: GraphPoint) => void;
  moveSelectedNodesBy: (delta: GraphPoint) => void;
  pushHistory: () => void;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectedSectionSet: Set<string>;
  selectedSet: Set<string>;
}

export function useNodeDrag({
  closeContextMenu,
  moveNode,
  moveSelectedNodesBy,
  pushHistory,
  screenToWorld,
  selectNode,
  selectedSectionSet,
  selectedSet,
}: UseNodeDragParams) {
  return useCallback((node: ProductionNode, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,select,[data-port-id]')) return;
    if (target.closest('[data-node-interactive]') && !target.closest('[data-node-drag-handle]')) return;

    const startPoint = screenToWorld(event.nativeEvent);
    if (!startPoint) return;

    event.stopPropagation();
    closeContextMenu();

    const alreadySelected = selectedSet.has(node.id);
    if (!alreadySelected) selectNode(node.id, event.shiftKey);
    if (node.locked) return;

    const groupDrag = alreadySelected && selectedSet.size + selectedSectionSet.size > 1;
    const startPosition = node.position;
    const startClient = { x: event.clientX, y: event.clientY };
    let didStartDrag = false;
    let previousPoint = startPoint;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToWorld(moveEvent);
      if (!nextPoint) return;

      const distance = Math.hypot(moveEvent.clientX - startClient.x, moveEvent.clientY - startClient.y);
      if (!didStartDrag && distance < 4) return;
      if (!didStartDrag) {
        didStartDrag = true;
        pushHistory();
      }

      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      if (groupDrag) {
        moveSelectedNodesBy({ x: nextPoint.x - previousPoint.x, y: nextPoint.y - previousPoint.y });
        previousPoint = nextPoint;
        return;
      }

      moveNode(node.id, {
        x: startPosition.x + nextPoint.x - startPoint.x,
        y: startPosition.y + nextPoint.y - startPoint.y,
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (didStartDrag) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [
    closeContextMenu,
    moveNode,
    moveSelectedNodesBy,
    pushHistory,
    screenToWorld,
    selectNode,
    selectedSectionSet,
    selectedSet,
  ]);
}
