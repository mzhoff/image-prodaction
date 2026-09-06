'use client';

import { useCallback } from 'react';
import { isNodeCollapsible } from '@/entities/production-graph/model/node-definitions';
import { normalizeNodeDisplayState } from '@/entities/production-graph/model/project-schema';
import type { useProductionCanvasStore } from './use-production-canvas-store';

export function useCanvasSelectedCollapse(graph: ReturnType<typeof useProductionCanvasStore>) {
  return useCallback(() => {
    const candidateNodeIds = Array.from(graph.selectedSet).flatMap((nodeId) => {
      const node = graph.nodesById.get(nodeId);
      return node && isNodeCollapsible(node.type) ? [node.id] : [];
    });
    if (candidateNodeIds.length === 0) return;

    const shouldCollapse = !candidateNodeIds.every((nodeId) => (
      normalizeNodeDisplayState(graph.uiState.nodes[nodeId]) === 'Collapsed'
    ));
    const nextState = shouldCollapse ? 'Collapsed' : 'Expanded';
    candidateNodeIds.forEach((nodeId) => graph.setNodeUiState(nodeId, { state: nextState }));
  }, [graph]);
}
