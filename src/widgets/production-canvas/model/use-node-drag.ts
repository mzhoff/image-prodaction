'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { isNodeInsideLockedSection } from '@/entities/production-graph/model/graph-selection-actions';
import { isNodeInsideSectionIds } from '@/entities/production-graph/model/graph-section-membership';
import { getSectionAndDescendantIds } from '@/entities/production-graph/model/graph-section-layout';
import { createNodeDragPreview } from '../lib/node-drag-preview';
import type { PortPointLookup } from '../lib/edge-path';

interface UseNodeDragParams {
  closeContextMenu: () => void;
  moveNode: (nodeId: string, position: GraphPoint) => void;
  moveSelectedNodesBy: (delta: GraphPoint) => void;
  pushHistory: () => void;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectedSectionSet: Set<string>;
  selectedSet: Set<string>;
  measuredPortPoints: PortPointLookup;
  collapsedGenerateComposingNodeIds: Set<string>;
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
  measuredPortPoints,
  collapsedGenerateComposingNodeIds,
}: UseNodeDragParams) {
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);
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
    const graph = useProductionGraphStore.getState();
    if (node.locked || isNodeInsideLockedSection(node, graph.sections)) return;
    const container = event.currentTarget.closest<HTMLElement>('.production-canvas');
    if (!container) return;
    cancelRef.current?.();

    const groupDrag = alreadySelected && selectedSet.size + selectedSectionSet.size > 1;
    const startPosition = node.position;
    const startClient = { x: event.clientX, y: event.clientY };
    let didStartDrag = false;
    const sectionIds = groupDrag ? getSectionAndDescendantIds(graph.sections, selectedSectionSet) : new Set<string>();
    const nodeIds = new Set(groupDrag ? graph.nodes.filter((item) => (
      (selectedSet.has(item.id) || isNodeInsideSectionIds(item, graph.sections, sectionIds))
      && !item.locked && !isNodeInsideLockedSection(item, graph.sections)
    )).map((item) => item.id) : [node.id]);
    let delta = { x: 0, y: 0 };
    let frame = 0;
    let preview: ReturnType<typeof createNodeDragPreview> | undefined;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextPoint = screenToWorld(moveEvent);
      if (!nextPoint) return;

      const distance = Math.hypot(moveEvent.clientX - startClient.x, moveEvent.clientY - startClient.y);
      if (!didStartDrag && distance < 4) return;
      if (!didStartDrag) {
        didStartDrag = true;
        preview = createNodeDragPreview(container, graph.nodes, graph.edges, nodeIds, sectionIds, {
          measuredPortPoints, collapsedGenerateComposingNodeIds,
        });
      }

      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      delta = { x: nextPoint.x - startPoint.x, y: nextPoint.y - startPoint.y };
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; preview?.move(delta); });
    };

    const finish = (commit: boolean) => {
      cancelAnimationFrame(frame);
      preview?.dispose();
      if (commit && didStartDrag && (delta.x !== 0 || delta.y !== 0)) {
        // Snapshot immediately before the coordinate commit: concurrent generation results survive undo.
        pushHistory();
        if (groupDrag) moveSelectedNodesBy(delta);
        else moveNode(node.id, { x: startPosition.x + delta.x, y: startPosition.y + delta.y });
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', handleKeyDown);
      cancelRef.current = null;
    };
    const cancel = () => finish(false);
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (didStartDrag) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
      }
      if (didStartDrag) {
        const point = screenToWorld(upEvent);
        if (point) delta = { x: point.x - startPoint.x, y: point.y - startPoint.y };
      }
      finish(true);
    };

    cancelRef.current = cancel;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', handleKeyDown);
  }, [
    closeContextMenu,
    moveNode,
    moveSelectedNodesBy,
    pushHistory,
    screenToWorld,
    selectNode,
    selectedSectionSet,
    selectedSet,
    measuredPortPoints,
    collapsedGenerateComposingNodeIds,
  ]);
}
