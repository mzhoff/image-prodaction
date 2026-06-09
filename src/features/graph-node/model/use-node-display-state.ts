'use client';

import { useCallback, useMemo } from 'react';
import { normalizeNodeDisplayState } from '@/entities/production-graph/model/project-schema';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

export function useNodeDisplayState(nodeId: string) {
  const nodeUiState = useProductionGraphStore((state) => state.uiState.nodes[nodeId]);
  const setNodeUiState = useProductionGraphStore((state) => state.setNodeUiState);

  const isCollapsed = useMemo(() => normalizeNodeDisplayState(nodeUiState) === 'Collapsed', [nodeUiState]);

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      setNodeUiState(nodeId, { state: collapsed ? 'Collapsed' : 'Expanded' });
    },
    [nodeId, setNodeUiState],
  );

  return {
    isCollapsed,
    setCollapsed,
  };
}

