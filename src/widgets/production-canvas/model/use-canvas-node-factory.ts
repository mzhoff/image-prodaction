'use client';

import { useCallback } from 'react';
import type { GraphPoint, ProductionNodeType } from '@/entities/production-graph/model/types';
import type { useProductionCanvasStore } from './use-production-canvas-store';
import { trackBehavior } from '@/shared/analytics/client';

type GraphModel = ReturnType<typeof useProductionCanvasStore>;

export function useCanvasNodeFactory(graph: GraphModel) {
  return useCallback((type: ProductionNodeType, position: GraphPoint) => {
    const nodeId = graph.addNode(type, position);
    if (type === 'generateImage') graph.setNodeUiState(nodeId, { state: 'Collapsed' });
    trackBehavior('ip_node_added', { source: 'editor', node_type: type });
    return nodeId;
  }, [graph]);
}
